// Options as rows, custom fields as definitions, and verification. The three
// things Phase 3 made editable from the UI, checked where they meet the
// database: a renamed option must not change what records store, a merged one
// must move every record and leave a pointer, a custom field must validate and
// filter like a real column, and Verify must stamp who and when.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const editor = { id: "", name: "Option Tester", email: "options@test.local", role: "EDITOR" as const };
vi.mock("@/lib/auth", () => ({
  requireRole: async () => editor,
  requireUser: async () => editor,
  hasRole: () => true,
  getSessionUser: async () => editor,
}));

import { optionList, optionLabel, setOptionCache } from "@/lib/option-cache";
import { ensureOption, optionUsage, primeOptions, OPTION_SETS } from "@/lib/options";
import { coerceCustom, customFieldMaps, customFilterFields, customSearchText, fieldDefinitions, bustFieldDefinitions, KIND_OF } from "@/lib/custom-fields";
import { filterWhere } from "@/lib/filter-where";
import { parseFilterParams } from "@/lib/filters";
import { statusOptionsFor } from "@/lib/row-status";

const db = new PrismaClient();
const P = "ZZOpt";
const SET = "zzopt_set";

async function cleanup() {
  await db.format.deleteMany({ where: { title: { startsWith: P } } });
  await db.organization.deleteMany({ where: { name: { startsWith: P } } });
  await db.creator.deleteMany({ where: { name: { startsWith: P } } });
  // Some of these tests add options to a real set (a status picker), so the
  // value prefix matters as much as the set key: without this the suite
  // leaves test statuses in the picker every time it runs.
  await db.option.deleteMany({ where: { OR: [{ setKey: { startsWith: "zzopt" } }, { value: { startsWith: "zzopt" } }] } });
  await db.fieldDefinition.deleteMany({ where: { key: { startsWith: "zzopt" } } });
  await db.auditLog.deleteMany({ where: { targetLabel: { contains: P } } });
  await db.knowledgeDigest.deleteMany({ where: { name: { startsWith: P } } });
}

beforeAll(async () => {
  await cleanup();
  const user = await db.user.upsert({ where: { email: editor.email }, update: { name: editor.name }, create: { email: editor.email, name: editor.name, role: "EDITOR", passwordHash: "x" } });
  editor.id = user.id;
});
afterAll(async () => { await cleanup(); await db.$disconnect(); });

describe("the option cache", () => {
  it("falls back to the code list until a set has rows, then prefers the rows", () => {
    setOptionCache([]);
    expect(optionList("format_status", [{ value: "idea", label: "Idea" }])).toEqual([{ value: "idea", label: "Idea" }]);
    setOptionCache([
      { id: "1", setKey: "format_status", value: "idea", label: "Spark", color: null, position: 0, archivedAt: null },
      { id: "2", setKey: "format_status", value: "dead", label: "Dead", color: null, position: 10, archivedAt: "2026-01-01T00:00:00.000Z" },
    ]);
    // The row's label wins; the archived one stays out of the picker but still resolves.
    expect(optionList("format_status", [{ value: "idea", label: "Idea" }])).toEqual([{ value: "idea", label: "Spark" }]);
    expect(optionLabel("dead")).toBe("Dead");
  });

  it("status pickers read the set and still hide archived", async () => {
    setOptionCache([
      { id: "1", setKey: "format_status", value: "idea", label: "Spark", color: null, position: 0, archivedAt: null },
      { id: "2", setKey: "format_status", value: "archived", label: "Archived", color: null, position: 10, archivedAt: null },
    ]);
    expect(statusOptionsFor("format").map((s) => s.value)).toEqual(["idea"]);
    await primeOptions(true);
  });
});

describe("ensureOption", () => {
  it("trims, dedupes case-insensitively, and never reuses a value", async () => {
    const a = await ensureOption(SET, "  In Talks  ", editor);
    expect(a).toMatchObject({ ok: true, value: "in_talks", label: "In Talks", created: true });
    const b = await ensureOption(SET, "in talks", editor);
    expect(b).toMatchObject({ ok: true, value: "in_talks", created: false });
    const c = await ensureOption(SET, "In Talks Again", editor);
    expect(c.ok && c.value).toBe("in_talks_again");
    expect(await db.option.count({ where: { setKey: SET } })).toBe(2);
  });

  it("gives every option a colour from the palette and refuses an empty name", async () => {
    const rows = await db.option.findMany({ where: { setKey: SET } });
    expect(rows.every((r) => !!r.color)).toBe(true);
    expect(await ensureOption(SET, "   ", editor)).toMatchObject({ ok: false });
  });
});

