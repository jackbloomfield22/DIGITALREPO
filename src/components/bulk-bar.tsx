"use client";

// The floating bar that appears when rows are selected: how many, the
// actions, and a way to widen the selection to everything the filters match.
// Every action is undoable from the toast as one batch.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { bulkApply, undoBatch, type BulkOp } from "@/lib/actions/bulk";
import { useToast } from "@/components/toast";
import type { LabeledValue } from "@/lib/filters";

type LookupItem = { id: string; name: string; sub?: string };

export function BulkBar({ type, selected, matching, onClear, onSelectAll, statuses, taggable }: {
  type: string; selected: string[]; matching: string[]; onClear: () => void; onSelectAll: () => void; statuses?: LabeledValue[]; taggable?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [tagQ, setTagQ] = useState("");
  const [tagOpen, setTagOpen] = useState(false);
  const [tags, setTags] = useState<LookupItem[]>([]);
  const { toast } = useToast();
  const router = useRouter();
  useEffect(() => {
    if (!tagOpen) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try { const res = await fetch(`/api/lookup?type=entity&q=${encodeURIComponent(tagQ)}`, { signal: controller.signal }); if (res.ok) setTags((await res.json()) as LookupItem[]); } catch { /* typed on */ }
    }, 150);
    return () => { clearTimeout(t); controller.abort(); };
  }, [tagQ, tagOpen]);
  if (!selected.length) return null;
  const run = async (op: BulkOp) => {
    setBusy(true);
    const r = await bulkApply(type, selected, op);
    setBusy(false);
    if (!r.ok) return toast(r.error, { tone: "error" });
    toast(`${r.changed} record${r.changed === 1 ? "" : "s"} ${r.label}.`, { undo: async () => { const u = await undoBatch(r.batchId); toast(u.ok ? `Put ${u.restored} record${u.restored === 1 ? "" : "s"} back.` : u.error ?? "Could not undo.", { tone: u.ok ? "default" : "error" }); router.refresh(); } });
    onClear();
    router.refresh();
  };
  return (
    <div role="region" aria-label="Bulk actions" className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 lg:left-60 peek-open:lg:right-[28rem]">
      <div className="flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-line bg-ink px-3 py-2 text-sm text-paper shadow-pop">
        <span className="font-medium tabular-nums">{selected.length} selected</span>
        {matching.length > selected.length && <button type="button" className="underline decoration-dotted underline-offset-2 hover:text-accent-wash" onClick={onSelectAll}>Select all {matching.length} matching</button>}
        <span className="mx-1 h-4 w-px bg-paper/30" aria-hidden />
        {statuses && statuses.length > 0 && (
          <select className="!min-h-8 !w-auto !border-paper/30 !bg-ink !py-0.5 !text-paper" aria-label="Change status" disabled={busy} value="" onChange={(e) => { if (e.target.value) void run({ kind: "status", status: e.target.value }); }}>
            <option value="">Change status…</option>
            {statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        )}
        {taggable && (
          <div className="relative">
            <button type="button" className="rounded border border-paper/30 px-2 py-0.5 hover:bg-paper/10" disabled={busy} onClick={() => setTagOpen(!tagOpen)} aria-expanded={tagOpen}>Add tag…</button>
            {tagOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-64 rounded-md border border-line bg-surface p-2 text-ink shadow-pop">
                <input autoFocus type="search" className="!min-h-8" placeholder="Find a tag…" aria-label="Find a tag" value={tagQ} onChange={(e) => setTagQ(e.target.value)} />
                <div className="mt-1 max-h-48 overflow-y-auto">{tags.map((t) => <button type="button" key={t.id} className="filter-option" onClick={() => { setTagOpen(false); void run({ kind: "tag", entityId: t.id, entityName: t.name }); }}><span className="truncate">{t.name}</span>{t.sub && <span className="ml-auto text-xs text-muted">{t.sub}</span>}</button>)}</div>
              </div>
            )}
          </div>
        )}
        <button type="button" className="rounded border border-paper/30 px-2 py-0.5 hover:bg-paper/10" disabled={busy} onClick={() => void run({ kind: "archive" })}>Archive</button>
        <button type="button" className="ml-1 text-paper/70 hover:text-paper" onClick={onClear} aria-label="Clear selection">×</button>
      </div>
    </div>
  );
}
