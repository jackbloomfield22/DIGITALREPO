// A changes file — proposals written outside the site — must land on the
// review board exactly as the model's would: names resolved, current values
// captured, the already-true dropped, and the rest applicable and undoable.

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { slugify } from "@/lib/slug";
import { refreshDigest } from "@/lib/ingest/digest";
import { CHANGES_FILE_KIND, loadChangesFile, parseChangesFile } from "@/lib/ingest/changes-file";
import { proposeItemCore } from "@/lib/ingest/pipeline";

const db = new PrismaClient();
const P = "ZZChanges";
const user = { id: "u-changes-test", name: "Changes Tester", role: "EDITOR" } as never;
const base = { confidence: 0.9, rationale: "the owner said so", evidence: ["the owner's words"], sensitive: false };

beforeAll(async () => {
  await db.user.upsert({
    where: { id: "u-changes-test" },
    update: {},
    create: { id: "u-changes-test", email: "zz-changes@example.test", name: "Changes Tester", role: "EDITOR", passwordHash: "x" },
  });
});
afterAll(async () => {
  await db.ingestItem.deleteMany({ where: { filename: { startsWith: P } } });
  await db.project.deleteMany({ where: { title: { startsWith: P } } });
  await db.format.deleteMany({ where: { title: { startsWith: P } } });
  await db.organization.deleteMany({ where: { name: { startsWith: P } } });
  await db.knowledgeDigest.deleteMany({ where: { name: { startsWith: P } } });
  await db.user.deleteMany({ where: { id: "u-changes-test" } });
  await db.$disconnect();
});

describe("recognising a changes file", () => {
  it("accepts the marked shape and nothing else", () => {
    expect(parseChangesFile(JSON.stringify({ kind: CHANGES_FILE_KIND, changes: [] }))).toMatchObject({ version: 1, changes: [] });
    expect(parseChangesFile(JSON.stringify({ kind: CHANGES_FILE_KIND, version: 1, title: "  Slate fixes  ", changes: [{}] }))?.title).toBe("Slate fixes");
    expect(parseChangesFile(JSON.stringify({ changes: [] }))).toBeNull();
    expect(parseChangesFile(JSON.stringify({ kind: CHANGES_FILE_KIND }))).toBeNull();
    expect(parseChangesFile("not json")).toBeNull();
    expect(parseChangesFile("[]")).toBeNull();
  });
});

describe("loading a changes file", () => {
  it("lands on the review board resolved, captured, and applicable", async () => {
    const project = await db.project.create({ data: { title: `${P} Grit`, slug: slugify(`${P} grit`), status: "announced", logline: "old" } });
    const format = await db.format.create({ data: { title: `${P} Open Water`, slug: slugify(`${P} open water`), status: "pitching", formatType: "docuseries", ownerId: "u-changes-test" } });
    const org = await db.organization.create({ data: { name: `${P} Netflix`, slug: slugify(`${P} netflix`) } });
    await refreshDigest("project", project.id);
    await refreshDigest("format", format.id);
    await refreshDigest("organization", org.id);

    const file = parseChangesFile(JSON.stringify({
      kind: CHANGES_FILE_KIND, version: 1, title: `${P} batch one`, source: "netflix passed. open water is a real show now.",
      changes: [
        { ...base, op: "update", targetType: "project", targetName: `${P} grit`, field: "status", value: "cancelled", evidence: ["netflix passed"] },
        { ...base, op: "update", targetType: "project", targetName: `${P} Grit`, field: "logline", value: "old" }, // already true → dropped
        { ...base, op: "link", kind: "project_org", aName: `${P} Grit`, bName: `${P} Netflix`, role: "streamer" },
        { ...base, op: "convert", targetType: "format", targetName: `${P} Open Water`, toType: "project", fields: { status: "airing" }, evidence: ["open water is a real show now"] },
        { ...base, op: "update", targetType: "project", targetName: `${P} Grit`, field: "status", value: "not-a-status" }, // invalid vocabulary
        { op: "update", nonsense: true }, // malformed
      ],
    }))!;
    const loaded = await loadChangesFile("u-changes-test", file, `${P}.json`, null);
    expect(loaded).toMatchObject({ stored: 3, malformed: 1, dropped: 1 });
    expect(loaded.invalid).toHaveLength(1);

    const item = await db.ingestItem.findUnique({ where: { id: loaded.itemId } });
    expect(item).toMatchObject({ kind: "changes", status: "proposed", filename: `${P} batch one` });
    const rows = await db.ingestChange.findMany({ where: { itemId: loaded.itemId }, orderBy: { sortOrder: "asc" } });
    expect(rows.map((r) => r.opType)).toEqual(["update", "link", "convert"]);
    // The name resolved to the record (case-insensitively) and the current value was captured for the diff.
    expect(rows[0].destination).toMatchObject({ targetId: project.id, field: "status", path: `/projects/${project.slug}` });
    expect(rows[0].before).toBe("announced");
    expect((rows[0].evidence as { start: number }[])[0].start).toBeGreaterThanOrEqual(0);
    expect(rows[2].destination).toMatchObject({ targetId: format.id });

    // Re-running propose over a loaded file must not touch its proposals.
    const rerun = await proposeItemCore(loaded.itemId, async () => { throw new Error("the model must not be called"); });
    expect(rerun).toEqual({ ok: true, status: "proposed" });
    expect(await db.ingestChange.count({ where: { itemId: loaded.itemId } })).toBe(3);

    // And they apply like any other proposals.
    await db.ingestChange.updateMany({ where: { itemId: loaded.itemId }, data: { status: "approved" } });
    const { applyIngestChangesCore } = await import("@/lib/ingest/apply");
    const outcome = await applyIngestChangesCore(loaded.itemId, user);
    expect(outcome).toMatchObject({ applied: 3, failed: 0 });
    expect((await db.project.findUnique({ where: { id: project.id }, include: { organizations: true } }))).toMatchObject({
      status: "cancelled", organizations: [expect.objectContaining({ organizationId: org.id, relationship: "streamer" })],
    });
    expect(await db.project.findFirst({ where: { title: `${P} Open Water` } })).toMatchObject({ status: "airing" });
    expect((await db.format.findUnique({ where: { id: format.id } }))?.archived).toBe(true);
  });

  it("prefers a live record over an archived namesake", async () => {
    const dead = await db.project.create({ data: { title: `${P} Twin`, slug: slugify(`${P} twin a`), status: "cancelled", archived: true } });
    const live = await db.project.create({ data: { title: `${P} Twin`, slug: slugify(`${P} twin b`), status: "announced" } });
    await refreshDigest("project", dead.id);
    await refreshDigest("project", live.id);
    const file = parseChangesFile(JSON.stringify({ kind: CHANGES_FILE_KIND, changes: [
      { ...base, op: "update", targetType: "project", targetName: `${P} Twin`, field: "status", value: "airing" },
    ] }))!;
    const loaded = await loadChangesFile("u-changes-test", file, `${P} twins.json`, null);
    const row = await db.ingestChange.findFirst({ where: { itemId: loaded.itemId } });
    expect(row?.destination).toMatchObject({ targetId: live.id });
  });
});
