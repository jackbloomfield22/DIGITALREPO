// No "server-only" marker: maintenance scripts (backup offload, demo purge)
// run this under tsx outside Next. Nothing here reaches the client bundle.
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
  "storedFile",
  "attachment",
  "auditLog",
  "aiThread",
  "aiMessage",
  "ingestItem",
  "ingestChange",
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

// Bytes columns (uploaded files, raw ingest documents) can't survive plain
// JSON.stringify — encode them as {$bytes: base64}; the restore script and
// restoreBackupTables decode the marker back to Buffers.
function encodeBytesFields(row: Record<string, unknown>): Record<string, unknown> {
  let out: Record<string, unknown> | null = null;
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Uint8Array) {
      out ??= { ...row };
      out[k] = { $bytes: Buffer.from(v).toString("base64") };
    }
  }
  return out ?? row;
}

export function decodeBytesFields(row: Record<string, unknown>): Record<string, unknown> {
  let out: Record<string, unknown> | null = null;
  for (const [k, v] of Object.entries(row)) {
    if (v && typeof v === "object" && "$bytes" in (v as object)) {
      out ??= { ...row };
      out[k] = Buffer.from((v as { $bytes: string }).$bytes, "base64");
    }
  }
  return out ?? row;
}

export async function buildBackup(): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {};
  for (const table of TABLE_ORDER) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: Record<string, unknown>[] = await (db[table] as any).findMany();
    tables[table] = rows.map(encodeBytesFields);
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

  // Best-effort copy to storage OUTSIDE the database, so a backup survives
  // loss of the database itself. No-op until BLOB_READ_WRITE_TOKEN is set.
  await offloadSnapshot(serialized, snapshot.createdAt);

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

export function offsiteBackupConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/**
 * Uploads an encrypted copy of the backup to Vercel Blob (offsite from the
 * database). Blob URLs are public-but-unguessable, so the payload is
 * AES-256-GCM encrypted with a key derived from AUTH_SECRET; decrypt with
 * scripts/decrypt-backup.mjs. Failures are logged, never thrown — an offsite
 * copy must not break the primary snapshot.
 */
async function offloadSnapshot(serialized: string, createdAt: Date): Promise<void> {
  if (!offsiteBackupConfigured()) return;
  const authSecret = process.env.AUTH_SECRET || process.env.Auth_secret || process.env.auth_secret;
  if (!authSecret) return;
  try {
    const crypto = await import("node:crypto");
    const key = crypto.createHash("sha256").update(authSecret).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(serialized, "utf8"), cipher.final()]);
    const payload = Buffer.concat([Buffer.from("44RB1"), iv, cipher.getAuthTag(), ciphertext]);

    const { put } = await import("@vercel/blob");
    const stamp = createdAt.toISOString().slice(0, 19).replace(/[:T]/g, "-");
    await put(`backups/repo-backup-${stamp}.enc`, payload, {
      access: "public",
      contentType: "application/octet-stream",
    });
    console.log(`Offsite backup uploaded (${payload.byteLength} bytes).`);
  } catch (e) {
    console.error("Offsite backup upload failed:", e);
  }
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
