import "server-only";

// Keeping the mentions graph in step with the text, and reading it back.

import { db } from "@/lib/db";
import { extractMentions, excludeSelf, type DictEntry, type MentionHit } from "@/lib/hq/mentions";
import { repoPath } from "@/lib/hq/vocab";

type Dict = { at: number; entries: DictEntry[] };
const cache = new Map<string, Dict>();
const TTL = 60_000;

export async function dictionaryFor(ownerId: string): Promise<DictEntry[]> {
  const hit = cache.get(ownerId);
  if (hit && Date.now() - hit.at < TTL) return hit.entries;
  const [rels, cards, digest] = await Promise.all([
    db.hqRelationship.findMany({ where: { ownerId }, select: { id: true, name: true } }),
    db.hqPipeline.findMany({ where: { ownerId }, select: { id: true, title: true } }),
    db.knowledgeDigest.findMany({ where: { archived: false }, select: { targetType: true, targetId: true, name: true, aliases: true } }),
  ]);
  const relByRepo = new Set<string>();
  const entries: DictEntry[] = [
    ...rels.map((r) => ({ name: r.name, targetType: "relationship" as const, targetId: r.id })),
    ...cards.map((c) => ({ name: c.title, targetType: "pipeline" as const, targetId: c.id })),
  ];
  // Repo people and talent who are already relationships resolve to the relationship, not the record.
  const relRows = await db.hqRelationship.findMany({ where: { ownerId }, select: { personType: true, personId: true } });
  for (const r of relRows) relByRepo.add(`${r.personType}:${r.personId}`);
  const cardByRepo = new Set((await db.hqPipeline.findMany({ where: { ownerId, targetId: { not: null } }, select: { targetType: true, targetId: true } })).map((c) => `${c.targetType}:${c.targetId}`));
  for (const d of digest) {
    const key = `${d.targetType}:${d.targetId}`;
    if (relByRepo.has(key) || cardByRepo.has(key)) continue;
    entries.push({ name: d.name, aliases: d.aliases, targetType: "repo", targetId: d.targetId, targetKind: d.targetType });
  }
  cache.set(ownerId, { at: Date.now(), entries });
  return entries;
}

export function forgetDictionary(ownerId: string) {
  cache.delete(ownerId);
}

/** Re-read one piece of text and replace its links. */
export async function reindexMentions(
  ownerId: string,
  source: { type: string; id: string },
  text: string,
  self: { targetType: string; targetId: string } | null = null,
): Promise<MentionHit[]> {
  const dict = await dictionaryFor(ownerId);
  const hits = excludeSelf(extractMentions(text, dict), self);
  await db.hqMention.deleteMany({ where: { ownerId, sourceType: source.type, sourceId: source.id } });
  if (hits.length) {
    await db.hqMention.createMany({
      data: hits.map((h) => ({ ownerId, sourceType: source.type, sourceId: source.id, targetType: h.targetType, targetId: h.targetId, targetKind: h.targetKind ?? null, name: h.name })),
      skipDuplicates: true,
    });
  }
  return hits;
}

export type Backlink = { sourceType: string; sourceId: string; title: string; href: string; when: Date; snippet: string };

/** Everything that names this thing. */
export async function backlinksTo(ownerId: string, target: { targetType: string; targetId: string }, limit = 30): Promise<Backlink[]> {
  const rows = await db.hqMention.findMany({ where: { ownerId, targetType: target.targetType, targetId: target.targetId }, orderBy: { createdAt: "desc" }, take: limit * 2 });
  const by = (t: string) => rows.filter((r) => r.sourceType === t).map((r) => r.sourceId);
  const [notes, ideas, inter, tasks, cards, rels] = await Promise.all([
    by("note").length ? db.hqNote.findMany({ where: { id: { in: by("note") } }, select: { id: true, title: true, body: true, updatedAt: true } }) : [],
    by("idea").length ? db.hqIdea.findMany({ where: { id: { in: by("idea") } }, select: { id: true, title: true, body: true, updatedAt: true } }) : [],
    by("interaction").length ? db.hqInteraction.findMany({ where: { id: { in: by("interaction") } }, include: { relationship: { select: { id: true, name: true } } } }) : [],
    by("task").length ? db.hqTask.findMany({ where: { id: { in: by("task") } }, select: { id: true, title: true, notes: true, updatedAt: true, status: true } }) : [],
    by("pipeline").length ? db.hqPipeline.findMany({ where: { id: { in: by("pipeline") } }, select: { id: true, title: true, whyItMatters: true, updatedAt: true } }) : [],
    by("relationship").length ? db.hqRelationship.findMany({ where: { id: { in: by("relationship") } }, select: { id: true, name: true, notes: true, updatedAt: true } }) : [],
  ]);
  const out: Backlink[] = [
    ...notes.map((n) => ({ sourceType: "note", sourceId: n.id, title: n.title, href: `/hq/brain/${n.id}`, when: n.updatedAt, snippet: n.body.slice(0, 140) })),
    ...ideas.map((n) => ({ sourceType: "idea", sourceId: n.id, title: n.title, href: `/hq/ideas/${n.id}`, when: n.updatedAt, snippet: (n.body ?? "").slice(0, 140) })),
    ...inter.map((i) => ({ sourceType: "interaction", sourceId: i.id, title: `${i.kind} with ${i.relationship.name}`, href: `/hq/people/${i.relationship.id}`, when: i.at, snippet: i.summary.slice(0, 140) })),
    ...tasks.map((t) => ({ sourceType: "task", sourceId: t.id, title: t.title, href: "/hq#tasks", when: t.updatedAt, snippet: t.status === "done" ? "done" : (t.notes ?? "").slice(0, 140) })),
    ...cards.map((c) => ({ sourceType: "pipeline", sourceId: c.id, title: c.title, href: `/hq/pipeline/${c.id}`, when: c.updatedAt, snippet: (c.whyItMatters ?? "").slice(0, 140) })),
    ...rels.map((r) => ({ sourceType: "relationship", sourceId: r.id, title: r.name, href: `/hq/people/${r.id}`, when: r.updatedAt, snippet: (r.notes ?? "").slice(0, 140) })),
  ];
  return out.sort((a, b) => b.when.getTime() - a.when.getTime()).slice(0, limit);
}

