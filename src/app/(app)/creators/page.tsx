import Link from "next/link";
import { requireUser, hasRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  parseCreatorFilters,
  queryCreators,
  resolveFilterLabels,
} from "@/lib/queries/creators";
import { toCreatorCardVM } from "@/lib/creator-vm";
import {
  CreatorDirectoryControls,
  type ActiveChip,
} from "@/components/creators/directory-controls";
import { CreatorCardGrid, CreatorTable } from "@/components/creators/creator-views";
import { labelFor } from "@/lib/taxonomy";
import { compactNumber } from "@/lib/format";

export const metadata = { title: "Creators" };

export default async function CreatorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const filters = parseCreatorFilters(params);

  const [{ creators, total, pages }, labels, favorites] = await Promise.all([
    queryCreators(filters),
    resolveFilterLabels(filters),
    db.favorite.findMany({
      where: { userId: user.id, targetType: "creator" },
      select: { targetId: true },
    }),
  ]);

  const favoriteIds = new Set(favorites.map((f) => f.targetId));
  const vms = creators.map((c) => toCreatorCardVM(c, favoriteIds));
  const canEdit = hasRole(user, "EDITOR");

  const chips: ActiveChip[] = [
    ...labels.entities.map((e) => ({
      param: "entity",
      value: e.id,
      label: `${e.name}`,
    })),
    ...(filters.role
      ? [{ param: "role", value: filters.role, label: `Has been ${labelFor(filters.role)}` }]
      : []),
    ...(labels.orgName ? [{ param: "org", value: filters.org!, label: labels.orgName }] : []),
    ...(labels.repName ? [{ param: "rep", value: filters.rep!, label: `Rep: ${labels.repName}` }] : []),
    ...(filters.format === "any"
      ? [{ param: "format", value: "any", label: "Has Format" }]
      : filters.format === "none"
        ? [{ param: "format", value: "none", label: "No Format" }]
        : labels.formatTitle
          ? [{ param: "format", value: filters.format!, label: `Format: ${labels.formatTitle}` }]
          : []),
    ...(filters.platform
      ? [{ param: "platform", value: filters.platform, label: labelFor(filters.platform) }]
      : []),
    ...(filters.minFollowers
      ? [{ param: "min", value: String(filters.minFollowers), label: `${compactNumber(filters.minFollowers)}+ followers` }]
      : []),
    ...(filters.status
      ? [{ param: "status", value: filters.status, label: `Status: ${labelFor(filters.status)}` }]
      : []),
  ];

  const pageLink = (page: number) => {
    const p = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === "page" || value == null) continue;
      for (const v of Array.isArray(value) ? value : [value]) p.append(key, v);
    }
    if (page > 1) p.set("page", String(page));
    const qs = p.toString();
    return `/creators${qs ? `?${qs}` : ""}`;
  };

  return (
    <div>
      <CreatorDirectoryControls total={total} activeChips={chips} canEdit={canEdit} />

      {vms.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-strong bg-wash/50 px-6 py-10 text-center text-sm text-muted">
          No creators match these filters.
          {canEdit && (
            <div className="mt-3">
              <Link href="/creators/new" className="btn btn-secondary btn-sm">
                + Add Creator
              </Link>
            </div>
          )}
        </div>
      ) : filters.view === "table" ? (
        <CreatorTable creators={vms} canEdit={canEdit} isAdmin={hasRole(user, "ADMIN")} />
      ) : (
        <CreatorCardGrid creators={vms} canEdit={canEdit} />
      )}

      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-2 text-sm">
          {filters.page > 1 && (
            <Link className="btn btn-secondary btn-sm" href={pageLink(filters.page - 1)}>
              ← Previous
            </Link>
          )}
          <span className="px-2 text-muted">
            Page {filters.page} of {pages}
          </span>
          {filters.page < pages && (
            <Link className="btn btn-secondary btn-sm" href={pageLink(filters.page + 1)}>
              Next →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
