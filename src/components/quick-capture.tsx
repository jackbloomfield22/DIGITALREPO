"use client";

// The box in the corner, which now does what you ask rather than only writing
// it down. Say "move this to on hold, HBO passed" while looking at a format and
// it reads that as changes to the record you're on, shows you what it
// understood in plain English, and only writes once you say go. "Just save a
// note" is still there for the times you want a note and nothing else.
//
// Nothing here bypasses review: the same ingest pipeline, apply engine, audit
// trail and undo that everything else in the Repo goes through.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { applyPageEdit, discardPageEdit, keepAsNoteOnly } from "@/lib/actions/page-edit";

const DRAFT_KEY = "quick-capture-draft";

type Proposal = {
  id: string;
  opType: string;
  confidence: number;
  sensitive: boolean;
  path: string | null;
  summary: string;
};

type Stage =
  | { at: "writing" }
  | { at: "thinking"; what: string }
  | { at: "review"; itemId: string; proposals: Proposal[]; picked: Set<string>; reasons: string[] }
  | { at: "nothing"; itemId: string; reasons: string[] }
  // The note is already stored by this point, so a retry re-reads that same
  // item rather than filing a second copy of what you wrote.
  | { at: "failed"; itemId: string; error: string };

/**
 * A readable name for wherever the note was written. The page heading is the
 * record's own name; the document title carries site branding, which is not
 * what we want to hand the reader as context.
 */
function whereFrom(pathname: string): { label: string; context: string; isRecord: boolean } | null {
  if (pathname === "/" || pathname.startsWith("/uploads") || pathname.startsWith("/ingest")) return null;
  const heading = document.querySelector("main h1")?.textContent?.trim();
  if (!heading) return null;
  // A record page is /talent/aja-wilson; a directory is /talent.
  const isRecord = pathname.split("/").filter(Boolean).length >= 2;
  return {
    label: heading,
    isRecord,
    context: isRecord
      ? `Written from the "${heading}" page in the Repo (${pathname}). Unless the note names something else, it is about that record.`
      : `Written from the ${heading} section of the Repo (${pathname}).`,
  };
}

/**
 * What the model is told when the note is an instruction rather than an
 * observation. Loosely-worded is the point — "this one's dead" has to land as
 * a status change, not as a document to be assessed for relevance.
 */
