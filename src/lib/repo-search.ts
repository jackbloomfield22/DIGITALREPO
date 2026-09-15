import "server-only";
import { db } from "@/lib/db";
import { creatorSearch, projectSearch, formatSearch, organizationSearch, personSearch, opportunitySearch, channelSearch, searchWords } from "@/lib/search-where";
import { rankCandidates, spellingSuggestion } from "@/lib/search-rank";
import { resolveRecordRefs } from "@/lib/record-refs";

// Search across the Repo. Two ways in, one order out:
//   1. The knowledge index (one trigram-indexed table over every record) —
//      forgiving of misspellings and partial names, and it knows aliases.
//   2. The per-type field search — exact words anywhere on the record or its
//      relationships ("Nike" finds the talent with a Nike deal).
// Candidates from both are merged and ordered by the ladder in search-rank.

export const SEARCH_SECTIONS = [
  { type: "creator", label: "Talent", href: "/talent", create: "/talent/new" },
  { type: "project", label: "Projects", href: "/projects", create: "/projects/new" },
  { type: "organization", label: "Companies", href: "/organizations", create: "/organizations/new" },
  { type: "format", label: "Formats", href: "/formats", create: "/formats/new" },
  { type: "opportunity", label: "Opportunities", href: "/opportunities", create: "/opportunities/new" },
  { type: "person", label: "Industry people", href: "/people", create: "/people/new" },
  { type: "channel", label: "YouTube channels", href: "/youtube/channels", create: "/youtube/new" },
  { type: "entity", label: "Interests & topics", href: "/explore", create: null },
  { type: "collection", label: "Collections", href: "/collections", create: "/collections/new" },
  { type: "doc", label: "Documents", href: "/dev-slate", create: null },
] as const;
export type SearchType = typeof SEARCH_SECTIONS[number]["type"];
export type SearchItem = { id: string; type: SearchType; label: string; href: string; sub?: string; detail?: string; archived?: boolean; updatedAt?: string };
export type SearchGroup = { type: SearchType; label: string; href: string; create: string | null; count: number; items: SearchItem[] };
export const SEARCH_PAGE_SIZE = 24;
/** The most a single type will return, ranked; "view all" on a list is separate. */
const MAX_PER_TYPE = 200;

const docPaths: Record<string, string> = { "dev-slate": "/dev-slate", "youtube-playbook": "/youtube/playbook" };
export function searchSnippet(text: string | null | undefined, q: string, length = 200): string {
  if (!text) return "";
  const plain = text.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  const index = searchWords(q).map((w) => plain.toLowerCase().indexOf(w.toLowerCase())).filter((i) => i >= 0).sort((a,b) => a-b)[0] ?? 0;
  const start = Math.max(0, index - 65);
  return `${start ? "…" : ""}${plain.slice(start, start + length)}${plain.length > start + length ? "…" : ""}`;
}

type DigestRow = { targetType: string; targetId: string; name: string; aliases: string[]; archived: boolean; summary: string; updatedAt: Date; sim: number };
const DIGEST_TYPES = new Set(["creator", "project", "organization", "format", "person", "opportunity", "channel", "entity"]);

/** Fuzzy candidates from the index: misspellings, partial names, aliases. */
async function indexCandidates(q: string, archived: boolean, limit: number): Promise<DigestRow[]> {
  try {
    const rows = await db.$queryRaw<DigestRow[]>`
      SELECT "targetType", "targetId", "name", "aliases", "archived", "summary", "updatedAt",
        GREATEST(similarity("name", ${q}), similarity(array_to_string("aliases", ' '), ${q}), similarity("searchText", ${q}) * 0.6) AS sim
      FROM "KnowledgeDigest"
      WHERE (${archived} OR "archived" = false)
        AND (similarity("name", ${q}) > 0.25 OR similarity(array_to_string("aliases", ' '), ${q}) > 0.3 OR "name" ILIKE ${"%" + q + "%"} OR "searchVector" @@ plainto_tsquery('simple', ${q}))
      ORDER BY sim DESC
      LIMIT ${limit}
    `;
    return rows.filter((r) => DIGEST_TYPES.has(r.targetType));
  } catch (e) {
    console.error("Index search failed; falling back to field search only.", e);
    return [];
  }
}

async function bestSpelling(q: string): Promise<{ name: string; sim: number } | null> {
  try {
    const rows = await db.$queryRaw<{ name: string; sim: number }[]>`
      SELECT "name", similarity("name", ${q}) AS sim FROM "KnowledgeDigest"
      WHERE "archived" = false AND similarity("name", ${q}) > 0.4 ORDER BY sim DESC LIMIT 1`;
    return rows[0] ?? null;
  } catch { return null; }
}

