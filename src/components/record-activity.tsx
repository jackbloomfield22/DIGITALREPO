// The Activity tab: what changed on this record, who did it and when — field
// edits, links added or removed, notes, archive and restore, merges.

import Link from "next/link";
import { db } from "@/lib/db";
import { relativeTime } from "@/lib/format";

const VERB: Record<string, string> = {
  created: "created this record", updated: "changed", linked: "linked", unlinked: "unlinked", archived: "moved this to the Archive",
  restored: "restored this", merged: "merged this", note: "added a note", verified: "verified this",
};

export async function RecordActivity({ type, id, limit = 100 }: { type: string; id: string; limit?: number }) {
  const rows = await db.auditLog.findMany({ where: { targetType: type, targetId: id }, orderBy: { createdAt: "desc" }, take: limit });
  if (!rows.length) return <p className="text-sm text-faint">Nothing has happened here yet.</p>;
  const byDay = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.createdAt.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
    byDay.set(k, [...(byDay.get(k) ?? []), r]);
  }
  return (
    <div className="space-y-6">
      {[...byDay.entries()].map(([day, list]) => (
        <section key={day}>
          <h3 className="overline mb-2">{day}</h3>
          <ol className="space-y-2 border-l border-line pl-4">
            {list.map((r) => (
              <li key={r.id} className="relative text-sm">
                <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-line" aria-hidden />
                <span className="font-medium">{r.userName ?? "Someone"}</span>{" "}
                <span className="text-muted">{VERB[r.action] ?? r.action}</span>
                {r.field && r.action === "updated" && <span className="text-muted"> {prettyField(r.field)}</span>}
                {r.field && r.action !== "updated" && <span className="text-muted"> · {prettyField(r.field)}</span>}
                {(r.oldValue || r.newValue) && (
                  <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs">
                    {r.oldValue && <span className="max-w-xs truncate text-faint line-through" title={r.oldValue}>{r.oldValue}</span>}
                    {r.newValue && <span className="max-w-md truncate text-charcoal" title={r.newValue}>{r.newValue}</span>}
                  </div>
                )}
                <div className="text-[11px] text-faint" title={r.createdAt.toISOString()}>{relativeTime(r.createdAt)}</div>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {rows.length >= limit && <Link href={`/activity?type=${type}&id=${id}`} className="text-xs underline underline-offset-2 hover:text-accent">Everything, on the Activity page →</Link>}
    </div>
  );
}

function prettyField(f: string): string {
  return f.replace(/\s*\(ingest\)$/, " (via ingest)").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}
