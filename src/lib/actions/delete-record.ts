"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { RECORD_REGISTRY, type IngestTargetType } from "@/lib/ingest/registry";

// Hard delete for the main record types. Archive remains the safe default for
// "we don't care about this anymore"; delete is for records that shouldn't
// exist at all. Relations cascade; digest/favorite/recent/source/attachment
// rows keyed by targetType+targetId are cleaned up; the deletion itself is
// audit-logged so Activity shows who removed what.

const DELETABLE = new Set(["creator", "project", "organization", "format", "opportunity", "person"]);

const DIRECTORY: Record<string, string> = {
  creator: "/talent",
  project: "/projects",
  organization: "/organizations",
  format: "/formats",
  opportunity: "/opportunities",
  person: "/people",
};

export async function deleteRecord(input: {
  targetType: string;
  id: string;
}): Promise<{ ok: true; redirect: string } | { ok: false; error: string }> {
  try {
    const user = await requireRole("EDITOR");
    const { targetType, id } = input;
    if (!DELETABLE.has(targetType)) {
      return { ok: false, error: "This record type can't be deleted." };
    }
    const spec = RECORD_REGISTRY[targetType as IngestTargetType];
    const redirect = DIRECTORY[targetType];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const record = await (db as any)[spec.prismaModel].findUnique({ where: { id } });
    if (!record) return { ok: true, redirect }; // already gone
    const label = String(record[spec.nameField] ?? "Untitled");

    // Uploaded files attached to this record go with it.
    const attachments = await db.attachment.findMany({ where: { targetType, targetId: id } });
    if (attachments.length) {
      await db.storedFile.deleteMany({ where: { key: { in: attachments.map((a) => a.storedPath) } } });
      await db.attachment.deleteMany({ where: { targetType, targetId: id } });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any)[spec.prismaModel].delete({ where: { id } });

    await db.knowledgeDigest.deleteMany({ where: { targetType, targetId: id } });
    await db.favorite.deleteMany({ where: { targetType, targetId: id } });
    await db.recentView.deleteMany({ where: { targetType, targetId: id } });
    await db.recordSource.deleteMany({ where: { targetType, targetId: id } });
    await db.collectionItem.deleteMany({ where: { targetType, targetId: id } });

    await logAudit(user, { targetType, targetId: id, targetLabel: label, action: "deleted" });
    revalidatePath("/", "layout");
    return { ok: true, redirect };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed." };
  }
}
