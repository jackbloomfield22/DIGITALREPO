import type { CreatorCardData } from "@/lib/queries/creators";
import type { CreatorCardVM } from "@/components/creators/types";
import { compactNumber, relativeTime, totalAudience } from "@/lib/format";
import { socialLabel } from "@/lib/taxonomy";

export function toCreatorCardVM(
  creator: CreatorCardData,
  favoriteIds: Set<string>,
): CreatorCardVM {
  const byKind = (kind: string) =>
    creator.entityLinks
      .filter((l) => l.entity.kind === kind)
      .map((l) => ({ name: l.entity.name, slug: l.entity.slug }));

  const basedIn =
    creator.entityLinks.find(
      (l) => l.entity.kind === "location" && l.relationship === "based_in",
    ) ?? creator.entityLinks.find((l) => l.entity.kind === "location");

  const projectsMap = new Map<string, { title: string; slug: string }>();
  for (const credit of creator.credits) {
    projectsMap.set(credit.project.id, {
      title: credit.project.title,
      slug: credit.project.slug,
    });
  }

  const socials = [...creator.socialProfiles]
    .filter((s) => s.followerCount != null)
    .sort((a, b) => (b.followerCount ?? 0) - (a.followerCount ?? 0));

  return {
    id: creator.id,
    slug: creator.slug,
    name: creator.name,
    imageUrl: creator.imageUrl,
    headline: creator.headline,
    status: creator.status,
    categories: byKind("creator_category"),
    basedIn: basedIn
      ? { name: basedIn.entity.name, slug: basedIn.entity.slug }
      : null,
    audience: `${compactNumber(totalAudience(creator.socialProfiles))}`,
    formatCount: creator._count.formats,
    projectCount: projectsMap.size,
    interests: creator.entityLinks
      .filter((l) => ["interest", "sport", "hobby"].includes(l.entity.kind))
      .slice(0, 6)
      .map((l) => ({ name: l.entity.name, slug: l.entity.slug, kind: l.entity.kind })),
    formats: creator.formats.slice(0, 3).map((f) => ({
      title: f.format.title,
      slug: f.format.slug,
    })),
    projects: [...projectsMap.values()].slice(0, 3),
    socials: socials.slice(0, 4).map((s) => ({
      platform: s.platform,
      label: socialLabel(s.platform),
      followers: compactNumber(s.followerCount),
    })),
    representation: creator.people.map((p) => p.person.name),
    favorited: favoriteIds.has(creator.id),
    updated: relativeTime(creator.updatedAt),
  };
}
