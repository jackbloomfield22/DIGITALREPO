// The Airtable mirror, run against a small in-memory stand-in for Airtable's
// API (the real one is out of reach from tests). Covers the row mapping, the
// signed file links, set-up, first push, unchanged skips, files on and off
// the row, deletion, the queue, and the deck-onto-page step.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

process.env.AIRTABLE_TOKEN = "pat_test_token";
process.env.AIRTABLE_BASE_ID = "appTESTBASE000001";
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret";
process.env.SITE_URL = "https://repo.test";
process.env.AIRTABLE_MIN_GAP_MS = "0";

import { buildFields, stableStringify, FIELD, airtableRecordUrl } from "@/lib/airtable/fields";
import { signedFetchUrl, verifyFetchSignature } from "@/lib/airtable/fetch-url";
import { saveAirtableConfig, forgetAirtableConfig } from "@/lib/airtable/config";
import { checkConnection, setupTables, syncRecord, queueAirtableSync, drainAirtableQueue, setAutoDrain, loadMirrorSource, forgetAirtableTables, queueEverything } from "@/lib/airtable/sync";
import { attachSourceFile, attachTargets } from "@/lib/ingest/attach-source";

const db = new PrismaClient();
const P = "ZZAir";

// ---------------------------------------------------------------------------
// A stand-in Airtable: tables, records, attachments, the metadata API, and
// the filterByFormula shape the mirror uses. Counts calls so tests can assert
// that an unchanged record costs nothing.
// ---------------------------------------------------------------------------
type Field = { id: string; name: string; type: string };
type Table = { id: string; name: string; primaryFieldId: string; fields: Field[]; records: Map<string, Record<string, unknown>> };
const base: { tables: Table[] } = { tables: [] };
const calls: string[] = [];
let seq = 1;
const nid = (p: string) => `${p}${String(seq++).padStart(14, "0")}`;

// Airtable keeps a full attachment behind an `{id}` reference and fetches a
// `{url, filename}` one into a new attachment; the stand-in does the same.
function normaliseAttachments(fields: Record<string, unknown>, existing: unknown[] = []) {
  const files = fields[FIELD.files];
  if (Array.isArray(files)) {
    const known = new Map((existing as { id: string }[]).map((a) => [a.id, a]));
    fields[FIELD.files] = files.map((a: { id?: string; url?: string; filename?: string }) =>
      a.id ? (known.get(a.id) ?? a) : { id: nid("att"), url: a.url, filename: a.filename, size: 0, type: "application/pdf" });
  }
}

const fakeFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
  const method = (init?.method ?? "GET").toUpperCase();
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  calls.push(`${method} ${url.host}${url.pathname}`);
  const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  const auth = (init?.headers as Record<string, string>)?.Authorization;
  if (auth !== "Bearer pat_test_token") return json(401, { error: { type: "AUTHENTICATION_REQUIRED" } });
  const parts = url.pathname.split("/").filter(Boolean); // v0, ...

  if (url.host === "content.airtable.com") {
    const [, baseId, recordId, fieldName] = parts;
    if (baseId !== process.env.AIRTABLE_BASE_ID) return json(404, { error: "NOT_FOUND" });
    for (const t of base.tables) {
      const rec = t.records.get(recordId);
      if (!rec) continue;
      const list = ((rec[fieldName] as unknown[]) ?? []).slice();
      const att = { id: nid("att"), url: `https://dl.airtable.test/${recordId}/${body.filename}`, filename: body.filename, size: Buffer.from(body.file, "base64").byteLength, type: body.contentType };
      list.push(att);
      rec[fieldName] = list;
      const field = t.fields.find((f) => f.name === fieldName)!;
      return json(200, { id: recordId, createdTime: new Date().toISOString(), fields: { [field.id]: list } });
    }
    return json(404, { error: "NOT_FOUND" });
  }

  if (parts[1] === "meta") {
    const baseId = parts[3];
    if (baseId !== process.env.AIRTABLE_BASE_ID) return json(404, { error: { type: "NOT_FOUND" } });
    if (parts.length === 5 && method === "GET") return json(200, { tables: base.tables.map(strip) });
    if (parts.length === 5 && method === "POST") {
      const fields = (body.fields as { name: string; type: string }[]).map((f) => ({ id: nid("fld"), name: f.name, type: f.type }));
      const t: Table = { id: nid("tbl"), name: body.name, primaryFieldId: fields[0].id, fields, records: new Map() };
      base.tables.push(t);
      return json(200, strip(t));
    }
    if (parts.length === 7 && parts[6] === "fields" && method === "POST") {
      const t = base.tables.find((x) => x.id === parts[5]);
      if (!t) return json(404, { error: "NOT_FOUND" });
      const f = { id: nid("fld"), name: body.name, type: body.type };
      t.fields.push(f);
      return json(200, f);
    }
    return json(404, { error: "NOT_FOUND" });
  }

  const [, baseId, tableKey, recordId] = parts;
  if (baseId !== process.env.AIRTABLE_BASE_ID) return json(404, { error: { type: "NOT_FOUND", message: "Could not find base" } });
  const t = base.tables.find((x) => x.id === decodeURIComponent(tableKey) || x.name === decodeURIComponent(tableKey));
  if (!t) return json(404, { error: { type: "TABLE_NOT_FOUND" } });
  if (!recordId && method === "GET") {
    const formula = url.searchParams.get("filterByFormula") ?? "";
    const m = formula.match(/^\{(.+?)\} = "(.*)"$/);
    const records = [...t.records.entries()].filter(([, f]) => !m || f[m[1]] === m[2]).map(([id, fields]) => ({ id, fields }));
    return json(200, { records });
  }
  if (!recordId && method === "POST") {
    const fields = { ...(body.fields as Record<string, unknown>) };
    normaliseAttachments(fields);
    const id = nid("rec");
    t.records.set(id, fields);
    return json(200, { id, createdTime: new Date().toISOString(), fields });
  }
  const rec = t.records.get(recordId);
  if (!rec) return json(404, { error: { type: "MODEL_ID_NOT_FOUND" } });
  if (method === "GET") return json(200, { id: recordId, fields: rec });
  if (method === "PATCH") {
    const patch = { ...(body.fields as Record<string, unknown>) };
    normaliseAttachments(patch, (rec[FIELD.files] as unknown[]) ?? []);
    Object.assign(rec, patch);
    return json(200, { id: recordId, fields: rec });
  }
  return json(405, { error: "METHOD" });
});

const strip = (t: Table) => Object.fromEntries(Object.entries(t).filter(([k]) => k !== "records"));
const countCalls = (pattern: RegExp) => calls.filter((c) => pattern.test(c)).length;
const rowsIn = (name: string) => base.tables.find((t) => t.name === name)!.records;

beforeAll(async () => {
  vi.stubGlobal("fetch", fakeFetch);
  setAutoDrain(false);
  forgetAirtableConfig();
  await db.airtableJob.deleteMany({});
  await db.airtableSync.deleteMany({});
  await db.attachment.deleteMany({ where: { filename: { startsWith: P } } });
  await db.storedFile.deleteMany({ where: { key: { startsWith: "zzair-" } } });
  await db.ingestItem.deleteMany({ where: { filename: { startsWith: P } } });
  await db.format.deleteMany({ where: { title: { startsWith: P } } });
  await db.project.deleteMany({ where: { title: { startsWith: P } } });
  await db.organization.deleteMany({ where: { name: { startsWith: P } } });
  await db.industryPerson.deleteMany({ where: { name: { startsWith: P } } });
  await saveAirtableConfig({ baseId: "", tables: { format: "Formats", project: "Projects" }, enabled: { format: true, project: true }, primaryField: {} });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  setAutoDrain(true);
  await db.airtableJob.deleteMany({});
  await db.airtableSync.deleteMany({});
  await db.attachment.deleteMany({ where: { filename: { startsWith: P } } });
  await db.storedFile.deleteMany({ where: { key: { startsWith: "zzair-" } } });
  await db.ingestItem.deleteMany({ where: { filename: { startsWith: P } } });
  await db.format.deleteMany({ where: { title: { startsWith: P } } });
  await db.project.deleteMany({ where: { title: { startsWith: P } } });
  await db.organization.deleteMany({ where: { name: { startsWith: P } } });
  await db.industryPerson.deleteMany({ where: { name: { startsWith: P } } });
  await db.$disconnect();
});

