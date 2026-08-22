import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ENTITY_KIND_PLURALS, labelFor, type EntityKind } from "@/lib/taxonomy";
import { compactNumber, totalAudience } from "@/lib/format";

// Global command-bar search. Groups results by type.
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json([], { status: 401 });

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) return NextResponse.json([]);

  const contains = { contains: q, mode: "insensitive" as const };
  // Support "j richards"-style partial-token matching on names.
  const tokens = q.split(/\s+/).filter(Boolean);
  const nameWhere = {
    OR: [
      { name: contains },
      { aliases: { hasSome: [q] } },
      ...(tokens.length > 1
        ? [{ AND: tokens.map((t) => ({ name: { contains: t, mode: "insensitive" as const } })) }]
        : []),
    ],
  };

  const [creators, projects, organizations, formats, people, opportunities, entities, collections] =
    await Promise.all([
      db.creator.findMany({
        where: { AND: [{ archived: false }, nameWhere] },
        take: 5,
        include: { socialProfiles: { select: { followerCount: true } } },
        orderBy: { name: "asc" },
      }),
      db.project.findMany({
        where: {
          AND: [
            { archived: false },
            { OR: [{ title: contains }, { aliases: { hasSome: [q] } }] },
          ],
        },
        take: 5,
        orderBy: { title: "asc" },
      }),
      db.organization.findMany({
        where: {
          AND: [
            { archived: false },
            { OR: [{ name: contains }, { aliases: { hasSome: [q] } }] },
          ],
        },
        take: 5,
        orderBy: { name: "asc" },
      }),
      db.format.findMany({
        where: { AND: [{ archived: false }, { title: contains }] },
        take: 5,
        orderBy: { title: "asc" },
      }),
      db.industryPerson.findMany({
        where: { AND: [{ archived: false }, { name: contains }] },
        take: 4,
        orderBy: { name: "asc" },
      }),
      db.opportunity.findMany({
        where: { AND: [{ archived: false }, { title: contains }] },
        take: 4,
        orderBy: { title: "asc" },
      }),
      db.entity.findMany({
        where: { name: contains },
        take: 6,
        orderBy: { name: "asc" },
      }),
      db.collection.findMany({
        where: { name: contains },
        take: 3,
        orderBy: { name: "asc" },
      }),
    ]);

  const groups = [
    {
      group: "Talent",
      items: creators.map((c) => ({
        label: c.name,
        sub:
          totalAudience(c.socialProfiles) > 0
            ? `${compactNumber(totalAudience(c.socialProfiles))} audience`
            : c.headline ?? undefined,
        href: `/talent/${c.slug}`,
      })),
    },
    {
      group: "Formats",
      items: formats.map((f) => ({
        label: f.title,
        sub: labelFor(f.status),
        href: `/formats/${f.slug}`,
      })),
    },
    {
      group: "Projects",
      items: projects.map((p) => ({
        label: p.title,
        sub: labelFor(p.projectType),
        href: `/projects/${p.slug}`,
      })),
    },
    {
      group: "Organizations",
      items: organizations.map((o) => ({
        label: o.name,
        sub: o.types.map(labelFor).join(" · ") || undefined,
        href: `/organizations/${o.slug}`,
      })),
    },
    {
      group: "Industry People",
      items: people.map((p) => ({
        label: p.name,
        sub: p.title ?? undefined,
        href: `/people/${p.slug}`,
      })),
    },
    {
      group: "Opportunities",
      items: opportunities.map((o) => ({
        label: o.title,
        sub: labelFor(o.status),
        href: `/opportunities/${o.slug}`,
      })),
    },
    {
      group: "Entities",
      items: entities.map((e) => ({
        label: e.name,
        sub: ENTITY_KIND_PLURALS[e.kind as EntityKind] ?? labelFor(e.kind),
        href: `/explore/${e.kind}/${e.slug}`,
      })),
    },
    {
      group: "Collections",
      items: collections.map((c) => ({
        label: c.name,
        href: `/collections/${c.slug}`,
      })),
    },
  ].filter((g) => g.items.length > 0);

  return NextResponse.json(groups);
}