describe("renaming and merging options", () => {
  it("a rename changes the label, never the value records store", async () => {
    const { renameOption } = await import("@/lib/actions/options");
    await ensureOption("format_status", "Developing", editor);
    const format = await db.format.create({ data: { slug: `${P.toLowerCase()}-ren-${Date.now()}`, title: `${P} Rename`, status: "developing" } });
    const row = await db.option.findFirst({ where: { setKey: "format_status", value: "developing" } });
    expect(row).toBeTruthy();
    expect(await renameOption(row!.id, "In development")).toEqual({ ok: true });
    const after = await db.format.findUnique({ where: { id: format.id } });
    expect(after?.status).toBe("developing");
    await primeOptions(true);
    expect(optionLabel("developing", "format_status")).toBe("In development");
  });

  it("a merge moves every record, audits each one, and archives the source with a pointer", async () => {
    const { mergeOption } = await import("@/lib/actions/options");
    const from = await ensureOption("format_status", `${P} Outbound`, editor);
    const to = await ensureOption("format_status", `${P} Pitched`, editor);
    expect(from.ok && to.ok).toBe(true);
    if (!from.ok || !to.ok) return;
    await primeOptions(true);
    const f1 = await db.format.create({ data: { slug: `${P.toLowerCase()}-m1-${Date.now()}`, title: `${P} Merge One`, status: from.value } });
    const f2 = await db.format.create({ data: { slug: `${P.toLowerCase()}-m2-${Date.now()}`, title: `${P} Merge Two`, status: from.value } });

    const usage = await optionUsage("format_status", from.value);
    expect(usage.total).toBe(2);

    const src = await db.option.findFirst({ where: { setKey: "format_status", value: from.value } });
    const dst = await db.option.findFirst({ where: { setKey: "format_status", value: to.value } });
    const res = await mergeOption(src!.id, dst!.id);
    expect(res).toMatchObject({ ok: true, reassigned: 2 });

    expect((await db.format.findUnique({ where: { id: f1.id } }))?.status).toBe(to.value);
    expect((await db.format.findUnique({ where: { id: f2.id } }))?.status).toBe(to.value);
    const archived = await db.option.findUnique({ where: { id: src!.id } });
    expect(archived?.archivedAt).toBeTruthy();
    expect(archived?.mergedInto).toBe(dst!.id);
    // One audit row per record moved, so the change is traceable and reversible.
    const audits = await db.auditLog.findMany({ where: { targetType: "format", field: { contains: "option merge" } } });
    expect(audits.length).toBeGreaterThanOrEqual(2);
  });
});

