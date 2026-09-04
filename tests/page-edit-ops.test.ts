// The update panel's wider reach: renaming a page, removing a connection,
// bringing a record back from the Archive, and moving a page to a different
// part of the Repo with everything on it. Each is checked as an op the model
// can propose, as a sentence the reviewer reads, and as a real change that
// can be put back.

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { slugify } from "@/lib/slug";
import { proposedOpSchema, validateOp, describeOpVocabulary, splitList, type ProposedOp } from "@/lib/ingest/ops";
import { describeOp } from "@/lib/ingest/describe";
import { movedTo, canConvert } from "@/lib/conversions";
import { pageUpdateContext } from "@/lib/page-update";

const db = new PrismaClient();
const P = "ZZPageOps";
const user = { id: "u-pageops-test", name: "Page Ops", role: "EDITOR" } as never;
const base = { confidence: 0.9, rationale: "from the test", evidence: ["quoted evidence"], sensitive: false };
const parse = (raw: object) => validateOp(proposedOpSchema.parse({ ...base, ...raw }));

beforeAll(async () => {
  await db.user.upsert({
    where: { id: "u-pageops-test" },
    update: {},
    create: { id: "u-pageops-test", email: "zz-pageops@example.test", name: "Page Ops", role: "EDITOR", passwordHash: "x" },
  });
});

afterAll(async () => {
  await db.ingestItem.deleteMany({ where: { filename: { startsWith: P } } });
  await db.project.deleteMany({ where: { title: { startsWith: P } } });
  await db.format.deleteMany({ where: { title: { startsWith: P } } });
  await db.creator.deleteMany({ where: { name: { startsWith: P } } });
  await db.industryPerson.deleteMany({ where: { name: { startsWith: P } } });
  await db.organization.deleteMany({ where: { name: { startsWith: P } } });
  await db.channel.deleteMany({ where: { name: { startsWith: P } } });
  await db.user.deleteMany({ where: { id: "u-pageops-test" } });
  await db.$disconnect();
});

describe("the op vocabulary", () => {
  it("accepts a rename and refuses a no-op or an entity", () => {
    expect(parse({ op: "rename", targetType: "project", targetName: "Old", newName: "  New  " })).toMatchObject({ ok: true, op: { newName: "New" } });
    expect(parse({ op: "rename", targetType: "project", targetName: "Same", newName: "Same" }).ok).toBe(false);
    expect(parse({ op: "rename", targetType: "entity", targetName: "Golf", newName: "Golfing" }).ok).toBe(false);
  });

  it("accepts unlink for any ingest link kind, including the two new ones", () => {
    expect(parse({ op: "unlink", kind: "creator_person", aName: "A", bName: "B", role: "Agent" })).toMatchObject({ ok: true, op: { role: "agent" } });
    expect(parse({ op: "link", kind: "person_org", aName: "A", bName: "B", role: "Executive" })).toMatchObject({ ok: true, op: { role: "executive" } });
    expect(parse({ op: "link", kind: "channel_creator", aName: "A", bName: "B" }).ok).toBe(true);
    expect(() => proposedOpSchema.parse({ ...base, op: "unlink", kind: "nope", aName: "A", bName: "B" })).toThrow();
  });

  it("only allows the moves that make sense", () => {
    expect(canConvert("format", "project")).toBe(true);
    expect(canConvert("creator", "person")).toBe(true);
    expect(canConvert("project", "channel")).toBe(true);
    expect(canConvert("organization", "project")).toBe(false);
    expect(parse({ op: "convert", targetType: "format", targetName: "X", toType: "project", fields: { status: "Released", nonsense: "y" } }))
      .toMatchObject({ ok: true, op: { fields: { status: "released" } } });
    expect(parse({ op: "convert", targetType: "format", targetName: "X", toType: "person" }).ok).toBe(false);
    expect(parse({ op: "restore", targetType: "entity", targetName: "X" }).ok).toBe(false);
    expect(parse({ op: "restore", targetType: "format", targetName: "X" }).ok).toBe(true);
  });

  it("reads list fields out of prose and keeps only known vocabulary", () => {
    expect(splitList("brand, agency; podcast company\nbrand")).toEqual(["brand", "agency", "podcast company"]);
    const types = parse({ op: "update", targetType: "organization", targetName: "X", field: "types", value: "Brand, Agency, Unicorn Farm" });
    expect(types).toMatchObject({ ok: true, op: { value: "brand, agency" } });
    expect(parse({ op: "update", targetType: "organization", targetName: "X", field: "types", value: "Unicorn Farm" }).ok).toBe(false);
    const aliases = parse({ op: "update", targetType: "creator", targetName: "X", field: "aliases", value: "The Kid; TK" });
    expect(aliases).toMatchObject({ ok: true, op: { value: "The Kid, TK" } });
  });

  it("explains the new ops to the model and to the reviewer", () => {
    const vocab = describeOpVocabulary();
    expect(vocab).toContain("- convert:");
    expect(vocab).toContain("format→project/channel");
    expect(vocab).toContain("- unlink:");
    expect(vocab).toContain("types (comma-separated, each one of:");
    const ctx = pageUpdateContext({ recordType: "format", name: "X", path: "/formats/x", today: "2026-09-04" });
    for (const word of ['"rename"', '"convert"', '"unlink"', '"restore"', "start the page over"]) expect(ctx).toContain(word);

    expect(describeOp({ ...base, op: "rename", targetType: "project", targetName: "Old", newName: "New" } as ProposedOp)).toBe('Rename Old to "New"');
    expect(describeOp({ ...base, op: "convert", targetType: "format", targetName: "Show", toType: "project" } as ProposedOp)).toContain("Move Show to Projects");
    expect(describeOp({ ...base, op: "convert", targetType: "person", targetName: "Sam", toType: "creator" } as ProposedOp)).toContain("Move Sam to Talent");
    expect(describeOp({ ...base, op: "unlink", kind: "creator_person", aName: "Sam", bName: "Alex", role: "agent" } as ProposedOp)).toBe("Remove the connection between Sam and Alex (Agent)");
    expect(describeOp({ ...base, op: "restore", targetType: "format", targetName: "Show" } as ProposedOp)).toBe("Bring Show back out of the Archive");
  });

  it("recognises a forwarding address and nothing else", () => {
    expect(movedTo("Moved to /projects/the-show")).toBe("/projects/the-show");
    expect(movedTo("Moved to /projects/the-show — see there")).toBe("/projects/the-show");
    expect(movedTo("Project cancelled")).toBeNull();
    expect(movedTo("Moved to https://evil.example")).toBeNull();
    expect(movedTo(null)).toBeNull();
  });
});

