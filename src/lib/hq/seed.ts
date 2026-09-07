import "server-only";

// Filling HQ from what the Repo already knows, so the first morning is not
// an empty page. Every seeded row is marked source "seed" and nothing the
// owner has typed is ever overwritten: seeding only creates what is missing.
// Also: HQ's own export and the bundle import that brings in material
// prepared outside (ideas mined from old notes, say).

import { db } from "@/lib/db";
import { PRIVATE_TABLES } from "@/lib/backup";

const FORMAT_STAGE: Record<string, string> = {
  idea: "idea", concept: "idea", developing: "developing", on_hold: "parked", outbound: "buyer_conversations",
  pitched: "buyer_conversations", in_discussion: "in_negotiation", sold: "sold", produced: "in_production", passed: "passed",
};
const CHANNEL_STAGE: Record<string, string> = {
  prospect: "idea", in_talks: "buyer_conversations", signed: "sold", building: "in_production", live: "in_production", paused: "parked", ended: "passed",
};
const PROJECT_STAGE: Record<string, string> = { announced: "sold", in_production: "in_production", airing: "in_production" };
const OPPORTUNITY_STAGE: Record<string, string> = {
  researching: "idea", active: "developing", outbound: "buyer_conversations", in_discussion: "in_negotiation", completed: "sold", on_hold: "parked", passed: "passed",
};
const HEAT: Record<string, number> = { in_negotiation: 3, buyer_conversations: 3, sold: 2, in_production: 2, developing: 2, talent_attached: 2, packaging: 2, idea: 1, parked: 1, passed: 1 };

export type SeedOutcome = { pipelines: number; relationships: number; contacts: number };

export async function seedFromRepo(ownerId: string): Promise<SeedOutcome> {
  const [formats, channels, projects, opportunities, people, creators] = await Promise.all([
    db.format.findMany({ where: { archived: false }, include: { creators: { select: { creatorId: true, isPrimary: true } } } }),
    db.channel.findMany({ where: { archived: false }, include: { people: { select: { personId: true, relationship: true } } } }),
    db.project.findMany({ where: { archived: false, status: { in: Object.keys(PROJECT_STAGE) } }, include: { credits: { select: { creatorId: true } }, people: { select: { personId: true, role: true } } } }),
    db.opportunity.findMany({ where: { archived: false }, include: { creators: { select: { creatorId: true } } } }),
    db.industryPerson.findMany({ where: { archived: false }, include: { _count: { select: { projects: true, creators: true, channels: true } } } }),
    db.creator.findMany({ where: { archived: false }, include: { entityLinks: { include: { entity: { select: { name: true } } } }, _count: { select: { formats: true, credits: true, channels: true } } } }),
  ]);

  // Relationships first, so pipeline contacts can point at them.
  const relRows = [
    ...people.map((p) => ({
      ownerId, personType: "person", personId: p.id, name: p.name, email: p.email ?? null,
      tier: p._count.projects + p._count.creators + p._count.channels > 0 ? "active" : "warm",
      notes: [p.title, p.roleType ? p.roleType.replace(/_/g, " ") : null].filter(Boolean).join(" · ") || null,
      source: "seed",
    })),
    ...creators.map((c) => ({
      ownerId, personType: "creator", personId: c.id, name: c.name, email: null,
      tier: c._count.formats + c._count.credits + c._count.channels > 0 ? "active" : "warm",
      interests: c.entityLinks.map((l) => l.entity.name).slice(0, 12),
      notes: c.headline ?? null,
      source: "seed",
    })),
  ];
  const before = await db.hqRelationship.count({ where: { ownerId } });
  await db.hqRelationship.createMany({ data: relRows, skipDuplicates: true });
  const relationships = (await db.hqRelationship.count({ where: { ownerId } })) - before;
  const rels = await db.hqRelationship.findMany({ where: { ownerId }, select: { id: true, personType: true, personId: true } });
  const relId = new Map(rels.map((r) => [`${r.personType}:${r.personId}`, r.id]));

  type Card = { targetType: string; targetId: string; title: string; stage: string; whyItMatters: string | null; lastContactAt: Date | null; contacts: { key: string; role: string }[] };
  const cards: Card[] = [];
  for (const f of formats) {
    const stage = FORMAT_STAGE[f.status]; if (!stage) continue;
    cards.push({ targetType: "format", targetId: f.id, title: f.title, stage, whyItMatters: f.logline ?? null, lastContactAt: f.lastActivityAt ?? null,
      contacts: f.creators.map((c) => ({ key: `creator:${c.creatorId}`, role: "talent" })) });
  }
  for (const c of channels) {
    const stage = CHANNEL_STAGE[c.status]; if (!stage) continue;
    const contacts = c.people.map((p) => ({ key: `person:${p.personId}`, role: p.relationship === "executive" ? "decision_maker" : "partner" }));
    if (c.creatorId) contacts.unshift({ key: `creator:${c.creatorId}`, role: "talent" });
    cards.push({ targetType: "channel", targetId: c.id, title: c.name, stage, whyItMatters: c.premise ?? null, lastContactAt: c.lastActivityAt ?? null, contacts });
  }
  for (const p of projects) {
    const stage = PROJECT_STAGE[p.status]; if (!stage) continue;
    cards.push({ targetType: "project", targetId: p.id, title: p.title, stage, whyItMatters: p.logline ?? null, lastContactAt: p.lastActivityAt ?? null,
      contacts: [...p.credits.map((c) => ({ key: `creator:${c.creatorId}`, role: "talent" })), ...p.people.map((x) => ({ key: `person:${x.personId}`, role: x.role === "executive" ? "decision_maker" : "partner" }))] });
  }
  for (const o of opportunities) {
    const stage = OPPORTUNITY_STAGE[o.status]; if (!stage) continue;
    cards.push({ targetType: "opportunity", targetId: o.id, title: o.title, stage, whyItMatters: o.description?.slice(0, 400) ?? null, lastContactAt: o.lastActivityAt ?? null,
      contacts: o.creators.map((c) => ({ key: `creator:${c.creatorId}`, role: "talent" })) });
  }

  let pipelines = 0, contacts = 0;
  for (const card of cards) {
    const exists = await db.hqPipeline.findFirst({ where: { ownerId, targetType: card.targetType, targetId: card.targetId }, select: { id: true } });
    const id = exists?.id ?? (await db.hqPipeline.create({
      data: {
        ownerId, targetType: card.targetType, targetId: card.targetId, title: card.title, stage: card.stage,
        heat: HEAT[card.stage] ?? 2, whyItMatters: card.whyItMatters, lastContactAt: card.lastContactAt, source: "seed",
        closedAt: card.stage === "passed" ? new Date() : null,
      },
    })).id;
    if (!exists) pipelines++;
    for (const c of card.contacts) {
      const rid = relId.get(c.key); if (!rid) continue;
      const made = await db.hqPipelineContact.createMany({ data: [{ pipelineId: id, relationshipId: rid, role: c.role }], skipDuplicates: true });
      contacts += made.count;
    }
  }
  await db.hqSettings.upsert({ where: { ownerId }, update: { seededAt: new Date() }, create: { ownerId, seededAt: new Date() } });
  return { pipelines, relationships, contacts };
}

