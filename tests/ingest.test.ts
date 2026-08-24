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

const db = new PrismaClient();
const P = "ZZIngest";

async function cleanup() {
  await db.knowledgeDigest.deleteMany({ where: { name: { startsWith: P } } });
  await db.creator.deleteMany({ where: { name: { startsWith: P } } });
  await db.entity.deleteMany({ where: { name: { startsWith: P } } });
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
