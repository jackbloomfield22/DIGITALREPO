"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { applyIngestChangesCore, type ApplyOutcome } from "@/lib/ingest/apply";

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
