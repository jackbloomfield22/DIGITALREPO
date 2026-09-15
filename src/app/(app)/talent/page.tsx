import { redirect } from "next/navigation";
import Link from "next/link";
import { directoryPageUrl, firstParam } from "@/lib/directory-params";
import { requireUser, hasRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseCreatorFilters, queryCreators, TALENT_FIELDS, TALENT_DEFAULT_VIEWS } from "@/lib/queries/talent";
import { toCreatorCardVM } from "@/lib/creator-vm";
import { CreatorDirectoryControls } from "@/components/talent/directory-controls";
import { CreatorCardGrid, CreatorTable } from "@/components/talent/creator-views";
import { Pagination } from "@/components/pagination";
import { filterNames } from "@/lib/filter-where";
import { directoryUser, layoutFor } from "@/lib/directory";

export const metadata = { title: "Talent" };

export default async function CreatorsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const params = await searchParams;
  const filters = parseCreatorFilters(params);
  const [{ creators, total, pages, page, all, ids, requested }, names, favorites, { prefs, views }] = await Promise.all([
    queryCreators(filters),
    filterNames(TALENT_FIELDS, filters.state),
    db.favorite.findMany({ where: { userId: user.id, targetType: "creator" }, select: { targetId: true } }),
    directoryUser(user.id, "talent"),
  ]);
  if (!all && requested > pages) redirect(directoryPageUrl("/talent", params, pages));
  const view = layoutFor(params, prefs, "talent");
  const favoriteIds = new Set(favorites.map((f) => f.targetId));
  const vms = creators.map((c) => toCreatorCardVM(c, favoriteIds));
  const canEdit = hasRole(user, "EDITOR");

  return (
    <div>
      <CreatorDirectoryControls showArchived={firstParam(params.archived) === "1"} total={total} canEdit={canEdit} fields={TALENT_FIELDS} state={filters.state} names={Object.fromEntries(names)} savedViews={views} defaultViews={TALENT_DEFAULT_VIEWS} />
      {vms.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-strong bg-wash/50 px-6 py-10 text-center text-sm text-muted">
          {filters.q || filters.state.and.length || filters.state.or.length ? "No talent matches these filters." : "No talent yet. Creators, athletes and personalities live here."}
          {canEdit && <div className="mt-3"><Link href="/talent/new" className="btn btn-secondary btn-sm">+ Add Talent</Link></div>}
        </div>
      ) : view === "table" ? (
        <CreatorTable creators={vms} canEdit={canEdit} isAdmin={hasRole(user, "ADMIN")} matchingIds={ids} />
      ) : (
        <CreatorCardGrid creators={vms} canEdit={canEdit} />
      )}
      <Pagination page={page} pages={pages} total={total} all={all} />
    </div>
  );
}
