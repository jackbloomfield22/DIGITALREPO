import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasRole } from "@/lib/auth";
import { textToDocHtml, sanitizeDocHtml } from "@/lib/doc-format";
import { extractDocx, extractPdf } from "@/lib/ingest/parse/documents";
import { logAudit } from "@/lib/audit";

// Refreshing a document from the file it came out of. The slate is maintained
// somewhere else and exported; this is the path that gets that export back in
// without anyone retyping it. The version being replaced is always kept first —
// an import is the single most destructive thing that can happen to this
// document, and it happens in one click.
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const user = await getSessionUser();
  if (!user || !hasRole(user, "EDITOR")) {
    return NextResponse.json({ error: "Editor access required" }, { status: 403 });
  }

  const { slug } = await params;
  const doc = await db.doc.findUnique({ where: { slug } });
  if (!doc) return NextResponse.json({ error: "No such document" }, { status: 404 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is over 25MB." }, { status: 400 });
  }

  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  const bytes = new Uint8Array(await file.arrayBuffer());

  let text: string;
  try {
    if (extension === "pdf") text = (await extractPdf(bytes)).text;
    else if (extension === "docx") text = extractDocx(bytes).text;
    else if (["txt", "md", "markdown", "text"].includes(extension)) text = new TextDecoder().decode(bytes);
    else {
      return NextResponse.json(
        { error: `Can't read a .${extension} — use a PDF, a Word file, or plain text.` },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json({ error: "That file couldn't be read." }, { status: 400 });
  }

  if (!text.trim()) {
    return NextResponse.json({ error: "There was no text in that file." }, { status: 400 });
  }

  const content = sanitizeDocHtml(textToDocHtml(text));

  // Whatever was there is kept before it is replaced, always — not on the
  // usual "was this change big enough" rules an autosave uses.
  if (doc.content) {
    await db.docRevision.create({
      data: {
        docId: doc.id,
        content: doc.content,
        note: `replaced by ${file.name}`,
        createdById: user.id,
        createdByName: user.name,
      },
    });
  }

  const updated = await db.doc.update({
    where: { id: doc.id },
    data: {
      content,
      version: { increment: 1 },
      updatedById: user.id,
      updatedByName: user.name,
    },
  });

  await logAudit(user, {
    targetType: "doc",
    targetId: doc.id,
    targetLabel: doc.title,
    action: "updated",
    field: "imported",
    newValue: file.name,
  });

  return NextResponse.json({
    ok: true,
    content,
    version: updated.version,
    savedAt: updated.updatedAt.toISOString(),
    filename: file.name,
  });
}
