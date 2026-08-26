"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const sourceSchema = z.object({
  targetType: z.string().min(1).max(30),
  targetId: z.string().min(1),
  title: z.string().trim().max(300).optional(),
  url: z.string().trim().max(1000).optional(),
  sourceType: z.string().trim().max(40).optional(),
  notes: z.string().max(2000).optional(),
});

export async function addSourceToRecord(
  input: z.infer<typeof sourceSchema>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireRole("EDITOR");
    const data = sourceSchema.parse(input);
    if (!data.title && !data.url) {
      return { ok: false, error: "Add a title or URL." };
    }
    const source = await db.source.create({
      data: {
        title: data.title || null,
        url: data.url || null,
        sourceType: data.sourceType || null,
        notes: data.notes || null,
        addedById: user.id,
      },
    });
    await db.recordSource.create({
      data: { sourceId: source.id, targetType: data.targetType, targetId: data.targetId },
    });
    await logAudit(user, {
      targetType: data.targetType,
      targetId: data.targetId,
      targetLabel: data.title || data.url || "source",
      action: "linked",
      field: "source",
      newValue: data.title || data.url,
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not add source." };
  }
}

export async function removeRecordSource(
  recordSourceId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireRole("EDITOR");
    await db.recordSource.delete({ where: { id: recordSourceId } });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not remove source." };
  }
}
