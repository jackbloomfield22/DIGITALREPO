"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createSnapshot } from "@/lib/backup";
import {
  consolidateBatches,
  ensureImportSource,
  importTotals,
  parseBundle,
  runImportChunk,
  IMPORT_PHASES,
  IMPORT_RECORD_NOTE,
  type ImportPhase,
} from "@/lib/drive-import";

// A staged bundle lives in StoredFile under this prefix until the browser has
// walked it through every phase. Keeping the payload server-side means the
// client only ever passes back a key, a phase, and an offset.
const KEY_PREFIX = "bulk-upload:";
const MAX_BYTES = 8 * 1024 * 1024;

export type StageResult =
  | { ok: true; key: string; sourceTitle: string; totals: Record<ImportPhase, number>; grandTotal: number }
  | { ok: false; error: string };

/** Parse + validate the uploaded bundle, snapshot the database, and stage it. */
export async function stageBundle(input: {
  json: string;
  title: string;
  url: string;
}): Promise<StageResult> {
  try {
    const user = await requireRole("ADMIN");

    const title = input.title.trim() || "Bulk knowledge upload";
    const bytes = Buffer.byteLength(input.json, "utf8");
    if (!bytes) return { ok: false, error: "That file is empty." };
    if (bytes > MAX_BYTES) {
      return { ok: false, error: `That file is ${(bytes / 1024 / 1024).toFixed(1)} MB. The limit is 8 MB — split it into two bundles.` };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(input.json);
    } catch {
      return { ok: false, error: "That file isn't valid JSON. Make sure you picked the .json bundle." };
    }

    const batches = parseBundle(parsed);
    const consolidated = consolidateBatches(batches);
    const totals = importTotals(consolidated);
    const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);
    if (!grandTotal) {
      return { ok: false, error: "No records were found in that bundle. Nothing to import." };
    }

    // One safety net before any write, so a bad bundle is always reversible.
    await createSnapshot("manual", `pre-bulk-upload — ${title}`);

    const key = `${KEY_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    await db.storedFile.create({
      data: {
        key,
        mimeType: "application/json",
        sizeBytes: bytes,
        data: Buffer.from(JSON.stringify({ title, url: input.url.trim(), batches })),
      },
    });

    await logAudit(user, {
      targetType: "source",
      targetId: key,
      targetLabel: title,
      action: "created",
      field: `staged bulk upload — ${grandTotal} records`,
    });

    return { ok: true, key, sourceTitle: title, totals, grandTotal };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not stage that file." };
  }
}

export type StepResult =
  | { ok: true; phase: ImportPhase; processed: number; created: number; enriched: number; total: number; nextPhase: ImportPhase | null; nextOffset: number }
  | { ok: false; error: string };

/**
 * Run one slice of one phase. The browser calls this repeatedly, which keeps
 * every request short regardless of how large the bundle is.
 */
export async function runBulkUploadStep(input: {
  key: string;
  phase: ImportPhase;
  offset: number;
  limit?: number;
}): Promise<StepResult> {
  try {
    const user = await requireRole("ADMIN");
    if (!input.key.startsWith(KEY_PREFIX)) return { ok: false, error: "Unknown upload." };
    if (!IMPORT_PHASES.includes(input.phase)) return { ok: false, error: "Unknown import step." };

    const stored = await db.storedFile.findUnique({ where: { key: input.key } });
    if (!stored) return { ok: false, error: "That upload expired. Please pick the file again." };

    const payload = JSON.parse(Buffer.from(stored.data).toString("utf8")) as {
      title: string;
      url: string;
      batches: unknown[];
    };
    const consolidated = consolidateBatches(payload.batches);
    const source = await ensureImportSource(
      user.id,
      payload.title,
      payload.url,
      "Bulk upload of extracted notes. Per-record provenance (document + as-of date) lives in each record's notes.",
    );

    const limit = Math.min(Math.max(input.limit ?? 15, 1), 50);
    const result = await runImportChunk(consolidated, input.phase, Math.max(input.offset, 0), limit, source.id);

    // Advance to the next non-empty phase when this one is finished.
    let nextPhase: ImportPhase | null = input.phase;
    let nextOffset = result.nextOffset ?? 0;
    if (result.nextOffset === null) {
      const totals = importTotals(consolidated);
      const idx = IMPORT_PHASES.indexOf(input.phase);
      nextPhase = null;
      nextOffset = 0;
      for (let i = idx + 1; i < IMPORT_PHASES.length; i++) {
        if (totals[IMPORT_PHASES[i]] > 0) {
          nextPhase = IMPORT_PHASES[i];
          break;
        }
      }
    }

    return {
      ok: true,
      phase: result.phase,
      processed: result.processed,
      created: result.created,
      enriched: result.enriched,
      total: result.total,
      nextPhase,
      nextOffset,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "That step failed." };
  }
}

/** Clear the staged payload and log the finished import. */
export async function finishBulkUpload(input: {
  key: string;
  created: number;
  enriched: number;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireRole("ADMIN");
    const stored = await db.storedFile.findUnique({ where: { key: input.key } });
    const title = stored
      ? (JSON.parse(Buffer.from(stored.data).toString("utf8")) as { title: string }).title
      : "Bulk knowledge upload";

    await db.storedFile.deleteMany({ where: { key: input.key } });
    await logAudit(user, {
      targetType: "source",
      targetId: input.key,
      targetLabel: title,
      action: "updated",
      field: `bulk upload finished — ${input.created} created, ${input.enriched} enriched`,
    });

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not finish the upload." };
  }
}

/** Abandon a staged upload that was never run. */
export async function discardBulkUpload(key: string): Promise<void> {
  await requireRole("ADMIN");
  if (!key.startsWith(KEY_PREFIX)) return;
  await db.storedFile.deleteMany({ where: { key } });
}

// ---------------------------------------------------------------------------
// Undo — remove everything one upload created
// ---------------------------------------------------------------------------
// An import links only the records it *created* to its source (existing records
// are enriched and never linked), so those links are an exact record of what a
// given upload added. Removing them is a precise undo: nothing that predates
// the upload is touched.

const REVERTABLE: Record<string, string> = {
  creator: "creator",
  project: "project",
  organization: "organization",
  format: "format",
  opportunity: "opportunity",
  person: "industryPerson",
};

export type ImportSummary = {
  sourceId: string;
  title: string;
  createdAt: string;
  counts: { label: string; n: number }[];
  total: number;
};

const TYPE_LABELS: Record<string, string> = {
  organization: "organizations",
  person: "industry people",
  creator: "talent",
  project: "projects",
  format: "formats",
  opportunity: "opportunities",
};

/** Past uploads that still have records attributed to them, newest first. */
export async function listImports(): Promise<ImportSummary[]> {
  await requireRole("ADMIN");
  const links = await db.recordSource.findMany({
    where: { note: IMPORT_RECORD_NOTE },
    select: { sourceId: true, targetType: true },
  });
  if (!links.length) return [];

  const bySource = new Map<string, Map<string, number>>();
  for (const l of links) {
    if (!bySource.has(l.sourceId)) bySource.set(l.sourceId, new Map());
    const m = bySource.get(l.sourceId)!;
    m.set(l.targetType, (m.get(l.targetType) ?? 0) + 1);
  }

  const sources = await db.source.findMany({
    where: { id: { in: [...bySource.keys()] } },
    select: { id: true, title: true, createdAt: true },
  });

  return sources
    .map((s) => {
      const m = bySource.get(s.id)!;
      const counts = [...m.entries()]
        .map(([type, n]) => ({ label: TYPE_LABELS[type] ?? type, n }))
        .sort((a, b) => b.n - a.n);
      return {
        sourceId: s.id,
        title: s.title ?? "Untitled upload",
        createdAt: s.createdAt.toISOString(),
        counts,
        total: counts.reduce((a, b) => a + b.n, 0),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type RevertResult =
  | { ok: true; deleted: number; remaining: number; done: boolean }
  | { ok: false; error: string };

/**
 * Delete one slice of an upload's records. The browser calls this until
 * `done`, which keeps each request short — the same shape as the import.
 * Takes a snapshot before the first deletion.
 */
export async function revertImportChunk(input: {
  sourceId: string;
  limit?: number;
  first?: boolean;
}): Promise<RevertResult> {
  try {
    const user = await requireRole("ADMIN");
    const source = await db.source.findUnique({ where: { id: input.sourceId } });
    if (!source) return { ok: false, error: "That upload is no longer on record." };

    if (input.first) {
      await createSnapshot("manual", `pre-undo — ${source.title ?? "upload"}`);
    }

    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
    const links = await db.recordSource.findMany({
      where: { sourceId: input.sourceId, note: IMPORT_RECORD_NOTE },
      take: limit,
    });

    let deleted = 0;
    for (const link of links) {
      const model = REVERTABLE[link.targetType];
      if (model) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const exists = await (db as any)[model].findUnique({ where: { id: link.targetId } });
        if (exists) {
          const attachments = await db.attachment.findMany({
            where: { targetType: link.targetType, targetId: link.targetId },
          });
          if (attachments.length) {
            await db.storedFile.deleteMany({ where: { key: { in: attachments.map((a) => a.storedPath) } } });
            await db.attachment.deleteMany({ where: { targetType: link.targetType, targetId: link.targetId } });
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (db as any)[model].delete({ where: { id: link.targetId } });
          await db.knowledgeDigest.deleteMany({ where: { targetType: link.targetType, targetId: link.targetId } });
          await db.favorite.deleteMany({ where: { targetType: link.targetType, targetId: link.targetId } });
          await db.recentView.deleteMany({ where: { targetType: link.targetType, targetId: link.targetId } });
          await db.collectionItem.deleteMany({ where: { targetType: link.targetType, targetId: link.targetId } });
          deleted++;
        }
      }
      // Drop the link even when the record was already gone, so the loop drains.
      await db.recordSource.deleteMany({ where: { id: link.id } });
    }

    const remaining = await db.recordSource.count({
      where: { sourceId: input.sourceId, note: IMPORT_RECORD_NOTE },
    });

    if (remaining === 0) {
      await db.source.delete({ where: { id: input.sourceId } }).catch(() => {});
      await logAudit(user, {
        targetType: "source",
        targetId: input.sourceId,
        targetLabel: source.title ?? "upload",
        action: "deleted",
        field: "undid a bulk upload",
      });
      revalidatePath("/", "layout");
    }

    return { ok: true, deleted, remaining, done: remaining === 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Undo failed." };
  }
}
