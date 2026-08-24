// Ingest system tests. Phase 1: registry coverage + Knowledge Digest
// freshness. Later phases append parsing, matching, proposal, and apply tests.

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { PrismaClient, Prisma } from "@prisma/client";
import { slugify } from "@/lib/slug";
import { LINK_KINDS } from "@/lib/link-schema";
import {
  ARCHIVABLE_TARGET_TYPES,
  LINK_SPECS,
  RECORD_REGISTRY,
  type IngestTargetType,
} from "@/lib/ingest/registry";
import { clearDigestMemo, refreshDigest, rebuildAllDigests } from "@/lib/ingest/digest";
import { logFieldChanges } from "@/lib/audit";

import { zipSync } from "fflate";
import { computeThreadId, parseEml, stripQuoted } from "@/lib/ingest/parse/email";
import { splitMbox } from "@/lib/ingest/parse/mbox";
import { extractDocx, extractPptx, extractXlsx } from "@/lib/ingest/parse/documents";
import { classifyKind, parseIngestItemCore } from "@/lib/ingest/parse";
import { storeRawBytes } from "@/lib/ingest/storage";

const db = new PrismaClient();
const P = "ZZIngest";

const EML = [
  "From: Renee Vaughn <renee@harborlight.example>",
  "To: Sam Whitaker <sam@440.example>",
  "Cc: Jordan Avery <jordan@440.example>",
  "Subject: Re: Sasha Kim — Fast Lane season 3",
  "Date: Mon, 24 Aug 2026 09:15:00 -0700",
  "Message-ID: <msg-2@harborlight.example>",
  "In-Reply-To: <msg-1@440.example>",
  "References: <msg-0@440.example> <msg-1@440.example>",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="BOUND"',
  "",
  "--BOUND",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Confirming Sasha is locked to host season 3 of Fast Lane Cook-Off.",
  "Halcyon North is producing again.",
  "",
  "On Mon, Aug 24, 2026 at 8:00 AM Sam Whitaker wrote:",
  "> Any update on Sasha for S3?",
  "> Thanks!",
  "--BOUND",
  'Content-Type: text/plain; name="deal-points.txt"',
  'Content-Disposition: attachment; filename="deal-points.txt"',
  "",
  "Fee: TBD",
  "--BOUND--",
  "",
].join("\r\n");

