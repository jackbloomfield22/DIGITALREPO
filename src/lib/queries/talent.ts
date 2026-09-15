import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { creatorSearch } from "@/lib/search-where";
import { firstParam, type SearchParams } from "@/lib/directory-params";
import { totalAudience } from "@/lib/format";
import { parseFilterParams, type FilterField, type FilterState } from "@/lib/filters";
import { filterWhere, type FieldMap } from "@/lib/filter-where";
import { paging } from "@/lib/directory";
import { CREATOR_STATUSES, PROJECT_ROLES, SOCIAL_PLATFORMS } from "@/lib/taxonomy";

// The talent list: the shared filter model plus a few sorts that have to be
// worked out in memory (audience, per-platform following, connections).

export const TALENT_FIELDS: FilterField[] = [
  { key: "topic", label: "Interests, sports & locations", kind: "lookup", lookupType: "entity", legacy: "entity" },
  { key: "status", label: "Talent status", kind: "select", options: CREATOR_STATUSES, legacy: "status" },
  { key: "platform", label: "Social platform", kind: "select", options: SOCIAL_PLATFORMS.map((p) => ({ value: p.value, label: p.label })), legacy: "platform" },
  { key: "followers", label: "Followers on a platform", kind: "number", legacy: "min", placeholder: "e.g. 300000" },
  { key: "company", label: "Company / brand", kind: "lookup", lookupType: "organization", legacy: "org" },
  { key: "rep", label: "Representative", kind: "lookup", lookupType: "person", legacy: "rep" },
  { key: "role", label: "Project role", kind: "select", options: PROJECT_ROLES, legacy: "role" },
  { key: "format", label: "Format", kind: "lookup", lookupType: "format", legacy: "format", presets: [{ value: "any", label: "Has a format" }, { value: "none", label: "No format yet" }] },
  { key: "project", label: "Project", kind: "lookup", lookupType: "project" },
  { key: "location", label: "Location", kind: "text" },
  { key: "updated", label: "Updated", kind: "date" },
];
export const TALENT_MAPS: Record<string, FieldMap> = {
  topic: { relation: "entityLinks", idField: "entityId" },
  status: { column: "status" },
  platform: { relation: "socialProfiles", idField: "platform" },
  followers: { custom: (c) => { const n = Number(c.values[0]); if (!Number.isFinite(n)) return null; return c.op === "lt" ? { socialProfiles: { some: { followerCount: { lte: n } } } } : c.op === "between" ? { socialProfiles: { some: { followerCount: { gte: n, lte: Number(c.values[1]) } } } } : c.op === "is" ? { socialProfiles: { some: { followerCount: n } } } : c.op === "empty" ? { socialProfiles: { none: { followerCount: { not: null } } } } : c.op === "not_empty" ? { socialProfiles: { some: { followerCount: { not: null } } } } : { socialProfiles: { some: { followerCount: { gte: n } } } }; } },
  company: { custom: (c) => c.op === "any" || c.op === "is" ? { OR: [{ organizations: { some: { organizationId: { in: c.values } } } }, { credits: { some: { project: { organizations: { some: { organizationId: { in: c.values } } } } } } }] } : c.op === "none" || c.op === "is_not" ? { NOT: { organizations: { some: { organizationId: { in: c.values } } } } } : c.op === "empty" ? { organizations: { none: {} } } : { organizations: { some: {} } } },
  rep: { relation: "people", idField: "personId" },
  role: { custom: (c) => c.op === "is" ? { credits: { some: { role: c.values[0] } } } : c.op === "any" ? { credits: { some: { role: { in: c.values } } } } : c.op === "is_not" ? { credits: { none: { role: c.values[0] } } } : c.op === "none" ? { credits: { none: { role: { in: c.values } } } } : null },
  format: { relation: "formats", idField: "formatId" },
  project: { relation: "credits", idField: "projectId" },
  location: { column: "location" },
  updated: { column: "updatedAt", kind: "date" },
};
export const TALENT_DEFAULT_VIEWS = [
  { name: "All", query: "" },
  { name: "Active", query: "f=status~is~active" },
  { name: "Priority", query: "f=status~is~priority" },
  { name: "Watch list", query: "f=status~is~watch" },
  { name: "Recently updated", query: "sort=updated" },
];

export type CreatorFilters = { q?: string; state: FilterState; sort: string; params: SearchParams };

