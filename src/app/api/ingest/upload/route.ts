import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasRole } from "@/lib/auth";
import { storeRawBytes } from "@/lib/ingest/storage";
import { classifyKind } from "@/lib/ingest/parse";
import { loadChangesFile, parseChangesFile } from "@/lib/ingest/changes-file";
import { verifyUpload } from "@/lib/files";

export const maxDuration = 60;

const ACCEPTED = new Set(["eml", "msg", "mbox", "zip", "pdf", "docx", "pptx", "xlsx", "csv", "txt", "md", "html", "htm"]);
const MAX_FILES = 50;
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

// Upload stage: create one IngestItem per file (plus one for pasted text) and
// return immediately — parsing happens in its own short request.
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || !hasRole(user, "EDITOR")) {
    return NextResponse.json({ error: "Editor access required" }, { status: 403 });
  }

  const form = await request.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  const pasted = String(form.get("text") ?? "").trim();
  // Optional uploader note ("what this is / why it matters") — stored on every
  // item in the batch and fed to triage and propose as trusted context.
  const context = String(form.get("context") ?? "").trim().slice(0, 2000) || null;
  const webResearch = form.get("webResearch") === "1";
  // Which part of the Repo the uploader says this is for. Only a known lane is
  // accepted — an unrecognised one would silently change how everything is read.
  const workspaceRaw = String(form.get("workspace") ?? "").trim();
  const workspace = workspaceRaw === "youtube" ? "youtube" : null;
  // Optional human label for pasted text, so a note is recognisable in the
  // queue and in Add Info rather than showing up as one more "Pasted text".
  const label = String(form.get("label") ?? "").trim().slice(0, 120) || null;
  // Files that went straight to Blob storage from the browser: verified
  // against the store, never trusted from the form.
  let blobs: { url: string; pathname: string; filename: string; size: number; type: string }[] = [];
  try {
    const raw = String(form.get("blobs") ?? "");
    if (raw) blobs = (JSON.parse(raw) as typeof blobs).filter((b) => b && typeof b.url === "string" && typeof b.filename === "string").slice(0, MAX_FILES);
  } catch {
    return NextResponse.json({ error: "The upload list could not be read." }, { status: 400 });
  }
  // "This file is for": a format or project the file should land on after review.
  const attachToRaw = String(form.get("attachTo") ?? "").trim();
  let attachTo: { type: "format" | "project"; id: string } | null = null;
  if (attachToRaw) {
    const [type, id] = attachToRaw.split(":");
    if ((type === "format" || type === "project") && id) {
      const exists = type === "format" ? await db.format.findUnique({ where: { id }, select: { id: true } }) : await db.project.findUnique({ where: { id }, select: { id: true } });
      if (!exists) return NextResponse.json({ error: "The record this file is for could not be found." }, { status: 400 });
      attachTo = { type, id };
    }
  }
  const metadata = attachTo ? { attachTo } : undefined;

  if (!files.length && !pasted && !blobs.length) {
    return NextResponse.json({ error: "Nothing to ingest — add files or paste text." }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Too many files — the limit is ${MAX_FILES} per upload.` }, { status: 400 });
  }
  const totalBytes = files.reduce((n, f) => n + f.size, 0);
  if (totalBytes > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Upload exceeds 100MB — split it into smaller batches." }, { status: 400 });
  }

  const created: {
    id: string; filename: string | null; skipped?: string;
    /** A changes file lands already proposed — nothing to parse or read. */
    ready?: boolean; stored?: number; invalid?: number; malformed?: number;
  }[] = [];

  for (const file of files) {
    const extension = file.name.toLowerCase().split(".").pop() ?? "";
    if (extension === "json") {
      const changes = parseChangesFile(await file.text());
      if (!changes) {
        created.push({ id: "", filename: file.name, skipped: "Not a 4.4.Forty changes file" });
        continue;
      }
      const loaded = await loadChangesFile(user.id, changes, file.name, workspace);
      created.push({
        id: loaded.itemId, filename: file.name, ready: true,
        stored: loaded.stored, invalid: loaded.invalid.length, malformed: loaded.malformed,
      });
      continue;
    }
    if (!ACCEPTED.has(extension)) {
      created.push({ id: "", filename: file.name, skipped: `Unsupported type .${extension}` });
      continue;
    }
    const item = await db.ingestItem.create({
      data: {
        kind: classifyKind(file.name, file.type || null),
        filename: file.name,
        mimeType: file.type || null,
        sizeBytes: file.size,
        context,
        webResearch,
        workspace,
        metadata,
        createdById: user.id,
        status: "uploaded",
      },
    });
    await storeRawBytes(item.id, new Uint8Array(await file.arrayBuffer()));
    created.push({ id: item.id, filename: file.name });
  }

  for (const b of blobs) {
    const extension = b.filename.toLowerCase().split(".").pop() ?? "";
    if (!ACCEPTED.has(extension)) {
      created.push({ id: "", filename: b.filename, skipped: `Unsupported type .${extension}` });
      continue;
    }
    const info = await verifyUpload(b.url);
    if (!info) {
      created.push({ id: "", filename: b.filename, skipped: "That upload didn't arrive — try it again" });
      continue;
    }
    const item = await db.ingestItem.create({
      data: {
        kind: classifyKind(b.filename, b.type || null),
        filename: b.filename,
        mimeType: b.type || info.contentType,
        sizeBytes: info.size,
        blobPath: info.pathname,
        blobUrl: b.url,
        context,
        webResearch,
        workspace,
        metadata,
        createdById: user.id,
        status: "uploaded",
      },
    });
    created.push({ id: item.id, filename: b.filename });
  }

  if (pasted) {
    const item = await db.ingestItem.create({
      data: {
        kind: "text",
        filename: label,
        extractedText: pasted.slice(0, 200_000),
        sizeBytes: pasted.length,
        context,
        webResearch,
        workspace,
        createdById: user.id,
        status: "parsed", // pasted text needs no parse stage
      },
    });
    created.push({ id: item.id, filename: label });
  }

  return NextResponse.json({ items: created });
}
