import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { totalAudience } from "@/lib/format";

export type CreatorFilters = {
  q?: string;
  entities: string[]; // entity ids, AND semantics
  role?: string; // creator-project role, e.g. "host"
  org?: string; // organization id — direct relationship OR worked on its projects
  rep?: string; // industry person id
  format?: string; // "any" | "none" | format id
  platform?: string;
  minFollowers?: number;
  status?: string;
  sort: string;
  view: "cards" | "table";
  page: number;
};

export const PAGE_SIZE = 24;

export function parseCreatorFilters(
  params: Record<string, string | string[] | undefined>,
): CreatorFilters {
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const many = (v: string | string[] | undefined) =>
    v == null ? [] : Array.isArray(v) ? v : [v];
  return {
    q: one(params.q)?.trim() || undefined,
    entities: many(params.entity).filter(Boolean),
    role: one(params.role) || undefined,
    org: one(params.org) || undefined,
    rep: one(params.rep) || undefined,
    format: one(params.format) || undefined,
    platform: one(params.platform) || undefined,
    minFollowers: one(params.min) ? Number(one(params.min)) : undefined,
    status: one(params.status) || undefined,
    sort: one(params.sort) || "name",
    view: one(params.view) === "table" ? "table" : "cards",
    page: Math.max(1, Number(one(params.page) ?? 1) || 1),
  };
}

export function buildCreatorWhere(f: CreatorFilters): Prisma.CreatorWhereInput {
  const and: Prisma.CreatorWhereInput[] = [{ archived: false }];

  if (f.q) {
    const tokens = f.q.split(/\s+/).filter(Boolean);
    and.push({
      OR: [
        { name: { contains: f.q, mode: "insensitive" } },
        { aliases: { hasSome: [f.q] } },
        ...(tokens.length > 1
          ? [{ AND: tokens.map((t) => ({ name: { contains: t, mode: "insensitive" as const } })) }]
          : []),
      ],
    });
  }
  for (const entityId of f.entities) {
    and.push({ entityLinks: { some: { entityId } } });
  }
  if (f.role) and.push({ credits: { some: { role: f.role } } });
  if (f.org) {
    and.push({
      OR: [
        { organizations: { some: { organizationId: f.org } } },
        { credits: { some: { project: { organizations: { some: { organizationId: f.org } } } } } },
      ],
    });
  }
  if (f.rep) and.push({ people: { some: { personId: f.rep } } });
  if (f.format === "any") and.push({ formats: { some: {} } });
  else if (f.format === "none") and.push({ formats: { none: {} } });
  else if (f.format) and.push({ formats: { some: { formatId: f.format } } });
  if (f.status) and.push({ status: f.status });
  if (f.platform && f.minFollowers) {
    and.push({
      socialProfiles: {
        some: { platform: f.platform, followerCount: { gte: f.minFollowers } },
      },
    });
  } else if (f.platform) {
    and.push({ socialProfiles: { some: { platform: f.platform } } });
  }
  // minFollowers with no platform = total listed audience, applied post-query.
  return { AND: and };
}

const cardInclude = {
  socialProfiles: {
    select: { platform: true, handle: true, followerCount: true, countUpdatedAt: true },
  },
  entityLinks: {
    select: {
      relationship: true,
      entity: { select: { id: true, kind: true, name: true, slug: true } },
    },
  },
  formats: {
    select: { format: { select: { title: true, slug: true } } },
  },
  credits: {
    select: { role: true, project: { select: { id: true, title: true, slug: true } } },
  },
  people: {
    select: { relationship: true, person: { select: { name: true, slug: true } } },
  },
  _count: {
    select: { formats: true, relationshipsA: true, relationshipsB: true },
  },
} satisfies Prisma.CreatorInclude;

export type CreatorCardData = Prisma.CreatorGetPayload<{
  include: typeof cardInclude;
}>;

