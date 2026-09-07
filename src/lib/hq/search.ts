import "server-only";

// The brain's search. No model: Postgres full-text over everything private
// plus the Repo's digest, with a little reading of the question so "what
// athletes have we discussed for prank formats" comes back as the formats
// that mention pranks *and the talent attached to them*, not a list of
// documents containing the word.

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { repoPath } from "@/lib/hq/vocab";

export type Hit = {
  source: "note" | "idea" | "task" | "interaction" | "relationship" | "pipeline" | "style" | "repo";
  id: string;
  title: string;
  snippet: string;
  href: string;
  kind: string; // note kind, idea kind, repo targetType…
  updatedAt: Date | null;
  rank: number;
  targetType?: string;
  targetId?: string;
};

export type AnswerBlock = { heading: string; items: { name: string; href: string | null; detail: string }[] };

export type SearchResult = {
  query: string;
  terms: string;
  hints: string[];
  answer: AnswerBlock[];
  hits: Hit[];
  total: number;
};

const STOP = new Set(("what which who whom whose where when why how have has had we us our i me my you your the a an of for to in on at by with about from and or is are was were be been being do does did any all some this that these those there their them they it its as if so than then into over under discussed discuss talked talk mention mentioned looked liked like want wanted think thought ever did we've we'd i've i'd let's list show find give me").split(" "));

const HINTS: { re: RegExp; hint: string }[] = [
  { re: /\b(athletes?|talent|creators?|players?|stars?|influencers?)\b/i, hint: "creator" },
  { re: /\b(filmmakers?|directors?|producers?|showrunners?|writers?|dps?|editors?|execs?|executives?|buyers?|agents?|managers?|people|contacts?|reps?)\b/i, hint: "person" },
  { re: /\b(formats?|shows?|series|concepts?|ideas?|mechanics?)\b/i, hint: "format" },
  { re: /\b(projects?|films?|docs?|documentar(?:y|ies)|productions?)\b/i, hint: "project" },
  { re: /\b(companies|company|networks?|streamers?|brands?|studios?|agencies|agency)\b/i, hint: "organization" },
  { re: /\b(channels?|youtube)\b/i, hint: "channel" },
  { re: /\b(emails?|templates?)\b/i, hint: "template" },
  { re: /\b(meetings?|calls?|notes?)\b/i, hint: "meeting" },
];

