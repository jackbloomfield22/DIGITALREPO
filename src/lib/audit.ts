import { db } from "@/lib/db";
import { refreshDigest } from "@/lib/ingest/digest";
import type { SessionUser } from "@/lib/roles";

type AuditEntry = {
  targetType: string;
  targetId: string;
  targetLabel: string;
  action: string; // created | updated | linked | unlinked | archived | restored | merged
  field?: string;
  oldValue?: string | null;
  newValue?: string | null;
};

export async function logAudit(user: SessionUser | null, entry: AuditEntry) {
  await db.auditLog.create({
    data: {
      userId: user?.id ?? null,
      userName: user?.name ?? null,
      targetType: entry.targetType,
      targetId: entry.targetId,
      targetLabel: entry.targetLabel,
      action: entry.action,
      field: entry.field ?? null,
      oldValue: entry.oldValue ?? null,
      newValue: entry.newValue ?? null,
    },
  });
  // Audit is the chokepoint every mutation passes through — keep the
  // Knowledge Digest current from here (TTL-memoized; no-op for
  // non-digestible target types).
  await refreshDigest(entry.targetType, entry.targetId);
}

/** Diff two flat records and write one audit row per changed field. */
export async function logFieldChanges(
  user: SessionUser | null,
  targetType: string,
  targetId: string,
  targetLabel: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  const rows = [];
  for (const key of Object.keys(after)) {
    const oldV = normalize(before[key]);
    const newV = normalize(after[key]);
    if (oldV !== newV) {
      rows.push({
        userId: user?.id ?? null,
        userName: user?.name ?? null,
        targetType,
        targetId,
        targetLabel,
        action: "updated",
        field: key,
        oldValue: oldV,
        newValue: newV,
      });
    }
  }
  if (rows.length) {
    await db.auditLog.createMany({ data: rows });
    await refreshDigest(targetType, targetId);
  }
}

function normalize(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}