describe("row mapping", () => {
  const src = {
    type: "format" as const, id: "f1", slug: "wrestling-doc", title: "Pro Wrestling Doc", status: "developing", statusLabel: "Developing",
    kind: "documentary", kindLabel: "Documentary", logline: "  A year inside.  ", companies: ["Scarlet Creative"], people: ["Brennan Scarlett — Executive Producer (Scarlet Creative)"],
    talent: [], archived: false, archivedReason: null, lastActivityAt: new Date("2026-08-01T12:00:00Z"), updatedAt: new Date("2026-09-01T12:00:00Z"), files: [],
  };
  it("builds the small slice, with the primary field named whatever the table calls it", () => {
    const f = buildFields(src, "https://repo.test", "Project");
    expect(f["Project"]).toBe("Pro Wrestling Doc");
    expect(f[FIELD.name]).toBeUndefined();
    expect(f[FIELD.repoLink]).toBe("https://repo.test/formats/wrestling-doc");
    expect(f[FIELD.repoId]).toBe("format:f1");
    expect(f[FIELD.logline]).toBe("A year inside.");
    expect(f[FIELD.talent]).toBeNull();
    expect(f[FIELD.lastMoved]).toBe("2026-08-01");
    expect(f[FIELD.archived]).toBe(false);
    expect(f[FIELD.syncNote]).toBeNull();
    const archived = buildFields({ ...src, archived: true, archivedReason: "Went quiet" }, "https://repo.test");
    expect(archived[FIELD.syncNote]).toBe("Went quiet");
    expect(archived[FIELD.name]).toBe("Pro Wrestling Doc");
  });
  it("keeps a base id that came from the environment out of the database", async () => {
    await saveAirtableConfig({ enabled: { format: true, project: false } });
    const row = await db.appSetting.findUnique({ where: { key: "airtable" } });
    expect((row?.value as { baseId?: string }).baseId).toBe("");
    forgetAirtableConfig();
    await saveAirtableConfig({ enabled: { format: true, project: true } });
  });
  it("hashes the same row the same way whatever the key order", () => {
    expect(stableStringify({ b: 1, a: [{ d: 2, c: null }] })).toBe(stableStringify({ a: [{ c: null, d: 2 }], b: 1 }));
    expect(airtableRecordUrl("appX", "tblY", "recZ")).toBe("https://airtable.com/appX/tblY/recZ");
  });
});

describe("signed file links", () => {
  it("open for a while, then close, and cannot be bent to another file", () => {
    const url = new URL(signedFetchUrl("att123", 1_000_000));
    expect(url.pathname).toBe("/api/attachments/att123/fetch");
    const exp = url.searchParams.get("exp"), sig = url.searchParams.get("sig");
    expect(verifyFetchSignature("att123", exp, sig, 1_000_000 + 60_000)).toBe(true);
    expect(verifyFetchSignature("att123", exp, sig, 1_000_000 + 3 * 3_600_000)).toBe(false);
    expect(verifyFetchSignature("att999", exp, sig, 1_000_000 + 60_000)).toBe(false);
    expect(verifyFetchSignature("att123", String(Number(exp) + 1), sig, 1_000_000)).toBe(false);
    expect(verifyFetchSignature("att123", exp, null, 1_000_000)).toBe(false);
  });
});

