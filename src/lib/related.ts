import "server-only";
import { db } from "@/lib/db";
import { labelFor } from "@/lib/taxonomy";

export type RelatedCreator = {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  headline: string | null;
  score: number;
  reasons: string[];
};

// Explainable related-creators. Weights favor real working relationships
// (collaborations, shared projects/formats) over soft similarity (location,
// broad category). Every surfaced result carries its reasons — no mystery
// percentages.
const WEIGHTS = {
  direct: 50,
  sharedProject: 40,
  sharedFormat: 30,
  sharedInterest: 12,
  sharedSport: 10,
  sharedOrg: 8,
  sharedRep: 8,
  sharedLocation: 5,
  sharedCategory: 3,
};

export type RelatedProject = {
  id: string;
  slug: string;
  title: string;
  projectType: string | null;
  score: number;
  reasons: string[];
};

export async function findRelatedProjects(
  projectId: string,
  limit = 5,
): Promise<RelatedProject[]> {
  const me = await db.project.findUnique({
    where: { id: projectId },
    include: {
      organizations: { include: { organization: { select: { name: true } } } },
      credits: { select: { creatorId: true, creator: { select: { name: true } } } },
      entityLinks: { include: { entity: true } },
    },
  });
  if (!me) return [];

  const scores = new Map<string, { score: number; reasons: string[]; seen: Set<string> }>();
  const bump = (id: string, points: number, reason: string, dedupeKey: string) => {
    if (id === projectId) return;
    const entry = scores.get(id) ?? { score: 0, reasons: [], seen: new Set() };
    if (entry.seen.has(dedupeKey)) return;
    entry.seen.add(dedupeKey);
    entry.score += points;
    if (entry.reasons.length < 3) entry.reasons.push(reason);
    scores.set(id, entry);
  };

  const orgIds = me.organizations.map((o) => o.organizationId);
  if (orgIds.length) {
    const others = await db.projectOrganization.findMany({
      where: { organizationId: { in: orgIds }, projectId: { not: projectId } },
      select: { projectId: true, organization: { select: { name: true } } },
    });
    for (const o of others) bump(o.projectId, 20, `Also involves ${o.organization.name}`, `org-${o.organization.name}`);
  }
  const creatorIds = me.credits.map((c) => c.creatorId);
  if (creatorIds.length) {
    const others = await db.creatorProjectCredit.findMany({
      where: { creatorId: { in: creatorIds }, projectId: { not: projectId } },
      select: { projectId: true, creator: { select: { name: true } } },
    });
    for (const o of others) bump(o.projectId, 25, `Shared talent (${o.creator.name})`, `talent-${o.creator.name}`);
  }
  const entityIds = me.entityLinks.map((l) => l.entityId);
  if (entityIds.length) {
    const others = await db.projectEntityLink.findMany({
      where: { entityId: { in: entityIds }, projectId: { not: projectId } },
      select: { projectId: true, entity: { select: { name: true } } },
    });
    for (const o of others) bump(o.projectId, 8, `Same topic (${o.entity.name})`, `topic-${o.entity.name}`);
  }
  if (me.projectType) {
    const others = await db.project.findMany({
      where: { projectType: me.projectType, id: { not: projectId }, archived: false },
      select: { id: true },
      take: 50,
    });
    for (const o of others) bump(o.id, 3, `Same format type (${labelFor(me.projectType)})`, "type");
  }

  const top = [...scores.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, limit);
  if (!top.length) return [];
  const projects = await db.project.findMany({
    where: { id: { in: top.map(([id]) => id) }, archived: false },
    select: { id: true, slug: true, title: true, projectType: true },
  });
  const byId = new Map(projects.map((p) => [p.id, p]));
  return top
    .map(([id, entry]) => {
      const p = byId.get(id);
      return p ? { ...p, score: entry.score, reasons: entry.reasons } : null;
    })
    .filter((x): x is RelatedProject => !!x);
}