describe("custom fields", () => {
  it("every field type maps to an editor kind", () => {
    expect(Object.keys(KIND_OF).sort()).toEqual(["checkbox", "date", "longtext", "multiselect", "number", "relation", "select", "text", "url", "user"]);
  });

  it("validates by its definition: required, url shape, option membership", async () => {
    const def = await db.fieldDefinition.create({ data: { recordType: "format", key: "zzopt_url", name: "Deck", type: "url", required: false, position: 900 } });
    bustFieldDefinitions();
    expect(await coerceCustom(def as never, "example.com/deck")).toMatchObject({ ok: true, plain: "https://example.com/deck" });
    expect(await coerceCustom(def as never, "not a url at all")).toMatchObject({ ok: false });
    expect(await coerceCustom(def as never, "")).toMatchObject({ ok: true, plain: null });

    const req = await db.fieldDefinition.create({ data: { recordType: "format", key: "zzopt_req", name: "Owner note", type: "text", required: true, position: 910 } });
    bustFieldDefinitions();
    expect(await coerceCustom(req as never, "")).toMatchObject({ ok: false });
    expect(await coerceCustom(req as never, "  kept  ")).toMatchObject({ ok: true, plain: "kept" });
  });

  it("setField writes into the JSON column, audits by the field's name, and bumps the version", async () => {
    const { setField } = await import("@/lib/actions/inline");
    await db.fieldDefinition.create({ data: { recordType: "format", key: "zzopt_stage", name: "Stage note", type: "text", position: 920 } });
    bustFieldDefinitions();
    const format = await db.format.create({ data: { slug: `${P.toLowerCase()}-cf-${Date.now()}`, title: `${P} Custom`, status: "idea" } });

    const res = await setField({ type: "format", id: format.id, field: "custom.zzopt_stage", value: "Deck out", expectedVersion: format.version });
    expect(res).toMatchObject({ ok: true, changed: true, value: "Deck out", version: format.version + 1 });
    expect((await db.format.findUnique({ where: { id: format.id } }))?.custom).toMatchObject({ zzopt_stage: "Deck out" });

    // Unchanged writes are skipped, and a stale version is refused like any other field.
    expect(await setField({ type: "format", id: format.id, field: "custom.zzopt_stage", value: "Deck out" })).toMatchObject({ changed: false });
    const stale = await setField({ type: "format", id: format.id, field: "custom.zzopt_stage", value: "Other", expectedVersion: format.version });
    expect(stale.ok).toBe(false);

    const audit = await db.auditLog.findFirst({ where: { targetType: "format", targetId: format.id, field: "Stage note" } });
    expect(audit?.newValue).toBe("Deck out");

    // Emptying it takes the key out rather than storing a blank.
    await setField({ type: "format", id: format.id, field: "custom.zzopt_stage", value: "" });
    expect((await db.format.findUnique({ where: { id: format.id } }))?.custom).not.toHaveProperty("zzopt_stage");
  });

  it("becomes a filter field whose where clause actually selects the record", async () => {
    await db.fieldDefinition.create({ data: { recordType: "format", key: "zzopt_pick", name: "Pick", type: "select", optionSetKey: SET, position: 930 } });
    bustFieldDefinitions();
    const hit = await db.format.create({ data: { slug: `${P.toLowerCase()}-fh-${Date.now()}`, title: `${P} Filter Hit`, status: "idea", custom: { zzopt_pick: "in_talks" } } });
    await db.format.create({ data: { slug: `${P.toLowerCase()}-fm-${Date.now()}`, title: `${P} Filter Miss`, status: "idea", custom: { zzopt_pick: "in_talks_again" } } });

    const fields = await customFilterFields("format");
    const pick = fields.find((f) => f.key === "c_zzopt_pick");
    expect(pick).toMatchObject({ kind: "select", label: "Pick" });

    const state = parseFilterParams({ f: "c_zzopt_pick~is~in_talks" }, fields);
    expect(state.and).toHaveLength(1);
    const where = filterWhere(await customFieldMaps("format"), state);
    const found = await db.format.findMany({ where: { AND: [{ title: { startsWith: P } }, ...(where as object[])] } as never, select: { id: true } });
    expect(found.map((f) => f.id)).toEqual([hit.id]);
  });

  it("only the definitions of that record type come back, and archived ones drop out", async () => {
    const all = await fieldDefinitions("format");
    expect(all.every((d) => d.recordType === "format")).toBe(true);
    const one = all.find((d) => d.key === "zzopt_url");
    await db.fieldDefinition.update({ where: { id: one!.id }, data: { archivedAt: new Date() } });
    bustFieldDefinitions();
    expect((await fieldDefinitions("format")).some((d) => d.key === "zzopt_url")).toBe(false);
    expect((await fieldDefinitions("format", true)).some((d) => d.key === "zzopt_url")).toBe(true);
  });

  it("puts its text into the search index but not its dates or links", () => {
    expect(customSearchText({ a: "Brand deal", b: "2026-04-01", c: "https://example.com", d: ["one", "two"], e: { id: "x", name: "Jane" } }))
      .toEqual(["Brand deal", "one", "two", "Jane"]);
  });
});