export function parseCreatorFilters(params: SearchParams): CreatorFilters {
  return { q: firstParam(params.q)?.trim() || undefined, state: parseFilterParams(params, TALENT_FIELDS), sort: firstParam(params.sort) || "name", params };
}

export function buildCreatorWhere(f: CreatorFilters): Prisma.CreatorWhereInput {
  const live = firstParam(f.params.archived) === "1" ? [] : [{ archived: false }];
  return { AND: [...live, ...(f.q ? [creatorSearch(f.q)] : []), ...(filterWhere(TALENT_MAPS, f.state) as Prisma.CreatorWhereInput[])] };
}

const cardInclude = {
  socialProfiles: { select: { platform: true, handle: true, followerCount: true, countUpdatedAt: true } },
  entityLinks: { select: { relationship: true, entity: { select: { id: true, kind: true, name: true, slug: true } } } },
  formats: { select: { format: { select: { title: true, slug: true } } } },
  credits: { select: { role: true, project: { select: { id: true, title: true, slug: true } } } },
  people: { select: { relationship: true, person: { select: { name: true, slug: true } } } },
  _count: { select: { formats: true, relationshipsA: true, relationshipsB: true } },
} satisfies Prisma.CreatorInclude;

export type CreatorCardData = Prisma.CreatorGetPayload<{ include: typeof cardInclude }>;

const PLATFORM_SORTS: Record<string, string> = { instagram: "instagram", tiktok: "tiktok", youtube: "youtube" };

export async function queryCreators(f: CreatorFilters): Promise<{ creators: CreatorCardData[]; total: number; pages: number; page: number; all: boolean; ids: string[]; requested: number }> {
  const where = buildCreatorWhere(f);
  const simpleOrder: Record<string, Prisma.CreatorOrderByWithRelationInput> = {
    name: { name: "asc" }, added: { createdAt: "desc" }, updated: { updatedAt: "desc" }, formats: { formats: { _count: "desc" } }, projects: { credits: { _count: "desc" } },
  };
  const needsComputedSort = f.sort === "audience" || f.sort === "connections" || f.sort in PLATFORM_SORTS;

  if (!needsComputedSort) {
    const total = await db.creator.count({ where });
    const pg = paging(f.params, total);
    const orderBy = simpleOrder[f.sort] ?? simpleOrder.name;
    const [creators, ids] = await Promise.all([
      db.creator.findMany({ where, include: cardInclude, orderBy: [orderBy, { name: "asc" }], skip: pg.skip, take: pg.take }),
      db.creator.findMany({ where, select: { id: true }, take: 500 }),
    ]);
    return { creators, total, pages: pg.pages, page: pg.page, all: pg.all, ids: ids.map((r) => r.id), requested: pg.requested };
  }

  // Computed sorts: rank the whole matching set in memory (ids + aggregates only), then hydrate the page.
  const rows = await db.creator.findMany({
    where,
    select: { id: true, name: true, socialProfiles: { select: { platform: true, followerCount: true } }, _count: { select: { relationshipsA: true, relationshipsB: true } } },
  });
  const ranked = rows.map((r) => ({
    id: r.id, name: r.name, audience: totalAudience(r.socialProfiles),
    platformCount: (platform: string) => r.socialProfiles.filter((s) => s.platform === platform).reduce((sum, s) => sum + (s.followerCount ?? 0), 0),
    connections: r._count.relationshipsA + r._count.relationshipsB,
  }));
  if (f.sort === "audience") ranked.sort((a, b) => b.audience - a.audience || a.name.localeCompare(b.name));
  else if (f.sort === "connections") ranked.sort((a, b) => b.connections - a.connections || a.name.localeCompare(b.name));
  else { const platform = PLATFORM_SORTS[f.sort]; ranked.sort((a, b) => b.platformCount(platform) - a.platformCount(platform) || a.name.localeCompare(b.name)); }
  const total = ranked.length;
  const pg = paging(f.params, total);
  const pageIds = ranked.slice(pg.skip, pg.skip + pg.take).map((r) => r.id);
  const creators = await db.creator.findMany({ where: { id: { in: pageIds } }, include: cardInclude });
  const order = new Map(pageIds.map((creatorId, i) => [creatorId, i]));
  creators.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { creators, total, pages: pg.pages, page: pg.page, all: pg.all, ids: ranked.slice(0, 500).map((r) => r.id), requested: pg.requested };
}