describe("the mirror", () => {
  let formatId = "";
  let projectId = "";

  it("explains what is wrong before it is set up, then sets the base up", async () => {
    forgetAirtableConfig();
    const before = await checkConnection();
    expect(before.ok).toBe(false);
    expect(before.tables.every((t) => !t.found)).toBe(true);
    const setup = await setupTables();
    expect(setup.problem).toBeNull();
    expect(setup.ok).toBe(true);
    expect(setup.created).toEqual(['table "Formats" with all its fields', 'table "Projects" with all its fields']);
    const after = await checkConnection();
    expect(after.ok).toBe(true);
    // A field removed by hand is noticed and put back, nothing else touched.
    const projects = base.tables.find((t) => t.name === "Projects")!;
    projects.fields = projects.fields.filter((f) => f.name !== FIELD.talent);
    forgetAirtableTables();
    const again = await setupTables();
    expect(again.created).toEqual([`"${FIELD.talent}" on "Projects"`]);
    expect(again.ok).toBe(true);
  });

  it("pushes a format with its companies, people, talent and a file, then skips it while unchanged", async () => {
    const org = await db.organization.create({ data: { name: `${P} Scarlet Creative`, slug: "zzair-scarlet-creative", types: ["production_company"] } });
    const person = await db.industryPerson.create({ data: { name: `${P} Brennan Scarlett`, slug: "zzair-brennan-scarlett", roleType: "executive", organizations: { create: { organizationId: org.id, role: "Founder" } } } });
    const format = await db.format.create({ data: {
      title: `${P} Pro Wrestling Doc`, slug: "zzair-pro-wrestling-doc", status: "developing", formatType: "documentary", logline: "A year inside the indie circuit.",
      organizations: { create: { organizationId: org.id, relationship: "producer" } },
      people: { create: { personId: person.id, role: "executive_producer" } },
    } });
    formatId = format.id;
    await db.storedFile.create({ data: { key: "zzair-deck.pdf", mimeType: "application/pdf", sizeBytes: 11, data: Buffer.from("%PDF-1.4 zz") } });
    await db.attachment.create({ data: { targetType: "format", targetId: format.id, filename: `${P} Deck.pdf`, storage: "db", storedPath: "zzair-deck.pdf", mimeType: "application/pdf", sizeBytes: 11 } });

    const src = await loadMirrorSource("format", format.id);
    expect(src?.companies).toEqual([`${P} Scarlet Creative`]);
    expect(src?.people).toEqual([`${P} Brennan Scarlett — Executive Producer (${P} Scarlet Creative)`]);

    calls.length = 0;
    expect(await syncRecord("format", format.id)).toBe("synced");
    const rows = rowsIn("Formats");
    expect(rows.size).toBe(1);
    const [recordId, row] = [...rows.entries()][0];
    expect(row[FIELD.name]).toBe(`${P} Pro Wrestling Doc`);
    expect(row[FIELD.status]).toBe("Developing");
    expect(row[FIELD.type]).toBe("Documentary");
    expect(row[FIELD.repoId]).toBe(`format:${format.id}`);
    expect(row[FIELD.repoLink]).toBe("https://repo.test/formats/zzair-pro-wrestling-doc");
    const files = row[FIELD.files] as { id: string; filename: string; size: number }[];
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe(`${P} Deck.pdf`);
    expect(files[0].size).toBe(11);
    expect(countCalls(/content\.airtable\.com/)).toBe(1);
    const att = await db.attachment.findFirst({ where: { targetType: "format", targetId: format.id } });
    expect(att?.airtableAttachmentId).toBe(files[0].id);
    const sync = await db.airtableSync.findUnique({ where: { targetType_targetId: { targetType: "format", targetId: format.id } } });
    expect(sync?.recordId).toBe(recordId);
    expect(sync?.error).toBeNull();

    // Nothing changed: no request at all.
    calls.length = 0;
    expect(await syncRecord("format", format.id)).toBe("skipped");
    expect(calls).toEqual([]);

    // A status change: one PATCH, no new row, the file left alone.
    await db.format.update({ where: { id: format.id }, data: { status: "pitched" } });
    calls.length = 0;
    expect(await syncRecord("format", format.id)).toBe("synced");
    expect(countCalls(/^PATCH/)).toBe(1);
    expect(countCalls(/^POST/)).toBe(0);
    expect(rows.size).toBe(1);
    expect(rows.get(recordId)![FIELD.status]).toBe("Pitched");
  });

  it("hands a big file over as a signed link, and takes a deleted file off the row", async () => {
    await db.storedFile.create({ data: { key: "zzair-cut.mp4", mimeType: "video/mp4", sizeBytes: 3, data: Buffer.from("abc") } });
    const big = await db.attachment.create({ data: { targetType: "format", targetId: formatId, filename: `${P} Cut.mp4`, storage: "db", storedPath: "zzair-cut.mp4", mimeType: "video/mp4", sizeBytes: 900 * 1024 * 1024 } });
    calls.length = 0;
    expect(await syncRecord("format", formatId)).toBe("synced");
    expect(countCalls(/content\.airtable\.com/)).toBe(0);
    const row = [...rowsIn("Formats").values()][0];
    const files = row[FIELD.files] as { id: string; url: string; filename: string }[];
    expect(files).toHaveLength(2);
    const added = files.find((f) => f.filename === `${P} Cut.mp4`)!;
    expect(added.url).toMatch(new RegExp(`^https://repo.test/api/attachments/${big.id}/fetch\\?exp=\\d+&sig=[a-f0-9]{64}$`));
    const url = new URL(added.url);
    expect(verifyFetchSignature(big.id, url.searchParams.get("exp"), url.searchParams.get("sig"))).toBe(true);
    const stored = await db.attachment.findUnique({ where: { id: big.id } });
    expect(stored?.airtableAttachmentId).toBe(added.id);

    // Deleted on the page: the queue carries the Airtable id to remove.
    await db.attachment.delete({ where: { id: big.id } });
    await queueAirtableSync("format", formatId, { removeIds: [added.id] });
    const out = await drainAirtableQueue();
    expect(out).toMatchObject({ synced: 1, failed: 0, remaining: 0 });
    const after = [...rowsIn("Formats").values()][0][FIELD.files] as { id: string }[];
    expect(after.map((f) => f.id)).toEqual([files.find((f) => f.filename === `${P} Deck.pdf`)!.id]);
  });

  it("adopts a row that already carries the Repo ID instead of making a second one", async () => {
    const project = await db.project.create({ data: { title: `${P} Announced Doc`, slug: "zzair-announced-doc", status: "announced", projectType: "documentary" } });
    projectId = project.id;
    const rows = rowsIn("Projects");
    const stray = nid("rec");
    rows.set(stray, { [FIELD.name]: "typed by hand", [FIELD.repoId]: `project:${project.id}` });
    expect(await syncRecord("project", project.id)).toBe("synced");
    expect(rows.size).toBe(1);
    expect(rows.get(stray)![FIELD.name]).toBe(`${P} Announced Doc`);
    expect(rows.get(stray)![FIELD.status]).toBe("Announced");
    const sync = await db.airtableSync.findUnique({ where: { targetType_targetId: { targetType: "project", targetId: project.id } } });
    expect(sync?.recordId).toBe(stray);
  });

  it("recreates the row when someone deleted it in Airtable", async () => {
    const rows = rowsIn("Projects");
    rows.clear();
    await db.project.update({ where: { id: projectId }, data: { logline: "Now with a logline." } });
    expect(await syncRecord("project", projectId)).toBe("synced");
    expect(rows.size).toBe(1);
    expect([...rows.values()][0][FIELD.logline]).toBe("Now with a logline.");
  });

  it("marks the row when the record is deleted from the Repo", async () => {
    const rows = rowsIn("Projects");
    const [recordId] = [...rows.keys()];
    await db.project.delete({ where: { id: projectId } });
    await queueAirtableSync("project", projectId, { reason: "deleted" });
    const out = await drainAirtableQueue();
    expect(out.synced).toBe(1);
    expect(rows.get(recordId)![FIELD.archived]).toBe(true);
    expect(rows.get(recordId)![FIELD.syncNote]).toMatch(/^Deleted from the Repo on \d{4}-\d{2}-\d{2}$/);
    expect(await db.airtableSync.findUnique({ where: { targetType_targetId: { targetType: "project", targetId: projectId } } })).toBeNull();
  });

  it("queues everything live, works the queue, and records a failure without losing the job", async () => {
    const n = await queueEverything();
    expect(n).toBeGreaterThanOrEqual(1);
    expect(await db.airtableJob.count({ where: { targetType: "format", targetId: formatId } })).toBe(1);
    const out = await drainAirtableQueue({ limit: 500 });
    expect(out.failed).toBe(0);
    expect(out.remaining).toBe(0);

    // Airtable down for one push: the job stays, with the reason, for the next pass.
    await db.format.update({ where: { id: formatId }, data: { logline: "Changed while Airtable was down." } });
    await queueAirtableSync("format", formatId);
    const real = fakeFetch.getMockImplementation()!;
    fakeFetch.mockImplementationOnce(async () => new Response(JSON.stringify({ error: { type: "SERVER_ERROR", message: "boom" } }), { status: 503 }))
      .mockImplementationOnce(async () => new Response(JSON.stringify({ error: { type: "SERVER_ERROR", message: "boom" } }), { status: 503 }));
    const failed = await drainAirtableQueue();
    expect(failed.failed).toBe(1);
    const job = await db.airtableJob.findUnique({ where: { targetType_targetId: { targetType: "format", targetId: formatId } } });
    expect(job?.attempts).toBe(1);
    expect(job?.lastError).toContain("boom");
    expect(job?.claimedAt).toBeNull();
    fakeFetch.mockImplementation(real);
    const retry = await drainAirtableQueue();
    expect(retry).toMatchObject({ synced: 1, failed: 0, remaining: 0 });
    expect([...rowsIn("Formats").values()][0][FIELD.logline]).toBe("Changed while Airtable was down.");
  }, 180_000);

  it("leaves a type alone when it is switched off, and says so on the page", async () => {
    await saveAirtableConfig({ enabled: { format: false, project: true } });
    await db.format.update({ where: { id: formatId }, data: { logline: "Not for Airtable." } });
    calls.length = 0;
    expect(await syncRecord("format", formatId)).toBe("skipped");
    expect(calls).toEqual([]);
    await saveAirtableConfig({ enabled: { format: true, project: true } });
  });
});

