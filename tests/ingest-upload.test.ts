// The Ingest upload route is the front door for anything new. It must take
// any file type, refuse an oversize upload with a reason (never a bare 413),
// and answer in JSON whatever happens.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

const editor = { id: "", name: "Ingest Tester", email: "ingest-upload@test.local", role: "EDITOR" as const };
vi.mock("@/lib/auth", () => ({
  requireRole: async () => editor,
  requireUser: async () => editor,
  hasRole: () => true,
  getSessionUser: async () => editor,
}));

import { POST } from "@/app/api/ingest/upload/route";
import { INLINE_INGEST_BYTES } from "@/lib/files";

const db = new PrismaClient();
const P = "ZZUpload";

async function cleanup() {
  await db.ingestItem.deleteMany({ where: { OR: [{ filename: { startsWith: P } }, { extractedText: { startsWith: P } }] } });
}

beforeAll(async () => {
  await cleanup();
  const user = await db.user.upsert({ where: { email: editor.email }, update: {}, create: { email: editor.email, name: editor.name, role: "EDITOR", passwordHash: "x" } });
  editor.id = user.id;
});
afterAll(async () => { await cleanup(); await db.$disconnect(); });

const post = async (form: FormData) => {
  const res = await POST(new Request("http://test.local/api/ingest/upload", { method: "POST", body: form }));
  return { status: res.status, body: (await res.json()) as { error?: string; items?: { id: string; filename: string | null; skipped?: string }[] } };
};

describe("the ingest upload route", () => {
  it("takes a file type it cannot read, instead of refusing it", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const form = new FormData();
    form.append("files", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3])], `${P}-photo.png`, { type: "image/png" }));
    form.append("files", new File([new Uint8Array([0x50, 0x4b, 0, 0, 1])], `${P}-deck.key`, { type: "" }));
    const { status, body } = await post(form);
    expect(status).toBe(200);
    expect(body.items?.map((i) => i.skipped ?? "ok")).toEqual(["ok", "ok"]);
    const rows = await db.ingestItem.findMany({ where: { filename: { startsWith: P } }, select: { filename: true, kind: true, rawRetained: true } });
    expect(rows.find((r) => r.filename?.endsWith(".png"))?.kind).toBe("media");
    expect(rows.every((r) => r.rawRetained)).toBe(true);
  });

  it("refuses an upload the site cannot carry, in words, as JSON", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const form = new FormData();
    form.append("files", new File([new Uint8Array(INLINE_INGEST_BYTES + 1024)], `${P}-big.pdf`, { type: "application/pdf" }));
    const { status, body } = await post(form);
    expect(status).toBe(413);
    expect(body.error).toContain(`${P}-big.pdf`);
    expect(body.error).toContain("file storage");
    expect(await db.ingestItem.count({ where: { filename: `${P}-big.pdf` } })).toBe(0);
  });

  it("turns pasted text into an item that needs no parse stage", async () => {
    const form = new FormData();
    form.append("text", `${P} Danny, my buddy Mark and I have a golf-meets-boxing show concept.`);
    form.append("context", "This is a new format");
    const { status, body } = await post(form);
    expect(status).toBe(200);
    const id = body.items?.[0]?.id;
    const item = await db.ingestItem.findUnique({ where: { id: id! } });
    expect(item?.kind).toBe("text");
    expect(item?.status).toBe("parsed");
    expect(item?.context).toBe("This is a new format");
  });
});
