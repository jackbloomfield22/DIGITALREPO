import "server-only";

// Where uploaded files live, and how they get back to a browser.
//
// Attachments used to be written into Postgres, because a serverless disk is
// wiped on every deploy and there was nowhere else to put them. That held up
// while "a file" meant a two-megabyte PDF. It does not hold up for a rough cut:
// a database is the wrong place for gigabytes of video, backups have to carry
// it, and every read pulls it through a connection pool.
//
// So real files go to Vercel Blob instead, and this module is the only part of
// the app that knows that. Three things matter about how it is set up:
//
//   Private, not public. The Repo holds unannounced projects and confidential
//   deals. Blob's public URLs are unguessable but permanent — anyone who ends
//   up with the link is past the login. Files are stored private, and reaching
//   one always goes through a session check.
//
//   Served by redirect, not by proxy. A signed URL is minted per request and
//   the browser is sent to it. The bytes travel from Blob's CDN straight to the
//   viewer, which is what makes scrubbing through a two-hour cut work at all —
//   range requests are handled there, not by a function paying for every byte.
//
//   Uploaded straight from the browser. A serverless request body caps out at
//   4.5MB, so anything real would fail if it went through the app. The browser
//   gets a short-lived, size-and-type-constrained token and uploads directly.

import { db } from "@/lib/db";

/** An hour is long enough to watch something, short enough that a copied URL dies. */
const SIGNED_URL_TTL_MS = 60 * 60 * 1000;

/** Anything larger and Int columns and browsers both start to complain. */
export const MAX_UPLOAD_BYTES = 2_000_000_000;

/** What the Postgres fallback will take when no Blob store is connected. */
export const MAX_DB_UPLOAD_BYTES = 15 * 1024 * 1024;

export const ALLOWED_UPLOAD_TYPES = [
  // Documents and decks
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
  "application/rtf",
  "application/zip",
  // Images
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/avif",
  "image/svg+xml",
  // Video — the reason this module exists
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "video/x-msvideo",
  // Audio
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/aac",
  "audio/ogg",
];

export function blobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/** How big a file this deployment can actually take, and why. */
export function uploadLimit(): { bytes: number; blob: boolean } {
  return blobConfigured()
    ? { bytes: MAX_UPLOAD_BYTES, blob: true }
    : { bytes: MAX_DB_UPLOAD_BYTES, blob: false };
}

export function isAllowedType(mimeType: string | null | undefined): boolean {
  if (!mimeType) return true; // browsers leave this empty for some file types
  return ALLOWED_UPLOAD_TYPES.includes(mimeType);
}

export type MediaKind = "video" | "audio" | "image" | "pdf" | "file";

/** What the UI should render for a file, decided once rather than per page. */
export function mediaKind(mimeType: string | null | undefined, filename?: string): MediaKind {
  const type = (mimeType ?? "").toLowerCase();
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (type === "application/pdf") return "pdf";
  if (type.startsWith("image/")) return "image";
  // A file that arrived without a content type still has a name.
  const ext = (filename ?? "").toLowerCase().split(".").pop() ?? "";
  if (["mp4", "mov", "webm", "m4v"].includes(ext)) return "video";
  if (["mp3", "wav", "m4a", "aac"].includes(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp", "avif", "heic"].includes(ext)) return "image";
  return "file";
}

/**
 * A URL the browser can fetch this file from, valid for the next hour and
 * scoped to this one file. Returns null when the blob is gone or the store
 * isn't reachable, so the caller can 404 rather than redirect into an error.
 */
export async function signedUrlFor(pathname: string): Promise<string | null> {
  if (!blobConfigured()) return null;
  try {
    const { issueSignedToken, presignUrl } = await import("@vercel/blob");
    const validUntil = Date.now() + SIGNED_URL_TTL_MS;
    const signedToken = await issueSignedToken({
      pathname,
      operations: ["get"],
      validUntil,
    });
    const { presignedUrl } = await presignUrl(signedToken, {
      operation: "get",
      pathname,
      access: "private",
      validUntil,
    });
    return presignedUrl;
  } catch (e) {
    console.error("Could not sign a URL for", pathname, e);
    return null;
  }
}

/**
 * Remove the bytes behind an attachment, wherever they are. Deleting an
 * attachment used to drop the row and leave its contents in the database
 * forever; this is the other half of that.
 */
export async function deleteStoredBytes(attachment: {
  storage: string;
  storedPath: string;
  blobUrl: string | null;
}): Promise<void> {
  if (attachment.storage === "blob") {
    if (!blobConfigured()) return;
    try {
      const { del } = await import("@vercel/blob");
      await del(attachment.blobUrl ?? attachment.storedPath);
    } catch (e) {
      // A missing blob is already the desired state; anything else is worth
      // knowing about but must not block removing the record.
      console.error("Could not delete blob", attachment.storedPath, e);
    }
    return;
  }
  await db.storedFile.deleteMany({ where: { key: attachment.storedPath } });
}

/** Confirm a client-side upload really landed, and how big it actually is. */
export async function verifyUpload(
  url: string,
): Promise<{ pathname: string; size: number; contentType: string | null } | null> {
  if (!blobConfigured()) return null;
  try {
    const { head } = await import("@vercel/blob");
    const info = await head(url);
    return {
      pathname: info.pathname,
      size: info.size,
      contentType: info.contentType ?? null,
    };
  } catch {
    return null;
  }
}

/** A record's files, shaped for the UI: kind decided, URL routed, size known. */
export async function attachmentsFor(targetType: string, targetId: string) {
  const rows = await db.attachment.findMany({
    where: { targetType, targetId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((a) => ({
    id: a.id,
    filename: a.filename,
    // Always the app's own route, never the storage URL: reading a file is a
    // session check followed by a signed redirect.
    url: `/api/attachments/${a.id}`,
    sizeBytes: a.sizeBytes,
    mimeType: a.mimeType,
    kind: mediaKind(a.mimeType, a.filename),
    durationSeconds: a.durationSeconds,
    storage: a.storage,
  }));
}
