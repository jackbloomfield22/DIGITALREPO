// Inline editing and merging: values are coerced for their column, a stale
// version is refused rather than overwritten, and a merge re-points every
// relationship at the record that stays while the other goes to the Archive
// with a pointer back.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { coerceField, detailFields, plainValue, sameValue } from "@/lib/record-fields";
import { RECORD_REGISTRY } from "@/lib/ingest/registry";
import { mergeRecordsCore, mergedInto, foreignKeysTo, possibleDuplicates } from "@/lib/merge-records";
import { clearDigestMemo, refreshDigest } from "@/lib/ingest/digest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// A real user row: audit entries carry a foreign key to the editor.
const editor = { id: "", name: "Test Editor", email: "editor@test.local", role: "EDITOR" as const };
vi.mock("@/lib/auth", () => ({
  requireRole: async () => editor,
  requireUser: async () => editor,
  hasRole: () => true,
}));

const db = new PrismaClient();
const P = "ZZInline";

async function cleanup() {
  await db.creator.deleteMany({ where: { name: { startsWith: P } } });
  await db.format.deleteMany({ where: { title: { startsWith: P } } });
  await db.organization.deleteMany({ where: { name: { startsWith: P } } });
  await db.$executeRawUnsafe(`DELETE FROM "AppSetting" WHERE key LIKE 'merged:%' AND value->>'name' LIKE '${P}%'`);
  await db.auditLog.deleteMany({ where: { targetLabel: { startsWith: P } } });
  await db.knowledgeDigest.deleteMany({ where: { name: { startsWith: P } } });
}

beforeAll(async () => {
  await cleanup();
  const user = await db.user.upsert({ where: { email: editor.email }, update: { name: editor.name }, create: { email: editor.email, name: editor.name, role: "EDITOR", passwordHash: "x" } });
  editor.id = user.id;
});
afterAll(async () => { await cleanup(); await db.$disconnect(); });

describe("coerceField", () => {
  const spec = RECORD_REGISTRY.format;
  const f = (name: string) => spec.fields.find((x) => x.name === name)!;
  it("empties become null, numbers parse, dates keep the day", () => {
    expect(coerceField(f("targetPlatform"), "  ")).toEqual({ ok: true, value: null, plain: null });
    expect(coerceField(RECORD_REGISTRY.project.fields.find((x) => x.name === "seasons")!, "3")).toEqual({ ok: true, value: 3, plain: 3 });
    const d = coerceField(f("lastActivityAt"), "2026-03-04");
    expect(d.ok && d.plain).toBe("2026-03-04");
    expect(d.ok && (d.value as Date).toISOString()).toBe("2026-03-04T00:00:00.000Z");
  });
  it("refuses a value outside a vocabulary and a list item outside its vocabulary", () => {
    expect(coerceField(f("status"), "made_up").ok).toBe(false);
    expect(coerceField(f("status"), "developing")).toEqual({ ok: true, value: "developing", plain: "developing" });
    const types = RECORD_REGISTRY.organization.fields.find((x) => x.name === "types")!;
    expect(coerceField(types, "brand, nonsense").ok).toBe(false);
    expect(coerceField(types, ["brand", "brand"])).toEqual({ ok: true, value: ["brand"], plain: ["brand"] });
  });
  it("aliases split on commas and newlines", () => {
    const aliases = RECORD_REGISTRY.creator.fields.find((x) => x.name === "aliases")!;
    expect(coerceField(aliases, "AD,  The Brow\nAnthony")).toEqual({ ok: true, value: ["AD", "The Brow", "Anthony"], plain: ["AD", "The Brow", "Anthony"] });
  });
  it("plainValue and sameValue treat empty, null and [] as the same thing", () => {
    expect(sameValue(null, "")).toBe(true);
    expect(sameValue([], null)).toBe(true);
    expect(sameValue(["a"], ["a"])).toBe(true);
    expect(sameValue("1", 1)).toBe(true);
    expect(plainValue("date", new Date("2026-01-02T15:00:00Z"))).toBe("2026-01-02");
  });
  it("detailFields carries options for vocabularies and plain values for the record", () => {
    const fields = detailFields("format", { status: "concept", lastActivityAt: new Date("2026-05-06T00:00:00Z"), title: "x" });
    const status = fields.find((f) => f.name === "status")!;
    expect(status.options?.some((o) => o.value === "in_production")).toBe(true);
    expect(fields.find((f) => f.name === "lastActivityAt")!.value).toBe("2026-05-06");
  });
});

describe("setField", () => {
  it("writes, audits, bumps the version, skips an unchanged value and refuses a stale version", async () => {
    const { setField } = await import("@/lib/actions/inline");
    const format = await db.format.create({ data: { slug: `${P.toLowerCase()}-set-${Date.now()}`, title: `${P} Set Field`, status: "idea" } });
    const first = await setField({ type: "format", id: format.id, field: "targetPlatform", value: " Netflix ", expectedVersion: format.version });
    expect(first).toMatchObject({ ok: true, changed: true, value: "Netflix", version: format.version + 1 });
    const again = await setField({ type: "format", id: format.id, field: "targetPlatform", value: "Netflix", expectedVersion: format.version + 1 });
    expect(again).toMatchObject({ ok: true, changed: false, version: format.version + 1 });
    const stale = await setField({ type: "format", id: format.id, field: "targetPlatform", value: "Hulu", expectedVersion: format.version });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.conflict).toMatchObject({ editedBy: "Test Editor", version: format.version + 1 });
    const stored = await db.format.findUnique({ where: { id: format.id } });
    expect(stored?.targetPlatform).toBe("Netflix");
    const audit = await db.auditLog.findFirst({ where: { targetType: "format", targetId: format.id, field: "targetPlatform" } });
    expect(audit?.newValue).toBe("Netflix");
    const bad = await setField({ type: "format", id: format.id, field: "status", value: "nope" });
    expect(bad.ok).toBe(false);
    const renamed = await setField({ type: "format", id: format.id, field: "title", value: `${P} Renamed` });
    expect(renamed.ok).toBe(true);
    expect((await db.format.findUnique({ where: { id: format.id } }))?.slug).toBe(format.slug);
  });
});