function instructionContext(from: ReturnType<typeof whereFrom>): string {
  const scope = from?.isRecord
    ? `They were looking at the "${from.label}" page (${location.pathname}) when they wrote it, so anything not otherwise attributed — "this", "it", "the show" — means that record.`
    : from
      ? `They were looking at the ${from.label} section of the Repo when they wrote it.`
      : "";
  return [
    "THIS IS A DIRECT INSTRUCTION FROM THE OWNER OF THIS REPO, typed into the Repo itself.",
    scope,
    "Treat it as authoritative and current: it is always relevant, and it states what is true now.",
    "It is written casually and briefly. Read the intent, not the wording — a phrase like",
    '"this one\'s dead", "we passed", "shelve it" or "it\'s moving again" is a status change;',
    '"add X" is a new record or a new connection; "note that…" is a note.',
    "Propose only what the instruction actually asks for. Do not embellish, and do not",
    "propose changes to records it does not mention.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function QuickCapture() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [stage, setStage] = useState<Stage>({ at: "writing" });
  const [source, setSource] = useState<{ label: string; context: string; isRecord: boolean } | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  // The save effect runs on mount with empty text; without this it would erase
  // the very draft the restore below is about to read.
  const restored = useRef(false);
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();

  // Restore a draft left behind on another page.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const saved = localStorage.getItem(DRAFT_KEY);
        if (saved) {
          setText(saved);
          setSource(whereFrom(window.location.pathname));
          setOpen(true);
        }
      } catch {}
      restored.current = true;
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    try {
      if (text) localStorage.setItem(DRAFT_KEY, text);
      else localStorage.removeItem(DRAFT_KEY);
    } catch {}
  }, [text]);

  useEffect(() => {
    if (open && stage.at === "writing") areaRef.current?.focus();
  }, [open, stage.at]);

  const reveal = () => {
    setSource(whereFrom(pathname));
    setOpen(true);
  };

  const reset = () => {
    setText("");
    setStage({ at: "writing" });
    setOpen(false);
  };

  /**
   * Read a stored note and come back with proposals. Split out from `submit`
   * so a failure can be retried against the note already on file.
   */
  const readItem = useCallback(
    async (id: string) => {
      setStage({ at: "thinking", what: "Reading what you asked for…" });
      try {
        // Pasted text arrives already parsed, so it starts at triage. Each
        // stage is its own request, which keeps every one of them well inside
        // the serverless time limit.
        for (const s of ["triage", "propose"] as const) {
          const r = await fetch("/api/ingest/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, stage: s }),
          });
          const out = (await r.json()) as { ok?: boolean; error?: string; status?: string };
          if (!out.ok) {
            setStage({ at: "failed", itemId: id, error: out.error ?? "Something went wrong reading that." });
            return;
          }
          if (out.status === "irrelevant") break;
        }

        const list = await fetch(`/api/ingest/changes?id=${id}`);
        const parsed = (await list.json()) as { changes?: Proposal[]; reasons?: string[]; error?: string };
        if (!list.ok) {
          setStage({ at: "failed", itemId: id, error: parsed.error ?? "Couldn't read that back." });
          return;
        }
        const proposals = parsed.changes ?? [];
        if (!proposals.length) {
          setStage({ at: "nothing", itemId: id, reasons: parsed.reasons ?? [] });
          return;
        }
        setStage({
          at: "review",
          itemId: id,
          proposals,
          // Everything is ticked to begin with — the common case is that it got
          // it right, and unticking one is easier than ticking four.
          picked: new Set(proposals.map((p) => p.id)),
          reasons: parsed.reasons ?? [],
        });
      } catch {
        setStage({ at: "failed", itemId: id, error: "Could not reach the server." });
      }
    },
    [],
  );

  /**
   * Store the note, then read it. `act` decides whether we come back with
   * proposals to approve or simply file it for later like a paper note.
   */
  const submit = useCallback(
    async (act: boolean) => {
      const note = text.trim();
      if (!note || stage.at === "thinking") return;
      // Read the page fresh at send time — you may have navigated while typing.
      const from = whereFrom(pathname);
      setStage({ at: "thinking", what: act ? "Reading what you asked for…" : "Saving…" });
      try {
        const form = new FormData();
        // Naming the record in the text itself is what lets the matcher find
        // it; the context alone doesn't reach the candidate search.
        form.set("text", from?.isRecord ? `About: ${from.label} (${pathname})\n\n${note}` : note);
        form.set("context", act ? instructionContext(from) : (from?.context ?? ""));
        form.set("label", from ? `Note — ${from.label}` : "Note");

        const res = await fetch("/api/ingest/upload", { method: "POST", body: form });
        const data = (await res.json()) as { items?: { id: string }[]; error?: string };
        if (!res.ok || !data.items?.length) {
          toast(data.error ?? "Could not save that note.", { tone: "error" });
          setStage({ at: "writing" });
          return;
        }
        const id = data.items[0].id;

        if (!act) {
          setText("");
          setStage({ at: "writing" });
          setOpen(false);
          toast("Noted — it'll show up in Add Info once it's been read");
          // Read it in the background; the note is already safely stored.
          for (const s of ["triage", "propose"] as const) {
            const r = await fetch("/api/ingest/run", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id, stage: s }),
            });
            const out = (await r.json()) as { ok?: boolean; status?: string };
            if (!out.ok || out.status === "irrelevant") break;
          }
          return;
        }

        await readItem(id);
      } catch {
        toast("Could not reach the server — your note is still in the box.", { tone: "error" });
        setStage({ at: "writing" });
      }
    },
    [text, stage.at, pathname, toast, readItem],
  );

  const apply = useCallback(async () => {
    if (stage.at !== "review") return;
    const { itemId, picked } = stage;
    setStage({ at: "thinking", what: "Making the change…" });
    const res = await applyPageEdit(itemId, [...picked]);
    if (!res.ok) {
      toast(res.error ?? "Could not make that change.", { tone: "error" });
      setStage({ at: "writing" });
      return;
    }
    toast(
      res.applied === 1 ? "Done — one change made" : `Done — ${res.applied} changes made`,
      { tone: res.failed ? "error" : undefined },
    );
    reset();
    router.refresh();
  }, [stage, router, toast]);

  if (!open) {
    return (
      <button
        onClick={reveal}
        aria-label="Write a note or ask for a change"
        className="fixed bottom-4 right-4 z-40 rounded-full border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium shadow-pop transition-colors hover:border-accent hover:text-accent"
      >
        ✎ Note{text ? <span className="ml-1.5 text-xs text-accent">draft</span> : null}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[min(26rem,calc(100vw-2rem))] rounded-md border border-line-strong bg-surface shadow-pop">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          {stage.at === "review" ? "Is this right?" : stage.at === "failed" ? "That didn't work" : "Quick note"}
        </span>
        <button
          onClick={() => (stage.at === "writing" || stage.at === "thinking" ? setOpen(false) : setStage({ at: "writing" }))}
          aria-label={stage.at === "review" ? "Back to the note" : "Collapse note box"}
          className="text-muted hover:text-accent"
        >
          ✕
        </button>
      </div>

      {stage.at === "thinking" && (
        <div className="p-4 text-sm text-muted">
          <span className="inline-block animate-pulse">{stage.what}</span>
        </div>
      )}

      {stage.at === "failed" && (
        <div className="p-3">
          <p className="text-sm text-charcoal">Your note is saved — I just couldn&apos;t read it into changes.</p>
          <p className="mt-1 text-xs text-muted">{stage.error}</p>
          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              className="text-xs text-faint hover:text-accent"
              onClick={async () => {
                await discardPageEdit(stage.itemId);
                reset();
              }}
            >
              Discard it
            </button>
            <div className="flex gap-2">
              <button
                className="btn btn-secondary btn-sm"
                onClick={async () => {
                  await keepAsNoteOnly(stage.itemId);
                  toast("Kept as a note in Add Info");
                  reset();
                }}
              >
                Keep as a note
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => void readItem(stage.itemId)}>
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {stage.at === "nothing" && (
        <div className="p-3">
          <p className="text-sm text-charcoal">
            I couldn&apos;t turn that into a change to the Repo.
            {stage.reasons.length > 0 && (
              <span className="mt-1 block text-xs text-muted">{stage.reasons.join(" · ")}</span>
            )}
          </p>
          <p className="mt-2 text-xs text-muted">
            Try naming the record and what should change — &ldquo;Foul Play is sold to TBS&rdquo;.
            Your words are saved either way.
          </p>
          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              className="text-xs text-faint hover:text-accent"
              onClick={async () => {
                await discardPageEdit(stage.itemId);
                reset();
              }}
            >
              Discard it
            </button>
            <div className="flex gap-2">
              <button className="btn btn-secondary btn-sm" onClick={() => setStage({ at: "writing" })}>
                Reword
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={async () => {
                  await keepAsNoteOnly(stage.itemId);
                  toast("Kept as a note in Add Info");
                  reset();
                }}
              >
                Keep as a note
              </button>
            </div>
          </div>
        </div>
      )}

      {stage.at === "review" && (
        <div className="p-3">
          <p className="mb-2 text-xs text-muted">
            Untick anything you don&apos;t want. Nothing is written until you press Make
            {stage.picked.size === 1 ? " the change" : " the changes"}.
          </p>
          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {stage.proposals.map((p) => {
              const on = stage.picked.has(p.id);
              return (
                <li key={p.id}>
                  <label className="flex cursor-pointer gap-2 rounded border border-line px-2.5 py-2 text-sm hover:border-line-strong">
                    <input
                      type="checkbox"
                      className="mt-0.5 !w-auto"
                      checked={on}
                      onChange={() => {
                        const picked = new Set(stage.picked);
                        if (on) picked.delete(p.id);
                        else picked.add(p.id);
                        setStage({ ...stage, picked });
                      }}
                    />
                    <span className="min-w-0">
                      <span className={on ? "" : "text-faint line-through"}>{p.summary}</span>
                      {(p.sensitive || p.confidence < 0.5) && (
                        <span className="mt-0.5 block text-[11px] text-accent-deep">
                          {p.sensitive ? "Worth a second look" : "Not certain about this one"}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              className="text-xs text-faint hover:text-accent"
              onClick={async () => {
                await keepAsNoteOnly(stage.itemId);
                toast("Kept as a note instead");
                reset();
              }}
            >
              Just keep the note
            </button>
            <button className="btn btn-primary btn-sm" disabled={stage.picked.size === 0} onClick={apply}>
              Make {stage.picked.size === 1 ? "the change" : `${stage.picked.size} changes`}
            </button>
          </div>
        </div>
      )}

      {stage.at === "writing" && (
        <div className="p-3">
          <textarea
            ref={areaRef}
            rows={4}
            className="w-full"
            placeholder={
              source?.isRecord
                ? `Say what should change about ${source.label} — "put it on hold", "HBO passed", "add Danny as EP"…`
                : "Say what should change — \"Foul Play is sold to TBS\", \"add Rich Paul at Klutch\"…"
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void submit(true);
              }
            }}
          />
          {source && (
            <p className="mt-1.5 text-xs text-faint">
              About <span className="text-muted">{source.label}</span>
            </p>
          )}
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              className="text-xs text-faint hover:text-accent"
              disabled={!text.trim()}
              onClick={() => void submit(false)}
            >
              Just save a note
            </button>
            <button className="btn btn-primary btn-sm" disabled={!text.trim()} onClick={() => void submit(true)}>
              Make the change
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
