"use client";

// Settings → Options. One set at a time: rename, recolour, reorder, archive,
// restore, and merge one option into another with the affected record count
// shown before it happens.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { Modal } from "@/components/overlay";
import { Button } from "@/components/button";
import { archiveOption, createOption, mergeOption, optionUsageCount, recolorOption, renameOption, reorderOptions } from "@/lib/actions/options";
import { OPTION_COLORS, OPTION_COLOR_CLASS, type OptionColor } from "@/lib/option-cache";

type Row = { id: string; value: string; label: string; color: string | null; position: number; archived: boolean; mergedInto: string | null };
type SetRow = { key: string; label: string; description?: string; count: number };

export function OptionsAdmin({ sets, current, options, canEdit }: { sets: SetRow[]; current: string; options: Row[]; canEdit: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [merging, setMerging] = useState<Row | null>(null);
  const [mergeTarget, setMergeTarget] = useState("");
  const [usage, setUsage] = useState<number | null>(null);

  const live = options.filter((o) => !o.archived);
  const archived = options.filter((o) => o.archived);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    toast(res.ok ? ok : res.error ?? "Could not save.", res.ok ? {} : { tone: "error" });
    if (res.ok) router.refresh();
    return res.ok;
  };

  const move = async (id: string, delta: number) => {
    const order = live.map((o) => o.id);
    const i = order.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    await run(() => reorderOptions(current, order), "Reordered");
  };

  const openMerge = async (row: Row) => {
    setMerging(row);
    setMergeTarget("");
    setUsage(null);
    const u = await optionUsageCount(current, row.value);
    setUsage(u.total);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <nav aria-label="Option sets" className="min-w-0">
        <ul className="space-y-0.5">
          {sets.map((s) => (
            <li key={s.key}>
              <Link href={`/settings/options?set=${s.key}`} aria-current={s.key === current ? "page" : undefined}
                className={`flex items-baseline justify-between gap-2 rounded px-2.5 py-1.5 text-sm ${s.key === current ? "bg-surface font-semibold text-accent-deep shadow-card" : "text-charcoal hover:bg-surface/70"}`}>
                <span className="truncate">{s.label}</span>
                <span className="shrink-0 text-xs tabular-nums text-faint">{s.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section className="min-w-0" aria-label="Options in this set">
        {live.length === 0 && archived.length === 0 && <p className="text-sm text-faint">This set has no options yet.</p>}
        <ul className="divide-y divide-line rounded-md border border-line bg-surface">
          {live.map((o, i) => (
            <li key={o.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              {canEdit && (
                <span className="flex flex-col">
                  <button type="button" aria-label={`Move ${o.label} up`} disabled={i === 0 || busy} className="px-1 text-xs text-faint hover:text-accent disabled:opacity-30" onClick={() => void move(o.id, -1)}>▲</button>
                  <button type="button" aria-label={`Move ${o.label} down`} disabled={i === live.length - 1 || busy} className="px-1 text-xs text-faint hover:text-accent disabled:opacity-30" onClick={() => void move(o.id, 1)}>▼</button>
                </span>
              )}
              <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${OPTION_COLOR_CLASS[(o.color as OptionColor) ?? "gray"] ?? "bg-wash text-muted"}`}>{o.label}</span>
              {editing === o.id ? (
                <span className="flex items-center gap-1">
                  <input autoFocus value={draft} aria-label={`Rename ${o.label}`} className="!min-h-8 !w-48" disabled={busy}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void run(() => renameOption(o.id, draft), "Renamed").then((ok) => ok && setEditing(null)); } if (e.key === "Escape") setEditing(null); }} />
                  <Button size="sm" variant="primary" loading={busy} onClick={() => void run(() => renameOption(o.id, draft), "Renamed").then((ok) => ok && setEditing(null))}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                </span>
              ) : (
                <code className="text-xs text-faint">{o.value}</code>
              )}
              {canEdit && editing !== o.id && (
                <span className="ml-auto flex flex-wrap items-center gap-1">
                  <select aria-label={`Colour for ${o.label}`} className="!min-h-7 !w-auto !py-0.5 !text-xs" value={o.color ?? "gray"} disabled={busy}
                    onChange={(e) => void run(() => recolorOption(o.id, e.target.value), "Recoloured")}>
                    {OPTION_COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(o.id); setDraft(o.label); }}>Rename</Button>
                  <Button size="sm" variant="ghost" onClick={() => void openMerge(o)}>Merge…</Button>
                  <Button size="sm" variant="ghost" loading={busy} onClick={async () => {
                    const u = await optionUsageCount(current, o.value);
                    if (!(await confirm({ title: `Archive “${o.label}”?`, message: u.total ? `${u.total} record${u.total === 1 ? "" : "s"} keep this value; it just stops appearing in the pickers.` : "It disappears from the pickers. Nothing is deleted.", action: "Archive" }))) return;
                    await run(() => archiveOption(o.id), "Archived");
                  }}>Archive</Button>
                </span>
              )}
            </li>
          ))}
        </ul>

        {canEdit && (
          <div className="mt-3">
            {adding ? (
              <span className="flex flex-wrap items-center gap-1">
                <input autoFocus value={newLabel} placeholder="New option…" aria-label="New option name" className="!min-h-8 !w-48" disabled={busy}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void run(async () => createOption(current, newLabel), "Added").then((ok) => { if (ok) { setNewLabel(""); setAdding(false); } }); } if (e.key === "Escape") setAdding(false); }} />
                <Button size="sm" variant="primary" loading={busy} onClick={() => void run(async () => createOption(current, newLabel), "Added").then((ok) => { if (ok) { setNewLabel(""); setAdding(false); } })}>Add</Button>
                <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              </span>
            ) : (
              <Button size="sm" onClick={() => setAdding(true)}>+ Add an option</Button>
            )}
          </div>
        )}

        {archived.length > 0 && (
          <div className="mt-6">
            <h2 className="overline mb-2">Archived</h2>
            <ul className="divide-y divide-line rounded-md border border-dashed border-line bg-wash/40">
              {archived.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-sm">
                  <span className="text-muted">{o.label}</span>
                  <code className="text-xs text-faint">{o.value}</code>
                  {o.mergedInto && <span className="text-xs text-faint">merged into {options.find((x) => x.id === o.mergedInto)?.label ?? "another option"}</span>}
                  {canEdit && <Button size="sm" variant="ghost" className="ml-auto" loading={busy} onClick={() => void run(() => archiveOption(o.id, true), "Restored")}>Restore</Button>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Modal open={!!merging} onClose={() => setMerging(null)} title={merging ? `Merge “${merging.label}” into…` : ""}>
          <p className="text-sm text-muted">
            {usage === null ? "Counting the records that use it…" : `${usage} record${usage === 1 ? "" : "s"} carry “${merging?.label}”. They will all be moved to the option you pick, each with its own history entry. “${merging?.label}” is archived with a pointer to where it went.`}
          </p>
          <label className="mt-3 block text-sm">
            <span className="mb-1 block text-xs font-semibold text-muted">Keep</span>
            <select value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} aria-label="Option to keep">
              <option value="">Choose an option…</option>
              {live.filter((o) => o.id !== merging?.id).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <Button size="sm" onClick={() => setMerging(null)}>Cancel</Button>
            <Button size="sm" variant="accent" loading={busy} disabled={!mergeTarget}
              onClick={async () => {
                if (!merging || !mergeTarget) return;
                setBusy(true);
                const res = await mergeOption(merging.id, mergeTarget);
                setBusy(false);
                if (!res.ok) return toast(res.error, { tone: "error" });
                toast(`Merged — ${res.reassigned} record${res.reassigned === 1 ? "" : "s"} moved.`);
                setMerging(null);
                router.refresh();
              }}>Merge</Button>
          </div>
        </Modal>
      </section>
    </div>
  );
}
