"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { rebuildAllDigests } from "@/lib/ingest/digest";

export async function rebuildDigests(): Promise<{ ok: boolean; built?: number; error?: string }> {
  try {
    const admin = await requireRole("ADMIN");
    const { built, removed } = await rebuildAllDigests();
    await logAudit(admin, {
      targetType: "ingest",
      targetId: "digest-rebuild",
      targetLabel: "Knowledge Digest",
      action: "updated",
      field: "rebuild",
      newValue: `${built} rows${removed ? `, ${removed} removed` : ""}`,
    });
    revalidatePath("/admin/ingest");
    return { ok: true, built };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Rebuild failed." };
  }
}