const PLATFORM_SORTS: Record<string, string> = {
  instagram: "instagram",
  tiktok: "tiktok",
  youtube: "youtube",
};

export async function queryCreators(f: CreatorFilters): Promise<{
  creators: CreatorCardData[];
  total: number;
  pages: number;
}> {
  const where = buildCreatorWhere(f);

  const simpleOrder: Record<string, Prisma.CreatorOrderByWithRelationInput> = {
    name: { name: "asc" },
    added: { createdAt: "desc" },
    updated: { updatedAt: "desc" },
    formats: { formats: { _count: "desc" } },
    projects: { credits: { _count: "desc" } },
  };

  const needsComputedSort =
    f.sort === "audience" || f.sort === "connections" || f.sort in PLATFORM_SORTS;
  const needsAudienceFilter = !!f.minFollowers && !f.platform;

  if (!needsComputedSort && !needsAudienceFilter) {
    const orderBy = simpleOrder[f.sort] ?? simpleOrder.name;
    const [creators, total] = await Promise.all([
      db.creator.findMany({
        where,
        include: cardInclude,
        orderBy: [orderBy, { name: "asc" }],
        skip: (f.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      db.creator.count({ where }),
    ]);
    return { creators, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
  }

  // Computed sorts / total-audience filter: rank the full matching set in
  // memory (ids + aggregates only), then hydrate the page.
  const rows = await db.creator.findMany({
    where,
    select: {
      id: true,
      name: true,
      socialProfiles: { select: { platform: true, followerCount: true } },
      _count: { select: { relationshipsA: true, relationshipsB: true } },
    },
  });

  let ranked = rows.map((r) => ({
    id: r.id,
    name: r.name,
    audience: totalAudience(r.socialProfiles),
    platformCount: (platform: string) =>
      r.socialProfiles
        .filter((s) => s.platform === platform)
        .reduce((sum, s) => sum + (s.followerCount ?? 0), 0),
    connections: r._count.relationshipsA + r._count.relationshipsB,
  }));

  if (needsAudienceFilter) {
    ranked = ranked.filter((r) => r.audience >= (f.minFollowers ?? 0));
  }

  if (f.sort === "audience") ranked.sort((a, b) => b.audience - a.audience || a.name.localeCompare(b.name));
  else if (f.sort === "connections") ranked.sort((a, b) => b.connections - a.connections || a.name.localeCompare(b.name));
  else if (f.sort in PLATFORM_SORTS) {
    const platform = PLATFORM_SORTS[f.sort];
    ranked.sort((a, b) => b.platformCount(platform) - a.platformCount(platform) || a.name.localeCompare(b.name));
  } else ranked.sort((a, b) => a.name.localeCompare(b.name));

  const total = ranked.length;
  const pageIds = ranked.slice((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE).map((r) => r.id);
  const creators = await db.creator.findMany({
    where: { id: { in: pageIds } },
    include: cardInclude,
  });
  const order = new Map(pageIds.map((creatorId, i) => [creatorId, i]));
  creators.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { creators, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Resolve display labels for active filter chips. */
export async function resolveFilterLabels(f: CreatorFilters) {
  const [entities, orgRecord, repRecord, formatRecord] = await Promise.all([
    f.entities.length
      ? db.entity.findMany({ where: { id: { in: f.entities } }, select: { id: true, name: true, kind: true } })
      : Promise.resolve([]),
    f.org ? db.organization.findUnique({ where: { id: f.org }, select: { name: true } }) : null,
    f.rep ? db.industryPerson.findUnique({ where: { id: f.rep }, select: { name: true } }) : null,
    f.format && f.format !== "any" && f.format !== "none"
      ? db.format.findUnique({ where: { id: f.format }, select: { title: true } })
      : null,
  ]);
  return {
    entities,
    orgName: orgRecord?.name,
    repName: repRecord?.name,
    formatTitle: formatRecord?.title,
  };
}
