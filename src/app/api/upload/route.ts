import { NextResponse } from "next/server";
import path from "path";
import crypto from "crypto";
import { db } from "@/lib/db";
import { getSessionUser, hasRole } from "@/lib/auth";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv", "text/plain",
]);

// File bytes are stored in Postgres (StoredFile) — serverless filesystems are
// ephemeral, so disk writes would silently vanish on the next deploy. Stored
// URLs stay opaque to the rest of the app.
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || !hasRole(user, "EDITOR")) {
    return NextResponse.json({ error: "Editor access required" }, { status: 403 });
  }
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 15MB)" }, { status: 400 });
  }
  if (file.type && !ALLOWED.has(file.type)) {
    return NextResponse.json({ error: `Unsupported file type ${file.type}` }, { status: 400 });
  }

  const ext = path.extname(file.name).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 10);
  const key = `${crypto.randomBytes(12).toString("hex")}${ext}`;
  const data = new Uint8Array(await file.arrayBuffer());
  await db.storedFile.create({
    data: { key, mimeType: file.type || null, sizeBytes: data.byteLength, data },
  });

  const url = `/api/files/${key}`;

  const targetType = form.get("targetType");
  const targetId = form.get("targetId");
  let attachmentId: string | undefined;
  if (typeof targetType === "string" && typeof targetId === "string" && targetType && targetId) {
    const attachment = await db.attachment.create({
      data: {
        targetType,
        targetId,
        filename: file.name,
        storedPath: key,
        mimeType: file.type || null,
        sizeBytes: file.size,
        uploadedById: user.id,
      },
    });
    attachmentId = attachment.id;
  }

  return NextResponse.json({ url, attachmentId });
}
