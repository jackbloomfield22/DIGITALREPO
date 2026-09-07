"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { captureQuick } from "@/lib/actions/hq";

// The one box. It reads what you type and files it: "call Alex tomorrow",
// "idea: retired QBs prank format", "lunch w/ Sam Rivers thu 1pm #openwater".
// After each capture it shows how it read the line, so a wrong guess is
// obvious and one click away from being fixed.

const HINTS = [
  "call Alex Chen tomorrow about the deck",
  "idea: a prank format built around retired quarterbacks",
  "lunch w/ Sam Rivers thu 1pm #open-water",
  "note: buyers at the upfront kept asking for docuseries with a game show spine",
  "follow up with Netflix on Grit City next week",
];

export function CaptureBar() {
  const [text, setText] = useState("");
  const [last, setLast] = useState<{ kind: string; title: string; href: string; reading: string[]; resolved: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Rotates daily rather than randomly, so the server and the browser agree.
  const hint = HINTS[new Date().getDate() % HINTS.length];
  const ref = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  const submit = () => {
    const raw = text.trim();
    if (!raw || pending) return;
    setError(null);
    start(async () => {
      const r = await captureQuick(raw);
      if (!r.ok) { setError(r.error); return; }
      setLast({ kind: r.kind, title: r.title, href: r.href, reading: r.reading, resolved: r.resolved });
      setText("");
      router.refresh();
    });
  };

  return (
    <div className="mb-5">
      <div className="flex items-start gap-2">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder={`Capture anything — e.g. “${hint}”`}
          className="min-h-[42px] flex-1 resize-y"
          aria-label="Capture"
        />
        <button className="btn btn-primary" disabled={!text.trim() || pending} onClick={submit}>
          {pending ? "Filing…" : "Capture"}
        </button>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-faint">
        <span>Enter to file. Shift+Enter for a new line; a blank line starts the notes.</span>
        <span>@Name links a person · #card links a pipeline card · “idea:”, “note:”, “call…”, “lunch w/… thu 1pm” pick where it goes.</span>
      </div>
      {error && <div className="mt-2 rounded bg-[#f6e3e0] px-3 py-2 text-sm text-[#8a3a30]">{error}</div>}
      {last && !error && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded bg-wash px-3 py-2 text-sm">
          <span>
            Filed as <span className="font-semibold">{last.kind.replace("_", "-")}</span>:{" "}
            <Link href={last.href} className="underline decoration-line-strong underline-offset-2 hover:text-accent">{last.title}</Link>
          </span>
          {[...last.resolved, ...last.reading].map((r, i) => <span key={i} className="text-xs text-muted">{r}</span>)}
          <button className="ml-auto text-xs text-faint hover:text-accent" onClick={() => setLast(null)}>×</button>
        </div>
      )}
    </div>
  );
}
