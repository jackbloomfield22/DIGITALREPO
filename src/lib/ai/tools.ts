import "server-only";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { findRelatedCreators } from "@/lib/related";
import { labelFor, socialLabel } from "@/lib/taxonomy";
import { totalAudience } from "@/lib/format";

// Read-only tools the AI can call. Every input is validated server-side with
// zod, result sizes are capped, and there is no path to arbitrary SQL or any
// write operation.

const MAX_RESULTS = 25;

export type ResultCard = {
  type: "creator" | "project" | "organization" | "format" | "person" | "opportunity" | "entity";
  id: string;
  name: string;
  slug: string;
  href: string;
  sub?: string;
};

/** Collects every record the tools touched, so the UI can render linkable cards. */
export class ResultRegistry {
  cards = new Map<string, ResultCard>();
  add(card: ResultCard) {
    this.cards.set(`${card.type}:${card.id}`, card);
  }
  /** Cards whose names actually appear in the final answer text. */
  mentioned(text: string): ResultCard[] {
    const lower = text.toLowerCase();
    return [...this.cards.values()].filter((c) => lower.includes(c.name.toLowerCase()));
  }
}

const take = (n?: number) => Math.min(Math.max(1, n ?? 10), MAX_RESULTS);

const creatorSummary = async (
  registry: ResultRegistry,
  creators: {
    id: string; name: string; slug: string; headline: string | null;
    socialProfiles: { platform: string; followerCount: number | null }[];
    entityLinks: { relationship: string; entity: { kind: string; name: string } }[];
  }[],
) =>
  creators.map((c) => {
    registry.add({ type: "creator", id: c.id, name: c.name, slug: c.slug, href: `/talent/${c.slug}`, sub: c.headline ?? undefined });
    const kind = (k: string) => c.entityLinks.filter((l) => l.entity.kind === k).map((l) => l.entity.name);
    return {
      name: c.name,
      slug: c.slug,
      headline: c.headline,
      categories: kind("creator_category"),
      basedIn: c.entityLinks.find((l) => l.entity.kind === "location" && l.relationship === "based_in")?.entity.name ?? null,
      sports: kind("sport"),
      interests: [...kind("interest"), ...kind("hobby")],
      totalListedAudience: totalAudience(c.socialProfiles),
    };
  });

const creatorInclude = {
  socialProfiles: { select: { platform: true, followerCount: true } },
  entityLinks: { select: { relationship: true, entity: { select: { kind: true, name: true } } } },
} as const;

type ToolDef = {
  schema: Anthropic.Tool;
  input: z.ZodTypeAny;
  run: (input: never, registry: ResultRegistry) => Promise<unknown>;
};

const tool = <T extends z.ZodTypeAny>(
  name: string,
  description: string,
  input: T,
  properties: Record<string, unknown>,
  required: string[],
  run: (input: z.infer<T>, registry: ResultRegistry) => Promise<unknown>,
): ToolDef => ({
  schema: {
    name,
    description,
    input_schema: { type: "object" as const, properties, required, additionalProperties: false },
  },
  input,
  run: run as ToolDef["run"],
});

const str = { type: "string" };
const num = { type: "number" };

