"use client";

// Settings → Fields: the custom fields on each record type, and the form that
// adds one. A field's type never changes after it is made, so the form is the
// only place a type is chosen.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { Button } from "@/components/button";
import { archiveFieldDefinition, createFieldDefinition, reorderFieldDefinitions, updateFieldDefinition } from "@/lib/actions/fields";
import type { FieldType } from "@/lib/custom-fields";

type Field = {
  id: string; key: string; name: string; type: string; optionSetKey: string | null; relationType: string | null;
  required: boolean; indexed: boolean; showInNeedsAttention: boolean; archived: boolean;
};
type Choice = { value: string; label: string };

export function FieldsAdmin({ recordType, types, fields, fieldTypes, optionSets, recordTypes, canEdit }: {
  recordType: string;
  types: { value: string; label: string; count: number }[];
  fields: Field[];
  fieldTypes: { value: FieldType; label: string }[];
  optionSets: Choice[];
  recordTypes: Choice[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [optionSetKey, setOptionSetKey] = useState("");
  const [newOptionSet, setNewOptionSet] = useState("");
  const [relationType, setRelationType] = useState("creator");
  const [required, setRequired] = useState(false);
  const [indexed, setIndexed] = useState(false);
  const [alerts, setAlerts] = useState(false);

  const live = fields.filter((f) => !f.archived);
  const archived = fields.filter((f) => f.archived);
  const needsOptions = type === "select" || type === "multiselect";

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    toast(res.ok ? ok : res.error ?? "Could not save.", res.ok ? {} : { tone: "error" });
    if (res.ok) router.refresh();
    return res.ok;
  };

  const move = async (id: string, delta: number) => {
    const order = live.map((f) => f.id);
    const i = order.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    await run(() => reorderFieldDefinitions(recordType, order), "Reordered");
  };

  const add = async () => {
    const ok = await run(() => createFieldDefinition({
      recordType, name, type,
      optionSetKey: needsOptions ? optionSetKey || undefined : undefined,
      newOptionSet: needsOptions && !optionSetKey ? newOptionSet || name : undefined,
      relationType: type === "relation" ? relationType : undefined,
      required, indexed, showInNeedsAttention: alerts && type === "date",
    }), "Field added");
    if (ok) { setAdding(false); setName(""); setType("text"); setOptionSetKey(""); setNewOptionSet(""); setRequired(false); setIndexed(false); setAlerts(false); }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <nav aria-label="Record types" className="min-w-0">
        <ul className="space-y-0.5">
          {types.map((t) => (
            <li key={t.value}>
              <Link href={`/settings/fields?type=${t.value}`} aria-current={t.value === recordType ? "page" : undefined}
                className={`flex items-baseline justify-between gap-2 rounded px-2.5 py-1.5 text-sm ${t.value === recordType ? "bg-surface font-semibold text-accent-deep shadow-card" : "text-charcoal hover:bg-surface/70"}`}>
                <span className="truncate">{t.label}</span>
                <span className="shrink-0 text-xs tabular-nums text-faint">{t.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section className="min-w-0" aria-label="Fields on this record type">
        {live.length === 0 && <p className="text-sm text-faint">No fields added to this record type yet.</p>}
        {live.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  {canEdit && <th className="w-10 px-2 py-2" aria-label="Reorder" />}
                  <th className="px-3 py-2 font-semibold">Field</th>
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 font-semibold">Required</th>
                  <th className="px-3 py-2 font-semibold">Indexed</th>
                  <th className="px-3 py-2 font-semibold">Needs attention</th>
                  {canEdit && <th className="px-3 py-2" aria-label="Actions" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {live.map((f, i) => (
                  <tr key={f.id}>
                    {canEdit && (
                      <td className="px-2 py-1.5">
                        <span className="flex flex-col">
                          <button type="button" aria-label={`Move ${f.name} up`} disabled={i === 0 || busy} className="px-1 text-xs text-faint hover:text-accent disabled:opacity-30" onClick={() => void move(f.id, -1)}>▲</button>
                          <button type="button" aria-label={`Move ${f.name} down`} disabled={i === live.length - 1 || busy} className="px-1 text-xs text-faint hover:text-accent disabled:opacity-30" onClick={() => void move(f.id, 1)}>▼</button>
                        </span>
                      </td>
                    )}
                    <td className="px-3 py-2"><span className="font-medium">{f.name}</span> <code className="text-xs text-faint">{f.key}</code></td>
                    <td className="px-3 py-2 text-muted">
                      {fieldTypes.find((t) => t.value === f.type)?.label ?? f.type}
                      {f.optionSetKey && <> · <Link href={`/settings/options?set=${f.optionSetKey}`} className="underline underline-offset-2 hover:text-accent">{f.optionSetKey.replace(/_/g, " ")}</Link></>}
                      {f.relationType && <> · {f.relationType}</>}
                    </td>
                    {(["required", "indexed", "showInNeedsAttention"] as const).map((flag) => (
                      <td key={flag} className="px-3 py-2">
                        <input type="checkbox" className="!w-auto" aria-label={`${flag} for ${f.name}`} checked={f[flag]} disabled={!canEdit || busy || (flag === "showInNeedsAttention" && f.type !== "date")}
                          onChange={(e) => void run(() => updateFieldDefinition(f.id, { [flag]: e.target.checked }), "Saved")} />
                      </td>
                    ))}
                    {canEdit && (
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="ghost" loading={busy} onClick={async () => {
                          if (!(await confirm({ title: `Archive “${f.name}”?`, message: "It disappears from the Details panel, lists and filters. Every value already entered is kept, and restoring brings them all back.", action: "Archive" }))) return;
                          await run(() => archiveFieldDefinition(f.id), "Archived");
                        }}>Archive</Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canEdit && !adding && <Button size="sm" className="mt-3" onClick={() => setAdding(true)}>+ Add a field</Button>}
        {canEdit && adding && (
          <form className="mt-3 rounded-md border border-line bg-surface p-4" onSubmit={(e) => { e.preventDefault(); void add(); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-muted">Name</span>
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Deal status" required />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-muted">Type (cannot be changed later)</span>
                <select value={type} onChange={(e) => setType(e.target.value as FieldType)}>
                  {fieldTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
              {needsOptions && (
                <>
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-semibold text-muted">Choices from</span>
                    <select value={optionSetKey} onChange={(e) => setOptionSetKey(e.target.value)}>
                      <option value="">A new list…</option>
                      {optionSets.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </label>
                  {!optionSetKey && (
                    <label className="block text-sm">
                      <span className="mb-1 block text-xs font-semibold text-muted">New list name</span>
                      <input value={newOptionSet} onChange={(e) => setNewOptionSet(e.target.value)} placeholder="Defaults to the field name" />
                    </label>
                  )}
                </>
              )}
              {type === "relation" && (
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-semibold text-muted">Points at</span>
                  <select value={relationType} onChange={(e) => setRelationType(e.target.value)}>
                    {recordTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </label>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" className="!w-auto" checked={required} onChange={(e) => setRequired(e.target.checked)} />Required</label>
              <label className="flex items-center gap-2"><input type="checkbox" className="!w-auto" checked={indexed} onChange={(e) => setIndexed(e.target.checked)} />Indexed <span className="text-xs text-faint">(quicker filtering)</span></label>
              {type === "date" && <label className="flex items-center gap-2"><input type="checkbox" className="!w-auto" checked={alerts} onChange={(e) => setAlerts(e.target.checked)} />Show in Needs attention <span className="text-xs text-faint">(30 days out and overdue)</span></label>}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" onClick={() => setAdding(false)}>Cancel</Button>
              <Button size="sm" variant="primary" type="submit" loading={busy} disabled={!name.trim()}>Add field</Button>
            </div>
          </form>
        )}

        {archived.length > 0 && (
          <div className="mt-6">
            <h2 className="overline mb-2">Archived</h2>
            <ul className="divide-y divide-line rounded-md border border-dashed border-line bg-wash/40">
              {archived.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-sm">
                  <span className="text-muted">{f.name}</span>
                  <code className="text-xs text-faint">{f.key}</code>
                  {canEdit && <Button size="sm" variant="ghost" className="ml-auto" loading={busy} onClick={() => void run(() => archiveFieldDefinition(f.id, true), "Restored")}>Restore</Button>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
