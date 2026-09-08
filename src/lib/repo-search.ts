import "server-only";
import { db } from "@/lib/db";
import { labelFor } from "@/lib/taxonomy";
import { creatorSearch, projectSearch, formatSearch, organizationSearch, personSearch, opportunitySearch, channelSearch, searchWords } from "@/lib/search-where";

export const SEARCH_SECTIONS = [
  { type: "creator", label: "Talent", href: "/talent" },
  { type: "format", label: "Formats", href: "/formats" },
  { type: "project", label: "Projects", href: "/projects" },
  { type: "organization", label: "Organizations", href: "/organizations" },
  { type: "person", label: "Industry people", href: "/people" },
  { type: "opportunity", label: "Opportunities", href: "/opportunities" },
  { type: "channel", label: "YouTube channels", href: "/youtube/channels" },
  { type: "entity", label: "Interests & topics", href: "/explore" },
  { type: "collection", label: "Collections", href: "/collections" },
  { type: "doc", label: "Documents", href: "/dev-slate" },
] as const;
export type SearchType = typeof SEARCH_SECTIONS[number]["type"];
export type SearchItem = { id: string; label: string; href: string; sub?: string; detail?: string; archived?: boolean };
export type SearchGroup = { type: SearchType; label: string; href: string; count: number; items: SearchItem[] };
export const SEARCH_PAGE_SIZE = 24;

const docPaths: Record<string, string> = { "dev-slate": "/dev-slate", "youtube-playbook": "/youtube/playbook" };
export function searchSnippet(text: string | null | undefined, q: string, length = 200): string {
  if (!text) return "";
  const plain = text.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  const index = searchWords(q).map((w) => plain.toLowerCase().indexOf(w.toLowerCase())).filter((i) => i >= 0).sort((a,b) => a-b)[0] ?? 0;
  const start = Math.max(0, index - 65);
  return `${start ? "…" : ""}${plain.slice(start, start + length)}${plain.length > start + length ? "…" : ""}`;
}

/** Search only shared, canonical Repo models. HQ notes and personal records
 * never enter this index. Counts are exact; All shows a short group preview. */
