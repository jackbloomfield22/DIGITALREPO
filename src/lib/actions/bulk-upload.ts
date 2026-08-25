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