/** Everything in HQ, as one JSON document. The owner's own backup. */
export async function buildHqExport(ownerId: string): Promise<Record<string, unknown>> {
  const tables: Record<string, unknown[]> = {};
  for (const table of PRIVATE_TABLES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tables[table] = await (db as any)[table].findMany({ where: { ownerId } });
  }
  return { format: "44forty-hq-export", version: 1, exportedAt: new Date().toISOString(), tables };
}

export type BrainBundle = {
  kind: "44forty-brain";
  ideas?: { title: string; body?: string; kind?: string; status?: string; rating?: number; tags?: string[] }[];
  notes?: { title: string; body: string; kind?: string; tags?: string[]; about?: string }[];
  relationships?: { name: string; personType?: string; tier?: string; interests?: string[]; notes?: string; opportunities?: string; howWeMet?: string; email?: string; lastContactAt?: string }[];
  interactions?: { name: string; at?: string; kind?: string; summary: string }[];
  pipeline?: { title: string; stage?: string; heat?: number; whyItMatters?: string; nextStep?: string; nextStepDue?: string; notes?: string }[];
  tasks?: { title: string; dueAt?: string; kind?: string; notes?: string; person?: string }[];
};

export function parseBrainBundle(raw: string): BrainBundle | null {
  try {
    const j = JSON.parse(raw);
    return j && j.kind === "44forty-brain" ? (j as BrainBundle) : null;
  } catch { return null; }
}

/** A name in a bundle resolves to an existing relationship, then to a Repo record (creating the relationship), then to nothing. */
async function relationshipByName(ownerId: string, name: string, personTypeHint?: string): Promise<string | null> {
  const existing = await db.hqRelationship.findFirst({ where: { ownerId, name: { equals: name, mode: "insensitive" } } });
  if (existing) return existing.id;
  const person = personTypeHint === "creator" ? null : await db.industryPerson.findFirst({ where: { name: { equals: name, mode: "insensitive" }, archived: false } });
  if (person) return (await db.hqRelationship.create({ data: { ownerId, personType: "person", personId: person.id, name: person.name, email: person.email, source: "import" } })).id;
  const creator = await db.creator.findFirst({ where: { name: { equals: name, mode: "insensitive" }, archived: false } });
  if (creator) return (await db.hqRelationship.create({ data: { ownerId, personType: "creator", personId: creator.id, name: creator.name, source: "import" } })).id;
  return null;
}