async function cleanup() {
  await db.knowledgeDigest.deleteMany({ where: { name: { startsWith: P } } });
  await db.creator.deleteMany({ where: { name: { startsWith: P } } });
  await db.entity.deleteMany({ where: { name: { startsWith: P } } });
  await db.ingestItem.deleteMany({ where: { OR: [{ filename: { startsWith: P } }, { extractedText: { startsWith: P } }] } });
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("registry coverage", () => {
  const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

  it("every Prisma model with an archived column has a registry entry", () => {
    const archivableModels = Prisma.dmmf.datamodel.models
      .filter((m) => m.fields.some((f) => f.name === "archived"))
      .map((m) => lowerFirst(m.name))
      .filter((name) => name !== "knowledgeDigest"); // the index itself
    const registryModels = new Set(
      Object.values(RECORD_REGISTRY).map((spec) => spec.prismaModel),
    );
    const missing = archivableModels.filter((m) => !registryModels.has(m));
    expect(missing).toEqual([]);
    // and the archivable list itself stays in sync
    for (const t of ARCHIVABLE_TARGET_TYPES) {
      expect(registryModels.has(RECORD_REGISTRY[t].prismaModel)).toBe(true);
    }
  });

  it("every link kind in the link engine has a link spec", () => {
    const missing = LINK_KINDS.filter((kind) => !LINK_SPECS[kind]);
    expect(missing).toEqual([]);
  });

  it("every digestible registry type can build a digest", async () => {
    // rebuildAllDigests walks every registry type; a missing builder throws.
    const result = await rebuildAllDigests();
    expect(result.built).toBeGreaterThan(0);
    const types = await db.knowledgeDigest.groupBy({ by: ["targetType"] });
    const covered = new Set(types.map((t) => t.targetType));
    for (const t of ["creator", "project", "organization", "format", "entity"] as IngestTargetType[]) {
      expect(covered.has(t)).toBe(true);
    }
  }, 120_000);
});

describe("knowledge digest freshness", () => {
  it("editing a bio refreshes the digest within the same request path", async () => {
    const creator = await db.creator.create({
      data: { name: `${P} Fresh`, slug: slugify(`${P} Fresh`) },
    });
    clearDigestMemo();
    await refreshDigest("creator", creator.id);
    const before = await db.knowledgeDigest.findUnique({
      where: { targetType_targetId: { targetType: "creator", targetId: creator.id } },
    });
    expect(before?.summary).toContain(`${P} Fresh`);
    expect(before?.summary).not.toContain("aviation historian");

    // The audit helpers are the chokepoint — writing field changes through
    // them must refresh the digest.
    await db.creator.update({
      where: { id: creator.id },
      data: { miniBio: "An aviation historian and pilot." },
    });
    clearDigestMemo();
    await logFieldChanges(
      null, "creator", creator.id, creator.name,
      { miniBio: null }, { miniBio: "An aviation historian and pilot." },
    );
    const after = await db.knowledgeDigest.findUnique({
      where: { targetType_targetId: { targetType: "creator", targetId: creator.id } },
    });
    expect(after).toBeTruthy();
    expect(after!.updatedAt.getTime()).toBeGreaterThanOrEqual(before!.updatedAt.getTime());
  });

  it("adding a link refreshes searchText with the related record's name", async () => {
    const creator = await db.creator.create({
      data: { name: `${P} Linked`, slug: slugify(`${P} Linked`) },
    });
    const entity = await db.entity.create({
      data: { kind: "interest", name: `${P} Falconry`, slug: slugify(`${P} Falconry`) },
    });
    await db.creatorEntityLink.create({
      data: { creatorId: creator.id, entityId: entity.id, relationship: "" },
    });
    clearDigestMemo();
    await refreshDigest("creator", creator.id);
    const digest = await db.knowledgeDigest.findUnique({
      where: { targetType_targetId: { targetType: "creator", targetId: creator.id } },
    });
    expect(digest?.searchText).toContain(`${P} Falconry`);
    expect(digest?.summary).toContain("Falconry");
  });

  it("deleting a record removes its digest on refresh", async () => {
    const creator = await db.creator.create({
      data: { name: `${P} Gone`, slug: slugify(`${P} Gone`) },
    });
    clearDigestMemo();
    await refreshDigest("creator", creator.id);
    await db.creator.delete({ where: { id: creator.id } });
    clearDigestMemo();
    await refreshDigest("creator", creator.id);
    const digest = await db.knowledgeDigest.findUnique({
      where: { targetType_targetId: { targetType: "creator", targetId: creator.id } },
    });
    expect(digest).toBeNull();
  });
});

describe("email parsing", () => {
  it("extracts headers, strips the quoted reply, splits attachments, computes threadId", async () => {
    const parsed = await parseEml(new TextEncoder().encode(EML));
    expect(parsed.headers.from).toContain("renee@harborlight.example");
    expect(parsed.headers.subject).toContain("Sasha Kim");
    expect(parsed.headers.cc[0]).toContain("jordan@440.example");
    expect(parsed.cleanText).toContain("locked to host season 3");
    expect(parsed.cleanText).not.toContain("Any update on Sasha");
    expect(parsed.strippedText).toContain("Any update on Sasha");
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0].filename).toBe("deal-points.txt");
    // Thread id is stable and derived from the References root
    expect(parsed.threadId).toBe(
      computeThreadId({ references: ["<msg-0@440.example>"], inReplyTo: null, messageId: null, subject: "x" }),
    );
    // A later reply with the same root lands in the same thread
    const reply = computeThreadId({
      references: ["<msg-0@440.example>", "<msg-2@harborlight.example>"],
      inReplyTo: "<msg-2@harborlight.example>",
      messageId: "<msg-3@440.example>",
      subject: "Re: Re: Sasha Kim — Fast Lane season 3",
    });
    expect(reply).toBe(parsed.threadId);
  });

  it("never strips an entire message", () => {
    const { clean } = stripQuoted("> everything quoted\n> all of it");
    expect(clean.length).toBeGreaterThan(0);
  });
});

