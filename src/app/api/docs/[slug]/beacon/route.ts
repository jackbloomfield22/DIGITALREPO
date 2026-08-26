import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasRole } from "@/lib/auth";
import { sanitizeDocHtml } from "@/lib/doc-format";

// The last save, sent as the tab closes. `navigator.sendBeacon` can only post
// to a URL, not call a server action, so the autosave's safety net needs a
// route of its own. It is deliberately forgiving — a beacon gets no response
// and cannot be retried, so a stale version is written rather than refused,
// on the grounds that losing the last sentence someone typed is worse than
// overwriting a change nobody has looked at yet. Everything it replaces is
// kept as a revision.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const user = await getSessionUser();
  if (!user || !hasRole(user, "EDITOR")) {
    return NextResponse.json({ error: "Editor access required" }, { status: 403 });
  }
  const { slug } = await params;
  const form = await request.formData();
  const content = sanitizeDocHtml(String(form.get("content") ?? ""));
  if (!content) return NextResponse.json({ ok: true });

  const doc = await db.doc.findUnique({ where: { slug } });
  if (!doc || doc.content === content) return NextResponse.json({ ok: true });

  await db.docRevision.create({
    data: {
      docId: doc.id,
      content: doc.content,
      note: "before a change saved on closing the page",
      createdById: user.id,
      createdByName: user.name,
    },
  });
  await db.doc.update({
    where: { id: doc.id },
    data: {
      content,
      version: { increment: 1 },
      updatedById: user.id,
      updatedByName: user.name,
    },
  });
  return NextResponse.json({ ok: true });
}
