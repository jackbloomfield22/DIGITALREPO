import "server-only";
import { db } from "@/lib/db";

// Full-database backup engine. A backup captures every table — users,
// creators, all relationships, notes, sources, audit history, AI threads —
// so the complete state of the Repo can be restored or kept offline.
//
// TABLE_ORDER is parent-before-child (safe insert order for restore);
// restores delete in reverse. scripts/restore-backup.mjs consumes this
// format. Attachment rows are included, but the underlying files live in
// storage, not the database.

export const BACKUP_VERSION = 1;

// Prisma client property names, in FK-safe insert order.
export const TABLE_ORDER = [
  "user",
  "entity",
  "sportsEvent",
  "creator",
  "socialProfile",
  "socialSnapshot",
  "project",
  "organization",
  "industryPerson",
  "format",
  "opportunity",
  "creatorEntityLink",
  "formatEntityLink",
  "projectEntityLink",
  "opportunityEntityLink",
  "creatorProjectCredit",
  "projectOrganization",
  "creatorOrganization",
  "creatorPerson",
  "personOrganization",
  "personProject",
  "creatorFormat",
  "formatOrganization",
  "creatorRelationship",
  "opportunityCreator",
  "opportunityFormat",
  "opportunityProject",
  "opportunityOrganization",
  "collection",
  "collectionItem",
  "savedView",
  "favorite",
  "recentView",
  "source",
  "recordSource",
  "attachment",
  "auditLog",
  "aiThread",
  "aiMessage",
  "researchInboxItem",
  // Rebuildable at any time (scripts/rebuild-digests.ts), but included so the
  // dump is complete and the coverage test stays honest.
  "knowledgeDigest",
] as const;

export type BackupFile = {
  format: "digital-bible-backup";
  version: number;
  createdAt: string;
  tables: Record<string, unknown[]>;
};

export async function buildBackup(): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {};
  for (const table of TABLE_ORDER) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tables[table] = await (db[table] as any).findMany();
  }
  return {
    format: "digital-bible-backup",
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    tables,
  };
}

const KEEP_SCHEDULED = 14;

export async function createSnapshot(kind: "manual" | "scheduled", label?: string) {
  const backup = await buildBackup();
  const counts = Object.fromEntries(
    Object.entries(backup.tables).map(([table, rows]) => [table, rows.length]),
  );
  const serialized = JSON.stringify(backup);
  const snapshot = await db.snapshot.create({
    data: {
      kind,
      label: label ?? null,
      counts,
      data: backup as object,
      sizeBytes: Buffer.byteLength(serialized, "utf8"),
    },
    select: { id: true, createdAt: true, sizeBytes: true },
  });

  // Keep every manual backup; retain only the newest scheduled ones.
  const staleScheduled = await db.snapshot.findMany({
    where: { kind: "scheduled" },
    orderBy: { createdAt: "desc" },
    skip: KEEP_SCHEDULED,
    select: { id: true },
  });
  if (staleScheduled.length) {
    await db.snapshot.deleteMany({ where: { id: { in: staleScheduled.map((s) => s.id) } } });
  }
  return snapshot;
}

/** True when a scheduled snapshot was already taken recently (cron throttle). */
export async function recentlyBackedUp(hours = 20): Promise<boolean> {
  const latest = await db.snapshot.findFirst({
    where: { kind: "scheduled" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (!latest) return false;
  return Date.now() - latest.createdAt.getTime() < hours * 3_600_000;
}