/** Strip the question down to the words worth searching, and note what kind of answer is wanted. */
export function readQuestion(q: string): { terms: string; hints: string[] } {
  const hints = HINTS.filter((h) => h.re.test(q)).map((h) => h.hint);
  const words = q.toLowerCase().replace(/[?!.,;:"'()]/g, " ").split(/\s+/).filter(Boolean);
  // Type words steer the answer; they are not search terms themselves unless nothing else is left.
  const typeWords = new Set(HINTS.flatMap((h) => words.filter((w) => h.re.test(w))));
  let terms = words.filter((w) => !STOP.has(w) && !typeWords.has(w) && w.length > 1);
  if (!terms.length) terms = words.filter((w) => !STOP.has(w));
  return { terms: terms.join(" "), hints };
}

const HEADLINE = "MaxFragments=2, MaxWords=18, MinWords=6, StartSel=«, StopSel=»";

async function fts(ownerId: string, terms: string): Promise<Hit[]> {
  if (!terms.trim()) return [];
  const q = Prisma.sql`websearch_to_tsquery('english', ${terms})`;
  const rows = await db.$queryRaw<{ source: string; id: string; title: string; snippet: string; kind: string; updatedAt: Date; rank: number }[]>`
    SELECT * FROM (
      SELECT 'note' AS source, id, title, ts_headline('english', coalesce(body,''), ${q}, ${HEADLINE}) AS snippet, kind, "updatedAt", ts_rank(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,'')), ${q}) AS rank
        FROM "HqNote" WHERE "ownerId" = ${ownerId} AND to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,'')) @@ ${q}
      UNION ALL
      SELECT 'idea', id, title, ts_headline('english', coalesce(body,''), ${q}, ${HEADLINE}), kind, "updatedAt", ts_rank(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,'')), ${q})
        FROM "HqIdea" WHERE "ownerId" = ${ownerId} AND status <> 'dead' AND to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,'')) @@ ${q}
      UNION ALL
      SELECT 'task', id, title, ts_headline('english', coalesce(notes,''), ${q}, ${HEADLINE}), kind, "updatedAt", ts_rank(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(notes,'')), ${q})
        FROM "HqTask" WHERE "ownerId" = ${ownerId} AND to_tsvector('english', coalesce(title,'') || ' ' || coalesce(notes,'')) @@ ${q}
      UNION ALL
      SELECT 'interaction', i.id, r.name, ts_headline('english', i.summary, ${q}, ${HEADLINE}), i.kind, i."at", ts_rank(to_tsvector('english', i.summary), ${q})
        FROM "HqInteraction" i JOIN "HqRelationship" r ON r.id = i."relationshipId"
        WHERE i."ownerId" = ${ownerId} AND to_tsvector('english', i.summary) @@ ${q}
      UNION ALL
      SELECT 'relationship', id, name, ts_headline('english', coalesce(notes,'') || ' ' || coalesce(opportunities,'') || ' ' || coalesce("howWeMet",''), ${q}, ${HEADLINE}), tier, "updatedAt", ts_rank(to_tsvector('english', coalesce(name,'') || ' ' || coalesce(notes,'') || ' ' || coalesce(opportunities,'') || ' ' || coalesce("howWeMet",'')), ${q}) + 0.2
        FROM "HqRelationship" WHERE "ownerId" = ${ownerId} AND to_tsvector('english', coalesce(name,'') || ' ' || coalesce(notes,'') || ' ' || coalesce(opportunities,'') || ' ' || coalesce("howWeMet",'')) @@ ${q}
      UNION ALL
      SELECT 'pipeline', id, title, ts_headline('english', coalesce("whyItMatters",'') || ' ' || coalesce("nextStep",'') || ' ' || coalesce(notes,''), ${q}, ${HEADLINE}), stage, "updatedAt", ts_rank(to_tsvector('english', coalesce(title,'') || ' ' || coalesce("whyItMatters",'') || ' ' || coalesce("nextStep",'') || ' ' || coalesce(notes,'')), ${q}) + 0.2
        FROM "HqPipeline" WHERE "ownerId" = ${ownerId} AND to_tsvector('english', coalesce(title,'') || ' ' || coalesce("whyItMatters",'') || ' ' || coalesce("nextStep",'') || ' ' || coalesce(notes,'')) @@ ${q}
      UNION ALL
      SELECT 'style', id, title, ts_headline('english', body, ${q}, ${HEADLINE}), kind, "createdAt", ts_rank(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,'')), ${q})
        FROM "HqStyleExample" WHERE "ownerId" = ${ownerId} AND to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,'')) @@ ${q}
    ) AS hits ORDER BY rank DESC LIMIT 60`;
  return rows.map((r) => ({ ...r, source: r.source as Hit["source"], rank: Number(r.rank), href: hrefFor(r.source, r.id), snippet: r.snippet ?? "" }));
}

async function repo(terms: string): Promise<Hit[]> {
  if (!terms.trim()) return [];
  const q = Prisma.sql`websearch_to_tsquery('english', ${terms})`;
  const rows = await db.$queryRaw<{ id: string; targetType: string; targetId: string; name: string; slug: string; archived: boolean; snippet: string; rank: number; updatedAt: Date }[]>`
    SELECT id, "targetType", "targetId", name, slug, archived, ts_headline('english', summary, ${q}, ${HEADLINE}) AS snippet, ts_rank("searchVector", ${q}) AS rank, "updatedAt"
      FROM "KnowledgeDigest" WHERE "searchVector" @@ ${q} ORDER BY archived ASC, rank DESC LIMIT 40`;
  return rows.map((r) => ({
    source: "repo" as const, id: r.targetId, targetType: r.targetType, targetId: r.targetId,
    title: r.archived ? `${r.name} (archived)` : r.name, snippet: r.snippet ?? "", kind: r.targetType,
    href: repoPath(r.targetType, r.slug) ?? "/", updatedAt: r.updatedAt, rank: Number(r.rank) * (r.archived ? 0.5 : 1),
  }));
}

/** When full-text finds nothing (a typo, a rare name), fall back to substring matching. */
async function loose(ownerId: string, terms: string): Promise<Hit[]> {
  const like = `%${terms.split(" ")[0]}%`;
  const [notes, ideas, rels, pipes, digest] = await Promise.all([
    db.hqNote.findMany({ where: { ownerId, OR: [{ title: { contains: like.slice(1, -1), mode: "insensitive" } }, { body: { contains: like.slice(1, -1), mode: "insensitive" } }] }, take: 10 }),
    db.hqIdea.findMany({ where: { ownerId, OR: [{ title: { contains: like.slice(1, -1), mode: "insensitive" } }, { body: { contains: like.slice(1, -1), mode: "insensitive" } }] }, take: 10 }),
    db.hqRelationship.findMany({ where: { ownerId, name: { contains: like.slice(1, -1), mode: "insensitive" } }, take: 10 }),
    db.hqPipeline.findMany({ where: { ownerId, title: { contains: like.slice(1, -1), mode: "insensitive" } }, take: 10 }),
    db.knowledgeDigest.findMany({ where: { name: { contains: like.slice(1, -1), mode: "insensitive" } }, take: 10 }),
  ]);
  return [
    ...notes.map((n) => ({ source: "note" as const, id: n.id, title: n.title, snippet: n.body.slice(0, 160), kind: n.kind, href: hrefFor("note", n.id), updatedAt: n.updatedAt, rank: 0.1 })),
    ...ideas.map((n) => ({ source: "idea" as const, id: n.id, title: n.title, snippet: (n.body ?? "").slice(0, 160), kind: n.kind, href: hrefFor("idea", n.id), updatedAt: n.updatedAt, rank: 0.1 })),
    ...rels.map((n) => ({ source: "relationship" as const, id: n.id, title: n.name, snippet: (n.notes ?? "").slice(0, 160), kind: n.tier, href: hrefFor("relationship", n.id), updatedAt: n.updatedAt, rank: 0.2 })),
    ...pipes.map((n) => ({ source: "pipeline" as const, id: n.id, title: n.title, snippet: (n.whyItMatters ?? "").slice(0, 160), kind: n.stage, href: hrefFor("pipeline", n.id), updatedAt: n.updatedAt, rank: 0.2 })),
    ...digest.map((d) => ({ source: "repo" as const, id: d.targetId, targetType: d.targetType, targetId: d.targetId, title: d.name, snippet: d.summary.slice(0, 160), kind: d.targetType, href: repoPath(d.targetType, d.slug) ?? "/", updatedAt: d.updatedAt, rank: 0.1 })),
  ];
}

export function hrefFor(source: string, id: string): string {
  switch (source) {
    case "note": return `/hq/brain/${id}`;
    case "idea": return `/hq/ideas/${id}`;
    case "task": return `/hq#tasks`;
    case "interaction": return `/hq/people`;
    case "relationship": return `/hq/people/${id}`;
    case "pipeline": return `/hq/pipeline/${id}`;
    case "style": return `/hq/studio`;
    default: return "/hq/brain";
  }
}

/**
 * The answer blocks: the question's type words decide what is pulled out of
 * the hits. Asking for athletes with a format hit gives the talent attached
 * to those formats; asking for filmmakers with a project hit gives the
 * people credited on it; asking for companies gives the organizations
 * connected to whatever matched.
 */
async function answerBlocks(hints: string[], hits: Hit[]): Promise<AnswerBlock[]> {
  const blocks: AnswerBlock[] = [];
  const repoHits = hits.filter((h) => h.source === "repo");
  const formatIds = repoHits.filter((h) => h.targetType === "format").map((h) => h.targetId!);
  const projectIds = repoHits.filter((h) => h.targetType === "project").map((h) => h.targetId!);
  const channelIds = repoHits.filter((h) => h.targetType === "channel").map((h) => h.targetId!);

  if (hints.includes("creator") && (formatIds.length || projectIds.length || channelIds.length)) {
    const [cf, cp, ch] = await Promise.all([
      formatIds.length ? db.creatorFormat.findMany({ where: { formatId: { in: formatIds } }, include: { creator: { select: { name: true, slug: true, headline: true } }, format: { select: { title: true } } } }) : [],
      projectIds.length ? db.creatorProjectCredit.findMany({ where: { projectId: { in: projectIds } }, include: { creator: { select: { name: true, slug: true, headline: true } }, project: { select: { title: true } } } }) : [],
      channelIds.length ? db.channel.findMany({ where: { id: { in: channelIds }, creatorId: { not: null } }, include: { creator: { select: { name: true, slug: true, headline: true } } } }) : [],
    ]);
    const seen = new Map<string, { name: string; href: string | null; detail: string }>();
    for (const x of cf) seen.set(x.creator.slug, { name: x.creator.name, href: `/talent/${x.creator.slug}`, detail: `on ${x.format.title}${x.isPrimary ? " (primary)" : ""}` });
    for (const x of cp) seen.set(x.creator.slug, { name: x.creator.name, href: `/talent/${x.creator.slug}`, detail: `${x.role.replace(/_/g, " ")} on ${x.project.title}` });
    for (const x of ch) if (x.creator) seen.set(x.creator.slug, { name: x.creator.name, href: `/talent/${x.creator.slug}`, detail: `channel: ${x.name}` });
    if (seen.size) blocks.push({ heading: "Talent attached to what matched", items: [...seen.values()].slice(0, 24) });
  }
  if (hints.includes("person") && (projectIds.length || channelIds.length || formatIds.length)) {
    const [pp, chp] = await Promise.all([
      projectIds.length ? db.personProject.findMany({ where: { projectId: { in: projectIds } }, include: { person: { select: { name: true, slug: true, title: true } }, project: { select: { title: true } } } }) : [],
      channelIds.length ? db.channelPerson.findMany({ where: { channelId: { in: channelIds } }, include: { person: { select: { name: true, slug: true, title: true } }, channel: { select: { name: true } } } }) : [],
    ]);
    const seen = new Map<string, { name: string; href: string | null; detail: string }>();
    for (const x of pp) seen.set(x.person.slug, { name: x.person.name, href: `/people/${x.person.slug}`, detail: `${x.role.replace(/_/g, " ")} on ${x.project.title}` });
    for (const x of chp) seen.set(x.person.slug, { name: x.person.name, href: `/people/${x.person.slug}`, detail: `${x.relationship.replace(/_/g, " ")} on ${x.channel.name}` });
    // Talent reps on matched talent count as people too.
    const creatorIds = repoHits.filter((h) => h.targetType === "creator").map((h) => h.targetId!);
    if (creatorIds.length) {
      const reps = await db.creatorPerson.findMany({ where: { creatorId: { in: creatorIds } }, include: { person: { select: { name: true, slug: true } }, creator: { select: { name: true } } } });
      for (const x of reps) seen.set(x.person.slug, { name: x.person.name, href: `/people/${x.person.slug}`, detail: `${x.relationship.replace(/_/g, " ")} for ${x.creator.name}` });
    }
    if (seen.size) blocks.push({ heading: "People connected to what matched", items: [...seen.values()].slice(0, 24) });
  }
  if (hints.includes("organization") && (projectIds.length || formatIds.length)) {
    const [po, fo] = await Promise.all([
      projectIds.length ? db.projectOrganization.findMany({ where: { projectId: { in: projectIds } }, include: { organization: { select: { name: true, slug: true } }, project: { select: { title: true } } } }) : [],
      formatIds.length ? db.formatOrganization.findMany({ where: { formatId: { in: formatIds } }, include: { organization: { select: { name: true, slug: true } }, format: { select: { title: true } } } }) : [],
    ]);
    const seen = new Map<string, { name: string; href: string | null; detail: string }>();
    for (const x of po) seen.set(x.organization.slug, { name: x.organization.name, href: `/organizations/${x.organization.slug}`, detail: `${x.relationship.replace(/_/g, " ")} on ${x.project.title}` });
    for (const x of fo) seen.set(x.organization.slug, { name: x.organization.name, href: `/organizations/${x.organization.slug}`, detail: `${x.relationship.replace(/_/g, " ")} on ${x.format.title}` });
    if (seen.size) blocks.push({ heading: "Companies connected to what matched", items: [...seen.values()].slice(0, 24) });
  }
  // Your own words first: notes and ideas that match are the memory itself.
  const own = hits.filter((h) => h.source === "note" || h.source === "idea" || h.source === "interaction").slice(0, 6);
  if (own.length && hints.length) {
    blocks.push({ heading: "From your notes", items: own.map((h) => ({ name: h.title, href: h.href, detail: h.snippet.replace(/[«»]/g, "") })) });
  }
  return blocks;
}

export async function searchBrain(ownerId: string, query: string): Promise<SearchResult> {
  const q = query.trim();
  if (!q) return { query: q, terms: "", hints: [], answer: [], hits: [], total: 0 };
  const { terms, hints } = readQuestion(q);
  let [own, shared] = await Promise.all([fts(ownerId, terms).catch(() => [] as Hit[]), repo(terms).catch(() => [] as Hit[])]);
  if (!shared.length && terms) {
    // The digest's index can lag a fresh record; its plain text does not.
    const word = terms.split(" ").sort((a, b) => b.length - a.length)[0];
    const rows = await db.knowledgeDigest.findMany({ where: { searchText: { contains: word, mode: "insensitive" } }, take: 15, orderBy: { archived: "asc" } }).catch(() => []);
    shared = rows.map((d) => ({ source: "repo" as const, id: d.targetId, targetType: d.targetType, targetId: d.targetId, title: d.archived ? `${d.name} (archived)` : d.name, snippet: d.summary.slice(0, 160), kind: d.targetType, href: repoPath(d.targetType, d.slug) ?? "/", updatedAt: d.updatedAt, rank: 0.05 }));
  }
  if (!own.length && !shared.length) {
    const fallback = await loose(ownerId, terms || q).catch(() => [] as Hit[]);
    own = fallback.filter((h) => h.source !== "repo");
    shared = fallback.filter((h) => h.source === "repo");
  }
  // A type hint pulls that kind of record to the front.
  const boost = (h: Hit) => (h.source === "repo" && hints.includes(h.targetType ?? "") ? 0.5 : 0) + (h.source !== "repo" ? 0.15 : 0);
  const hits = [...own, ...shared].sort((a, b) => b.rank + boost(b) - (a.rank + boost(a)));
  const answer = await answerBlocks(hints, hits).catch(() => []);
  return { query: q, terms, hints, answer, hits: hits.slice(0, 40), total: hits.length };
}
