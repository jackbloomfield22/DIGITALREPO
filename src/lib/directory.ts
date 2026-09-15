// The bits every directory page repeats: paging (fifty a page, or all of
// them up to a cap), and the ids of everything matching the current filters
// so a list can "select all N matching" beyond the visible page.

import "server-only";
import { db } from "@/lib/db";
import { firstParam, pageNumber, PAGE_SIZE, VIEW_ALL_CAP, type SearchParams } from "@/lib/directory-params";
import { readPrefs, type UserPrefs } from "@/lib/prefs";
export { PAGE_SIZE, VIEW_ALL_CAP };

export function paging(params: SearchParams, total: number) {
  const all = firstParam(params.all) === "1" && total <= VIEW_ALL_CAP;
  const pages = all ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = all ? 1 : Math.min(pageNumber(params.page), pages);
  return { all, pages, page, skip: all ? 0 : (page - 1) * PAGE_SIZE, take: all ? VIEW_ALL_CAP : PAGE_SIZE, requested: pageNumber(params.page) };
}

/** Ids of everything the filters match, capped, for bulk selection. */
export async function matchingIds(find: (args: { where: unknown; select: { id: true }; take: number }) => Promise<{ id: string }[]>, where: unknown): Promise<string[]> {
  const rows = await find({ where, select: { id: true }, take: VIEW_ALL_CAP });
  return rows.map((r) => r.id);
}

/** Table or cards: the URL wins, then the person's remembered choice. */
export function layoutFor(params: SearchParams, prefs: UserPrefs, section: string): "table" | "cards" {
  const v = firstParam(params.view);
  if (v === "cards" || v === "table") return v;
  return prefs.layout?.[section] ?? "table";
}

/** What a directory page needs from the person: preferences and their saved views for this section. */
export async function directoryUser(userId: string, section: string) {
  const [prefs, views] = await Promise.all([
    readPrefs(userId),
    db.savedView.findMany({ where: { ownerId: userId, targetType: section }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, query: true } }),
  ]);
  return { prefs, views };
}

/** "Show archived" on a list: `archived=1` in the URL. */
export function showArchived(params: Record<string, string | string[] | undefined>): boolean {
  return firstParam(params.archived) === "1";
}

/** The clause that keeps a list to live records unless the viewer asked for the Archive too. */
export function liveOnly(params: Record<string, string | string[] | undefined>): { archived: false }[] {
  return showArchived(params) ? [] : [{ archived: false }];
}