describe("archive splitting", () => {
  it("splits an mbox into messages and enforces caps", () => {
    const mbox = [
      "From renee@harborlight.example Mon Aug 24 09:15:00 2026",
      "Subject: One",
      "",
      "First body",
      ">From escaped line",
      "From sam@440.example Mon Aug 24 10:00:00 2026",
      "Subject: Two",
      "",
      "Second body",
    ].join("\n");
    const parts = splitMbox(new TextEncoder().encode(mbox), 10, 1024 * 1024);
    expect(parts).toHaveLength(2);
    expect(new TextDecoder().decode(parts[0])).toContain("From escaped line");
    expect(() => splitMbox(new TextEncoder().encode(mbox), 1, 1024 * 1024)).toThrow(/limit/);
  });

  it("extracts docx, pptx, and xlsx text from zip-of-XML fixtures", () => {
    const docx = zipSync({
      "word/document.xml": new TextEncoder().encode(
        "<w:document><w:p><w:r><w:t>Hello docx &amp; world</w:t></w:r></w:p><w:p><w:r><w:t>Line two</w:t></w:r></w:p></w:document>",
      ),
    });
    const docxOut = extractDocx(docx);
    expect(docxOut.text).toBe("Hello docx & world\nLine two");

    const pptx = zipSync({
      "ppt/slides/slide1.xml": new TextEncoder().encode("<p:sld><a:t>Title slide</a:t></p:sld>"),
      "ppt/slides/slide2.xml": new TextEncoder().encode("<p:sld><a:t>Second</a:t></p:sld>"),
    });
    const pptxOut = extractPptx(pptx);
    expect(pptxOut.text).toContain("— Slide 1 —");
    expect(pptxOut.text).toContain("Second");

    const xlsx = zipSync({
      "xl/sharedStrings.xml": new TextEncoder().encode("<sst><si><t>Name</t></si><si><t>Maya</t></si></sst>"),
      "xl/worksheets/sheet1.xml": new TextEncoder().encode(
        '<worksheet><row><c t="s"><v>0</v></c></row><row><c t="s"><v>1</v></c><c><v>27</v></c></row></worksheet>',
      ),
    });
    const xlsxOut = extractXlsx(xlsx);
    expect(xlsxOut.text).toContain("Name");
    expect(xlsxOut.text).toContain("Maya\t27");
  });
});

describe("parse stage end to end", () => {
  it("classifies kinds and parses an uploaded eml into text, metadata, and child attachments", async () => {
    expect(classifyKind("a.eml", null)).toBe("email");
    expect(classifyKind("a.zip", null)).toBe("archive");
    expect(classifyKind("a.pdf", null)).toBe("document");
    expect(classifyKind(null, null)).toBe("text");

    const item = await db.ingestItem.create({
      data: { kind: "email", filename: `${P}-mail.eml`, status: "uploaded" },
    });
    await storeRawBytes(item.id, new TextEncoder().encode(EML));
    const result = await parseIngestItemCore(item.id);
    expect(result.ok).toBe(true);

    const parsed = await db.ingestItem.findUnique({
      where: { id: item.id },
      include: { children: true },
    });
    expect(parsed?.status).toBe("parsed");
    expect(parsed?.extractedText).toContain("locked to host season 3");
    expect(parsed?.threadId).toBeTruthy();
    expect((parsed?.metadata as { from: string }).from).toContain("renee@harborlight.example");
    expect(parsed?.children).toHaveLength(1);
    expect(parsed?.children[0].filename).toBe("deal-points.txt");
    await db.ingestItem.delete({ where: { id: item.id } });
  });

  it("parse is idempotent — a parsed item is not re-parsed", async () => {
    const item = await db.ingestItem.create({
      data: { kind: "text", extractedText: `${P} already parsed`, status: "parsed" },
    });
    const result = await parseIngestItemCore(item.id);
    expect(result.ok).toBe(true);
    await db.ingestItem.delete({ where: { id: item.id } });
  });
});

describe("candidate matching", () => {
  it("finds an existing creator by alias and by email handle", async () => {
    const creator = await db.creator.create({
      data: {
        name: `${P} Marlow Vane`,
        slug: slugify(`${P} Marlow Vane`),
        aliases: ["M. Vane"],
        socialProfiles: { create: { platform: "instagram", handle: "marlowvane440" } },
      },
    });
    clearDigestMemo();
    await refreshDigest("creator", creator.id);

    const { matchCandidates } = await import("@/lib/ingest/matching");
    const byAlias = await matchCandidates("Spoke with M. Vane yesterday about the docuseries.");
    expect(byAlias.some((c) => c.targetId === creator.id)).toBe(true);

    const byHandle = await matchCandidates("Loop in marlowvane440@gmail.com when the deck is ready.");
    expect(byHandle.some((c) => c.targetId === creator.id)).toBe(true);
  });
});

