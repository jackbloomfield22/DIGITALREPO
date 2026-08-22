// Core product tests (spec §107). These run against the live Postgres
// database configured in DATABASE_URL. All fixtures are prefixed "ZZTest"
// and removed afterwards.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildCreatorWhere } from "@/lib/queries/talent";
import { mergeEntitiesCore } from "@/lib/merge";
import { hasRole } from "@/lib/roles";
import { nameSimilarity, slugify, uniqueSlug } from "@/lib/slug";
import { toolByName, ResultRegistry, AI_TOOLS } from "@/lib/ai/tools";

const db = new PrismaClient();
const P = "ZZTest";

async function cleanup() {
  await db.creator.deleteMany({ where: { name: { startsWith: P } } });
  await db.project.deleteMany({ where: { title: { startsWith: P } } });
  await db.organization.deleteMany({ where: { name: { startsWith: P } } });
  await db.format.deleteMany({ where: { title: { startsWith: P } } });
  await db.entity.deleteMany({ where: { name: { startsWith: P } } });
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("required creator fields", () => {
  it("creates a creator with only a name — everything else optional", async () => {
    const creator = await db.creator.create({
      data: { name: `${P} Minimal`, slug: slugify(`${P} Minimal`) },
    });
    expect(creator.id).toBeTruthy();
    expect(creator.status).toBe("active");
  });
});

describe("canonical interests", () => {
  it("adding the same interest twice does not create a duplicate relationship", async () => {
    const creator = await db.creator.create({
      data: { name: `${P} Interests`, slug: slugify(`${P} Interests`) },
    });
    const entity = await db.entity.create({
      data: { kind: "interest", name: `${P} Soccerish`, slug: slugify(`${P} Soccerish`) },
    });
    const link = { creatorId: creator.id, entityId: entity.id, relationship: "" };
    await db.creatorEntityLink.upsert({
      where: { creatorId_entityId_relationship: link },
      update: {},
      create: link,
    });
    await db.creatorEntityLink.upsert({
      where: { creatorId_entityId_relationship: link },
      update: {},
      create: link,
    });
    const count = await db.creatorEntityLink.count({
      where: { creatorId: creator.id, entityId: entity.id },
    });
    expect(count).toBe(1);
  });
});

describe("creator ↔ format bidirectionality", () => {
  it("a single link row is visible from both the creator and the format", async () => {
    const creator = await db.creator.create({
      data: { name: `${P} FormatLink`, slug: slugify(`${P} FormatLink`) },
    });
    const format = await db.format.create({
      data: { title: `${P} Format`, slug: slugify(`${P} Format`) },
    });
    await db.creatorFormat.create({ data: { creatorId: creator.id, formatId: format.id } });

    const fromCreator = await db.creator.findUnique({
      where: { id: creator.id },
      include: { formats: { include: { format: true } } },
    });
    const fromFormat = await db.format.findUnique({
      where: { id: format.id },
      include: { creators: { include: { creator: true } } },
    });
    expect(fromCreator?.formats[0]?.format.title).toBe(`${P} Format`);
    expect(fromFormat?.creators[0]?.creator.name).toBe(`${P} FormatLink`);
  });
});

describe("creator ↔ project roles", () => {
  it("persists multiple roles and exposes them from both directions", async () => {
    const creator = await db.creator.create({
      data: { name: `${P} Talent`, slug: slugify(`${P} Talent`) },
    });
    const project = await db.project.create({
      data: { title: `${P} Show`, slug: slugify(`${P} Show`), projectType: "competition_show" },
    });
    for (const role of ["host", "executive_producer"]) {
      await db.creatorProjectCredit.create({
        data: { creatorId: creator.id, projectId: project.id, role },
      });
    }
    const fromCreator = await db.creatorProjectCredit.findMany({ where: { creatorId: creator.id } });
    const fromProject = await db.creatorProjectCredit.findMany({ where: { projectId: project.id } });
    expect(fromCreator.map((c) => c.role).sort()).toEqual(["executive_producer", "host"]);
    expect(fromProject).toHaveLength(2);
  });
});

describe("project ↔ organization", () => {
  it("production company is visible from both project and organization", async () => {
    const project = await db.project.create({
      data: { title: `${P} Produced`, slug: slugify(`${P} Produced`) },
    });
    const org = await db.organization.create({
      data: { name: `${P} Prodco`, slug: slugify(`${P} Prodco`), types: ["production_company"] },
    });
    await db.projectOrganization.create({
      data: { projectId: project.id, organizationId: org.id, relationship: "production_company" },
    });
    const orgSide = await db.organization.findUnique({
      where: { id: org.id },
      include: { projects: { include: { project: true } } },
    });
    const projectSide = await db.project.findUnique({
      where: { id: project.id },
      include: { organizations: { include: { organization: true } } },
    });
    expect(orgSide?.projects[0]?.project.title).toBe(`${P} Produced`);
    expect(projectSide?.organizations[0]?.organization.name).toBe(`${P} Prodco`);
  });
});

describe("derived experience", () => {
  it("host credits produce hosting experience via role queries", async () => {
    const creator = await db.creator.create({
      data: { name: `${P} HostExp`, slug: slugify(`${P} HostExp`) },
    });
    const project = await db.project.create({
      data: { title: `${P} Hosted Series`, slug: slugify(`${P} Hosted Series`) },
    });
    await db.creatorProjectCredit.create({
      data: { creatorId: creator.id, projectId: project.id, role: "host" },
    });
    const hosts = await db.creator.findMany({
      where: buildCreatorWhere({
        entities: [], role: "host", sort: "name", view: "cards", page: 1, q: `${P} HostExp`,
      }),
    });
    expect(hosts.map((h) => h.name)).toContain(`${P} HostExp`);
  });
});

describe("combined filtering", () => {
  it("location + interest + project role combine with AND semantics", async () => {
    const location = await db.entity.create({
      data: { kind: "location", name: `${P}ville`, slug: slugify(`${P}ville`) },
    });
    const interest = await db.entity.create({
      data: { kind: "interest", name: `${P} Karting`, slug: slugify(`${P} Karting`) },
    });
    const match = await db.creator.create({
      data: { name: `${P} FullMatch`, slug: slugify(`${P} FullMatch`) },
    });
    const partial = await db.creator.create({
      data: { name: `${P} PartialMatch`, slug: slugify(`${P} PartialMatch`) },
    });
    const project = await db.project.create({
      data: { title: `${P} Filter Show`, slug: slugify(`${P} Filter Show`) },
    });
    for (const c of [match, partial]) {
      await db.creatorEntityLink.create({
        data: { creatorId: c.id, entityId: location.id, relationship: "based_in" },
      });
    }
    await db.creatorEntityLink.create({
      data: { creatorId: match.id, entityId: interest.id, relationship: "" },
    });
    await db.creatorProjectCredit.create({
      data: { creatorId: match.id, projectId: project.id, role: "host" },
    });

    const results = await db.creator.findMany({
      where: buildCreatorWhere({
        entities: [location.id, interest.id], role: "host",
        sort: "name", view: "cards", page: 1,
      }),
    });
    const names = results.map((r) => r.name);
    expect(names).toContain(`${P} FullMatch`);
    expect(names).not.toContain(`${P} PartialMatch`);
  });
});

describe("duplicate prevention", () => {
  it("similar organization names are flagged", () => {
    expect(nameSimilarity("Fulwell", "Fulwell 73")).toBeGreaterThanOrEqual(0.6);
    expect(nameSimilarity("Ironbark", "Ironbark Pictures")).toBeGreaterThanOrEqual(0.6);
    expect(nameSimilarity("Netflix", "Hearthstone Grills")).toBeLessThan(0.5);
  });
  it("slugs stay unique under collision", () => {
    const taken = new Set(["maya-delgado"]);
    expect(uniqueSlug("Maya Delgado", taken)).toBe("maya-delgado-2");
  });
});

describe("entity merge", () => {
  it("relationships survive a merge and the old name becomes an alias", async () => {
    const keep = await db.entity.create({
      data: { kind: "interest", name: `${P} Canonical`, slug: slugify(`${P} Canonical`) },
    });
    const dupe = await db.entity.create({
      data: { kind: "interest", name: `${P} Dupe`, slug: slugify(`${P} Dupe`) },
    });
    const onlyDupe = await db.creator.create({
      data: { name: `${P} OnDupe`, slug: slugify(`${P} OnDupe`) },
    });
    const onBoth = await db.creator.create({
      data: { name: `${P} OnBoth`, slug: slugify(`${P} OnBoth`) },
    });
    await db.creatorEntityLink.create({ data: { creatorId: onlyDupe.id, entityId: dupe.id, relationship: "" } });
    await db.creatorEntityLink.create({ data: { creatorId: onBoth.id, entityId: dupe.id, relationship: "" } });
    await db.creatorEntityLink.create({ data: { creatorId: onBoth.id, entityId: keep.id, relationship: "" } });

    await mergeEntitiesCore(dupe.id, keep.id);

    const remaining = await db.entity.findUnique({
      where: { id: keep.id },
      include: { creatorLinks: true },
    });
    expect(await db.entity.findUnique({ where: { id: dupe.id } })).toBeNull();
    expect(remaining?.aliases).toContain(`${P} Dupe`);
    expect(remaining?.creatorLinks.map((l) => l.creatorId).sort()).toEqual(
      [onlyDupe.id, onBoth.id].sort(),
    );
  });
});

describe("saved views are dynamic", () => {
  it("a stored filter query returns newly matching creators automatically", async () => {
    const entity = await db.entity.create({
      data: { kind: "interest", name: `${P} SavedViewTopic`, slug: slugify(`${P} SavedViewTopic`) },
    });
    // The saved view stores only the querystring — results come from a live query.
    const savedQuery = { entities: [entity.id], sort: "name", view: "cards" as const, page: 1 };
    const before = await db.creator.findMany({ where: buildCreatorWhere(savedQuery) });
    expect(before).toHaveLength(0);

    const creator = await db.creator.create({
      data: { name: `${P} LateArrival`, slug: slugify(`${P} LateArrival`) },
    });
    await db.creatorEntityLink.create({
      data: { creatorId: creator.id, entityId: entity.id, relationship: "" },
    });
    const after = await db.creator.findMany({ where: buildCreatorWhere(savedQuery) });
    expect(after.map((c) => c.name)).toContain(`${P} LateArrival`);
  });
});

describe("permissions", () => {
  it("viewers cannot pass editor/admin gates; editors cannot pass admin gates", () => {
    const viewer = { id: "1", email: "v@x", name: "V", role: "VIEWER" as const };
    const editor = { id: "2", email: "e@x", name: "E", role: "EDITOR" as const };
    const admin = { id: "3", email: "a@x", name: "A", role: "ADMIN" as const };
    expect(hasRole(viewer, "EDITOR")).toBe(false);
    expect(hasRole(viewer, "ADMIN")).toBe(false);
    expect(hasRole(editor, "EDITOR")).toBe(true);
    expect(hasRole(editor, "ADMIN")).toBe(false);
    expect(hasRole(admin, "ADMIN")).toBe(true);
    expect(hasRole(null, "VIEWER")).toBe(false);
  });
});

describe("optimistic concurrency", () => {
  it("a stale edit cannot silently overwrite newer data", async () => {
    const creator = await db.creator.create({
      data: { name: `${P} Concurrent`, slug: slugify(`${P} Concurrent`) },
    });
    const staleVersion = creator.version;

    // Another editor saves first: version increments.
    await db.creator.update({
      where: { id: creator.id, version: staleVersion },
      data: { headline: "Edited by someone else", version: { increment: 1 } },
    });

    // The stale write targets the old version and must not match anything.
    await expect(
      db.creator.update({
        where: { id: creator.id, version: staleVersion },
        data: { headline: "Stale overwrite", version: { increment: 1 } },
      }),
    ).rejects.toThrow();

    const final = await db.creator.findUnique({ where: { id: creator.id } });
    expect(final?.headline).toBe("Edited by someone else");
  });
});

describe("AI tool safety", () => {
  it("exposes no write tools", () => {
    const names = AI_TOOLS.map((t) => t.schema.name);
    for (const name of names) {
      expect(name).toMatch(/^(search|get|find)_/);
    }
  });

  it("rejects structurally malicious input instead of passing it to the ORM", async () => {
    const search = toolByName("search_creators")!;
    // Object injection into a string field must fail validation.
    expect(() =>
      search.input.parse({ query: { contains: "x", mode: "insensitive" } }),
    ).toThrow();
    // Oversized limits are clamped server-side.
    const registry = new ResultRegistry();
    const parsed = search.input.parse({ limit: 99999 });
    const results = (await search.run(parsed as never, registry)) as { results: unknown[] };
    expect(results.results.length).toBeLessThanOrEqual(25);
  });
});
