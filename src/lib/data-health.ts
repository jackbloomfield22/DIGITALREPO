import "server-only";
import { db } from "@/lib/db";
import { nameSimilarity } from "@/lib/slug";

export type DuplicateGroup = {
  kind: "creator" | "organization" | "project" | "entity";
  items: { id: string; label: string; href: string; detail?: string }[];
};

function pairs<T extends { id: string; label: string }>(
  rows: (T & { norm: string })[],
  threshold = 0.72,
): T[][] {
  const groups: T[][] = [];
  const used = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    if (used.has(rows[i].id)) continue;
    const group = [rows[i]];
    for (let j = i + 1; j < rows.length; j++) {
      if (used.has(rows[j].id)) continue;
      if (nameSimilarity(rows[i].label, rows[j].label) >= threshold) {
        group.push(rows[j]);
        used.add(rows[j].id);
      }
    }
    if (group.length > 1) {
      used.add(rows[i].id);
      groups.push(group);
    }
  }
  return groups;
}

export async function computeDataHealth() {
  const STALE_VERIFY_DAYS = 180;
  const STALE_SOCIAL_DAYS = 120;
  const staleVerify = new Date(Date.now() - STALE_VERIFY_DAYS * 86400_000);
  const staleSocial = new Date(Date.now() - STALE_SOCIAL_DAYS * 86400_000);

  const [creators, organizations, projects, entities] = await Promise.all([
    db.creator.findMany({ where: { archived: false }, select: { id: true, name: true, slug: true } }),
    db.organization.findMany({ where: { archived: false }, select: { id: true, name: true, slug: true, types: true } }),
    db.project.findMany({ where: { archived: false }, select: { id: true, title: true, slug: true } }),
    db.entity.findMany({ select: { id: true, name: true, kind: true, slug: true } }),
  ]);

  const duplicates: DuplicateGroup[] = [
    ...pairs(creators.map((c) => ({ id: c.id, label: c.name, slug: c.slug, norm: "" }))).map((g) => ({
      kind: "creator" as const,
      items: g.map((c) => ({ id: c.id, label: c.label, href: `/talent/${(c as unknown as { slug: string }).slug}` })),
    })),
    ...pairs(organizations.map((o) => ({ id: o.id, label: o.name, slug: o.slug, norm: "" }))).map((g) => ({
      kind: "organization" as const,
      items: g.map((o) => ({ id: o.id, label: o.label, href: `/organizations/${(o as unknown as { slug: string }).slug}` })),
    })),
    ...pairs(projects.map((p) => ({ id: p.id, label: p.title, slug: p.slug, norm: "" }))).map((g) => ({
      kind: "project" as const,
      items: g.map((p) => ({ id: p.id, label: p.label, href: `/projects/${(p as unknown as { slug: string }).slug}` })),
    })),
    // entities only within the same kind
    ...Object.values(
      entities.reduce<Record<string, typeof entities>>((acc, e) => {
        (acc[e.kind] ??= []).push(e);
        return acc;
      }, {}),
    ).flatMap((kindEntities) =>
      pairs(kindEntities.map((e) => ({ id: e.id, label: e.name, kind: e.kind, slug: e.slug, norm: "" }))).map((g) => ({
        kind: "entity" as const,
        items: g.map((e) => {
          const ent = e as unknown as { kind: string; slug: string };
          return { id: e.id, label: e.label, href: `/explore/${ent.kind}/${ent.slug}`, detail: ent.kind };
        }),
      })),
    ),
  ];

  const [staleCreators, staleSocials, noInterests, noProjects, noSources, orphanProjects, archived] =
    await Promise.all([
      db.creator.findMany({
        where: { archived: false, OR: [{ lastVerifiedAt: null }, { lastVerifiedAt: { lt: staleVerify } }] },
        select: { id: true, name: true, slug: true, lastVerifiedAt: true },
        orderBy: { lastVerifiedAt: "asc" },
        take: 30,
      }),
      db.socialProfile.findMany({
        where: {
          creator: { archived: false },
          followerCount: { not: null },
          OR: [{ countUpdatedAt: null }, { countUpdatedAt: { lt: staleSocial } }],
        },
        include: { creator: { select: { name: true, slug: true } } },
        take: 30,
      }),
      db.creator.findMany({
        where: { archived: false, entityLinks: { none: { entity: { kind: { in: ["interest", "sport", "hobby"] } } } } },
        select: { id: true, name: true, slug: true },
        take: 30,
      }),
      db.creator.findMany({
        where: { archived: false, credits: { none: {} } },
        select: { id: true, name: true, slug: true },
        take: 30,
      }),
      db.creator.findMany({
        where: { archived: false },
        select: { id: true, name: true, slug: true },
      }).then(async (all) => {
        const sourced = await db.recordSource.findMany({
          where: { targetType: "creator" },
          select: { targetId: true },
        });
        const sourcedIds = new Set(sourced.map((s) => s.targetId));
        return all.filter((c) => !sourcedIds.has(c.id)).slice(0, 30);
      }),
      db.project.findMany({
        where: { archived: false, credits: { none: {} }, organizations: { none: {} } },
        select: { id: true, title: true, slug: true },
        take: 30,
      }),
      Promise.all([
        db.creator.findMany({ where: { archived: true }, select: { id: true, name: true } }),
        db.project.findMany({ where: { archived: true }, select: { id: true, title: true } }),
        db.organization.findMany({ where: { archived: true }, select: { id: true, name: true } }),
        db.format.findMany({ where: { archived: true }, select: { id: true, title: true } }),
      ]),
    ]);

  return {
    duplicates,
    staleCreators,
    staleSocials,
    noInterests,
    noProjects,
    noSources,
    orphanProjects,
    archived: {
      creators: archived[0],
      projects: archived[1],
      organizations: archived[2],
      formats: archived[3],
    },
  };
}