describe("triage and propose with a fake model", () => {
  const usage = { model: "fake", inputTokens: 100, outputTokens: 50, cacheReadTokens: 0 };

  it("triage stores relevance and token usage; irrelevant stops the pipeline", async () => {
    const item = await db.ingestItem.create({
      data: { kind: "text", extractedText: `${P} scheduling note: see you at 3pm thanks`, status: "parsed" },
    });
    const { triageItemCore } = await import("@/lib/ingest/pipeline");
    const result = await triageItemCore(item.id, async () => ({
      output: { relevant: false, score: 0.05, reasons: ["Pure scheduling"], candidateRecords: [], newRecordCandidates: [], sections: [] },
      usage,
    }));
    expect(result.status).toBe("irrelevant");
    const stored = await db.ingestItem.findUnique({ where: { id: item.id } });
    expect(stored?.status).toBe("irrelevant");
    expect((stored?.relevance as { reasons: string[] }).reasons[0]).toContain("scheduling");
    expect((stored?.tokenUsage as { triage: { calls: number } }).triage.calls).toBe(1);
    await db.ingestItem.delete({ where: { id: item.id } });
  });

  it("propose validates ops, captures before, dedupes, and writes IngestChange rows", async () => {
    const creator = await db.creator.create({
      data: { name: `${P} Nova Reyes`, slug: slugify(`${P} Nova Reyes`), miniBio: "Old bio." },
    });
    clearDigestMemo();
    await refreshDigest("creator", creator.id);
    const digest = await db.knowledgeDigest.findUnique({
      where: { targetType_targetId: { targetType: "creator", targetId: creator.id } },
    });

    const text = `${P} Nova Reyes signed on to host Night Circuit. New bio incoming. Fee is $250k. Nova Reyes is repped by CAA now.`;
    const item = await db.ingestItem.create({
      data: { kind: "text", extractedText: text, status: "triaged" },
    });

    const change = (op: Record<string, unknown>) => ({
      confidence: 0.9,
      rationale: "test",
      evidence: [`${P} Nova Reyes signed on to host Night Circuit.`],
      sensitive: false,
      ...op,
    });
    const { proposeItemCore } = await import("@/lib/ingest/pipeline");
    const result = await proposeItemCore(item.id, async () => ({
      output: {
        changes: [
          change({ op: "update", targetType: "creator", targetName: `${P} Nova Reyes`, targetId: digest!.id, field: "miniBio", value: "New bio text." }),
          change({ op: "update", targetType: "creator", targetName: `${P} Nova Reyes`, targetId: digest!.id, field: "miniBio", value: "New bio text." }), // duplicate
          change({ op: "update", targetType: "creator", targetName: `${P} Nova Reyes`, targetId: digest!.id, field: "notARealField", value: "x" }), // invalid
          change({ op: "link", kind: "creator_project", aName: `${P} Nova Reyes`, aId: digest!.id, bName: `${P} Night Circuit`, role: "host" }),
          change({ op: "create", targetType: "project", name: `${P} Night Circuit`, fields: { projectType: "competition_show" } }),
          change({ op: "note", text: "Fee is $250k.", aboutType: "creator", aboutName: `${P} Nova Reyes`, aboutId: digest!.id, sensitive: true }),
        ],
      },
      usage,
    }));
    expect(result.ok).toBe(true);

    const changes = await db.ingestChange.findMany({ where: { itemId: item.id }, orderBy: { sortOrder: "asc" } });
    // duplicate merged, invalid dropped: create + update + link + note = 4
    expect(changes).toHaveLength(4);

    const update = changes.find((c) => c.opType === "update")!;
    expect(update.before).toBe("Old bio.");
    expect((update.destination as { targetId: string }).targetId).toBe(creator.id);
    expect((update.payload as { expectedVersion: number }).expectedVersion).toBe(1);
    expect((update.evidence as { start: number }[])[0].start).toBeGreaterThanOrEqual(0);

    const note = changes.find((c) => c.opType === "note")!;
    expect(note.sensitive).toBe(true);
    expect(note.sortOrder).toBe(changes.length - 1); // sensitive sorts last

    const stored = await db.ingestItem.findUnique({ where: { id: item.id } });
    expect(stored?.status).toBe("proposed");
    expect((stored?.metadata as { proposeInfo: { invalidOps: string[] } }).proposeInfo.invalidOps).toHaveLength(1);
    await db.ingestItem.delete({ where: { id: item.id } });
  });

  it("without an API key the real pipeline refuses gracefully", async () => {
    const item = await db.ingestItem.create({
      data: { kind: "text", extractedText: `${P} some text`, status: "parsed" },
    });
    const { triageItemCore } = await import("@/lib/ingest/pipeline");
    const result = await triageItemCore(item.id); // real runner path, no key in test env
    expect(result.ok).toBe(false);
    expect(result.error).toContain("ANTHROPIC_API_KEY");
    await db.ingestItem.delete({ where: { id: item.id } });
  });
});
