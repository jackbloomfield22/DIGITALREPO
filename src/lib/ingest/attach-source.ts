// After an upload has been applied, the file itself goes onto the pages it
// was about: the record the uploader picked in Add Info, and any format or
// project the upload created. A deck for a new documentary ends up on that
// documentary's page (and from there in Airtable) without a second upload.

import "server-only";
import crypto from "crypto";
import path from "path";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { blobConfigured } from "@/lib/files";
import type { SessionUser } from "@/lib/roles";

type Target = { targetType: string; targetId: string };
type ItemLike = {
  id: string; kind: string; filename: string | null; mimeType: string | null; sizeBytes: number | null;
  raw: Uint8Array | Buffer | null; rawRetained: boolean; blobPath: string | null; blobUrl: string | null; metadata: unknown;
};

/** Files worth putting on a page: decks and documents, not emails or archives. */
const ATTACHABLE = new Set(["pdf", "pptx", "ppt", "docx", "doc", "xlsx", "xls", "key", "png", "jpg", "jpeg"]);
const PAGES = new Set(["format", "project"]);

/** The record the uploader chose in Add Info, if any. */
export function attachTargets(item: { metadata: unknown }): Target[] {
  const meta = (item.metadata ?? {}) as { attachTo?: { type?: string; id?: string } };
  const t = meta.attachTo;
  return t?.type && t?.id && PAGES.has(t.type) ? [{ targetType: t.type, targetId: t.id }] : [];
}

export async function attachSourceFile(item: ItemLike, user: SessionUser, targets: Target[]): Promise<number> {
  if (!item.filename) return 0;
  const ext = item.filename.toLowerCase().split(".").pop() ?? "";
  if (!ATTACHABLE.has(ext)) return 0;
  const wanted = new Map<string, Target>();
  for (const t of targets) if (PAGES.has(t.targetType)) wanted.set(`${t.targetType}:${t.targetId}`, t);
  if (!wanted.size) return 0;

  const hasBlob = !!item.blobPath && !!item.blobUrl && blobConfigured();
  const bytes = !hasBlob && item.rawRetained && item.raw && item.raw.byteLength > 0 ? Buffer.from(item.raw) : null;
  if (!hasBlob && !bytes) return 0;

  let attached = 0;
  for (const t of wanted.values()) {
    // Applying the same upload twice must not stack a second copy on the page.
    const dup = await db.attachment.findFirst({
      where: { targetType: t.targetType, targetId: t.targetId, filename: item.filename },
      select: { id: true },
    });
    if (dup) continue;
    try {
      if (hasBlob) {
        // Its own copy: deleting the attachment later must not take the ingest file with it.
        const { copy } = await import("@vercel/blob");
        const target = `attachments/${t.targetType}/${t.targetId}/${path.basename(item.filename)}`;
        const copied = await copy(item.blobUrl!, target, { access: "private", addRandomSuffix: true, contentType: item.mimeType ?? undefined });
        await db.attachment.create({
          data: {
            targetType: t.targetType, targetId: t.targetId, filename: item.filename, storage: "blob", storedPath: copied.pathname,
            blobUrl: copied.url, mimeType: item.mimeType, sizeBytes: item.sizeBytes, uploadedById: user.id,
          },
        });
      } else {
        const key = `${crypto.randomBytes(12).toString("hex")}.${ext}`;
        await db.storedFile.create({ data: { key, mimeType: item.mimeType, sizeBytes: bytes!.byteLength, data: bytes! } });
        await db.attachment.create({
          data: {
            targetType: t.targetType, targetId: t.targetId, filename: item.filename, storage: "db", storedPath: key,
            mimeType: item.mimeType, sizeBytes: bytes!.byteLength, uploadedById: user.id,
          },
        });
      }
      await logAudit(user, { targetType: t.targetType, targetId: t.targetId, targetLabel: item.filename, action: "linked", field: "attachment", newValue: `${item.filename} (from Add Info)` });
      attached++;
    } catch (e) {
      console.error("Could not attach the source file to", t, e);
    }
  }
  return attached;
}
