"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { mergeRecordsCore, type MergeInput, type MergeOutcome } from "@/lib/merge-records";
import { RECORD_REGISTRY, type IngestTargetType } from "@/lib/ingest/registry";
import { db } from "@/lib/db";
import { modelFor } from "@/lib/db-model";

export type MergeResult = { ok: true; outcome: MergeOutcome; href: string } | { ok: false; error: string };

export async function mergeRecords(input: MergeInput): Promise<MergeResult> {
  try {
    const user = await requireRole("EDITOR");
    const outcome = await mergeRecordsCore(input, user);
    const spec = RECORD_REGISTRY[input.type as IngestTargetType];
    const winner = await modelFor(spec.prismaModel).findUnique({ where: { id: input.winnerId }, select: { slug: true } });
    revalidatePath("/", "layout");
    return { ok: true, outcome, href: spec.path(String(winner?.slug ?? "")) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Merge failed." };
  }
}
