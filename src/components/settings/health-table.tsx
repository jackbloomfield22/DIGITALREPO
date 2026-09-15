"use client";

// The Health page's working list: tick the records you have dealt with and
// verify them, or hand them all to an owner, in one go.

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { bulkApply, undoBatch, type BulkOp } from "@/lib/actions/bulk";
import { useToast } from "@/components/toast";
import { Button } from "@/components/button";

type Row = { id: string; name: string; href: string; sub: string };

export function HealthTable({ recordType, rows, members, canEdit }: {
  recordType: string; rows: Row[]; members: { id: string; name: string }[]; canEdit: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const all = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const run = async (op: BulkOp) => {
    setBusy(true);
    const res = await bulkApply(recordType, [...selected], op);
    setBusy(false);
    if (!res.ok) return toast(res.error, { tone: "error" });
    toast(`${res.changed} record${res.changed === 1 ? "" : "s"} ${res.label}.`, {
      undo: async () => { const u = await undoBatch(res.batchId); toast(u.ok ? `Put ${u.restored} record${u.restored === 1 ? "" : "s"} back.` : u.error ?? "Could not undo.", { tone: u.ok ? "default" : "error" }); router.refresh(); },
    });
    setSelected(new Set());
    router.refresh();
  };

  return (
    <div>
      {canEdit && selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-line bg-wash px-3 py-2 text-sm">
          <span className="font-medium tabular-nums">{selected.size} selected</span>
          <Button size="sm" loading={busy} onClick={() => void run({ kind: "verify" })}>✓ Verify these</Button>
          <select className="!min-h-8 !w-auto" aria-label="Set an owner" disabled={busy} value=""
            onChange={(e) => { const m = members.find((x) => x.id === e.target.value); if (m) void run({ kind: "owner", userId: m.id, userName: m.name }); }}>
            <option value="">Set owner…</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button type="button" className="ml-auto text-muted hover:text-accent" onClick={() => setSelected(new Set())} aria-label="Clear selection">×</button>
        </div>
      )}
      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-wash text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              {canEdit && <th className="w-8 px-2 py-2"><input type="checkbox" className="!w-auto" aria-label="Select all" checked={all} onChange={() => setSelected(all ? new Set() : new Set(rows.map((r) => r.id)))} /></th>}
              <th className="px-3 py-2 font-semibold">Record</th>
              <th className="px-3 py-2 font-semibold">Why it is here</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/70">
            {rows.map((r) => (
              <tr key={r.id} className={selected.has(r.id) ? "bg-accent-wash/50" : "hover:bg-wash/60"}>
                {canEdit && (
                  <td className="px-2 py-2">
                    <input type="checkbox" className="!w-auto" aria-label={`Select ${r.name}`} checked={selected.has(r.id)}
                      onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} />
                  </td>
                )}
                <td className="px-3 py-2"><Link href={r.href} className="font-medium hover:text-accent-deep hover:underline">{r.name}</Link></td>
                <td className="px-3 py-2 text-muted">{r.sub}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
