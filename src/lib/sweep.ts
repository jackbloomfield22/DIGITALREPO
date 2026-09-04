import "server-only";

// The page-by-page sweep: going through the Repo one record at a time and
// bringing each up to date. Two things make that bearable across four hundred
// pages — knowing which ones are done, and getting to the next one without
// going back to a list. Both come from the records themselves rather than any
// bookkeeping the reader has to keep.

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { BROUGHT_UP_TO_DATE } from "@/lib/page-update";
import type { SessionUser } from "@/lib/roles";

const SWEEP_MODELS: Record<string, { model: string; nameField: string; path: string; dated: boolean }> = {
  creator: { model: "creator", nameField: "name", path: "/talent", dated: false },
  project: { model: "project", nameField: "title", path: "/projects", dated: true },
  format: { model: "format", nameField: "title", path: "/formats", dated: true },
  organization: { model: "organization", nameField: "name", path: "/organizations", dated: false },
  person: { model: "industryPerson", nameField: "name", path: "/people", dated: false },
  opportunity: { model: "opportunity", nameField: "title", path: "/opportunities", dated: true },
  channel: { model: "channel", nameField: "name", path: "/youtube", dated: true },
};

export type SweepInfo = {
  lastUpdatedAt: string | null;
  lastUpdatedBy: string | null;
  next: { name: string; path: string } | null;
};

export async function sweepInfo(targetType: string, targetId: string): Promise<SweepInfo> {
  const spec = SWEEP_MODELS[targetType];
  if (!spec) return { lastUpdatedAt: null, lastUpdatedBy: null, next: null };

  const [mark, current] = await Promise.all([
    db.auditLog.findFirst({
      where: { targetType, targetId, field: BROUGHT_UP_TO_DATE },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, userName: true },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)[spec.model].findUnique({ where: { id: targetId }, select: { [spec.nameField]: true } }),
  ]);
  const name: string | undefined = current?.[spec.nameField];

  // The next live record alphabetically, so the sweep runs A to Z and skips
  // whatever has already been put in the Archive.
  const next = name
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any)[spec.model].findFirst({
        where: { archived: false, [spec.nameField]: { gt: name } },
        orderBy: { [spec.nameField]: "asc" },
        select: { slug: true, [spec.nameField]: true },
      })
    : null;

  return {
    lastUpdatedAt: mark?.createdAt.toISOString() ?? null,
    lastUpdatedBy: mark?.userName ?? null,
    next: next ? { name: next[spec.nameField], path: `${spec.path}/${next.slug}` } : null,
  };
}

/**
 * A visible mark that this page has been gone over, so the sweep can be picked
 * up after a break without wondering which pages are done. Records that carry
 * an activity date get it moved to today as well.
 */
export async function markBroughtUpToDate(
  user: SessionUser,
  sweep: { targetType: string; targetId: string; name: string },
  applied: number,
): Promise<void> {
  await logAudit(user, {
    targetType: sweep.targetType,
    targetId: sweep.targetId,
    targetLabel: sweep.name,
    action: "updated",
    field: BROUGHT_UP_TO_DATE,
    newValue: `${applied} change${applied === 1 ? "" : "s"}`,
  });
  const spec = SWEEP_MODELS[sweep.targetType];
  if (spec?.dated) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any)[spec.model]
      .update({ where: { id: sweep.targetId }, data: { lastActivityAt: new Date() } })
      .catch(() => {});
  }
}
