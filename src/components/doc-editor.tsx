"use client";

// A document you edit in place, like the Google Doc this replaces.
//
// It saves itself. There is no Save button, because a document with a Save
// button is a document someone eventually loses work in — so typing stops, a
// second passes, and it goes. What the toolbar does have is a plain statement
// of where things stand: saving, saved a moment ago, or a problem, in words.
//
// Formatting runs through document.execCommand. That API is deprecated and has
// no replacement of comparable reach; every browser still implements it, and
// the alternative is a rich-text framework and its dependency tree for the sake
// of six buttons.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { restoreDocRevision, saveDoc, listDocRevisions, type RevisionVM } from "@/lib/actions/docs";

/** Long enough not to save mid-word, short enough that closing the tab is safe. */
const SAVE_DEBOUNCE_MS = 1200;

type Status =
  | { at: "idle" }
  | { at: "dirty" }
  | { at: "saving" }
  | { at: "saved"; when: Date }
  | { at: "error"; message: string };

const BUTTONS: { label: string; title: string; command: string; value?: string; className?: string }[] = [
  { label: "H1", title: "Section heading", command: "formatBlock", value: "h2" },
  { label: "H2", title: "Sub-heading", command: "formatBlock", value: "h3" },
  { label: "Body", title: "Normal text", command: "formatBlock", value: "p" },
  { label: "B", title: "Bold", command: "bold", className: "font-bold" },
  { label: "I", title: "Italic", command: "italic", className: "italic" },
  { label: "U", title: "Underline", command: "underline", className: "underline" },
  { label: "• List", title: "Bulleted list", command: "insertUnorderedList" },
  { label: "1. List", title: "Numbered list", command: "insertOrderedList" },
  { label: "⨯ Format", title: "Strip formatting", command: "removeFormat" },
];

