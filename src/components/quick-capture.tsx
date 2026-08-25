"use client";

// A note box that follows you around the app. The point is to capture a change
// the moment you notice it, from wherever you are, without losing your place —
// so it stays collapsed until you want it, remembers a half-written draft
// across navigation, and hands the note to Ingest for review like anything
// else. Notes written on a record carry that record as context, which is
// usually the difference between the note being understood and being guessed at.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useToast } from "@/components/toast";

const DRAFT_KEY = "quick-capture-draft";

/**
 * A readable name for wherever the note was written. The page heading is the
 * record's own name; the document title carries site branding, which is not
 * what we want to hand the reader as context.
 */
function whereFrom(pathname: string): { label: string; context: string } | null {
  if (pathname === "/" || pathname.startsWith("/uploads") || pathname.startsWith("/ingest")) return null;
  const heading = document.querySelector("main h1")?.textContent?.trim();
  if (!heading) return null;
  // A record page is /talent/aja-wilson; a directory is /talent.
  const isRecord = pathname.split("/").filter(Boolean).length >= 2;
  return {
    label: heading,
    context: isRecord
      ? `Written from the "${heading}" page in the Repo (${pathname}). Unless the note names something else, it is about that record.`
      : `Written from the ${heading} section of the Repo (${pathname}).`,
  };
}

export function QuickCapture() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<{ label: string; context: string } | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  // The save effect runs on mount with empty text; without this it would erase
  // the very draft the restore below is about to read.
  const restored = useRef(false);
  const pathname = usePathname();
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
    if (open) areaRef.current?.focus();
  }, [open]);

  const reveal = () => {
    setSource(whereFrom(pathname));
    setOpen(true);
  };

  const send = useCallback(async () => {
    const note = text.trim();
    if (!note || busy) return;
    // Read the page fresh at send time — you may have navigated while typing.
    const from = whereFrom(pathname);
    setBusy(true);
    try {
      const form = new FormData();
      form.set("text", note);
      if (from) {
        form.set("context", from.context);
        form.set("label", `Note — ${from.label}`);
      } else {
        form.set("label", "Note");
      }
      const res = await fetch("/api/ingest/upload", { method: "POST", body: form });
      const data = (await res.json()) as { items?: { id: string }[]; error?: string };
      if (!res.ok || !data.items?.length) {
        toast(data.error ?? "Could not save that note.", { tone: "error" });
        return;
      }
      setText("");
      setOpen(false);
      toast("Noted — it'll show up in Add Info once it's been read");

      // Read it in the background; the note is already safely stored.
      // Pasted text arrives already parsed, so it starts at triage.
      const id = data.items[0].id;
      for (const stage of ["triage", "propose"] as const) {
        const r = await fetch("/api/ingest/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, stage }),
        });
        const out = (await r.json()) as { ok?: boolean; status?: string };
        if (!out.ok || out.status === "irrelevant") break;
      }
    } catch {
      toast("Could not reach the server — your note is still in the box.", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }, [text, busy, pathname, toast]);

  if (!open) {
    return (
      <button
        onClick={reveal}
        aria-label="Write a note"
        className="fixed bottom-4 right-4 z-40 rounded-full border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium shadow-pop transition-colors hover:border-accent hover:text-accent"
      >
        ✎ Note{text ? <span className="ml-1.5 text-xs text-accent">draft</span> : null}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[min(24rem,calc(100vw-2rem))] rounded-md border border-line-strong bg-surface shadow-pop">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Quick note</span>
        <button
          onClick={() => setOpen(false)}
          aria-label="Collapse note box"
          className="text-muted hover:text-accent"
        >
          ✕
        </button>
      </div>
      <div className="p-3">
        <textarea
          ref={areaRef}
          rows={4}
          className="w-full"
          placeholder="Anything you noticed — a status change, a new contact, a correction…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void send();
            }
          }}
        />
        {source && (
          <p className="mt-1.5 text-xs text-faint">
            Filed against <span className="text-muted">{source.label}</span>
          </p>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-faint">Goes to Add Info for your review</span>
          <button className="btn btn-primary btn-sm" disabled={!text.trim() || busy} onClick={send}>
            {busy ? "Saving…" : "Save note"}
          </button>
        </div>
      </div>
    </div>
  );
}