async function applyBatch(filename: string, changes: object[]) {
  const item = await db.ingestItem.create({ data: { kind: "text", filename, status: "proposed" } });
  await db.ingestChange.createMany({
    data: changes.map((c, i) => ({
      itemId: item.id, sortOrder: i + 1, group: "Test", status: "approved", confidence: 0.9,
      destination: {}, ...(c as object),
    })) as never,
  });
  const { applyIngestChangesCore } = await import("@/lib/ingest/apply");
  const outcome = await applyIngestChangesCore(item.id, user);
  const rows = await db.ingestChange.findMany({ where: { itemId: item.id }, orderBy: { sortOrder: "asc" } });
  return { item, outcome, rows };
}

describe("applying the new ops", () => {
  it("renames in place: same address, old name kept as an alias", async () => {
    const project = await db.project.create({ data: { title: `${P} Working Title`, slug: slugify(`${P} working title`), status: "announced" } });
    const { outcome, rows } = await applyBatch(`${P} rename`, [{
      opType: "rename",
      destination: { targetType: "project", targetId: project.id, field: "title", name: project.title, path: `/projects/${project.slug}` },
      before: project.title, after: `${P} Final Title`,
      payload: { ...base, op: "rename", targetType: "project", targetName: project.title, targetId: project.id, newName: `${P} Final Title` },
    }]);
    expect(outcome).toMatchObject({ applied: 1, failed: 0 });
    const after = await db.project.findUnique({ where: { id: project.id } });
    expect(after?.title).toBe(`${P} Final Title`);
    expect(after?.slug).toBe(project.slug);
    expect(after?.aliases).toContain(`${P} Working Title`);
    expect(after?.version).toBe(project.version + 1);
    // Undo uses the field + before like any other update.
    expect(rows[0].status).toBe("applied");
  });

  it("a rename does not make the edits after it look superseded", async () => {
    const project = await db.project.create({ data: { title: `${P} Rename Then Edit`, slug: slugify(`${P} rename then edit`), status: "announced", logline: "old" } });
    const { outcome } = await applyBatch(`${P} rename-edit`, [{
      opType: "rename", destination: { targetType: "project", targetId: project.id, field: "title", name: project.title }, before: project.title, after: `${P} Renamed Then Edited`,
      payload: { ...base, op: "rename", targetType: "project", targetName: project.title, targetId: project.id, newName: `${P} Renamed Then Edited` },
    }, {
      opType: "update", destination: { targetType: "project", targetId: project.id, field: "logline", name: project.title }, after: "new",
      payload: { ...base, op: "update", targetType: "project", targetName: project.title, targetId: project.id, field: "logline", value: "new", expectedVersion: project.version },
    }]);
    expect(outcome).toMatchObject({ applied: 2, failed: 0, superseded: 0 });
    expect(await db.project.findUnique({ where: { id: project.id } })).toMatchObject({ title: `${P} Renamed Then Edited`, logline: "new" });
  });

  it("refuses to rename something that is not on record, rather than creating it", async () => {
    const { outcome } = await applyBatch(`${P} rename-missing`, [{
      opType: "rename", destination: { targetType: "project", field: "title", name: `${P} Ghost` }, after: "x",
      payload: { ...base, op: "rename", targetType: "project", targetName: `${P} Ghost`, newName: `${P} Ghost 2` },
    }]);
    expect(outcome).toMatchObject({ applied: 0, failed: 1 });
    expect(await db.project.count({ where: { title: { startsWith: `${P} Ghost` } } })).toBe(0);
  });

  it("removes a connection and keeps what it removed for undo", async () => {
    const creator = await db.creator.create({ data: { name: `${P} Athlete`, slug: slugify(`${P} athlete`), status: "active" } });
    const person = await db.industryPerson.create({ data: { name: `${P} Agent`, slug: slugify(`${P} agent`), roleType: "agent" } });
    await db.creatorPerson.create({ data: { creatorId: creator.id, personId: person.id, relationship: "agent" } });
    const { outcome, rows } = await applyBatch(`${P} unlink`, [{
      opType: "unlink", destination: { targetType: "creator", targetId: creator.id, linkKind: "creator_person", name: creator.name },
      after: { kind: "creator_person", a: creator.name, b: person.name, role: "agent", removed: true },
      payload: { ...base, op: "unlink", kind: "creator_person", aName: creator.name, aId: creator.id, bName: person.name, bId: person.id, role: "agent" },
    }]);
    expect(outcome).toMatchObject({ applied: 1, failed: 0 });
    expect(await db.creatorPerson.count({ where: { creatorId: creator.id, personId: person.id } })).toBe(0);
    expect(rows[0].before).toMatchObject({ kind: "creator_person", creatorId: creator.id, personId: person.id });
    // And a channel's athlete can be set and cleared through the link engine.
    const channel = await db.channel.create({ data: { name: `${P} Channel`, slug: slugify(`${P} channel`), status: "prospect" } });
    const { upsertLink, deleteLink } = await import("@/lib/link-core");
    await upsertLink({ kind: "channel_creator", channelId: channel.id, creatorId: creator.id });
    expect((await db.channel.findUnique({ where: { id: channel.id } }))?.creatorId).toBe(creator.id);
    await deleteLink({ kind: "channel_creator", channelId: channel.id, creatorId: creator.id });
    expect((await db.channel.findUnique({ where: { id: channel.id } }))?.creatorId).toBeNull();
  });

  it("brings a record back from the Archive with a live status", async () => {
    const format = await db.format.create({
      data: { title: `${P} Shelved`, slug: slugify(`${P} shelved`), status: "archived", formatType: "docuseries", archived: true, archivedReason: "Dropped", archivedAt: new Date(), ownerId: "u-pageops-test" },
    });
    const { outcome } = await applyBatch(`${P} restore`, [{
      opType: "restore", destination: { targetType: "format", field: "archived", name: format.title }, before: true, after: { archived: false },
      payload: { ...base, op: "restore", targetType: "format", targetName: format.title },
    }]);
    expect(outcome).toMatchObject({ applied: 1, failed: 0 });
    const after = await db.format.findUnique({ where: { id: format.id } });
    expect(after).toMatchObject({ archived: false, archivedReason: null, status: "concept" });
  });

  it("moves a format to Projects with everything on it, and can move it back", async () => {
    const creator = await db.creator.create({ data: { name: `${P} Star`, slug: slugify(`${P} star`), status: "active" } });
    const org = await db.organization.create({ data: { name: `${P} Studio`, slug: slugify(`${P} studio`) } });
    const format = await db.format.create({
      data: {
        title: `${P} The Show`, slug: slugify(`${P} the show`), status: "sold", formatType: "docuseries",
        logline: "old logline", notes: "format notes", ownerId: "u-pageops-test",
        creators: { create: { creatorId: creator.id, isPrimary: true } },
        organizations: { create: { organizationId: org.id, relationship: "partner" } },
      },
    });
    await db.favorite.create({ data: { userId: "u-pageops-test", targetType: "format", targetId: format.id } });

    // An update and a move in one batch: the edit lands before the move and is carried across.
    const { outcome, rows } = await applyBatch(`${P} convert`, [{
      opType: "convert", destination: { targetType: "format", targetId: format.id, name: format.title, path: `/formats/${format.slug}` },
      after: { movedTo: "project", name: format.title },
      payload: { ...base, op: "convert", targetType: "format", targetName: format.title, targetId: format.id, toType: "project", fields: { status: "airing", role: "host" } },
    }, {
      opType: "update", destination: { targetType: "format", targetId: format.id, field: "logline", name: format.title },
      after: "new logline",
      payload: { ...base, op: "update", targetType: "format", targetName: format.title, targetId: format.id, field: "logline", value: "new logline", expectedVersion: format.version },
    }]);
    expect(outcome).toMatchObject({ applied: 2, failed: 0, superseded: 0 });

    const project = await db.project.findFirst({
      where: { title: format.title },
      include: { credits: true, organizations: true },
    });
    expect(project).toBeTruthy();
    expect(project).toMatchObject({ status: "airing", logline: "new logline", internalNotes: "format notes", projectType: "docuseries" });
    expect(project!.credits).toEqual([expect.objectContaining({ creatorId: creator.id, role: "host" })]);
    expect(project!.organizations).toEqual([expect.objectContaining({ organizationId: org.id, relationship: "production_company" })]);
    expect(project!.organizations[0].note).toContain("Partner");
    expect(await db.favorite.findFirst({ where: { userId: "u-pageops-test", targetType: "project", targetId: project!.id } })).toBeTruthy();

    const old = await db.format.findUnique({ where: { id: format.id } });
    expect(old).toMatchObject({ archived: true, archivedReason: `Moved to /projects/${project!.slug}` });
    expect(movedTo(old!.archivedReason)).toBe(`/projects/${project!.slug}`);
    const moveRow = rows.find((r) => r.opType === "convert")!;
    expect(moveRow.destination).toMatchObject({ movedToType: "project", movedToId: project!.id });
    expect(moveRow.after).toMatchObject({ movedTo: "project", path: `/projects/${project!.slug}` });
    expect(outcome.touched.map((t) => t.targetType).sort()).toEqual(["format", "project"]);

    // Put it back.
    const { revertConversion } = await import("@/lib/convert");
    await revertConversion({ type: "format", id: format.id }, { type: "project", id: project!.id });
    expect(await db.project.findUnique({ where: { id: project!.id } })).toBeNull();
    expect(await db.format.findUnique({ where: { id: format.id } })).toMatchObject({ archived: false, archivedReason: null });
    expect(await db.favorite.findFirst({ where: { userId: "u-pageops-test", targetType: "format", targetId: format.id } })).toBeTruthy();
    expect(await db.creatorFormat.count({ where: { formatId: format.id } })).toBe(1);
  });

  it("moves talent to Industry People, keeping what has no home in the notes", async () => {
    const org = await db.organization.create({ data: { name: `${P} Agency`, slug: slugify(`${P} agency`) } });
    const golf = await db.entity.upsert({ where: { kind_slug: { kind: "sport", slug: `${P.toLowerCase()}-golf` } }, update: {}, create: { name: `${P} Golf`, slug: `${P.toLowerCase()}-golf`, kind: "sport" } });
    const creator = await db.creator.create({
      data: {
        name: `${P} Not Talent`, slug: slugify(`${P} not talent`), status: "active", headline: "Head of Talent at the agency",
        organizations: { create: { organizationId: org.id, relationship: "team_member" } },
        entityLinks: { create: { entityId: golf.id } },
      },
    });
    const { outcome } = await applyBatch(`${P} convert-person`, [{
      opType: "convert", destination: { targetType: "creator", targetId: creator.id, name: creator.name },
      after: { movedTo: "person", name: creator.name },
      payload: { ...base, op: "convert", targetType: "creator", targetName: creator.name, targetId: creator.id, toType: "person", fields: { roleType: "executive" } },
    }]);
    expect(outcome).toMatchObject({ applied: 1, failed: 0 });
    const person = await db.industryPerson.findFirst({ where: { name: creator.name }, include: { organizations: true } });
    expect(person).toMatchObject({ roleType: "executive", title: "Head of Talent at the agency" });
    expect(person!.organizations).toEqual([expect.objectContaining({ organizationId: org.id })]);
    expect(person!.notes).toContain(`${P} Golf`);
    expect((await db.creator.findUnique({ where: { id: creator.id } }))?.archived).toBe(true);
    await db.entity.delete({ where: { id: golf.id } }).catch(() => {});
  });

  it("refuses to move a page that is already in the Archive", async () => {
    const format = await db.format.create({
      data: { title: `${P} Already Gone`, slug: slugify(`${P} already gone`), status: "concept", formatType: "docuseries", archived: true, ownerId: "u-pageops-test" },
    });
    const { outcome, rows } = await applyBatch(`${P} convert-archived`, [{
      opType: "convert", destination: { targetType: "format", targetId: format.id, name: format.title }, after: {},
      payload: { ...base, op: "convert", targetType: "format", targetName: format.title, targetId: format.id, toType: "project" },
    }]);
    expect(outcome).toMatchObject({ applied: 0, failed: 1 });
    expect(rows[0].error).toContain("Archive");
  });
});
