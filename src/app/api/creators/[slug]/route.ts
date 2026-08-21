import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { labelFor, socialLabel } from "@/lib/taxonomy";
import { compactNumber, totalAudience } from "@/lib/format";

// Powers the quick-preview drawer and quick-edit drawer.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const creator = await db.creator.findFirst({
    where: { OR: [{ slug }, { id: slug }] },
    include: {
      socialProfiles: { orderBy: { followerCount: "desc" } },
      entityLinks: { include: { entity: true } },
      formats: { include: { format: { select: { title: true, slug: true, id: true, status: true } } } },
      credits: {
        include: { project: { select: { title: true, slug: true, id: true, premiereYear: true } } },
      },
      people: { include: { person: { select: { name: true, slug: true } } } },
    },
  });
  if (!creator) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const projectsMap = new Map<string, { title: string; slug: string; roles: string[]; year: number | null }>();
  for (const credit of creator.credits) {
    const entry = projectsMap.get(credit.project.id) ?? {
      title: credit.project.title,
      slug: credit.project.slug,
      roles: [],
      year: credit.project.premiereYear,
    };
    entry.roles.push(labelFor(credit.role));
    projectsMap.set(credit.project.id, entry);
  }

  const byKind = (kind: string) =>
    creator.entityLinks
      .filter((l) => l.entity.kind === kind)
      .map((l) => ({ id: l.entity.id, name: l.entity.name, slug: l.entity.slug, relationship: l.relationship }));

  return NextResponse.json({
    id: creator.id,
    slug: creator.slug,
    name: creator.name,
    version: creator.version,
    imageUrl: creator.imageUrl,
    headline: creator.headline,
    status: creator.status,
    age: creator.age,
    miniBio: creator.miniBio,
    internalNotes: creator.internalNotes,
    audience: compactNumber(totalAudience(creator.socialProfiles)),
    audienceRaw: totalAudience(creator.socialProfiles),
    categories: byKind("creator_category"),
    locations: byKind("location"),
    interests: [...byKind("interest"), ...byKind("hobby")],
    sports: byKind("sport"),
    socials: creator.socialProfiles.map((s) => ({
      id: s.id,
      platform: s.platform,
      platformLabel: socialLabel(s.platform),
      handle: s.handle,
      url: s.url,
      followerCount: s.followerCount,
    })),
    formats: creator.formats.map((f) => ({
      id: f.format.id,
      title: f.format.title,
      slug: f.format.slug,
      status: labelFor(f.format.status),
    })),
    projects: [...projectsMap.values()].sort((a, b) => (b.year ?? 0) - (a.year ?? 0)),
    representation: creator.people.map((p) => ({
      name: p.person.name,
      slug: p.person.slug,
      relationship: labelFor(p.relationship),
    })),
  });
}
