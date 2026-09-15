"use client";

// Click a value to edit it. Text and numbers commit on Enter, Tab or blur;
// paragraphs on ⌘Enter or blur; Escape puts the old value back. The change
// shows at once and is written behind it — if the write fails the old value
// returns with a Retry, if someone else changed the record first you are told
// who, and every successful save can be undone from the toast for a while.

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { setField } from "@/lib/actions/inline";
import { displayValue, isEmptyValue, sameValue, type DetailField } from "@/lib/record-fields";
import { useToast } from "@/components/toast";

// --- Version store -----------------------------------------------------------
// Every editor on a page shares the record's version, so a save from the
// heading and a save from the details panel never fight over a stale number.

const versions = new Map<string, number | null>();
const listeners = new Set<() => void>();
const key = (type: string, id: string) => `${type}:${id}`;
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

export function useRecordVersion(type: string, id: string, initial: number | null): [number | null, (v: number | null) => void] {
  const k = key(type, id);
  if (!versions.has(k)) versions.set(k, initial);
  const v = useSyncExternalStore(subscribe, () => versions.get(k) ?? null, () => initial);
  return [v, (next) => { versions.set(k, next); notify(); }];
}

/** The version as of right now — for a save started from an older closure, such as an Undo. */
const currentVersion = (type: string, id: string) => versions.get(key(type, id)) ?? null;

/** Server-rendered pages hand the latest version down on every refresh. */
export function RecordVersion({ type, id, version }: { type: string; id: string; version: number | null }) {
  useEffect(() => { versions.set(key(type, id), version); notify(); }, [type, id, version]);
  return null;
}

// --- The editor --------------------------------------------------------------

type Props = {
  type: string;
  id: string;
  field: DetailField;
  canEdit: boolean;
  /** Heading style for the record's name. */
  heading?: boolean;
  className?: string;
  placeholder?: string;
  /** Called after a successful save, with the plain value now stored. */
  onSaved?: (value: DetailField["value"]) => void;
  /** Focus the editor as soon as it mounts. */
  autoFocus?: boolean;
  /** Custom read-only rendering. */
  render?: (value: DetailField["value"]) => ReactNode;
};

type Save = "idle" | "pending" | "saving" | "saved";

