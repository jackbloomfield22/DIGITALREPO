// Quiet metadata at the foot of a record page: who made it and when, who last
// touched it, when it was last verified, and who owns it.

import Link from "next/link";
import { db } from "@/lib/db";
import { formatDate, relativeTime } from "@/lib/format";

export async function RecordFooter({ type, id, createdAt, updatedAt, verifiedAt, verifiedBy, owner }: {
  type: string; id: string; createdAt: Date; updatedAt: Date; verifiedAt?: Date | null; verifiedBy?: string | null; owner?: string | null;
}) {
  const [first, last] = await Promise.all([
    db.auditLog.findFirst({ where: { targetType: type, targetId: id, action: "created" }, orderBy: { createdAt: "asc" }, select: { userName: true, createdAt: true } }),
    db.auditLog.findFirst({ where: { targetType: type, targetId: id }, orderBy: { createdAt: "desc" }, select: { userName: true, createdAt: true } }),
  ]);
  const cells: [string, string][] = [
    ["Created", `${formatDate(first?.createdAt ?? createdAt)}${first?.userName ? ` by ${first.userName}` : ""}`],
    ["Last updated", `${relativeTime(last?.createdAt ?? updatedAt)}${last?.userName ? ` by ${last.userName}` : ""}`],
    ["Last verified", verifiedAt ? `${formatDate(verifiedAt)}${verifiedBy ? ` by ${verifiedBy}` : ""}` : "Never"],
    ["Owner", owner ?? "—"],
  ];
  return (
    <footer className="mt-10 border-t border-line pt-4 text-xs text-faint">
      <dl className="flex flex-wrap gap-x-6 gap-y-1">
        {cells.map(([k, v]) => (
          <div key={k} className="flex gap-1.5"><dt>{k}</dt><dd className="text-muted">{v}</dd></div>
        ))}
        <div className="flex gap-1.5"><dt>ID</dt><dd className="font-mono text-muted">{id}</dd></div>
        <Link href={`/activity?type=${type}&id=${id}`} className="underline underline-offset-2 hover:text-accent">Full history</Link>
      </dl>
    </footer>
  );
}