export async function searchRepo(query: string, options: { type?: string; page?: number; archived?: boolean; previewSize?: number } = {}) {
  const q = query.trim().slice(0, 200);
  const selected = SEARCH_SECTIONS.some((s) => s.type === options.type) ? options.type : "";
  const archived = options.archived === true;
  const archive = archived ? {} : { archived: false };
  const words = searchWords(q);
  const textWhere = (fields: string[]) => ({ AND: words.map((word) => ({ OR: fields.map((f) => ({ [f]: { contains: word, mode: "insensitive" as const } })) })) });
  const where = {
    creator: { ...archive, ...creatorSearch(q) }, project: { ...archive, ...projectSearch(q) },
    format: { ...archive, ...formatSearch(q) }, organization: { ...archive, ...organizationSearch(q) },
    person: { ...archive, ...personSearch(q) }, opportunity: { ...archive, ...opportunitySearch(q) },
    channel: { ...archive, ...channelSearch(q) }, entity: textWhere(["name", "description"]),
    collection: textWhere(["name", "description"]), doc: { ...textWhere(["title", "content"]), slug: { in: Object.keys(docPaths) } },
  };
  const countQueries = [
    () => db.creator.count({ where: where.creator }), () => db.format.count({ where: where.format }),
    () => db.project.count({ where: where.project }), () => db.organization.count({ where: where.organization }),
    () => db.industryPerson.count({ where: where.person }), () => db.opportunity.count({ where: where.opportunity }),
    () => db.channel.count({ where: where.channel }), () => db.entity.count({ where: where.entity }),
    () => db.collection.count({ where: where.collection }), () => db.doc.count({ where: where.doc }),
  ];
  const counts = q ? await Promise.all(countQueries.map((count) => count())) : SEARCH_SECTIONS.map(() => 0);
  const selectedCount = counts[SEARCH_SECTIONS.findIndex((s) => s.type === selected)] ?? 0;
  const pages = Math.max(1, Math.ceil(selectedCount / SEARCH_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(options.page ?? 1)), pages);
  const paging = { take: selected ? SEARCH_PAGE_SIZE : Math.min(options.previewSize ?? 4, 8), skip: selected ? (page - 1) * SEARCH_PAGE_SIZE : 0 };
  const nameOrder = [{ name: "asc" as const }, { id: "asc" as const }];
  const titleOrder = [{ title: "asc" as const }, { id: "asc" as const }];
  const loaders: Record<SearchType, () => Promise<SearchItem[]>> = {
    creator: async () => (await db.creator.findMany({ where: where.creator, ...paging, orderBy: nameOrder, select: { id: true, name: true, slug: true, headline: true, miniBio: true, archived: true, entityLinks: { take: 8, select: { entity: { select: { name: true } } } }, organizations: { take: 4, select: { organization: { select: { name: true } } } } } })).map((r) => ({ id: r.id, label: r.name, href: `/talent/${r.slug}`, sub: r.headline ?? undefined, detail: searchSnippet([r.miniBio, ...r.entityLinks.map((e) => e.entity.name), ...r.organizations.map((o) => o.organization.name)].filter(Boolean).join(" · "), q), archived: r.archived })),
    project: async () => (await db.project.findMany({ where: where.project, ...paging, orderBy: titleOrder, select: { id: true, title: true, slug: true, status: true, logline: true, description: true, archived: true } })).map((r) => ({ id: r.id, label: r.title, href: `/projects/${r.slug}`, sub: labelFor(r.status), detail: searchSnippet(r.logline || r.description, q), archived: r.archived })),
    format: async () => (await db.format.findMany({ where: where.format, ...paging, orderBy: titleOrder, select: { id: true, title: true, slug: true, status: true, logline: true, description: true, archived: true } })).map((r) => ({ id: r.id, label: r.title, href: `/formats/${r.slug}`, sub: labelFor(r.status), detail: searchSnippet(r.logline || r.description, q), archived: r.archived })),
    organization: async () => (await db.organization.findMany({ where: where.organization, ...paging, orderBy: nameOrder, select: { id: true, name: true, slug: true, types: true, description: true, location: true, archived: true } })).map((r) => ({ id: r.id, label: r.name, href: `/organizations/${r.slug}`, sub: r.types.map(labelFor).join(" · "), detail: searchSnippet([r.location, r.description].filter(Boolean).join(" · "), q), archived: r.archived })),
    person: async () => (await db.industryPerson.findMany({ where: where.person, ...paging, orderBy: nameOrder, select: { id: true, name: true, slug: true, title: true, archived: true, organizations: { select: { organization: { select: { name: true } } } } } })).map((r) => ({ id: r.id, label: r.name, href: `/people/${r.slug}`, sub: r.title ?? undefined, detail: r.organizations.map((o) => o.organization.name).join(" · "), archived: r.archived })),
    opportunity: async () => (await db.opportunity.findMany({ where: where.opportunity, ...paging, orderBy: titleOrder, select: { id: true, title: true, slug: true, status: true, description: true, archived: true } })).map((r) => ({ id: r.id, label: r.title, href: `/opportunities/${r.slug}`, sub: labelFor(r.status), detail: searchSnippet(r.description, q), archived: r.archived })),
    channel: async () => (await db.channel.findMany({ where: where.channel, ...paging, orderBy: nameOrder, select: { id: true, name: true, slug: true, status: true, premise: true, archived: true } })).map((r) => ({ id: r.id, label: r.name, href: `/youtube/${r.slug}`, sub: labelFor(r.status), detail: searchSnippet(r.premise, q), archived: r.archived })),
    entity: async () => (await db.entity.findMany({ where: where.entity, ...paging, orderBy: nameOrder, select: { id: true, name: true, slug: true, kind: true, description: true } })).map((r) => ({ id: r.id, label: r.name, href: `/explore/${r.kind}/${r.slug}`, sub: labelFor(r.kind), detail: searchSnippet(r.description, q) })),
    collection: async () => (await db.collection.findMany({ where: where.collection, ...paging, orderBy: nameOrder, select: { id: true, name: true, slug: true, description: true } })).map((r) => ({ id: r.id, label: r.name, href: `/collections/${r.slug}`, detail: searchSnippet(r.description, q) })),
    doc: async () => (await db.doc.findMany({ where: where.doc, ...paging, orderBy: titleOrder, select: { id: true, title: true, slug: true, content: true } })).map((r) => ({ id: r.id, label: r.title, href: docPaths[r.slug], detail: searchSnippet(r.content, q) })),
  };
  const groups: SearchGroup[] = await Promise.all(SEARCH_SECTIONS.map(async (s, i) => ({ ...s, count: counts[i], items: q && counts[i] && (!selected || selected === s.type) ? await loaders[s.type]() : [] })));
  return { groups, total: counts.reduce((a,b) => a+b, 0), selected, page, pages, q };
}
