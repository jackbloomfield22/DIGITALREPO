"use client";

import { useRef, useState, useTransition } from "react";

// Inline, autosaving fields. Click to edit, blur or pause to save; the
// status word next to the label says what happened. Used across HQ so every
// page edits the same way and nothing needs a form.

export function AutoText({
  label, value, onSave, multiline, placeholder, rows = 3, className = "",
}: {
  label?: string; value: string | null | undefined; onSave: (v: string) => Promise<unknown>;
  multiline?: boolean; placeholder?: string; rows?: number; className?: string;
}) {
  const [text, setText] = useState(value ?? "");
  const [saved, setSaved] = useState(value ?? "");
  const [state, setState] = useState<"idle" | "dirty" | "saving" | "saved" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A new value from the server (after a refresh) replaces what is shown,
  // unless the field is mid-edit.
  const [seen, setSeen] = useState(value ?? "");
  if ((value ?? "") !== seen) {
    setSeen(value ?? "");
    if (state === "idle" || state === "saved") { setText(value ?? ""); setSaved(value ?? ""); }
  }

  const save = async (v: string) => {
    if (v === saved) { setState("idle"); return; }
    setState("saving");
    try { await onSave(v); setSaved(v); setState("saved"); setTimeout(() => setState("idle"), 1500); }
    catch { setState("failed"); }
  };
  const change = (v: string) => {
    setText(v); setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(v), 1200);
  };
  const Tag = multiline ? "textarea" : "input";
  return (
    <div className={className}>
      {label && (
        <div className="mb-1 flex items-baseline justify-between">
          <span className="overline">{label}</span>
          <span className="text-xs text-faint">{state === "saving" ? "saving…" : state === "saved" ? "saved" : state === "failed" ? "not saved" : state === "dirty" ? "…" : ""}</span>
        </div>
      )}
      <Tag
        value={text}
        onChange={(e) => change(e.target.value)}
        onBlur={() => { if (timer.current) clearTimeout(timer.current); void save(text); }}
        placeholder={placeholder}
        rows={multiline ? rows : undefined}
        className={`w-full ${multiline ? "resize-y leading-relaxed" : ""} text-sm`}
      />
    </div>
  );
}

export function AutoSelect({ label, value, options, onSave }: { label?: string; value: string; options: { value: string; label: string }[]; onSave: (v: string) => Promise<unknown> }) {
  const [pending, start] = useTransition();
  return (
    <label className="block">
      {label && <span className="overline mb-1 block">{label}</span>}
      <select value={value} disabled={pending} onChange={(e) => start(async () => { await onSave(e.target.value); })} className="w-full text-sm">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function AutoDate({ label, value, onSave }: { label?: string; value: string | null; onSave: (v: string | null) => Promise<unknown> }) {
  const [pending, start] = useTransition();
  const v = value ? new Date(value).toISOString().slice(0, 10) : "";
  return (
    <label className="block">
      {label && <span className="overline mb-1 block">{label}</span>}
      <input type="date" value={v} disabled={pending} onChange={(e) => start(async () => { await onSave(e.target.value ? new Date(e.target.value + "T12:00:00").toISOString() : null); })} className="w-full text-sm" />
    </label>
  );
}

export function TagsField({ label, value, onSave, placeholder = "Add and press Enter" }: { label?: string; value: string[]; onSave: (v: string[]) => Promise<unknown>; placeholder?: string }) {
  const [tags, setTags] = useState(value);
  const [draft, setDraft] = useState("");
  const [seen, setSeen] = useState(value);
  if (value !== seen) { setSeen(value); setTags(value); }
  const commit = (next: string[]) => { setTags(next); void onSave(next); };
  return (
    <div>
      {label && <span className="overline mb-1 block">{label}</span>}
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((t) => (
          <span key={t} className="chip">
            {t}
            <button type="button" className="ml-1 text-faint hover:text-[#8a3a30]" onClick={() => commit(tags.filter((x) => x !== t))} aria-label={`Remove ${t}`}>×</button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === ",") && draft.trim()) { e.preventDefault(); const t = draft.trim(); if (!tags.includes(t)) commit([...tags, t]); setDraft(""); }
            if (e.key === "Backspace" && !draft && tags.length) commit(tags.slice(0, -1));
          }}
          placeholder={placeholder}
          className="!w-40 text-sm"
        />
      </div>
    </div>
  );
}

export function Stars({ value, onSave }: { value: number; onSave: (v: number) => Promise<unknown> }) {
  const [v, setV] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) { setSeen(value); setV(value); }
  return (
    <span className="inline-flex gap-0.5" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className={`text-lg leading-none ${n <= v ? "text-accent" : "text-line-strong hover:text-faint"}`} onClick={() => { const next = n === v ? 0 : n; setV(next); void onSave(next); }} aria-label={`${n} star${n > 1 ? "s" : ""}`}>★</button>
      ))}
    </span>
  );
}