/** Search only shared, canonical Repo models. HQ notes and personal records never enter this index. */
export async function searchRepo(query: string, options: { type?: string; page?: number; archived?: boolean; previewSize?: number; skipCounts?: boolean; updatedWithinDays?: number } = {}) {
  const q = query.trim().slice(0, 200);
  const selected = SEARCH_SECTIONS.some((s) => s.type === options.type) ? options.type : "";
  const archived = options.archived === true;
  const archive = archived ? {} : { archived: false };
  const words = searchWords(q);
  const textWhere = (fields: string[]) => ({ AND: words.map((word) => ({ OR: fields.map((f) => ({ [f]: { contains: word, mode: "insensitive" as const } })) })) });
  const preview = Math.min(options.previewSize ?? 4, 8);
  const perType = selected ? MAX_PER_TYPE : Math.max(preview * 4, 12);

  if (!q) {
    return { groups: SEARCH_SECTIONS.map((s) => ({ ...s, count: 0, items: [] as SearchItem[] })), total: 0, selected, page: 1, pages: 1, q, suggestion: null as string | null };
  }

  // 1. Fuzzy candidates from the index (one query for every type).
  const index = await indexCandidates(q, archived, selected ? 400 : 120);

  // 2. Exact-word candidates per type, through fields and relationships.
  const wants = (t: SearchType) => !selected || selected === t;
  const take = perType;
  const fieldHits: Record<SearchType, { id: string; name: string; aliases?: string[]; updatedAt?: Date; archived?: boolean; detail?: string; related?: boolean }[]> = {
    creator: [], project: [], organization: [], format: [], opportunity: [], person: [], channel: [], entity: [], collection: [], doc: [],
  };
  await Promise.all([
    wants("creator") && db.creator.findMany({ where: { ...archive, ...creatorSearch(q) }, take, select: { id: true, name: true, aliases: true, updatedAt: true, archived: true, miniBio: true } }).then((rows) => { fieldHits.creator = rows.map((r) => ({ ...r, detail: searchSnippet(r.miniBio, q) })); }),
    wants("project") && db.project.findMany({ where: { ...archive, ...projectSearch(q) }, take, select: { id: true, title: true, aliases: true, updatedAt: true, archived: true, logline: true, description: true } }).then((rows) => { fieldHits.project = rows.map((r) => ({ id: r.id, name: r.title, aliases: r.aliases, updatedAt: r.updatedAt, archived: r.archived, detail: searchSnippet(r.logline || r.description, q) })); }),
    wants("organization") && db.organization.findMany({ where: { ...archive, ...organizationSearch(q) }, take, select: { id: true, name: true, aliases: true, updatedAt: true, archived: true, description: true, location: true } }).then((rows) => { fieldHits.organization = rows.map((r) => ({ ...r, detail: searchSnippet([r.location, r.description].filter(Boolean).join(" · "), q) })); }),
    wants("format") && db.format.findMany({ where: { ...archive, ...formatSearch(q) }, take, select: { id: true, title: true, updatedAt: true, archived: true, logline: true, description: true } }).then((rows) => { fieldHits.format = rows.map((r) => ({ id: r.id, name: r.title, updatedAt: r.updatedAt, archived: r.archived, detail: searchSnippet(r.logline || r.description, q) })); }),
    wants("opportunity") && db.opportunity.findMany({ where: { ...archive, ...opportunitySearch(q) }, take, select: { id: true, title: true, updatedAt: true, archived: true, description: true } }).then((rows) => { fieldHits.opportunity = rows.map((r) => ({ id: r.id, name: r.title, updatedAt: r.updatedAt, archived: r.archived, detail: searchSnippet(r.description, q) })); }),
    wants("person") && db.industryPerson.findMany({ where: { ...archive, ...personSearch(q) }, take, select: { id: true, name: true, updatedAt: true, archived: true, notes: true } }).then((rows) => { fieldHits.person = rows.map((r) => ({ ...r, detail: searchSnippet(r.notes, q) })); }),
    wants("channel") && db.channel.findMany({ where: { ...archive, ...channelSearch(q) }, take, select: { id: true, name: true, updatedAt: true, archived: true, premise: true } }).then((rows) => { fieldHits.channel = rows.map((r) => ({ ...r, detail: searchSnippet(r.premise, q) })); }),
    wants("entity") && db.entity.findMany({ where: textWhere(["name", "description"]), take, select: { id: true, name: true, aliases: true, description: true } }).then((rows) => { fieldHits.entity = rows.map((r) => ({ ...r, detail: searchSnippet(r.description, q) })); }),
    wants("collection") && db.collection.findMany({ where: textWhere(["name", "description"]), take, select: { id: true, name: true, description: true, updatedAt: true } }).then((rows) => { fieldHits.collection = rows.map((r) => ({ ...r, detail: searchSnippet(r.description, q) })); }),
    wants("doc") && db.doc.findMany({ where: { ...textWhere(["title", "content"]), slug: { in: Object.keys(docPaths) } }, take, select: { id: true, title: true, slug: true, content: true, updatedAt: true } }).then((rows) => { fieldHits.doc = rows.map((r) => ({ id: r.id, name: r.title, updatedAt: r.updatedAt, detail: searchSnippet(r.content, q), aliases: [r.slug] })); }),
  ]);

  // 3. Merge and rank per type.
  const docSlugs = new Map(fieldHits.doc.map((d) => [d.id, d.aliases?.[0] ?? ""]));
  const byType = new Map<SearchType, Map<string, { key: string; name: string; aliases?: string[]; sim?: number; related?: boolean; archived?: boolean; updatedAt?: Date; detail?: string }>>();
  const bucket = (t: SearchType) => byType.get(t) ?? (byType.set(t, new Map()), byType.get(t)!);
  for (const row of index) {
    if (!wants(row.targetType as SearchType)) continue;
    bucket(row.targetType as SearchType).set(row.targetId, { key: row.targetId, name: row.name, aliases: row.aliases, sim: row.sim, archived: row.archived, updatedAt: row.updatedAt });
  }
  for (const t of Object.keys(fieldHits) as SearchType[]) {
    for (const hit of fieldHits[t]) {
      const existing = bucket(t).get(hit.id);
      // A field hit whose name does not carry the query matched through a relationship or a long field.
      const nameCarries = words.every((w) => `${hit.name} ${(hit.aliases ?? []).join(" ")}`.toLowerCase().includes(w.toLowerCase()));
      bucket(t).set(hit.id, { key: hit.id, name: hit.name, aliases: hit.aliases, sim: existing?.sim, related: !existing && !nameCarries, archived: hit.archived ?? existing?.archived, updatedAt: hit.updatedAt ?? existing?.updatedAt, detail: hit.detail });
    }
  }
  const cutoff = options.updatedWithinDays ? Date.now() - options.updatedWithinDays * 86_400_000 : null;
  const ranked = new Map<SearchType, ReturnType<typeof rankCandidates<{ key: string; name: string; aliases?: string[]; sim?: number; related?: boolean; archived?: boolean; updatedAt?: Date; detail?: string }>>>();
  for (const [t, m] of byType) {
    const list = [...m.values()].filter((c) => !cutoff || !c.updatedAt || c.updatedAt.getTime() >= cutoff);
    ranked.set(t, rankCandidates(list, q).slice(0, MAX_PER_TYPE));
  }

  // 4. Page the selected type, or take a preview of each; then put names, pages and context on the survivors.
  const selectedList = selected ? ranked.get(selected as SearchType) ?? [] : [];
  const pages = Math.max(1, Math.ceil(selectedList.length / SEARCH_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(options.page ?? 1)), pages);
  const chosen: { type: SearchType; id: string }[] = [];
  for (const s of SEARCH_SECTIONS) {
    const list = ranked.get(s.type) ?? [];
    const slice = selected ? (selected === s.type ? list.slice((page - 1) * SEARCH_PAGE_SIZE, page * SEARCH_PAGE_SIZE) : []) : list.slice(0, preview);
    chosen.push(...slice.map((c) => ({ type: s.type, id: c.key })));
  }
  const refs = await resolveRecordRefs(chosen.filter((c) => c.type !== "doc").map((c) => ({ targetType: c.type, targetId: c.id })));
  const refMap = new Map(refs.map((r) => [`${r.type}:${r.id}`, r]));

  const groups: SearchGroup[] = SEARCH_SECTIONS.map((s) => {
    const list = ranked.get(s.type) ?? [];
    const items: SearchItem[] = [];
    for (const c of chosen.filter((x) => x.type === s.type)) {
      const cand = list.find((x) => x.key === c.id);
      if (!cand) continue;
      if (s.type === "doc") {
        const slug = docSlugs.get(c.id) ?? "";
        items.push({ id: c.id, type: s.type, label: cand.name, href: docPaths[slug] ?? "/dev-slate", detail: cand.detail, updatedAt: cand.updatedAt?.toISOString() });
        continue;
      }
      const ref = refMap.get(`${s.type}:${c.id}`);
      if (!ref) continue;
      items.push({ id: c.id, type: s.type, label: ref.name, href: ref.href, sub: ref.sub, detail: cand.detail, archived: ref.archived, updatedAt: cand.updatedAt?.toISOString() });
    }
    return { ...s, count: list.length, items };
  });
  const total = groups.reduce((a, g) => a + g.count, 0);
  const suggestion = total < 3 ? spellingSuggestion(q, await bestSpelling(q)) : null;
  return { groups, total, selected, page, pages, q, suggestion };
}