export const AI_TOOLS: ToolDef[] = [
  tool(
    "search_creators",
    "Search creators by name, category, interest/sport/location entity, minimum audience, or project role. All filters are optional and combine with AND. Returns structured summaries.",
    z.object({
      query: z.string().max(200).optional(),
      entityNames: z.array(z.string().max(100)).max(5).optional(),
      role: z.string().max(50).optional(),
      minAudience: z.number().int().min(0).optional(),
      organizationName: z.string().max(200).optional(),
      limit: z.number().int().optional(),
    }),
    {
      query: { ...str, description: "Partial name match" },
      entityNames: { type: "array", items: str, description: "Interest / sport / location / category names, e.g. ['Soccer','Los Angeles']. Each must match; use canonical names from search_entities when unsure." },
      role: { ...str, description: "Creator-project role in snake_case, e.g. host, executive_producer, contestant" },
      minAudience: { ...num, description: "Minimum total listed audience across platforms" },
      organizationName: { ...str, description: "Only creators connected to this organization (directly or via project credits)" },
      limit: num,
    },
    [],
    async (input, registry) => {
      const and: object[] = [{ archived: false }];
      if (input.query) and.push({ name: { contains: input.query, mode: "insensitive" } });
      const unmatched: string[] = [];
      for (const name of input.entityNames ?? []) {
        const entity = await db.entity.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
        if (!entity) {
          const fuzzy = await db.entity.findFirst({ where: { name: { contains: name, mode: "insensitive" } } });
          if (fuzzy) and.push({ entityLinks: { some: { entityId: fuzzy.id } } });
          else unmatched.push(name);
        } else and.push({ entityLinks: { some: { entityId: entity.id } } });
      }
      if (input.role) and.push({ credits: { some: { role: input.role } } });
      if (input.organizationName) {
        const org = await db.organization.findFirst({
          where: { name: { contains: input.organizationName, mode: "insensitive" } },
        });
        if (org) {
          and.push({
            OR: [
              { organizations: { some: { organizationId: org.id } } },
              { credits: { some: { project: { organizations: { some: { organizationId: org.id } } } } } },
            ],
          });
        } else unmatched.push(input.organizationName);
      }
      const creators = await db.creator.findMany({
        where: { AND: and },
        include: creatorInclude,
        take: take(input.limit),
        orderBy: { name: "asc" },
      });
      let results = await creatorSummary(registry, creators);
      if (input.minAudience) results = results.filter((r) => r.totalListedAudience >= (input.minAudience ?? 0));
      return {
        results,
        note: unmatched.length
          ? `These filter terms matched nothing in the database and were ignored: ${unmatched.join(", ")}. Results may be broader than requested.`
          : undefined,
      };
    },
  ),

  tool(
    "get_creator",
    "Get a creator's full profile: bio, socials, interests, projects with roles, formats, organizations, representation, collaborators.",
    z.object({ name: z.string().max(200) }),
    { name: { ...str, description: "Creator name or slug" } },
    ["name"],
    async (input, registry) => {
      const creator = await db.creator.findFirst({
        where: {
          archived: false,
          OR: [{ slug: input.name }, { name: { contains: input.name, mode: "insensitive" } }],
        },
        include: {
          socialProfiles: true,
          entityLinks: { include: { entity: true } },
          credits: { include: { project: { select: { id: true, title: true, slug: true, projectType: true, premiereYear: true } } } },
          organizations: { include: { organization: { select: { id: true, name: true, slug: true } } } },
          people: { include: { person: { select: { id: true, name: true, slug: true } } } },
          formats: { include: { format: { select: { id: true, title: true, slug: true, status: true } } } },
          relationshipsA: { include: { creatorB: { select: { name: true } } } },
          relationshipsB: { include: { creatorA: { select: { name: true } } } },
        },
      });
      if (!creator) return { error: `No creator matching "${input.name}" in the database.` };
      registry.add({ type: "creator", id: creator.id, name: creator.name, slug: creator.slug, href: `/talent/${creator.slug}` });
      for (const c of creator.credits) registry.add({ type: "project", id: c.project.id, name: c.project.title, slug: c.project.slug, href: `/projects/${c.project.slug}` });
      for (const f of creator.formats) registry.add({ type: "format", id: f.format.id, name: f.format.title, slug: f.format.slug, href: `/formats/${f.format.slug}` });
      for (const o of creator.organizations) registry.add({ type: "organization", id: o.organization.id, name: o.organization.name, slug: o.organization.slug, href: `/organizations/${o.organization.slug}` });
      const kind = (k: string) => creator.entityLinks.filter((l) => l.entity.kind === k).map((l) => l.entity.name);
      return {
        name: creator.name,
        headline: creator.headline,
        miniBio: creator.miniBio,
        digitalSummary: creator.digitalSummary,
        opportunityNotes: creator.opportunityNotes,
        age: creator.age,
        categories: kind("creator_category"),
        locations: creator.entityLinks.filter((l) => l.entity.kind === "location").map((l) => ({ name: l.entity.name, relationship: labelFor(l.relationship) || "Linked" })),
        sports: kind("sport"),
        interests: [...kind("interest"), ...kind("hobby")],
        socials: creator.socialProfiles.map((s) => ({ platform: socialLabel(s.platform), handle: s.handle, followers: s.followerCount })),
        totalListedAudience: totalAudience(creator.socialProfiles),
        projects: creator.credits.map((c) => ({ title: c.project.title, type: labelFor(c.project.projectType), year: c.project.premiereYear, role: labelFor(c.role) })),
        formats: creator.formats.map((f) => ({ title: f.format.title, status: labelFor(f.format.status) })),
        organizations: creator.organizations.map((o) => ({ name: o.organization.name, relationship: labelFor(o.relationship), status: labelFor(o.status) })),
        representation: creator.people.map((p) => ({ name: p.person.name, relationship: labelFor(p.relationship) })),
        collaborators: [
          ...creator.relationshipsA.map((r) => ({ name: r.creatorB.name, relationship: labelFor(r.relationship) })),
          ...creator.relationshipsB.map((r) => ({ name: r.creatorA.name, relationship: labelFor(r.relationship) })),
        ],
      };
    },
  ),

  tool(
    "search_projects",
    "Search existing projects by title, type, organization, creator, creator role, or topic.",
    z.object({
      query: z.string().max(200).optional(),
      projectType: z.string().max(50).optional(),
      organizationName: z.string().max(200).optional(),
      creatorName: z.string().max(200).optional(),
      role: z.string().max(50).optional(),
      topic: z.string().max(100).optional(),
      limit: z.number().int().optional(),
    }),
    {
      query: str,
      projectType: { ...str, description: "snake_case, e.g. competition_show, podcast, docuseries" },
      organizationName: str,
      creatorName: str,
      role: { ...str, description: "Filter to projects where a creator had this role" },
      topic: { ...str, description: "Vertical/genre name, e.g. Sports, Food" },
      limit: num,
    },
    [],
    async (input, registry) => {
      const and: object[] = [{ archived: false }];
      if (input.query) and.push({ title: { contains: input.query, mode: "insensitive" } });
      if (input.projectType) and.push({ projectType: input.projectType });
      if (input.organizationName)
        and.push({ organizations: { some: { organization: { name: { contains: input.organizationName, mode: "insensitive" } } } } });
      if (input.creatorName)
        and.push({ credits: { some: { creator: { name: { contains: input.creatorName, mode: "insensitive" } }, ...(input.role ? { role: input.role } : {}) } } });
      else if (input.role) and.push({ credits: { some: { role: input.role } } });
      if (input.topic) and.push({ entityLinks: { some: { entity: { name: { contains: input.topic, mode: "insensitive" } } } } });
      const projects = await db.project.findMany({
        where: { AND: and },
        take: take(input.limit),
        include: {
          credits: { include: { creator: { select: { name: true } } } },
          organizations: { include: { organization: { select: { name: true } } } },
        },
      });
      return projects.map((p) => {
        registry.add({ type: "project", id: p.id, name: p.title, slug: p.slug, href: `/projects/${p.slug}`, sub: labelFor(p.projectType) });
        return {
          title: p.title,
          type: labelFor(p.projectType),
          status: labelFor(p.status),
          year: p.premiereYear,
          logline: p.logline,
          talent: p.credits.map((c) => ({ name: c.creator.name, role: labelFor(c.role) })),
          organizations: p.organizations.map((o) => ({ name: o.organization.name, relationship: labelFor(o.relationship) })),
        };
      });
    },
  ),

  tool(
    "search_formats",
    "Search internal 4.4.Forty format concepts by title, status, creator, or topic.",
    z.object({
      query: z.string().max(200).optional(),
      status: z.string().max(30).optional(),
      creatorName: z.string().max(200).optional(),
      topic: z.string().max(100).optional(),
      limit: z.number().int().optional(),
    }),
    { query: str, status: { ...str, description: "e.g. idea, developing, pitched, sold" }, creatorName: str, topic: str, limit: num },
    [],
    async (input, registry) => {
      const and: object[] = [{ archived: false }];
      if (input.query) and.push({ title: { contains: input.query, mode: "insensitive" } });
      if (input.status) and.push({ status: input.status });
      if (input.creatorName) and.push({ creators: { some: { creator: { name: { contains: input.creatorName, mode: "insensitive" } } } } });
      if (input.topic) and.push({ entityLinks: { some: { entity: { name: { contains: input.topic, mode: "insensitive" } } } } });
      const formats = await db.format.findMany({
        where: { AND: and },
        take: take(input.limit),
        include: {
          creators: { include: { creator: { select: { name: true } } } },
          entityLinks: { include: { entity: { select: { name: true } } } },
        },
      });
      return formats.map((f) => {
        registry.add({ type: "format", id: f.id, name: f.title, slug: f.slug, href: `/formats/${f.slug}`, sub: labelFor(f.status) });
        return {
          title: f.title,
          status: labelFor(f.status),
          logline: f.logline,
          creators: f.creators.map((c) => c.creator.name),
          topics: f.entityLinks.map((l) => l.entity.name),
        };
      });
    },
  ),

  tool(
    "search_organizations",
    "Search organizations (production companies, brands, networks, agencies...) by name or type.",
    z.object({
      query: z.string().max(200).optional(),
      orgType: z.string().max(50).optional(),
      limit: z.number().int().optional(),
    }),
    { query: str, orgType: { ...str, description: "snake_case, e.g. production_company, brand, streamer, agency" }, limit: num },
    [],
    async (input, registry) => {
      const and: object[] = [{ archived: false }];
      if (input.query) and.push({ name: { contains: input.query, mode: "insensitive" } });
      if (input.orgType) and.push({ types: { has: input.orgType } });
      const orgs = await db.organization.findMany({
        where: { AND: and },
        take: take(input.limit),
        include: { _count: { select: { projects: true, creators: true } } },
      });
      return orgs.map((o) => {
        registry.add({ type: "organization", id: o.id, name: o.name, slug: o.slug, href: `/organizations/${o.slug}`, sub: o.types.map(labelFor).join(" · ") });
        return { name: o.name, types: o.types, description: o.description, projectCount: o._count.projects, directCreatorCount: o._count.creators };
      });
    },
  ),

  tool(
    "get_organization",
    "Get an organization with all connected projects, creators (direct, via projects, via representation), and formats.",
    z.object({ name: z.string().max(200) }),
    { name: str },
    ["name"],
    async (input, registry) => {
      const org = await db.organization.findFirst({
        where: { archived: false, OR: [{ slug: input.name }, { name: { contains: input.name, mode: "insensitive" } }] },
        include: {
          projects: { include: { project: { select: { id: true, title: true, slug: true } } } },
          creators: { include: { creator: { select: { id: true, name: true, slug: true } } } },
          formats: { include: { format: { select: { id: true, title: true, slug: true } } } },
          people: { include: { person: { select: { name: true, title: true } } } },
        },
      });
      if (!org) return { error: `No organization matching "${input.name}" in the database.` };
      registry.add({ type: "organization", id: org.id, name: org.name, slug: org.slug, href: `/organizations/${org.slug}` });
      const viaProjects = await db.creatorProjectCredit.findMany({
        where: { project: { organizations: { some: { organizationId: org.id } } } },
        include: { creator: { select: { id: true, name: true, slug: true } }, project: { select: { title: true } } },
      });
      for (const t of viaProjects) registry.add({ type: "creator", id: t.creator.id, name: t.creator.name, slug: t.creator.slug, href: `/talent/${t.creator.slug}` });
      return {
        name: org.name,
        types: org.types.map(labelFor),
        description: org.description,
        projects: org.projects.map((p) => ({ title: p.project.title, relationship: labelFor(p.relationship) })),
        directCreators: org.creators.map((c) => ({ name: c.creator.name, relationship: labelFor(c.relationship), status: labelFor(c.status) })),
        creatorsViaProjects: [...new Set(viaProjects.map((t) => `${t.creator.name} (${t.role} on ${t.project.title})`))],
        formats: org.formats.map((f) => ({ title: f.format.title, relationship: labelFor(f.relationship) })),
        people: org.people.map((p) => ({ name: p.person.name, title: p.person.title })),
      };
    },
  ),

  tool(
    "search_entities",
    "Search the canonical taxonomy (interests, sports, locations, categories, genres, verticals, tags). Use this to find exact entity names before filtering by them.",
    z.object({ query: z.string().max(100), kind: z.string().max(30).optional() }),
    { query: str, kind: { ...str, description: "Optional: interest | hobby | sport | location | genre | creator_category | vertical | audience_type | tag" } },
    ["query"],
    async (input) => {
      const entities = await db.entity.findMany({
        where: { name: { contains: input.query, mode: "insensitive" }, ...(input.kind ? { kind: input.kind } : {}) },
        take: 15,
        include: { _count: { select: { creatorLinks: true, projectLinks: true, formatLinks: true } } },
      });
      return entities.map((e) => ({
        name: e.name,
        kind: labelFor(e.kind),
        creatorCount: e._count.creatorLinks,
        projectCount: e._count.projectLinks,
        formatCount: e._count.formatLinks,
      }));
    },
  ),

  tool(
    "search_people",
    "Search industry people (agents, managers, executives, producers) by name or role type; includes who they represent.",
    z.object({ query: z.string().max(200).optional(), roleType: z.string().max(30).optional() }),
    { query: str, roleType: { ...str, description: "agent | manager | publicist | executive | producer | showrunner" } },
    [],
    async (input, registry) => {
      const people = await db.industryPerson.findMany({
        where: {
          archived: false,
          ...(input.query ? { name: { contains: input.query, mode: "insensitive" } } : {}),
          ...(input.roleType ? { roleType: input.roleType } : {}),
        },
        take: 15,
        include: {
          organizations: { include: { organization: { select: { name: true } } } },
          creators: { include: { creator: { select: { id: true, name: true, slug: true } } } },
        },
      });
      return people.map((p) => {
        registry.add({ type: "person", id: p.id, name: p.name, slug: p.slug, href: `/people/${p.slug}`, sub: p.title ?? undefined });
        return {
          name: p.name,
          title: p.title,
          roleType: labelFor(p.roleType),
          organization: p.organizations[0]?.organization.name ?? null,
          represents: p.creators.map((c) => ({ name: c.creator.name, relationship: labelFor(c.relationship) })),
        };
      });
    },
  ),

  tool(
    "search_opportunities",
    "Search internal opportunities/briefs by title, type, or status.",
    z.object({ query: z.string().max(200).optional(), status: z.string().max(30).optional(), type: z.string().max(40).optional() }),
    { query: str, status: str, type: str },
    [],
    async (input, registry) => {
      const opps = await db.opportunity.findMany({
        where: {
          archived: false,
          ...(input.query ? { title: { contains: input.query, mode: "insensitive" } } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.type ? { type: input.type } : {}),
        },
        take: 15,
        include: {
          entityLinks: { include: { entity: { select: { name: true } } } },
          creators: { include: { creator: { select: { name: true } } } },
        },
      });
      return opps.map((o) => {
        registry.add({ type: "opportunity", id: o.id, name: o.title, slug: o.slug, href: `/opportunities/${o.slug}`, sub: labelFor(o.status) });
        return {
          title: o.title,
          type: labelFor(o.type),
          status: labelFor(o.status),
          description: o.description,
          criteria: o.entityLinks.map((l) => l.entity.name),
          creatorsUnderConsideration: o.creators.map((c) => ({ name: c.creator.name, status: labelFor(c.status) })),
        };
      });
    },
  ),

  tool(
    "find_creator_connections",
    "Find what two creators have in common: shared projects, formats, organizations, interests, representatives, and direct relationships.",
    z.object({ creatorA: z.string().max(200), creatorB: z.string().max(200) }),
    { creatorA: str, creatorB: str },
    ["creatorA", "creatorB"],
    async (input, registry) => {
      const load = (name: string) =>
        db.creator.findFirst({
          where: { archived: false, OR: [{ slug: name }, { name: { contains: name, mode: "insensitive" } }] },
          include: {
            credits: { include: { project: { select: { id: true, title: true, slug: true } } } },
            formats: { include: { format: { select: { id: true, title: true } } } },
            organizations: { include: { organization: { select: { id: true, name: true } } } },
            entityLinks: { include: { entity: { select: { id: true, name: true, kind: true } } } },
            people: { include: { person: { select: { id: true, name: true } } } },
            relationshipsA: { select: { creatorBId: true, relationship: true } },
            relationshipsB: { select: { creatorAId: true, relationship: true } },
          },
        });
      const [a, b] = await Promise.all([load(input.creatorA), load(input.creatorB)]);
      if (!a || !b) return { error: `Could not find ${!a ? input.creatorA : input.creatorB} in the database.` };
      registry.add({ type: "creator", id: a.id, name: a.name, slug: a.slug, href: `/talent/${a.slug}` });
      registry.add({ type: "creator", id: b.id, name: b.name, slug: b.slug, href: `/talent/${b.slug}` });
      const intersect = <T, K>(xs: T[], ys: T[], key: (x: T) => K, label: (x: T) => string) => {
        const setB = new Set(ys.map(key));
        return [...new Set(xs.filter((x) => setB.has(key(x))).map(label))];
      };
      const direct = [
        ...a.relationshipsA.filter((r) => r.creatorBId === b.id).map((r) => r.relationship),
        ...a.relationshipsB.filter((r) => r.creatorAId === b.id).map((r) => r.relationship),
      ];
      return {
        creators: [a.name, b.name],
        directRelationships: direct,
        sharedProjects: intersect(a.credits, b.credits, (c) => c.project.id, (c) => c.project.title),
        sharedFormats: intersect(a.formats, b.formats, (f) => f.format.id, (f) => f.format.title),
        sharedOrganizations: intersect(a.organizations, b.organizations, (o) => o.organization.id, (o) => o.organization.name),
        sharedInterests: intersect(a.entityLinks, b.entityLinks, (l) => l.entity.id, (l) => `${l.entity.name} (${l.entity.kind})`),
        sharedRepresentatives: intersect(a.people, b.people, (p) => p.person.id, (p) => p.person.name),
      };
    },
  ),

  tool(
    "find_related_creators",
    "Get algorithmically related creators for a given creator, with explained reasons.",
    z.object({ name: z.string().max(200) }),
    { name: str },
    ["name"],
    async (input, registry) => {
      const creator = await db.creator.findFirst({
        where: { archived: false, OR: [{ slug: input.name }, { name: { contains: input.name, mode: "insensitive" } }] },
      });
      if (!creator) return { error: `No creator matching "${input.name}".` };
      const related = await findRelatedCreators(creator.id, 8);
      for (const r of related) registry.add({ type: "creator", id: r.id, name: r.name, slug: r.slug, href: `/talent/${r.slug}` });
      return related.map((r) => ({ name: r.name, reasons: r.reasons }));
    },
  ),

  tool(
    "get_recent_updates",
    "Get the most recent database changes (audit log).",
    z.object({ limit: z.number().int().optional() }),
    { limit: num },
    [],
    async (input) => {
      const entries = await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: take(input.limit) });
      return entries.map((e) => ({
        when: e.createdAt.toISOString(),
        who: e.userName,
        action: e.action,
        target: e.targetLabel,
        targetType: e.targetType,
        field: e.field,
        change: e.oldValue || e.newValue ? `${e.oldValue ?? ""} -> ${e.newValue ?? ""}` : undefined,
      }));
    },
  ),

  tool(
    "get_collection",
    "Get a collection's contents by name.",
    z.object({ name: z.string().max(200) }),
    { name: str },
    ["name"],
    async (input, registry) => {
      const collection = await db.collection.findFirst({
        where: { OR: [{ slug: input.name }, { name: { contains: input.name, mode: "insensitive" } }] },
        include: { items: true },
      });
      if (!collection) return { error: `No collection matching "${input.name}".` };
      const { resolveTargets } = await import("@/lib/resolve-targets");
      const resolved = await resolveTargets(collection.items);
      const items = collection.items.map((i) => {
        const r = resolved.get(`${i.targetType}:${i.targetId}`);
        if (r && (i.targetType === "creator" || i.targetType === "project" || i.targetType === "organization" || i.targetType === "format")) {
          registry.add({ type: i.targetType, id: i.targetId, name: r.label, slug: r.href.split("/").pop() ?? "", href: r.href });
        }
        return { type: i.targetType, name: r?.label ?? "unknown" };
      });
      return { name: collection.name, description: collection.description, items };
    },
  ),
];

export function toolByName(name: string): ToolDef | undefined {
  return AI_TOOLS.find((t) => t.schema.name === name);
}
