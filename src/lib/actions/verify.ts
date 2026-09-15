"use server";

// "I checked this and it is right" — a timestamp and a name on any record.

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { modelFor } from "@/lib/db-model";
import { RECORD_REGISTRY, type IngestTargetType } from "@/lib/ingest/registry";
import { DETAIL_TYPES } from "@/lib/record-fields";

export async function verifyRecord(type: string, id: string): Promise<{ ok: true; at: string; by: string } | { ok: false; error: string }> {
  try {
    const user = await requireRole("EDITOR");
    if (!DETAIL_TYPES.includes(type as IngestTargetType)) return { ok: false, error: "This record type cannot be verified." };
    const spec = RECORD_REGISTRY[type as IngestTargetType];
    const now = new Date();
    const data: Record<string, unknown> = { verifiedAt: now, verifiedBy: user.name };
    if (type === "creator" || type === "project") data.lastVerifiedAt = now;
    const row = await modelFor(spec.prismaModel).update({ where: { id }, data });
    await logAudit(user, { targetType: type, targetId: id, targetLabel: String(row[spec.nameField] ?? ""), action: "verified", newValue: now.toISOString() });
    revalidatePath("/", "layout");
    return { ok: true, at: now.toISOString(), by: user.name };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not verify." };
  }
}
