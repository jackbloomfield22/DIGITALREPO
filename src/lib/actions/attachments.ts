"use server";

// Recording a file against a record, once its bytes are safely stored.
//
// The upload itself happens in the browser, straight to Blob storage, because
// nothing of any size can travel through a serverless request. That leaves a
// gap: the app has to be told the upload finished. Blob can call a webhook,
// but a webhook needs a public URL and so never fires in local development —
// which would make attachments work in production and silently not work while
// building them. So the browser reports back here instead, and this action
// checks the claim against the store rather than believing it: the blob has to
// exist, and its real size is what gets recorded.

import { revalidatePath } from "next/cache";
import path from "path";
import crypto from "crypto";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  MAX_DB_UPLOAD_BYTES,
  MAX_UPLOAD_BYTES,
  blobConfigured,
  deleteStoredBytes,
  isAllowedType,
  verifyUpload,
} from "@/lib/files";

export type AttachResult = { ok: boolean; error?: string; id?: string };

export async function recordBlobUpload(input: {
  targetType: string;
  targetId: string;
  filename: string;
  url: string;
  mimeType?: string | null;
  durationSeconds?: number | null;
}): Promise<AttachResult> {
  try {
    const user = await requireRole("EDITOR");
    if (!blobConfigured()) return { ok: false, error: "File storage isn't connected." };

    const filename = input.filename.trim().slice(0, 260) || "file";
    if (!isAllowedType(input.mimeType)) {
      return { ok: false, error: `${input.mimeType} isn't a file type the Repo accepts.` };
    }

    // Believe the store, not the browser: size and pathname come from Blob.
    const blob = await verifyUpload(input.url);
    if (!blob) return { ok: false, error: "That upload didn't arrive — try it again." };
    if (blob.size > MAX_UPLOAD_BYTES) {
      return { ok: false, error: "That file is over the size limit." };
    }

    const attachment = await db.attachment.create({
      data: {
        targetType: input.targetType,
        targetId: input.targetId,
        filename,
        storage: "blob",
        storedPath: blob.pathname,
        blobUrl: input.url,
        mimeType: blob.contentType ?? input.mimeType ?? null,
        sizeBytes: blob.size,
        durationSeconds:
          input.durationSeconds && Number.isFinite(input.durationSeconds)
            ? Math.round(input.durationSeconds)
            : null,
        uploadedById: user.id,
      },
    });

    await logAudit(user, {
      targetType: input.targetType,
      targetId: input.targetId,
      targetLabel: filename,
      action: "linked",
      field: "attachment",
      newValue: filename,
    });
    revalidatePath("/", "layout");
    return { ok: true, id: attachment.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not attach that file." };
  }
}

/**
 * The fallback for a deployment with no Blob store connected: small files still
 * go into Postgres the old way, so the Repo is never simply unable to hold a
 * PDF. Bounded hard, because this is exactly the path that used to make
 * backups enormous.
 */
export async function recordDatabaseUpload(input: {
  targetType: string;
  targetId: string;
  filename: string;
  mimeType: string | null;
  base64: string;
}): Promise<AttachResult> {
  try {
    const user = await requireRole("EDITOR");
    const bytes = Buffer.from(input.base64, "base64");
    if (bytes.byteLength > MAX_DB_UPLOAD_BYTES) {
      return {
        ok: false,
        error: "Without a Blob store connected, files are limited to 15MB. Ask an admin to add one in Vercel.",
      };
    }
    if (!isAllowedType(input.mimeType)) {
      return { ok: false, error: `${input.mimeType} isn't a file type the Repo accepts.` };
    }

    const filename = input.filename.trim().slice(0, 260) || "file";
    const ext = path.extname(filename).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 10);
    const key = `${crypto.randomBytes(12).toString("hex")}${ext}`;
    await db.storedFile.create({
      data: { key, mimeType: input.mimeType, sizeBytes: bytes.byteLength, data: bytes },
    });
    const attachment = await db.attachment.create({
      data: {
        targetType: input.targetType,
        targetId: input.targetId,
        filename,
        storage: "db",
        storedPath: key,
        mimeType: input.mimeType,
        sizeBytes: bytes.byteLength,
        uploadedById: user.id,
      },
    });
    await logAudit(user, {
      targetType: input.targetType,
      targetId: input.targetId,
      targetLabel: filename,
      action: "linked",
      field: "attachment",
      newValue: filename,
    });
    revalidatePath("/", "layout");
    return { ok: true, id: attachment.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not attach that file." };
  }
}

/** Remove an attachment and the bytes behind it, wherever those live. */
export async function removeAttachment(attachmentId: string): Promise<AttachResult> {
  try {
    const user = await requireRole("EDITOR");
    const attachment = await db.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) return { ok: true };

    // Bytes first: a row without its file is recoverable, a file without its
    // row is a leak nobody will ever find.
    await deleteStoredBytes(attachment);
    await db.attachment.delete({ where: { id: attachmentId } });

    await logAudit(user, {
      targetType: attachment.targetType,
      targetId: attachment.targetId,
      targetLabel: attachment.filename,
      action: "unlinked",
      field: "attachment",
      oldValue: attachment.filename,
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not delete that file." };
  }
}