describe("a deck from Add Info lands on its page", () => {
  it("attaches the file to the chosen record and to created ones, once each", async () => {
    const format = await db.format.create({ data: { title: `${P} Chosen Format`, slug: "zzair-chosen-format", status: "concept", formatType: "docuseries" } });
    const user = await db.user.findFirst({ where: { role: "ADMIN" } });
    expect(user).toBeTruthy();
    const item = await db.ingestItem.create({ data: {
      kind: "document", filename: `${P} Wrestling Deck.pdf`, mimeType: "application/pdf", sizeBytes: 12,
      raw: Buffer.from("%PDF-1.4 deck"), rawRetained: true, status: "applied", metadata: { attachTo: { type: "format", id: format.id } },
    } });
    expect(attachTargets(item)).toEqual([{ targetType: "format", targetId: format.id }]);
    const n = await attachSourceFile(item, { id: user!.id, name: user!.name, email: user!.email, role: "ADMIN" }, [...attachTargets(item), { targetType: "person", targetId: "ignored" }]);
    expect(n).toBe(1);
    const again = await attachSourceFile(item, { id: user!.id, name: user!.name, email: user!.email, role: "ADMIN" }, attachTargets(item));
    expect(again).toBe(0);
    const files = await db.attachment.findMany({ where: { targetType: "format", targetId: format.id } });
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ filename: `${P} Wrestling Deck.pdf`, storage: "db", sizeBytes: 13 });
    const stored = await db.storedFile.findUnique({ where: { key: files[0].storedPath } });
    expect(Buffer.from(stored!.data).toString()).toBe("%PDF-1.4 deck");
    // An email export is not a deck; it stays off the page.
    const eml = await db.ingestItem.create({ data: { kind: "email", filename: `${P} thread.eml`, raw: Buffer.from("x"), rawRetained: true, status: "applied", metadata: { attachTo: { type: "format", id: format.id } } } });
    expect(await attachSourceFile(eml, { id: user!.id, name: user!.name, email: user!.email, role: "ADMIN" }, attachTargets(eml))).toBe(0);
    await db.storedFile.deleteMany({ where: { key: { in: files.map((f) => f.storedPath) } } });
  });
});