function when(date: Date): string {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  return date.toLocaleString(undefined, { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" });
}

export function DocEditor({
  slug,
  initialContent,
  initialVersion,
  updatedAt,
  updatedBy,
  canEdit,
}: {
  slug: string;
  initialContent: string;
  initialVersion: number;
  updatedAt: string;
  updatedBy: string | null;
  canEdit: boolean;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const version = useRef(initialVersion);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);

  const [status, setStatus] = useState<Status>({ at: "idle" });
  const [importing, setImporting] = useState(false);
  const [history, setHistory] = useState<RevisionVM[] | null>(null);
  const [, force] = useState(0);
  const router = useRouter();
  const { toast } = useToast();

  // Re-render the "saved 2 minutes ago" line without touching the document.
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 20_000);
    return () => clearInterval(id);
  }, []);

  const save = useCallback(async () => {
    const el = bodyRef.current;
    if (!el || !canEdit) return;
    pending.current = false;
    setStatus({ at: "saving" });
    const res = await saveDoc(slug, el.innerHTML, version.current);
    if (!res.ok) {
      setStatus({ at: "error", message: res.error ?? "Could not save." });
      if (res.conflictWith) {
        toast(
          `${res.conflictWith} saved a change while you were typing. Reload to see it — your text is still on screen, so copy anything you need first.`,
          { tone: "error" },
        );
      }
      return;
    }
    version.current = res.version ?? version.current;
    setStatus({ at: "saved", when: res.savedAt ? new Date(res.savedAt) : new Date() });
  }, [slug, canEdit, toast]);

  const scheduleSave = useCallback(() => {
    if (!canEdit) return;
    pending.current = true;
    setStatus({ at: "dirty" });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), SAVE_DEBOUNCE_MS);
  }, [canEdit, save]);

  // Nothing typed should be lost to a closed tab or a click into another page.
  useEffect(() => {
    const flush = () => {
      if (!pending.current || !bodyRef.current) return;
      const body = new FormData();
      body.set("content", bodyRef.current.innerHTML);
      body.set("version", String(version.current));
      navigator.sendBeacon?.(`/api/docs/${slug}/beacon`, body);
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (!pending.current) return;
      flush();
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("beforeunload", onLeave);
      flush();
    };
  }, [slug]);

  const exec = (command: string, value?: string) => {
    bodyRef.current?.focus();
    document.execCommand(command, false, value);
    scheduleSave();
  };

  const importFile = async (file: File) => {
    setImporting(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch(`/api/docs/${slug}/import`, { method: "POST", body: form });
      const body = (await res.json()) as { content?: string; version?: number; savedAt?: string; error?: string };
      if (!res.ok || !body.content) {
        toast(body.error ?? "Could not read that file.", { tone: "error" });
        return;
      }
      if (bodyRef.current) bodyRef.current.innerHTML = body.content;
      version.current = body.version ?? version.current;
      pending.current = false;
      setStatus({ at: "saved", when: body.savedAt ? new Date(body.savedAt) : new Date() });
      setHistory(null);
      toast(`Loaded ${file.name} — the previous version is in History`);
      router.refresh();
    } catch {
      toast("Could not upload that file.", { tone: "error" });
    } finally {
      setImporting(false);
    }
  };

  const statusLine = () => {
    switch (status.at) {
      case "saving": return <span className="text-muted">Saving…</span>;
      case "dirty": return <span className="text-faint">Unsaved changes</span>;
      case "saved": return <span className="text-muted">Saved {when(status.when)}</span>;
      case "error": return <span className="text-warn">{status.message}</span>;
      default:
        return (
          <span className="text-faint">
            Last edited {when(new Date(updatedAt))}
            {updatedBy ? ` by ${updatedBy}` : ""}
          </span>
        );
    }
  };

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-1 mb-4 flex flex-wrap items-center gap-1 border-b border-line bg-paper/95 px-1 py-2 backdrop-blur">
        {canEdit &&
          BUTTONS.map((b) => (
            <button
              key={b.label}
              type="button"
              title={b.title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec(b.command, b.value)}
              className={`rounded px-2 py-1 text-xs text-muted hover:bg-wash hover:text-charcoal ${b.className ?? ""}`}
            >
              {b.label}
            </button>
          ))}

        <span className="ml-auto flex items-center gap-2 text-xs">
          {statusLine()}
          {canEdit && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.txt,.md"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  if (
                    !window.confirm(
                      `Replace this document with ${file.name}? The version on screen now is kept in History, so this can be undone.`,
                    )
                  )
                    return;
                  void importFile(file);
                }}
              />
              <button
                className="btn btn-secondary btn-sm"
                disabled={importing}
                onClick={() => fileRef.current?.click()}
              >
                {importing ? "Reading…" : "Upload"}
              </button>
            </>
          )}
          <button
            className="btn btn-secondary btn-sm"
            onClick={async () => {
              if (history) return setHistory(null);
              setHistory(await listDocRevisions(slug));
            }}
          >
            History
          </button>
        </span>
      </div>

      {history && (
        <div className="mb-4 rounded-md border border-line bg-surface p-3">
          <div className="overline mb-2">Earlier versions</div>
          {history.length === 0 && (
            <p className="text-sm text-faint">
              No earlier versions yet — one is kept whenever the document changes substantially,
              and always before an upload replaces it.
            </p>
          )}
          <ul className="space-y-1.5">
            {history.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="text-charcoal">{when(new Date(r.when))}</span>{" "}
                  <span className="text-xs text-faint">
                    {[r.by, r.note, `${Math.round(r.length / 1000)}k characters`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {canEdit && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={async () => {
                      if (!window.confirm("Put the document back to this version? The current one is kept too.")) return;
                      const res = await restoreDocRevision(r.id);
                      if (!res.ok) return toast(res.error ?? "Could not restore.", { tone: "error" });
                      toast("Restored — reloading");
                      window.location.reload();
                    }}
                  >
                    Restore
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div
        ref={bodyRef}
        className="doc-body"
        contentEditable={canEdit}
        suppressContentEditableWarning
        onInput={scheduleSave}
        onBlur={() => {
          if (pending.current) void save();
        }}
        // Paste as text: a block copied out of a web page brings its markup,
        // its colours and its fonts, and none of that belongs in here.
        onPaste={(e) => {
          if (!canEdit) return;
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
          scheduleSave();
        }}
        dangerouslySetInnerHTML={{ __html: initialContent }}
      />
    </div>
  );
}
