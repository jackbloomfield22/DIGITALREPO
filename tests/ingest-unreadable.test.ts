// A file the parser cannot read is not a failure. Pointed at a page, it lands
// there as a file and the item is done. Not pointed anywhere, it is kept and
// the review page says what to do. Neither needs an AI key.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { slugify } from "@/lib/slug";
import { classifyKind, parseIngestItemCore } from "@/lib/ingest/parse";
import { triageItemCore } from "@/lib/ingest/pipeline";
import { storeRawBytes } from "@/lib/ingest/storage";

const db = new PrismaClient();
const P = "ZZUnread";
let userId = "";
let formatId = "";

async function cleanup() {
  const items = await db.ingestItem.findMany({ where: { filename: { startsWith: P } }, select: { id: true } });
  for (const i of items) await db.ingestItem.delete({ where: { id: i.id } });
  const atts = await db.attachment.findMany({ where: { filename: { startsWith: P } } });
  for (const a of atts) {
    await db.attachment.delete({ where: { id: a.id } });
    if (a.storage === "db") await db.storedFile.deleteMany({ where: { key: a.storedPath } });
  }
  await db.auditLog.deleteMany({ where: { targetLabel: { startsWith: P } } });
  await db.format.deleteMany({ where: { title: { startsWith: P } } });
}

beforeAll(async () => {
  await cleanup();
  const u = await db.user.upsert({ where: { email: "unreadable@test.local" }, update: {}, create: { email: "unreadable@test.local", name: "Unreadable Tester", role: "EDITOR", passwordHash: "x" } });
  userId = u.id;
  const f = await db.format.create({ data: { title: `${P} Golf Boxing`, slug: slugify(`${P} Golf Boxing`), status: "idea" } });
  formatId = f.id;
});
afterAll(async () => { await cleanup(); await db.$disconnect(); });

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);

describe("files the parser cannot read", () => {
  it("classifies pictures, video and audio as media", () => {
    expect(classifyKind("poster.PNG", null)).toBe("media");
    expect(classifyKind("sizzle.mov", "video/quicktime")).toBe("media");
    expect(classifyKind("clip", "audio/mpeg")).toBe("media");
    expect(classifyKind("deck.key", null)).toBe("document");
  });

  it("puts a picture straight onto the page it was for, and finishes the item", async () => {
    const item = await db.ingestItem.create({
      data: { kind: "media", filename: `${P}-poster.png`, mimeType: "image/png", sizeBytes: PNG.byteLength, status: "uploaded", createdById: userId, metadata: { attachTo: { type: "format", id: formatId } } },
    });
    await storeRawBytes(item.id, PNG);
    const result = await parseIngestItemCore(item.id);
    expect(result).toMatchObject({ ok: true, status: "applied" });

    const after = await db.ingestItem.findUnique({ where: { id: item.id } });
    expect(after?.status).toBe("applied");
    expect(after?.error).toBeNull();
    expect((after?.metadata as { unreadable: boolean; attachedTo: number }).attachedTo).toBe(1);

    const att = await db.attachment.findFirst({ where: { targetType: "format", targetId: formatId, filename: `${P}-poster.png` } });
    expect(att).toBeTruthy();
    expect(att?.sizeBytes).toBe(PNG.byteLength);
    const audit = await db.auditLog.findFirst({ where: { targetType: "format", targetId: formatId, field: "attachment" } });
    expect(audit?.userId).toBe(userId);
  });

  it("keeps an unknown binary with no page, and triage says what to do without an AI key", async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 1, 2, 3]);
    const item = await db.ingestItem.create({ data: { kind: "document", filename: `${P}-deck.key`, status: "uploaded", createdById: userId } });
    await storeRawBytes(item.id, bytes);
    expect(await parseIngestItemCore(item.id)).toMatchObject({ ok: true });
    const parsed = await db.ingestItem.findUnique({ where: { id: item.id } });
    expect(parsed?.status).toBe("parsed");
    expect((parsed?.metadata as { unreadable: boolean }).unreadable).toBe(true);

    delete process.env.ANTHROPIC_API_KEY;
    const triaged = await triageItemCore(item.id);
    expect(triaged).toMatchObject({ ok: true, status: "irrelevant" });
    const done = await db.ingestItem.findUnique({ where: { id: item.id } });
    expect((done?.relevance as { reasons: string[] }).reasons[0]).toContain("This file is for");
  });

  it("no longer fails an Outlook .msg; it is kept and the reason says how to have it read", async () => {
    const item = await db.ingestItem.create({ data: { kind: "email", filename: `${P}-note.msg`, status: "uploaded", createdById: userId } });
    await storeRawBytes(item.id, new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 1]));
    expect(await parseIngestItemCore(item.id)).toMatchObject({ ok: true });
    const after = await db.ingestItem.findUnique({ where: { id: item.id } });
    expect(after?.status).toBe("parsed");
    expect((after?.metadata as { unreadableReason: string }).unreadableReason).toContain(".eml");
  });
});
