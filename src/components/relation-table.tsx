"use client";

// A relationship tab: the linked records as a small table — name, what they
// are, their role — with a remove control per row and the same add popover
// the chips use. `autoOpen` opens the add popover on arrival (the header's
// Link menu lands here).

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AddLinkPopover, type AddConfig } from "@/components/link-editor";
import { addLink, removeLink, type LinkPayload } from "@/lib/actions/links";
import { useToast } from "@/components/toast";

export type RelationRow = {
  id: string;
  name: string;
  href?: string;
  sub?: string;
  role?: string;
  extra?: ReactNode;
  removePayload?: LinkPayload;
};

export function RelationTable({ rows, addConfig, canEdit, columns, emptyMessage, autoOpen, title }: {
  rows: RelationRow[]; addConfig?: AddConfig; canEdit: boolean; columns?: { sub?: string; role?: string; extra?: string }; emptyMessage?: ReactNode; autoOpen?: boolean; title?: string;
}) {
  const [open, setOpen] = useState(!!autoOpen);
  const router = useRouter();
  const { toast } = useToast();
  const hasSub = rows.some((r) => r.sub);
  const hasRole = rows.some((r) => r.role);
  const hasExtra = rows.some((r) => r.extra);

  const remove = async (row: RelationRow) => {
    if (!row.removePayload) return;
    const payload = row.removePayload;
    const res = await removeLink(payload);
    if (!res.ok) return toast(res.error, { tone: "error" });
    toast(`Removed ${row.name}`, { undo: async () => { await addLink(payload); router.refresh(); } });
    router.refresh();
  };

  return (
    <div>
      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 font-semibold">{title ?? "Name"}</th>
                {hasSub && <th className="px-3 py-2 font-semibold">{columns?.sub ?? ""}</th>}
                {hasRole && <th className="px-3 py-2 font-semibold">{columns?.role ?? "Role"}</th>}
                {hasExtra && <th className="px-3 py-2 font-semibold">{columns?.extra ?? ""}</th>}
                {canEdit && <th className="w-10 px-2 py-2" aria-label="Actions" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-wash/60">
                  <td className="px-3 py-2 font-medium">{r.href ? <Link href={r.href} className="hover:text-accent-deep hover:underline">{r.name}</Link> : r.name}</td>
                  {hasSub && <td className="px-3 py-2 text-muted">{r.sub}</td>}
                  {hasRole && <td className="px-3 py-2 text-muted">{r.role}</td>}
                  {hasExtra && <td className="px-3 py-2">{r.extra}</td>}
                  {canEdit && (
                    <td className="px-2 py-1 text-right">
                      {r.removePayload && <button type="button" aria-label={`Remove ${r.name}`} className="rounded px-1.5 py-0.5 text-muted hover:bg-wash hover:text-accent" onClick={() => remove(r)}>×</button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-faint">{emptyMessage ?? "Nothing linked yet."}</p>
      )}
      {canEdit && addConfig && (
        <div className="relative mt-3 inline-block">
          <button type="button" data-add-link className="chip border-dashed text-muted hover:text-accent-deep" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {addConfig.buttonLabel ?? "+ Add"}
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-20" aria-hidden onClick={() => setOpen(false)} />
              <AddLinkPopover config={addConfig} onDone={() => setOpen(false)} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
