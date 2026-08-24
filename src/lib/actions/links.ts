"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { linkPayloadSchema as payloadSchema, type LinkPayload } from "@/lib/link-schema";
import { auditInfo, deleteLink, refreshLinkSides, upsertLink } from "@/lib/link-core";

// One server action pair covers every relationship in the graph. Adds are
// idempotent (linking Soccer twice never duplicates the relationship) and
// every change is audited. Core logic lives in src/lib/link-core.ts so the
// ingest apply engine can share it outside a request context.

export type { LinkPayload };
export type LinkResult = { ok: true } | { ok: false; error: string };

export async function addLink(payload: LinkPayload): Promise<LinkResult> {
  try {
    const user = await requireRole("EDITOR");
    const p = payloadSchema.parse(payload);
    await upsertLink(p);
    const info = await auditInfo(p);
    await logAudit(user, { ...info, action: "linked", newValue: info.other });
    await refreshLinkSides(p);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save." };
  }
}

export async function removeLink(payload: LinkPayload): Promise<LinkResult> {
  try {
    const user = await requireRole("EDITOR");
    const p = payloadSchema.parse(payload);
    const info = await auditInfo(p);
    await deleteLink(p);
    await logAudit(user, { ...info, action: "unlinked", oldValue: info.other });
    await refreshLinkSides(p);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not remove." };
  }
}

