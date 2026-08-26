"use server";

// Saving a document that saves itself.
//
// Autosave removes the moment where someone decides to keep a copy, so the app
// has to decide for them — hence the revision rules below. It also makes two
// people typing at once likelier to collide, so every save carries the version
// it was based on and a stale one is refused rather than allowed to overwrite.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { sanitizeDocHtml } from "@/lib/doc-format";

export type SaveResult = {
  ok: boolean;
  error?: string;
  version?: number;
  savedAt?: string;
  /** Set when someone else saved first; the caller must not keep overwriting. */
  conflictWith?: string;
};

/** Roughly one keystroke-run per person per sitting, rather than one per keystroke. */
const REVISION_GAP_MS = 10 * 60 * 1000;
/** A change this big is a rewrite, and worth keeping the previous version for whatever the clock says. */
const REVISION_DELTA = 0.2;

const MAX_DOC_BYTES = 2 * 1024 * 1024;

/**
 * Keep the document as it stood, but only when the copy would be worth having:
 * the last one is old, or this save changed a lot at once.
 */
async function maybeSnapshot(
  doc: { id: string; content: string; updatedByName: string | null },
  nextContent: string,
  note?: string,
) {
  if (!doc.content) return;
  const last = await db.docRevision.findFirst({
    where: { docId: doc.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, content: true },
  });
  const changed =
    Math.abs(nextContent.length - doc.content.length) / Math.max(1, doc.content.length);
  const stale = !last || Date.now() - last.createdAt.getTime() > REVISION_GAP_MS;
  if (!note && !stale && changed < REVISION_DELTA) return;
  if (last?.content === doc.content) return;

  await db.docRevision.create({
    data: {
      docId: doc.id,
      content: doc.content,
      note: note ?? null,
      createdByName: doc.updatedByName,
    },
  });
  // History that grows without limit is the same storage problem as backups.
  const stale_ids = await db.docRevision.findMany({
    where: { docId: doc.id },
    orderBy: { createdAt: "desc" },
    skip: 50,
    select: { id: true },
  });
  if (stale_ids.length) {
    await db.docRevision.deleteMany({ where: { id: { in: stale_ids.map((r) => r.id) } } });
  }
}

export async function saveDoc(
  slug: string,
  content: string,
  expectedVersion: number,
): Promise<SaveResult> {
  try {
    const user = await requireRole("EDITOR");
    if (content.length > MAX_DOC_BYTES) {
      return { ok: false, error: "This document is too long to save — try splitting it up." };
    }
    const doc = await db.doc.findUnique({ where: { slug } });
    if (!doc) return { ok: false, error: "That document no longer exists." };

    const clean = sanitizeDocHtml(content);
    if (clean === doc.content) {
      // Nothing changed — don't burn a version on a cursor move.
      return { ok: true, version: doc.version, savedAt: doc.updatedAt.toISOString() };
    }
    if (doc.version !== expectedVersion) {
      return {
        ok: false,
        conflictWith: doc.updatedByName ?? "someone else",
        error: `${doc.updatedByName ?? "Someone else"} saved a change while you were typing.`,
      };
    }

    await maybeSnapshot(doc, clean);
    const updated = await db.doc.update({
      where: { id: doc.id, version: expectedVersion },
      data: {
        content: clean,
        version: { increment: 1 },
        updatedById: user.id,
        updatedByName: user.name,
      },
    });
    revalidatePath(`/${slug}`);
    return { ok: true, version: updated.version, savedAt: updated.updatedAt.toISOString() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save." };
  }
}

/** Put the document back to an earlier version, keeping the current one first. */
export async function restoreDocRevision(revisionId: string): Promise<SaveResult> {
  try {
    const user = await requireRole("EDITOR");
    const revision = await db.docRevision.findUnique({
      where: { id: revisionId },
      include: { doc: true },
    });
    if (!revision) return { ok: false, error: "That version is no longer on record." };

    await maybeSnapshot(revision.doc, revision.content, "before restoring an earlier version");
    const updated = await db.doc.update({
      where: { id: revision.docId },
      data: {
        content: revision.content,
        version: { increment: 1 },
        updatedById: user.id,
        updatedByName: user.name,
      },
    });
    await logAudit(user, {
      targetType: "doc",
      targetId: revision.docId,
      targetLabel: revision.doc.title,
      action: "updated",
      field: "restored an earlier version",
    });
    revalidatePath(`/${revision.doc.slug}`);
    return { ok: true, version: updated.version, savedAt: updated.updatedAt.toISOString() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not restore." };
  }
}

export type RevisionVM = { id: string; when: string; by: string | null; note: string | null; length: number };

export async function listDocRevisions(slug: string): Promise<RevisionVM[]> {
  const doc = await db.doc.findUnique({ where: { slug }, select: { id: true } });
  if (!doc) return [];
  const rows = await db.docRevision.findMany({
    where: { docId: doc.id },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: { id: true, createdAt: true, createdByName: true, note: true, content: true },
  });
  return rows.map((r) => ({
    id: r.id,
    when: r.createdAt.toISOString(),
    by: r.createdByName,
    note: r.note,
    length: r.content.length,
  }));
}