export async function findRelatedCreators(
  creatorId: string,
  limit = 6,
): Promise<RelatedCreator[]> {
  const me = await db.creator.findUnique({
    where: { id: creatorId },
    include: {
      entityLinks: { include: { entity: true } },
      credits: { select: { projectId: true, project: { select: { title: true } } } },
      formats: { select: { formatId: true, format: { select: { title: true } } } },
      organizations: { select: { organizationId: true, organization: { select: { name: true } } } },
      people: { select: { personId: true, person: { select: { name: true } } } },
      relationshipsA: { select: { creatorBId: true, relationship: true } },
      relationshipsB: { select: { creatorAId: true, relationship: true } },
    },
  });
  if (!me) return [];

  const scores = new Map<string, { score: number; reasons: string[]; counters: Record<string, number> }>();
  const bump = (id: string, points: number, reason: string, counterKey?: string) => {
    if (id === creatorId) return;
    const entry = scores.get(id) ?? { score: 0, reasons: [], counters: {} };
    entry.score += points;
    if (counterKey) {
      entry.counters[counterKey] = (entry.counters[counterKey] ?? 0) + 1;
      if (entry.counters[counterKey] === 1) entry.reasons.push(reason);
    } else {
      entry.reasons.push(reason);
    }
    scores.set(id, entry);
  };

  // Direct relationships
  for (const rel of me.relationshipsA) {
    bump(rel.creatorBId, WEIGHTS.direct, labelFor(rel.relationship));
  }
  for (const rel of me.relationshipsB) {
    bump(rel.creatorAId, WEIGHTS.direct, labelFor(rel.relationship));
  }

  // Shared projects
  const projectIds = me.credits.map((c) => c.projectId);
  if (projectIds.length) {
    const others = await db.creatorProjectCredit.findMany({
      where: { projectId: { in: projectIds }, creatorId: { not: creatorId } },
      select: { creatorId: true, project: { select: { title: true } } },
      distinct: ["creatorId", "projectId"],
    });
    for (const o of others) {
      bump(o.creatorId, WEIGHTS.sharedProject, `Both worked on ${o.project.title}`);
    }
  }

  // Shared formats
  const formatIds = me.formats.map((f) => f.formatId);
  if (formatIds.length) {
    const others = await db.creatorFormat.findMany({
      where: { formatId: { in: formatIds }, creatorId: { not: creatorId } },
      select: { creatorId: true, format: { select: { title: true } } },
    });
    for (const o of others) {
      bump(o.creatorId, WEIGHTS.sharedFormat, `Both attached to ${o.format.title}`);
    }
  }

  // Shared taxonomy
  const byKind = (kinds: string[]) =>
    me.entityLinks.filter((l) => kinds.includes(l.entity.kind));
  const entityGroups: [string, number, (n: number, sample: string) => string][] = [];
  void entityGroups;

  const interestIds = byKind(["interest", "hobby"]).map((l) => l.entityId);
  if (interestIds.length) {
    const others = await db.creatorEntityLink.findMany({
      where: { entityId: { in: interestIds }, creatorId: { not: creatorId } },
      select: { creatorId: true },
    });
    const perCreator = new Map<string, number>();
    for (const o of others) perCreator.set(o.creatorId, (perCreator.get(o.creatorId) ?? 0) + 1);
    for (const [id, n] of perCreator) {
      bump(id, Math.min(n, 3) * WEIGHTS.sharedInterest, n === 1 ? "1 shared interest" : `${n} shared interests`);
    }
  }

  const sportIds = byKind(["sport"]).map((l) => l.entityId);
  if (sportIds.length) {
    const others = await db.creatorEntityLink.findMany({
      where: { entityId: { in: sportIds }, creatorId: { not: creatorId } },
      select: { creatorId: true, entity: { select: { name: true } } },
    });
    for (const o of others) {
      bump(o.creatorId, WEIGHTS.sharedSport, `Both in ${o.entity.name}`, "sport");
    }
  }

  // Shared organizations (direct relationships)
  const orgIds = me.organizations.map((o) => o.organizationId);
  if (orgIds.length) {
    const others = await db.creatorOrganization.findMany({
      where: { organizationId: { in: orgIds }, creatorId: { not: creatorId } },
      select: { creatorId: true, organization: { select: { name: true } } },
    });
    for (const o of others) {
      bump(o.creatorId, WEIGHTS.sharedOrg, `Both connected to ${o.organization.name}`, `org-${o.organization.name}`);
    }
  }

  // Same representative
  const personIds = me.people.map((p) => p.personId);
  if (personIds.length) {
    const others = await db.creatorPerson.findMany({
      where: { personId: { in: personIds }, creatorId: { not: creatorId } },
      select: { creatorId: true, person: { select: { name: true } } },
    });
    for (const o of others) {
      bump(o.creatorId, WEIGHTS.sharedRep, `Same representative (${o.person.name})`, "rep");
    }
  }

  // Same base location
  const locationLinks = me.entityLinks.filter(
    (l) => l.entity.kind === "location" && l.relationship === "based_in",
  );
  if (locationLinks.length) {
    const others = await db.creatorEntityLink.findMany({
      where: {
        entityId: { in: locationLinks.map((l) => l.entityId) },
        relationship: "based_in",
        creatorId: { not: creatorId },
      },
      select: { creatorId: true, entity: { select: { name: true } } },
    });
    for (const o of others) {
      bump(o.creatorId, WEIGHTS.sharedLocation, `Both based in ${o.entity.name}`, "loc");
    }
  }

  // Same category
  const categoryIds = byKind(["creator_category"]).map((l) => l.entityId);
  if (categoryIds.length) {
    const others = await db.creatorEntityLink.findMany({
      where: { entityId: { in: categoryIds }, creatorId: { not: creatorId } },
      select: { creatorId: true, entity: { select: { name: true } } },
    });
    for (const o of others) {
      bump(o.creatorId, WEIGHTS.sharedCategory, `Both ${o.entity.name}s`, "cat");
    }
  }

  const top = [...scores.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit);
  if (!top.length) return [];

  const creators = await db.creator.findMany({
    where: { id: { in: top.map(([id]) => id) }, archived: false },
    select: { id: true, slug: true, name: true, imageUrl: true, headline: true },
  });
  const byId = new Map(creators.map((c) => [c.id, c]));

  return top
    .map(([id, entry]) => {
      const c = byId.get(id);
      if (!c) return null;
      return { ...c, score: entry.score, reasons: entry.reasons.slice(0, 3) };
    })
    .filter((x): x is RelatedCreator => !!x);
}
