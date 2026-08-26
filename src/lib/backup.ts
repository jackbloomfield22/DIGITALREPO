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

export const BACKUP_VERSION = 2;

/**
 * Columns holding raw file bytes, and the reason a snapshot could end up far
 * bigger than the Repo it protects: base64 inflates bytes by a third, and
 * every snapshot kept its own copy of every file, so 100MB of decks became
 * gigabytes of database on its own without anyone uploading anything new.
 *
 * From version 2 a backup captures the file *records* — name, type, size,
 * which record they hang off — but not their contents. Restoring brings back
 * every attachment's identity and link; the file itself is re-uploaded. The
 * emptiness is deliberate and detectable: `sizeBytes` still says how big the
 * file was, so a zero-length `data` next to a non-zero `sizeBytes` means
 * "restored from a backup, contents not included" rather than "empty file".
 */
const BYTE_COLUMNS: Partial<Record<(typeof TABLE_ORDER)[number], string[]>> = {
  storedFile: ["data"],
  ingestItem: ["raw"],
};

/** The marker an omitted byte column is written as; decodes to empty bytes. */
const OMITTED_BYTES = { $bytes: "" } as const;

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
  /** How much file content this backup deliberately left out, and from where. */
  omittedFileBytes?: { files: number; ingestDocuments: number; totalBytes: number };
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
  const omitted = { files: 0, ingestDocuments: 0, totalBytes: 0 };

  for (const table of TABLE_ORDER) {
    const byteColumns = BYTE_COLUMNS[table];
    // `omit` keeps the bytes out of the query itself, so a database full of
    // decks never has to fit in this process's memory to be backed up.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: Record<string, unknown>[] = await (db[table] as any).findMany(
      byteColumns ? { omit: Object.fromEntries(byteColumns.map((c) => [c, true])) } : undefined,
    );

    if (byteColumns) {
      for (const row of rows) {
        // An ingest item only held bytes if it kept them — pasted text carries
        // a sizeBytes too, and counting that would overstate what was left out.
        const held = table === "storedFile" || row.rawRetained === true;
        if (held) {
          omitted.totalBytes += Number(row.sizeBytes ?? 0);
          if (table === "storedFile") omitted.files++;
          else omitted.ingestDocuments++;
        }
        for (const column of byteColumns) row[column] = OMITTED_BYTES;
      }
      tables[table] = rows;
    } else {
      tables[table] = rows.map(encodeBytesFields);
    }
  }

  return {
    format: "digital-bible-backup",
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    tables,
    omittedFileBytes: omitted,
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

// ---------------------------------------------------------------------------
// What the Repo is actually costing in database storage
// ---------------------------------------------------------------------------

export type StorageUsage = {
  totalBytes: number;
  /** Daily and manual backups. */
  snapshotBytes: number;
  /** Uploaded attachments. */
  fileBytes: number;
  /** Ingested documents, including any raw bytes kept with them. */
  ingestBytes: number;
  fileCount: number;
  snapshotCount: number;
};

/**
 * Real on-disk figures, straight from Postgres, rather than a guess from row
 * counts — including TOAST and indexes, which is where file bytes actually
 * live. Answers "how much room am I using and what is using it" without
 * leaving the app for the Neon dashboard. Returns null on a host that does not
 * expose the size functions; the panel simply doesn't render.
 */
export async function databaseUsage(): Promise<StorageUsage | null> {
  try {
    const [sizes] = await db.$queryRaw<
      { total: bigint; snapshots: bigint; files: bigint; ingest: bigint }[]
    >`SELECT pg_database_size(current_database()) AS total,
             pg_total_relation_size('"Snapshot"')   AS snapshots,
             pg_total_relation_size('"StoredFile"') AS files,
             pg_total_relation_size('"IngestItem"') AS ingest`;
    const [fileCount, snapshotCount] = await Promise.all([
      db.storedFile.count(),
      db.snapshot.count(),
    ]);
    return {
      totalBytes: Number(sizes.total),
      snapshotBytes: Number(sizes.snapshots),
      fileBytes: Number(sizes.files),
      ingestBytes: Number(sizes.ingest),
      fileCount,
      snapshotCount,
    };
  } catch {
    return null;
  }
}