describe("verification", () => {
  it("stamps who and when, and says so in the history", async () => {
    const { verifyRecord } = await import("@/lib/actions/verify");
    const format = await db.format.create({ data: { slug: `${P.toLowerCase()}-v-${Date.now()}`, title: `${P} Verify`, status: "idea" } });
    const res = await verifyRecord("format", format.id);
    expect(res.ok).toBe(true);
    const after = await db.format.findUnique({ where: { id: format.id } });
    expect(after?.verifiedAt).toBeTruthy();
    expect(after?.verifiedBy).toBe(editor.name);
    expect(await db.auditLog.count({ where: { targetType: "format", targetId: format.id, action: "verified" } })).toBe(1);
    expect(await verifyRecord("entity", "whatever")).toMatchObject({ ok: false });
  });

  it("bulk verify stamps a whole selection under one undoable batch", async () => {
    const { bulkApply, undoBatch } = await import("@/lib/actions/bulk");
    const a = await db.format.create({ data: { slug: `${P.toLowerCase()}-b1-${Date.now()}`, title: `${P} Bulk One`, status: "idea" } });
    const b = await db.format.create({ data: { slug: `${P.toLowerCase()}-b2-${Date.now()}`, title: `${P} Bulk Two`, status: "idea" } });
    const res = await bulkApply("format", [a.id, b.id], { kind: "verify" });
    expect(res).toMatchObject({ ok: true, changed: 2, label: "verified" });
    expect((await db.format.findUnique({ where: { id: a.id } }))?.verifiedBy).toBe(editor.name);
    if (!res.ok) return;
    await undoBatch(res.batchId);
    expect((await db.format.findUnique({ where: { id: a.id } }))?.verifiedAt).toBeNull();
    expect((await db.format.findUnique({ where: { id: b.id } }))?.verifiedAt).toBeNull();
  });
});

describe("the option set map", () => {
  it("names a real Prisma model and column for every set that backs a column", async () => {
    const { Prisma } = await import("@prisma/client");
    for (const [key, spec] of Object.entries(OPTION_SETS)) {
      for (const col of spec.columns) {
        const model = Prisma.dmmf.datamodel.models.find((m) => m.name.charAt(0).toLowerCase() + m.name.slice(1) === col.model);
        expect(model, `${key} names a model that exists`).toBeTruthy();
        expect(model!.fields.some((f) => f.name === col.column), `${key} → ${col.model}.${col.column}`).toBe(true);
      }
    }
  });
});

describe("quick create and a required custom field", () => {
  // Organizations, because an earlier test in this file leaves a required
  // format field in place and this has to stand on its own.
  const KEY = "zzopt_org_note";
  const TYPE = "organization";

  it("refuses a record without it, and stores it when given", async () => {
    const { createRecord } = await import("@/lib/actions/quick-create");
    const { requiredCustomFields } = await import("@/lib/actions/fields");

    await db.fieldDefinition.create({
      data: { recordType: TYPE, key: KEY, name: "Owner sign-off", type: "text", required: true, position: 900 },
    });
    bustFieldDefinitions();

    // It reaches the sheet, marked required.
    const shown = await requiredCustomFields(TYPE);
    expect(shown.map((f) => f.name)).toContain(`custom.${KEY}`);
    expect(shown.find((f) => f.name === `custom.${KEY}`)?.required).toBe(true);

    // Creating without it is refused, and nothing is written.
    const refused = await createRecord(TYPE, { name: `${P} needs sign-off` });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toContain("Owner sign-off");
    expect(await db.organization.count({ where: { name: `${P} needs sign-off` } })).toBe(0);

    // Creating with it works, and the value lands in `custom`.
    const made = await createRecord(TYPE, { name: `${P} has sign-off`, [`custom.${KEY}`]: "Jack asked for this" });
    expect(made.ok).toBe(true);
    const row = await db.organization.findFirst({ where: { name: `${P} has sign-off` } });
    expect((row?.custom as Record<string, unknown>)?.[KEY]).toBe("Jack asked for this");

    await db.fieldDefinition.deleteMany({ where: { key: KEY } });
    bustFieldDefinitions();
  });

  it("leaves an optional field off the sheet and lets a record be made without it", async () => {
    const { createRecord } = await import("@/lib/actions/quick-create");
    const { requiredCustomFields } = await import("@/lib/actions/fields");
    await db.fieldDefinition.create({
      data: { recordType: TYPE, key: "zzopt_org_optional", name: "Optional note", type: "text", required: false, position: 901 },
    });
    bustFieldDefinitions();
    expect((await requiredCustomFields(TYPE)).map((f) => f.name)).not.toContain("custom.zzopt_org_optional");
    expect((await createRecord(TYPE, { name: `${P} no optional` })).ok).toBe(true);
    await db.fieldDefinition.deleteMany({ where: { key: "zzopt_org_optional" } });
    bustFieldDefinitions();
  });
});
