"use client";

// Two records side by side, one radio per field for which value survives.
// Pick which record is kept; the other is archived with a "merged into"
// pointer once you confirm.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { mergeRecords } from "@/lib/actions/merge";
import { useToast } from "@/components/toast";
import { displayValue, isEmptyValue, type DetailField } from "@/lib/record-fields";
import type { MergeableType } from "@/lib/merge-records";

type Side = { id: string; name: string; href: string; archived: boolean; updatedAt: string; history: number };
type Row = { name: string; label: string; kind: DetailField["kind"]; options?: DetailField["options"]; a: DetailField["value"]; b: DetailField["value"] };

export function MergeCompare({ type, a, b, rows }: { type: MergeableType; a: Side; b: Side; rows: Row[] }) {
  const [keep, setKeep] = useState<"a" | "b">(a.archived && !b.archived ? "b" : "a");
  const [picks, setPicks] = useState<Record<string, "a" | "b">>(() => {
    const init: Record<string, "a" | "b"> = {};
    for (const r of rows) init[r.name] = !isEmptyValue(r.a) ? "a" : !isEmptyValue(r.b) ? "b" : "a";
    return init;
  });
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const winner = keep === "a" ? a : b;
  const loser = keep === "a" ? b : a;
  const differing = rows.filter((r) => !(isEmptyValue(r.a) && isEmptyValue(r.b)) && JSON.stringify(r.a) !== JSON.stringify(r.b));

  const run = async () => {
    setBusy(true);
    const fromLoser: Record<string, unknown> = {};
    for (const r of rows) {
      const chosen = picks[r.name];
      if (chosen && chosen !== keep) fromLoser[r.name] = chosen === "a" ? r.a : r.b;
    }
    const res = await mergeRecords({ type, winnerId: winner.id, loserId: loser.id, picks: fromLoser });
    setBusy(false);
    if (!res.ok) return toast(res.error, { tone: "error" });
    toast(`Merged ${loser.name} into ${winner.name}: ${res.outcome.relinked} links moved${res.outcome.dropped ? `, ${res.outcome.dropped} duplicates dropped` : ""}.`);
    router.push(res.href);
    router.refresh();
  };

  const head = (side: "a" | "b", s: Side) => (
    <th className="px-3 py-2 text-left align-top">
      <label className="flex cursor-pointer items-start gap-2">
        <input type="radio" name="keep" className="mt-1" checked={keep === side} onChange={() => setKeep(side)} />
        <span>
          <span className="block font-semibold"><Link href={s.href} className="hover:underline">{s.name}</Link></span>
          <span className="block text-xs font-normal text-muted">{keep === side ? "Kept" : "Archived as merged"} · {s.history} history entries{s.archived ? " · in the Archive" : ""}</span>
        </span>
      </label>
    </th>
  );

  return (
    <div className="mt-5">
      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-xs">
            <tr><th className="px-3 py-2 text-left font-semibold text-muted">Field</th>{head("a", a)}{head("b", b)}</tr>
          </thead>
          <tbody className="divide-y divide-line/70">
            <tr>
              <td className="px-3 py-2 text-muted">Name</td>
              <td className="px-3 py-2 font-medium">{a.name}</td>
              <td className="px-3 py-2 font-medium">{b.name}</td>
            </tr>
            {rows.map((r) => {
              const same = JSON.stringify(r.a) === JSON.stringify(r.b);
              const bothEmpty = isEmptyValue(r.a) && isEmptyValue(r.b);
              if (bothEmpty) return null;
              return (
                <tr key={r.name} className={same ? "text-muted" : ""}>
                  <td className="px-3 py-2 align-top text-muted">{r.label}</td>
                  {(["a", "b"] as const).map((side) => {
                    const v = side === "a" ? r.a : r.b;
                    const text = displayValue(r, v);
                    return (
                      <td key={side} className="px-3 py-2 align-top">
                        <label className={`flex items-start gap-2 ${same ? "" : "cursor-pointer"}`}>
                          {!same && <input type="radio" name={`pick-${r.name}`} className="mt-1" checked={picks[r.name] === side} onChange={() => setPicks((p) => ({ ...p, [r.name]: side }))} />}
                          <span className={`min-w-0 whitespace-pre-line break-words ${isEmptyValue(v) ? "text-faint" : ""}`}>{isEmptyValue(v) ? "—" : text.length > 400 ? `${text.slice(0, 400)}…` : text}</span>
                        </label>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">
        {differing.length} field{differing.length === 1 ? "" : "s"} differ. The other record&apos;s name becomes an alias of the kept one. Relationships, tags, files, sources, stars and collection memberships all move across; a duplicate link is dropped rather than doubled.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Link href={winner.href} className="btn btn-secondary btn-sm">Cancel</Link>
        {!confirm ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setConfirm(true)}>Merge into {winner.name}…</button>
        ) : (
          <button type="button" className="btn btn-accent btn-sm" disabled={busy} onClick={run}>{busy ? "Merging…" : `Yes, archive ${loser.name} and merge`}</button>
        )}
      </div>
    </div>
  );
}
