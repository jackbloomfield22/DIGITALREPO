"use server";

// The note box, once it has understood you. A note that says "move this to on
// hold and put a line in that HBO passed" arrives here as a set of concrete
// proposals; approving them runs the same apply engine every other ingest uses,
// so the edit is audited, attributed, and undoable from Add Info like anything
// else. Nothing is written until you say so.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { applyIngestChangesCore } from "@/lib/ingest/apply";
import { markBroughtUpToDate } from "@/lib/sweep";

export type PageEditResult = {
  ok: boolean;
  error?: string;
  applied?: number;
  failed?: number;
  /** Where the change landed, so the box can offer a link when you weren't there. */
  touched?: { name: string; path: string | null }[];
};

export async function applyPageEdit(
  itemId: string,
  approvedIds: string[],
  /** Set when the edit came from the page's own update panel: marks the page as swept. */
  sweep?: { targetType: string; targetId: string; name: string },
): Promise<PageEditResult> {
  try {
    const user = await requireRole("EDITOR");
    const item = await db.ingestItem.findUnique({ where: { id: itemId }, select: { id: true, createdById: true } });
    if (!item) return { ok: false, error: "That note is no longer here." };

    const wanted = new Set(approvedIds);
    const changes = await db.ingestChange.findMany({
      where: { itemId, status: { in: ["pending", "approved", "edited"] } },
      select: { id: true },
    });
    if (!changes.some((c) => wanted.has(c.id))) {
      return { ok: false, error: "Nothing was selected." };
    }
    await db.ingestChange.updateMany({
      where: { itemId, id: { in: [...wanted] }, status: { in: ["pending", "approved", "edited"] } },
      data: { status: "approved" },
    });
    // Anything left unticked is a "no" — recorded as rejected so the note
    // doesn't sit in Add Info afterwards looking half-finished.
    await db.ingestChange.updateMany({
      where: { itemId, id: { notIn: [...wanted] }, status: { in: ["pending", "approved", "edited"] } },
      data: { status: "rejected" },
    });

    const outcome = await applyIngestChangesCore(itemId, user);

    if (sweep && outcome.applied > 0) await markBroughtUpToDate(user, sweep, outcome.applied);

    revalidatePath("/", "layout");
    return {
      ok: true,
      applied: outcome.applied,
      failed: outcome.failed,
      touched: outcome.touched.map((t) => ({ name: t.name, path: t.path })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not make that change." };
  }
}

/** Keep the note, drop the proposals — the note itself is still worth having. */
export async function keepAsNoteOnly(itemId: string): Promise<PageEditResult> {
  try {
    await requireRole("EDITOR");
    await db.ingestChange.updateMany({
      where: { itemId, status: { in: ["pending", "approved", "edited"] } },
      data: { status: "rejected" },
    });
    revalidatePath("/uploads");
    return { ok: true, applied: 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save that." };
  }
}

/** Throw the whole thing away — the note and everything it proposed. */
export async function discardPageEdit(itemId: string): Promise<PageEditResult> {
  try {
    await requireRole("EDITOR");
    await db.ingestItem.delete({ where: { id: itemId } }).catch(() => {});
    revalidatePath("/uploads");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not discard that." };
  }
}
