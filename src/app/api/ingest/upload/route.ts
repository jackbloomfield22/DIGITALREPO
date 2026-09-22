import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasRole } from "@/lib/auth";
import { storeRawBytes } from "@/lib/ingest/storage";
import { classifyKind } from "@/lib/ingest/parse";
import { loadChangesFile, parseChangesFile } from "@/lib/ingest/changes-file";
import { BLOB_SETUP_HINT, INLINE_INGEST_BYTES, blobConfigured, verifyUpload } from "@/lib/files";
import { RAW_CAP_BYTES } from "@/lib/ingest/storage";

export const maxDuration = 60;

const MAX_FILES = 50;
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1)}MB`;

// Upload stage: create one IngestItem per file (plus one for pasted text) and
// return immediately — parsing happens in its own short request. Ingest is
// the front door for anything: there is no list of accepted types here. What
// the parser can read becomes proposals; what it cannot still lands, as a
// file, on the page it was for.
export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (e) {
    // Always JSON. A thrown error would come back as an HTML page and the
    // uploader would see "Upload failed" with no reason.
    console.error("Ingest upload failed:", e);
    const message = e instanceof Error ? e.message : "Upload failed.";
    const tooBig = /body|size|large|limit/i.test(message);
    return NextResponse.json(
      { error: tooBig ? `The upload was too big for this site to take in one request. ${BLOB_SETUP_HINT}` : `The upload could not be read: ${message}` },
      { status: tooBig ? 413 : 500 },
    );
  }
}

async function handle(request: Request) {
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
  // A note typed on a record page says which page, so the panel can find its
  // proposals again after the person has moved on and come back.
  const pageRaw = String(form.get("page") ?? "").trim();
  const [pageType, pageId] = pageRaw.includes(":") ? pageRaw.split(":") : ["", ""];
  const page = pageType && pageId && /^[a-z_]+$/.test(pageType) && /^[A-Za-z0-9_-]{1,64}$/.test(pageId) ? { type: pageType, id: pageId } : null;
  const metadata = attachTo || page ? { ...(attachTo ? { attachTo } : {}), ...(page ? { page } : {}) } : undefined;

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
  // Without a Blob store every file travels through this function, which has
  // a hard ceiling on Vercel. Refuse with the reason rather than let a file
  // arrive with its bytes dropped and fail later at parse.
  if (!blobConfigured()) {
    const cap = Math.min(INLINE_INGEST_BYTES, RAW_CAP_BYTES);
    const big = files.find((f) => f.size > cap);
    if (big) {
      return NextResponse.json(
        { error: `${big.name} is ${mb(big.size)}. Without file storage connected, this site can take ${mb(cap)} per file through Ingest. ${BLOB_SETUP_HINT}` },
        { status: 413 },
      );
    }
    if (totalBytes > cap) {
      return NextResponse.json(
        { error: `These files add up to ${mb(totalBytes)}. Without file storage connected, one Ingest upload can carry ${mb(cap)}; send them in smaller batches. ${BLOB_SETUP_HINT}` },
        { status: 413 },
      );
    }
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
        metadata,
        createdById: user.id,
        status: "parsed", // pasted text needs no parse stage
      },
    });
    created.push({ id: item.id, filename: label });
  }

  return NextResponse.json({ items: created });
}