describe("mergeRecordsCore", () => {
  it("finds every join table pointing at a model", () => {
    const refs = foreignKeysTo("Format");
    expect(refs.map((r) => r.model).sort()).toEqual(["CreatorFormat", "FormatEntityLink", "FormatOrganization", "FormatPerson", "OpportunityFormat"]);
  });

  it("re-points links, drops duplicates, copies picked values, aliases the loser and archives it with a pointer", async () => {
    const stamp = Date.now();
    const talent = await db.creator.create({ data: { slug: `${P.toLowerCase()}-t-${stamp}`, name: `${P} Talent` } });
    const talent2 = await db.creator.create({ data: { slug: `${P.toLowerCase()}-t2-${stamp}`, name: `${P} Talent Two` } });
    const org = await db.organization.create({ data: { slug: `${P.toLowerCase()}-o-${stamp}`, name: `${P} Org` } });
    const winner = await db.format.create({ data: { slug: `${P.toLowerCase()}-w-${stamp}`, title: `${P} Cook for Coach`, status: "developing", targetPlatform: "Netflix" } });
    const loser = await db.format.create({ data: { slug: `${P.toLowerCase()}-l-${stamp}`, title: `${P} Cook For Coach (dupe)`, status: "concept", location: "Los Angeles", logline: "Chefs cook for coaches" } });
    await db.creatorFormat.create({ data: { creatorId: talent.id, formatId: winner.id } });
    await db.creatorFormat.create({ data: { creatorId: talent.id, formatId: loser.id } }); // duplicate — dropped
    await db.creatorFormat.create({ data: { creatorId: talent2.id, formatId: loser.id } }); // moves
    await db.formatOrganization.create({ data: { formatId: loser.id, organizationId: org.id, relationship: "target" } });
    await db.favorite.create({ data: { userId: editor.id, targetType: "format", targetId: loser.id } });

    const outcome = await mergeRecordsCore({ type: "format", winnerId: winner.id, loserId: loser.id, picks: { location: "Los Angeles", logline: "Chefs cook for coaches" } }, editor);
    expect(outcome.relinked).toBe(2); // talent2's link and the company; the duplicate talent link is dropped
    expect(outcome.dropped).toBe(1);
    expect(outcome.copied).toEqual(["Location", "Logline"]);

    const w = await db.format.findUnique({ where: { id: winner.id }, include: { creators: true, organizations: true } });
    expect(w?.creators.map((c) => c.creatorId).sort()).toEqual([talent.id, talent2.id].sort());
    expect(w?.organizations).toHaveLength(1);
    expect(w?.location).toBe("Los Angeles");
    expect(w?.targetPlatform).toBe("Netflix");
    expect(w?.status).toBe("developing");
    expect(w?.version).toBe(winner.version + 1);
    const l = await db.format.findUnique({ where: { id: loser.id }, include: { creators: true } });
    expect(l?.archived).toBe(true);
    expect(l?.archivedReason).toBe(`Merged into ${P} Cook for Coach`);
    expect(l?.creators).toHaveLength(0);
    expect(l?.location).toBe("Los Angeles"); // untouched
    const pointer = await mergedInto("format", loser.id);
    expect(pointer).toMatchObject({ into: winner.id, name: `${P} Cook for Coach`, by: "Test Editor", href: `/formats/${winner.slug}` });
    expect(await db.favorite.count({ where: { targetType: "format", targetId: winner.id } })).toBe(1);
    const merged = await db.auditLog.findFirst({ where: { targetType: "format", targetId: loser.id, action: "merged" } });
    expect(merged?.newValue).toBe(`${P} Cook for Coach`);
    await db.favorite.deleteMany({ where: { targetType: "format", targetId: winner.id } });
  });

  it("keeps the loser's name as an alias where the model has aliases, and flags likely duplicates", async () => {
    const stamp = Date.now();
    const a = await db.organization.create({ data: { slug: `${P.toLowerCase()}-a-${stamp}`, name: `${P} Wasserman Media` } });
    const b = await db.organization.create({ data: { slug: `${P.toLowerCase()}-b-${stamp}`, name: `${P} Wasserman Media Group` } });
    await Promise.all([refreshDigest("organization", a.id), refreshDigest("organization", b.id)]);
    const dupes = await possibleDuplicates("organization", a.id, a.name);
    expect(dupes.map((d) => d.id)).toContain(b.id);
    clearDigestMemo();
    await mergeRecordsCore({ type: "organization", winnerId: a.id, loserId: b.id }, editor);
    const kept = await db.organization.findUnique({ where: { id: a.id } });
    expect(kept?.aliases).toContain(`${P} Wasserman Media Group`);
    expect(await possibleDuplicates("organization", a.id, a.name)).toEqual([]);
  });

  it("refuses to merge a record with itself", async () => {
    await expect(mergeRecordsCore({ type: "format", winnerId: "x", loserId: "x" }, editor)).rejects.toThrow(/different/);
  });
});
