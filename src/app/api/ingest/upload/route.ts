import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasRole } from "@/lib/auth";
import { storeRawBytes } from "@/lib/ingest/storage";
import { classifyKind } from "@/lib/ingest/parse";

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
  // Optional human label for pasted text, so a note is recognisable in the
  // queue and in Add Info rather than showing up as one more "Pasted text".
  const label = String(form.get("label") ?? "").trim().slice(0, 120) || null;

  if (!files.length && !pasted) {
    return NextResponse.json({ error: "Nothing to ingest — add files or paste text." }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Too many files — the limit is ${MAX_FILES} per upload.` }, { status: 400 });
  }
  const totalBytes = files.reduce((n, f) => n + f.size, 0);
  if (totalBytes > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Upload exceeds 100MB — split it into smaller batches." }, { status: 400 });
  }

  const created: { id: string; filename: string | null; skipped?: string }[] = [];

  for (const file of files) {
    const extension = file.name.toLowerCase().split(".").pop() ?? "";
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
        createdById: user.id,
        status: "uploaded",
      },
    });
    await storeRawBytes(item.id, new Uint8Array(await file.arrayBuffer()));
    created.push({ id: item.id, filename: file.name });
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
        createdById: user.id,
        status: "parsed", // pasted text needs no parse stage
      },
    });
    created.push({ id: item.id, filename: label });
  }

  return NextResponse.json({ items: created });
}
