import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { daysAgo } from "@/lib/format";

// Shared Needs Attention criteria — one source of truth for the /attention
// workflow page and the homepage summary.

export const STALE_DAYS = 90;

export function attentionWheres() {
  const staleCutoff = daysAgo(STALE_DAYS);
  const noRep: Prisma.CreatorWhereInput = { archived: false, people: { none: { current: true } } };
  const staleSocial: Prisma.CreatorWhereInput = {
    archived: false,
    socialProfiles: {
      some: {
        followerCount: { not: null },
        OR: [{ countUpdatedAt: null }, { countUpdatedAt: { lt: staleCutoff } }],
      },
    },
  };
  const noProdCo: Prisma.ProjectWhereInput = { archived: false, organizations: { none: {} } };
  const unverified: Prisma.CreatorWhereInput = {
    archived: false,
    OR: [{ lastVerifiedAt: null }, { lastVerifiedAt: { lt: staleCutoff } }],
  };
  return { staleCutoff, noRep, staleSocial, noProdCo, unverified };
}

export type AttentionCounts = {
  deadlinesThisWeek: number;
  talentWithoutRep: number;
  staleSocialCounts: number;
  projectsWithoutCompany: number;
  talentWithoutSource: number;
  unverifiedTalent: number;
  total: number;
};

export async function attentionCounts(): Promise<AttentionCounts> {
  const { noRep, staleSocial, noProdCo, unverified } = attentionWheres();
  const [deadlinesThisWeek, talentWithoutRep, staleSocialCounts, projectsWithoutCompany, unverifiedTalent, sourced] =
    await Promise.all([
      db.opportunity.count({
        where: { archived: false, deadline: { gte: daysAgo(0), lte: daysAgo(-7) } },
      }),
      db.creator.count({ where: noRep }),
      db.creator.count({ where: staleSocial }),
      db.project.count({ where: noProdCo }),
      db.creator.count({ where: unverified }),
      db.recordSource.findMany({
        where: { targetType: "creator" },
        select: { targetId: true },
        distinct: ["targetId"],
      }),
    ]);
  const talentWithoutSource = await db.creator.count({
    where: { archived: false, id: { notIn: sourced.map((s) => s.targetId) } },
  });
  return {
    deadlinesThisWeek,
    talentWithoutRep,
    staleSocialCounts,
    projectsWithoutCompany,
    talentWithoutSource,
    unverifiedTalent,
    total:
      deadlinesThisWeek + talentWithoutRep + staleSocialCounts + projectsWithoutCompany + talentWithoutSource + unverifiedTalent,
  };
}
