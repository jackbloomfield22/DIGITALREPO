// Backup system tests: the dump must cover every model in the schema (so new
// tables can never be silently missing from backups), and a snapshot must
// round-trip real data.

import { describe, it, expect, afterAll } from "vitest";
import { writeFileSync } from "node:fs";
import { Prisma, PrismaClient } from "@prisma/client";
import { buildBackup, createSnapshot, decodeBytesFields, TABLE_ORDER } from "@/lib/backup";

const db = new PrismaClient();
afterAll(() => db.$disconnect());

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

describe("backup coverage", () => {
  it("includes every model in the schema except Snapshot itself", () => {
    const modelNames = Prisma.dmmf.datamodel.models
      .map((m) => lowerFirst(m.name))
      .filter((name) => name !== "snapshot");
    const covered = new Set<string>(TABLE_ORDER);
    const missing = modelNames.filter((name) => !covered.has(name));
    expect(missing).toEqual([]);
  });
});

describe("backup round trip", () => {
  it("captures users and all content with correct counts", async () => {
    const backup = await buildBackup();
    expect(backup.format).toBe("digital-bible-backup");
    const [users, creators, credits] = await Promise.all([
      db.user.count(),
      db.creator.count(),
      db.creatorProjectCredit.count(),
    ]);
    expect(backup.tables.user).toHaveLength(users);
    expect(backup.tables.creator).toHaveLength(creators);
    expect(backup.tables.creatorProjectCredit).toHaveLength(credits);
    expect(users).toBeGreaterThan(0);

    // Export for the restore-script integration check (run outside vitest).
    writeFileSync("/tmp/claude-0/test-backup.json", JSON.stringify(backup));
  });

  it("round-trips Bytes columns as JSON-safe base64 markers", async () => {
    const data = new Uint8Array([0, 44, 40, 255, 128, 7]);
    const file = await db.storedFile.create({
      data: { key: "zz-test-bytes.bin", mimeType: "application/octet-stream", sizeBytes: data.byteLength, data },
    });
    try {
      const backup = JSON.parse(JSON.stringify(await buildBackup())) as {
        tables: { storedFile: Record<string, unknown>[] };
      };
      const row = backup.tables.storedFile.find((r) => r.key === "zz-test-bytes.bin");
      expect(row).toBeTruthy();
      expect((row!.data as { $bytes: string }).$bytes).toBeTypeOf("string");
      const decoded = decodeBytesFields(row!);
      expect(new Uint8Array(decoded.data as Buffer)).toEqual(data);
    } finally {
      await db.storedFile.delete({ where: { id: file.id } });
    }
  });

  it("stores a snapshot with a size and per-table counts", async () => {
    const snapshot = await createSnapshot("manual", "test");
    expect(snapshot.sizeBytes).toBeGreaterThan(1000);
    const stored = await db.snapshot.findUnique({ where: { id: snapshot.id } });
    const counts = stored?.counts as Record<string, number>;
    expect(counts.creator).toBe(await db.creator.count());
    await db.snapshot.delete({ where: { id: snapshot.id } });
  });
});