export async function importBrainBundle(ownerId: string, bundle: BrainBundle): Promise<{ ideas: number; notes: number; relationships: number; interactions: number; pipeline: number; tasks: number; unresolved: string[] }> {
  const out = { ideas: 0, notes: 0, relationships: 0, interactions: 0, pipeline: 0, tasks: 0, unresolved: [] as string[] };
  const date = (s?: string) => (s ? new Date(s) : undefined);
  for (const i of bundle.ideas ?? []) {
    const dup = await db.hqIdea.findFirst({ where: { ownerId, title: { equals: i.title, mode: "insensitive" } } });
    if (dup) continue;
    await db.hqIdea.create({ data: { ownerId, title: i.title.slice(0, 300), body: i.body ?? null, kind: i.kind ?? "idea", status: i.status ?? "spark", rating: i.rating ?? 0, tags: i.tags ?? [], source: "import" } });
    out.ideas++;
  }
  for (const n of bundle.notes ?? []) {
    const dup = await db.hqNote.findFirst({ where: { ownerId, title: { equals: n.title, mode: "insensitive" } } });
    if (dup) continue;
    const relationshipId = n.about ? await relationshipByName(ownerId, n.about) : null;
    await db.hqNote.create({ data: { ownerId, title: n.title.slice(0, 300), body: n.body, kind: n.kind ?? "note", tags: n.tags ?? [], relationshipId, source: "import" } });
    out.notes++;
  }
  for (const r of bundle.relationships ?? []) {
    const id = await relationshipByName(ownerId, r.name, r.personType);
    if (!id) { out.unresolved.push(r.name); continue; }
    const current = await db.hqRelationship.findUnique({ where: { id } });
    await db.hqRelationship.update({
      where: { id },
      data: {
        tier: r.tier ?? current?.tier,
        interests: r.interests?.length ? [...new Set([...(current?.interests ?? []), ...r.interests])] : undefined,
        notes: r.notes ? [current?.notes, r.notes].filter(Boolean).join("\n\n") : undefined,
        opportunities: r.opportunities ? [current?.opportunities, r.opportunities].filter(Boolean).join("\n\n") : undefined,
        howWeMet: current?.howWeMet ?? r.howWeMet ?? undefined,
        email: current?.email ?? r.email ?? undefined,
        lastContactAt: r.lastContactAt && (!current?.lastContactAt || new Date(r.lastContactAt) > current.lastContactAt) ? new Date(r.lastContactAt) : undefined,
      },
    });
    out.relationships++;
  }
  for (const x of bundle.interactions ?? []) {
    const id = await relationshipByName(ownerId, x.name);
    if (!id) { out.unresolved.push(x.name); continue; }
    await db.hqInteraction.create({ data: { ownerId, relationshipId: id, at: date(x.at) ?? new Date(), kind: x.kind ?? "note", summary: x.summary, source: "seed" } });
    out.interactions++;
  }
  for (const p of bundle.pipeline ?? []) {
    const dup = await db.hqPipeline.findFirst({ where: { ownerId, title: { equals: p.title, mode: "insensitive" } } });
    if (dup) {
      await db.hqPipeline.update({ where: { id: dup.id }, data: { whyItMatters: dup.whyItMatters ?? p.whyItMatters, nextStep: dup.nextStep ?? p.nextStep, nextStepDue: dup.nextStepDue ?? date(p.nextStepDue), notes: p.notes ? [dup.notes, p.notes].filter(Boolean).join("\n\n") : undefined } });
      continue;
    }
    await db.hqPipeline.create({ data: { ownerId, title: p.title.slice(0, 300), stage: p.stage ?? "idea", heat: p.heat ?? 2, whyItMatters: p.whyItMatters, nextStep: p.nextStep, nextStepDue: date(p.nextStepDue), notes: p.notes, source: "import" } });
    out.pipeline++;
  }
  for (const t of bundle.tasks ?? []) {
    const relationshipId = t.person ? await relationshipByName(ownerId, t.person) : null;
    await db.hqTask.create({ data: { ownerId, title: t.title.slice(0, 300), kind: t.kind ?? (relationshipId ? "follow_up" : "task"), dueAt: date(t.dueAt), notes: t.notes, relationshipId, source: "seed" } });
    out.tasks++;
  }
  return out;
}