export function InlineField({ type, id, field, canEdit, heading, className, placeholder, onSaved, autoFocus, render }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [, setVersion] = useRecordVersion(type, id, null);
  const [seen, setSeen] = useState(field.value);
  const [value, setValue] = useState(field.value);
  if (!sameValue(seen, field.value)) { setSeen(field.value); setValue(field.value); }
  const [editing, setEditing] = useState(!!autoFocus);
  const [draft, setDraft] = useState<string>("");
  const [draftList, setDraftList] = useState<string[]>([]);
  const [save, setSave] = useState<Save>("idle");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);
  const timer = useRef<number | null>(null);
  const savedTimer = useRef<number | null>(null);
  const cancelled = useRef(false);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); if (savedTimer.current) window.clearTimeout(savedTimer.current); }, []);
  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  const begin = () => {
    if (!canEdit) return;
    cancelled.current = false;
    if (Array.isArray(value)) { setDraftList(value); setDraft(value.join(", ")); }
    else setDraft(value == null ? "" : String(value));
    setEditing(true);
  };

  const commit = async (raw: string | string[], opts: { undoOf?: DetailField["value"]; quiet?: boolean } = {}) => {
    setEditing(false);
    const prev = opts.undoOf === undefined ? value : opts.undoOf;
    const nextPlain: DetailField["value"] = Array.isArray(raw)
      ? raw
      : field.kind === "list" || field.kind === "vocablist"
        ? raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
        : field.kind === "number" || field.kind === "year"
          ? (raw.trim() === "" ? null : Number(raw))
          : raw.trim() || null;
    if (sameValue(prev, nextPlain) && opts.undoOf === undefined) return;
    setValue(nextPlain);
    setSave("pending");
    timer.current = window.setTimeout(() => setSave((s) => (s === "pending" ? "saving" : s)), 300);
    const res = await setField({ type, id, field: field.name, value: raw, expectedVersion: currentVersion(type, id) });
    if (timer.current) window.clearTimeout(timer.current);
    if (res.ok) {
      setVersion(res.version);
      setValue(res.value);
      setSave("saved");
      savedTimer.current = window.setTimeout(() => setSave("idle"), 1500);
      onSaved?.(res.value);
      if (res.changed && !opts.quiet) {
        toast(`Saved ${field.label.toLowerCase()}`, { undo: () => commit(toRaw(prev), { undoOf: res.value, quiet: true }) });
      }
      router.refresh();
    } else {
      setValue(prev);
      setSave("idle");
      if (res.conflict) {
        setVersion(res.conflict.version);
        toast(`Changed by ${res.conflict.editedBy} just now — the page will reload with their version.`, { tone: "error", action: { label: "Reload", run: () => router.refresh() } });
        router.refresh();
      } else {
        toast(res.error, { tone: "error", action: { label: "Retry", run: () => commit(raw, opts) } });
      }
    }
  };

  const cancel = () => { cancelled.current = true; setEditing(false); };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancel(); return; }
    const multi = field.kind === "longtext";
    if (e.key === "Enter" && (!multi || e.metaKey || e.ctrlKey)) { e.preventDefault(); void commit(field.kind === "vocablist" ? draftList : draft); return; }
    if (e.key === "Tab") { void commit(field.kind === "vocablist" ? draftList : draft); }
  };
  const onBlur = () => { if (cancelled.current) { cancelled.current = false; return; } if (editing) void commit(field.kind === "vocablist" ? draftList : draft); };

  const empty = isEmptyValue(value);
  const shown = render ? render(value) : displayValue(field, value);

  // --- Read-only ---------------------------------------------------------------
  if (!editing) {
    const status = save === "saving" ? <span className="ml-1.5 text-[11px] text-faint">Saving…</span> : save === "saved" ? <span className="ml-1.5 text-[11px] text-ok" aria-label="Saved">✓</span> : null;
    if (!canEdit) {
      return empty ? <span className={`text-faint ${className ?? ""}`}>—</span> : <span className={`${heading ? "" : "whitespace-pre-line"} ${className ?? ""}`}>{shown}</span>;
    }
    return (
      <button
        type="button"
        onClick={begin}
        aria-label={`Edit ${field.label}`}
        title="Click to edit"
        data-inline-field={field.name}
        className={`group/inline inline-edit -mx-1.5 -my-0.5 max-w-full rounded px-1.5 py-0.5 text-left transition-colors hover:bg-wash focus-visible:bg-wash ${heading ? "" : "whitespace-pre-line"} ${className ?? ""}`}
      >
        {empty ? <span className="text-faint">{placeholder ?? "Add…"}</span> : shown}
        {status}
      </button>
    );
  }

  // --- Editing -------------------------------------------------------------------
  const base = "!min-h-0 w-full";
  if (field.kind === "longtext") {
    const rows = Math.min(14, Math.max(3, draft.split("\n").length + 1));
    return (
      <div className={className}>
        <textarea ref={inputRef as never} className={`${base} text-[15px] leading-relaxed`} rows={rows} value={draft} aria-label={field.label} maxLength={field.maxLength} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={onBlur} />
        <div className="mt-1 text-[11px] text-faint">⌘↩ to save · Esc to cancel</div>
      </div>
    );
  }
  if (field.kind === "vocab") {
    return (
      <select ref={inputRef as never} className={`${base} ${heading ? "" : "text-sm"} ${className ?? ""}`} value={draft} aria-label={field.label}
        onChange={(e) => { setDraft(e.target.value); void commit(e.target.value); }} onKeyDown={onKey} onBlur={onBlur}>
        {field.name !== "status" && <option value="">—</option>}
        {(field.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  if (field.kind === "vocablist") {
    const toggle = (v: string) => setDraftList((l) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]));
    return (
      <div className={`rounded-md border border-line bg-surface p-2 shadow-pop ${className ?? ""}`} role="group" aria-label={field.label} onKeyDown={onKey}>
        <div className="max-h-56 overflow-y-auto">
          {(field.options ?? []).map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-wash">
              <input type="checkbox" checked={draftList.includes(o.value)} onChange={() => toggle(o.value)} />{o.label}
            </label>
          ))}
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={cancel}>Cancel</button>
          <button type="button" className="btn btn-primary btn-sm" ref={inputRef as never} onClick={() => void commit(draftList)}>Done</button>
        </div>
      </div>
    );
  }
  const inputType = field.kind === "date" ? "date" : field.kind === "number" || field.kind === "year" ? "number" : field.name.toLowerCase().includes("email") ? "email" : field.name.toLowerCase().includes("url") || field.name === "website" ? "url" : "text";
  return (
    <input
      ref={inputRef as never}
      type={inputType}
      inputMode={field.kind === "number" || field.kind === "year" ? "numeric" : undefined}
      className={`${base} ${heading ? "font-display text-3xl font-bold tracking-tight sm:text-4xl" : "text-sm"} ${className ?? ""}`}
      value={draft}
      aria-label={field.label}
      maxLength={field.maxLength}
      placeholder={field.kind === "list" ? "One, two, three" : placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={onKey}
      onBlur={onBlur}
    />
  );
}

function toRaw(v: DetailField["value"]): string | string[] {
  if (v == null) return "";
  if (Array.isArray(v)) return v;
  return String(v);
}