export type Outlink = { targetType: string; targetId: string; targetKind: string | null; name: string; href: string | null };

/** Everything this piece of text names. */
export async function outlinksFrom(ownerId: string, source: { type: string; id: string }): Promise<Outlink[]> {
  const rows = await db.hqMention.findMany({ where: { ownerId, sourceType: source.type, sourceId: source.id } });
  const repoIds = rows.filter((r) => r.targetType === "repo").map((r) => r.targetId);
  const slugs = repoIds.length ? await db.knowledgeDigest.findMany({ where: { targetId: { in: repoIds } }, select: { targetId: true, slug: true, targetType: true } }) : [];
  const slugOf = new Map(slugs.map((s) => [s.targetId, { slug: s.slug, type: s.targetType }]));
  return rows.map((r) => ({
    targetType: r.targetType, targetId: r.targetId, targetKind: r.targetKind, name: r.name,
    href: r.targetType === "relationship" ? `/hq/people/${r.targetId}` : r.targetType === "pipeline" ? `/hq/pipeline/${r.targetId}` : repoPath(slugOf.get(r.targetId)?.type, slugOf.get(r.targetId)?.slug),
  }));
}

/** Rebuild the whole graph — after a seed or a bundle import, when many names arrived at once. */
export async function reindexAll(ownerId: string): Promise<number> {
  forgetDictionary(ownerId);
  const [notes, ideas, inter, tasks, cards, rels] = await Promise.all([
    db.hqNote.findMany({ where: { ownerId }, select: { id: true, title: true, body: true, relationshipId: true, pipelineId: true } }),
    db.hqIdea.findMany({ where: { ownerId }, select: { id: true, title: true, body: true } }),
    db.hqInteraction.findMany({ where: { ownerId }, select: { id: true, summary: true, relationshipId: true } }),
    db.hqTask.findMany({ where: { ownerId, status: { in: ["open", "waiting"] } }, select: { id: true, title: true, notes: true } }),
    db.hqPipeline.findMany({ where: { ownerId }, select: { id: true, title: true, whyItMatters: true, nextStep: true, notes: true } }),
    db.hqRelationship.findMany({ where: { ownerId }, select: { id: true, notes: true, opportunities: true, howWeMet: true } }),
  ]);
  let n = 0;
  for (const x of notes) n += (await reindexMentions(ownerId, { type: "note", id: x.id }, `${x.title}\n${x.body}`)).length;
  for (const x of ideas) n += (await reindexMentions(ownerId, { type: "idea", id: x.id }, `${x.title}\n${x.body ?? ""}`)).length;
  for (const x of inter) n += (await reindexMentions(ownerId, { type: "interaction", id: x.id }, x.summary, { targetType: "relationship", targetId: x.relationshipId })).length;
  for (const x of tasks) n += (await reindexMentions(ownerId, { type: "task", id: x.id }, `${x.title}\n${x.notes ?? ""}`)).length;
  for (const x of cards) n += (await reindexMentions(ownerId, { type: "pipeline", id: x.id }, [x.whyItMatters, x.nextStep, x.notes].filter(Boolean).join("\n"), { targetType: "pipeline", targetId: x.id })).length;
  for (const x of rels) n += (await reindexMentions(ownerId, { type: "relationship", id: x.id }, [x.notes, x.opportunities, x.howWeMet].filter(Boolean).join("\n"), { targetType: "relationship", targetId: x.id })).length;
  return n;
}
