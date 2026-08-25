"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { applyIngestChangesCore, type ApplyOutcome } from "@/lib/ingest/apply";
import { logAudit } from "@/lib/audit";
import { refreshDigest } from "@/lib/ingest/digest";

type Result = { ok: boolean; error?: string };

const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;

export async function setChangeStatus(
  changeId: string,
  status: (typeof REVIEW_STATUSES)[number],
): Promise<Result> {
  try {
    await requireRole("EDITOR");
    z.enum(REVIEW_STATUSES).parse(status);
    const change = await db.ingestChange.findUnique({ where: { id: changeId } });
    if (!change) return { ok: false, error: "Change not found." };
    if (change.status === "applied") return { ok: false, error: "Already applied." };
    await db.ingestChange.update({
      where: { id: changeId },
      data: { status, ...(status !== "approved" ? { editedAfter: undefined } : {}) },
    });
    revalidatePath(`/ingest/${change.itemId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed." };
  }
}

export async function editChange(changeId: string, editedValue: string): Promise<Result> {
  try {
    await requireRole("EDITOR");
    const change = await db.ingestChange.findUnique({ where: { id: changeId } });
    if (!change) return { ok: false, error: "Change not found." };
    if (change.status === "applied") return { ok: false, error: "Already applied." };
    await db.ingestChange.update({
      where: { id: changeId },
      data: { status: "edited", editedAfter: { value: editedValue.slice(0, 8000) } },
    });
    revalidatePath(`/ingest/${change.itemId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed." };
  }
}

/** Approve everything at/above a confidence threshold — never archives or sensitive. */
/**
 * Edit a proposed *create* before it happens: its name and any field it wants
 * to set. Reviewing shouldn't be a choice between taking a record with the
 * wrong name and throwing the whole proposal away.
 */
export async function editCreateChange(
  changeId: string,
  edited: { name: string; fields: Record<string, string> },
): Promise<Result> {
  try {
    await requireRole("EDITOR");
    const change = await db.ingestChange.findUnique({ where: { id: changeId } });
    if (!change) return { ok: false, error: "Change not found." };
    if (change.status === "applied") return { ok: false, error: "Already applied." };
    if (change.opType !== "create") return { ok: false, error: "That change isn't a new record." };

    const name = edited.name.trim().slice(0, 300);
    if (!name) return { ok: false, error: "A new record needs a name." };
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(edited.fields ?? {})) {
      const clean = String(value ?? "").trim();
      if (clean) fields[key.slice(0, 60)] = clean.slice(0, 8000);
    }

    await db.ingestChange.update({
      where: { id: changeId },
      data: { status: "edited", editedAfter: { name, fields } },
    });
    revalidatePath(`/ingest/${change.itemId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed." };
  }
}

export async function bulkApprove(itemId: string, minConfidence: number): Promise<Result & { count?: number }> {
  try {
    await requireRole("EDITOR");
    const result = await db.ingestChange.updateMany({
      where: {
        itemId,
        status: "pending",
        confidence: { gte: Math.max(0, Math.min(1, minConfidence)) },
        sensitive: false,
        opType: { not: "archive" },
      },
      data: { status: "approved" },
    });
    revalidatePath(`/ingest/${itemId}`);
    return { ok: true, count: result.count };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed." };
  }
}

export async function bulkReject(itemId: string): Promise<Result & { count?: number }> {
  try {
    await requireRole("EDITOR");
    const result = await db.ingestChange.updateMany({
      where: { itemId, status: { in: ["pending", "approved", "edited"] } },
      data: { status: "rejected" },
    });
    revalidatePath(`/ingest/${itemId}`);
    return { ok: true, count: result.count };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed." };
  }
}

export async function applyIngestChanges(
  itemId: string,
): Promise<Result & { outcome?: ApplyOutcome }> {
  try {
    const user = await requireRole("EDITOR");
    const outcome = await applyIngestChangesCore(itemId, user);
    revalidatePath("/", "layout");
    return { ok: true, outcome };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Apply failed." };
  }
}

export async function markIrrelevant(itemId: string): Promise<Result> {
  try {
    await requireRole("EDITOR");
    await db.ingestItem.update({
      where: { id: itemId },
      data: { status: "irrelevant", relevance: { score: 0, reasons: ["Dismissed by reviewer"] } },
    });
    revalidatePath("/ingest");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed." };
  }
}

export async function deleteIngestItem(itemId: string): Promise<Result> {
  try {
    await requireRole("EDITOR");
    await db.ingestItem.delete({ where: { id: itemId } }); // cascades to children + changes
    revalidatePath("/ingest");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed." };
  }
}

// ---------------------------------------------------------------------------
// Undo and retry
// ---------------------------------------------------------------------------
// Removing an ingest that was never applied is a clean slate: the item and its
// proposals go, and the same material can be submitted again. Removing one that
// *was* applied has to put the records back first — every applied change stores
// the value it replaced, and creates record the row they produced, so both
// directions are recoverable.

const UNDO_MODELS: Record<string, string> = {
  creator: "creator",
  project: "project",
  organization: "organization",
  format: "format",
  opportunity: "opportunity",
  person: "industryPerson",
};

export type IngestUndoOutcome = {
  ok: boolean;
  error?: string;
  reverted?: number;
  deleted?: number;
  skipped?: string[];
};

/** Put back what an applied ingest changed. Safe to run more than once. */
export async function revertIngestChanges(itemId: string): Promise<IngestUndoOutcome> {
  try {
    const user = await requireRole("EDITOR");
    const item = await db.ingestItem.findUnique({ where: { id: itemId } });
    if (!item) return { ok: false, error: "That ingest is no longer on record." };

    const applied = await db.ingestChange.findMany({
      where: { itemId, status: "applied" },
      orderBy: { sortOrder: "desc" },
    });

    let reverted = 0;
    let deleted = 0;
    const skipped: string[] = [];

    for (const change of applied) {
      const dest = (change.destination ?? {}) as {
        targetType?: string;
        targetId?: string;
        field?: string;
        createdTargetType?: string;
        createdTargetId?: string;
      };

      try {
        if (change.opType === "create") {
          const type = dest.createdTargetType;
          const id = dest.createdTargetId;
          const model = type ? UNDO_MODELS[type] : undefined;
          if (!model || !id) {
            skipped.push(`${change.group} (created before undo was recorded — remove it by hand)`);
            continue;
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const exists = await (db as any)[model].findUnique({ where: { id } });
          if (exists) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (db as any)[model].delete({ where: { id } });
            await db.knowledgeDigest.deleteMany({ where: { targetType: type!, targetId: id } });
            await db.favorite.deleteMany({ where: { targetType: type!, targetId: id } });
            await db.recentView.deleteMany({ where: { targetType: type!, targetId: id } });
            await db.recordSource.deleteMany({ where: { targetType: type!, targetId: id } });
            await db.collectionItem.deleteMany({ where: { targetType: type!, targetId: id } });
            deleted++;
          }
        } else if (change.opType === "update" || change.opType === "note" || change.opType === "archive") {
          const model = dest.targetType ? UNDO_MODELS[dest.targetType] : undefined;
          if (!model || !dest.targetId || !dest.field) {
            skipped.push(change.group);
            continue;
          }
          // `before` is JSON null both when the field was empty and when it
          // wasn't captured; either way restoring null is the correct undo.
          const previous = change.before === undefined ? null : change.before;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (db as any)[model].update({
            where: { id: dest.targetId },
            data: { [dest.field]: previous },
          });
          await refreshDigest(dest.targetType!, dest.targetId);
          reverted++;
        } else {
          // Links are additive and cheap to leave; note them rather than guess.
          skipped.push(`${change.group} (link)`);
          continue;
        }

        await db.ingestChange.update({
          where: { id: change.id },
          data: { status: "approved", appliedAt: null, appliedById: null },
        });
      } catch (e) {
        skipped.push(`${change.group} — ${e instanceof Error ? e.message : "could not undo"}`);
      }
    }

    // The provenance record this ingest created goes with it.
    const source = await db.source.findFirst({ where: { url: `/ingest/${itemId}` } });
    if (source) {
      await db.recordSource.deleteMany({ where: { sourceId: source.id } });
      await db.source.delete({ where: { id: source.id } }).catch(() => {});
    }

    await db.ingestItem.update({ where: { id: itemId }, data: { status: "proposed" } });
    await logAudit(user, {
      targetType: "ingest",
      targetId: itemId,
      targetLabel: item.filename ?? "Ingested material",
      action: "updated",
      field: `undid ${reverted + deleted} applied changes`,
    });

    revalidatePath("/", "layout");
    return { ok: true, reverted, deleted, skipped };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Undo failed." };
  }
}

/**
 * Remove an ingest entirely. Anything it applied is put back first, so this is
 * always a complete undo rather than only forgetting the paperwork.
 */
export async function removeIngestItem(itemId: string): Promise<IngestUndoOutcome> {
  try {
    const user = await requireRole("EDITOR");
    const item = await db.ingestItem.findUnique({ where: { id: itemId } });
    if (!item) return { ok: true, reverted: 0, deleted: 0, skipped: [] };

    let undo: IngestUndoOutcome = { ok: true, reverted: 0, deleted: 0, skipped: [] };
    const hasApplied = await db.ingestChange.count({ where: { itemId, status: "applied" } });
    if (hasApplied) {
      undo = await revertIngestChanges(itemId);
      if (!undo.ok) return undo;
    }

    await db.ingestItem.delete({ where: { id: itemId } }); // cascades to children + changes
    await logAudit(user, {
      targetType: "ingest",
      targetId: itemId,
      targetLabel: item.filename ?? "Ingested material",
      action: "deleted",
    });

    revalidatePath("/", "layout");
    return { ...undo, ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not remove that ingest." };
  }
}

/** Clear proposals and put an item back at the start of the pipeline. */
export async function retryIngestItem(itemId: string): Promise<Result> {
  try {
    await requireRole("EDITOR");
    const hasApplied = await db.ingestChange.count({ where: { itemId, status: "applied" } });
    if (hasApplied) {
      return {
        ok: false,
        error: "This ingest has already been applied — undo it first, then retry.",
      };
    }
    await db.ingestChange.deleteMany({ where: { itemId } });
    await db.ingestItem.update({
      where: { id: itemId },
      data: { status: "parsed", error: null, relevance: undefined },
    });
    revalidatePath("/ingest");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Retry failed." };
  }
}
