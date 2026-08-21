"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { normalizeName, slugify, uniqueSlug } from "@/lib/slug";
import { ENTITY_KINDS } from "@/lib/taxonomy";

// Quick-create used by relationship pickers: typing a name that doesn't exist
// offers `Create "X"` and links it immediately. If an exact (normalized) match
// already exists, the existing record is returned instead of fragmenting the
// graph.

export type InlineResult =
  | { ok: true; id: string; name: string; existed: boolean }
  | { ok: false; error: string };

async function freshSlug(
  table: "creator" | "project" | "organization" | "format" | "person" | "collection",
  name: string,
): Promise<string> {
  const base = slugify(name);
  const rows: { slug: string }[] = await (() => {
    const where = { slug: { startsWith: base } };
    switch (table) {
      case "creator": return db.creator.findMany({ where, select: { slug: true } });
      case "project": return db.project.findMany({ where, select: { slug: true } });
      case "organization": return db.organization.findMany({ where, select: { slug: true } });
      case "format": return db.format.findMany({ where, select: { slug: true } });
      case "person": return db.industryPerson.findMany({ where, select: { slug: true } });
      case "collection": return db.collection.findMany({ where, select: { slug: true } });
    }
  })();
  return uniqueSlug(name, new Set(rows.map((r) => r.slug)));
}

export async function createEntityInline(kind: string, name: string): Promise<InlineResult> {
  try {
    const user = await requireRole("EDITOR");
    const clean = name.trim();
    if (!clean) return { ok: false, error: "Name is required." };
    if (!(ENTITY_KINDS as readonly string[]).includes(kind)) {
      return { ok: false, error: "Unknown entity kind." };
    }
    const slug = slugify(clean);
    const existing = await db.entity.findFirst({
      where: { kind, OR: [{ slug }, { name: { equals: clean, mode: "insensitive" } }] },
    });
    if (existing) return { ok: true, id: existing.id, name: existing.name, existed: true };
    const entity = await db.entity.create({ data: { kind, slug, name: clean } });
    await logAudit(user, { targetType: "entity", targetId: entity.id, targetLabel: entity.name, action: "created" });
    revalidatePath("/", "layout");
    return { ok: true, id: entity.id, name: entity.name, existed: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create." };
  }
}

export async function createOrganizationInline(name: string, type?: string): Promise<InlineResult> {
  try {
    const user = await requireRole("EDITOR");
    const clean = name.trim();
    if (!clean) return { ok: false, error: "Name is required." };
    const norm = normalizeName(clean);
    const candidates = await db.organization.findMany({ where: { archived: false } , select: { id: true, name: true } });
    const exact = candidates.find((c) => normalizeName(c.name) === norm);
    if (exact) return { ok: true, id: exact.id, name: exact.name, existed: true };
    const orgRecord = await db.organization.create({
      data: { slug: await freshSlug("organization", clean), name: clean, types: type ? [type] : [] },
    });
    await logAudit(user, { targetType: "organization", targetId: orgRecord.id, targetLabel: orgRecord.name, action: "created" });
    revalidatePath("/", "layout");
    return { ok: true, id: orgRecord.id, name: orgRecord.name, existed: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create." };
  }
}

export async function createProjectInline(title: string, projectType?: string): Promise<InlineResult> {
  try {
    const user = await requireRole("EDITOR");
    const clean = title.trim();
    if (!clean) return { ok: false, error: "Title is required." };
    const norm = normalizeName(clean);
    const candidates = await db.project.findMany({ where: { archived: false }, select: { id: true, title: true } });
    const exact = candidates.find((c) => normalizeName(c.title) === norm);
    if (exact) return { ok: true, id: exact.id, name: exact.title, existed: true };
    const project = await db.project.create({
      data: { slug: await freshSlug("project", clean), title: clean, projectType },
    });
    await logAudit(user, { targetType: "project", targetId: project.id, targetLabel: project.title, action: "created" });
    revalidatePath("/", "layout");
    return { ok: true, id: project.id, name: project.title, existed: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create." };
  }
}

export async function createPersonInline(name: string, roleType?: string): Promise<InlineResult> {
  try {
    const user = await requireRole("EDITOR");
    const clean = name.trim();
    if (!clean) return { ok: false, error: "Name is required." };
    const norm = normalizeName(clean);
    const candidates = await db.industryPerson.findMany({ where: { archived: false }, select: { id: true, name: true } });
    const exact = candidates.find((c) => normalizeName(c.name) === norm);
    if (exact) return { ok: true, id: exact.id, name: exact.name, existed: true };
    const personRecord = await db.industryPerson.create({
      data: { slug: await freshSlug("person", clean), name: clean, roleType },
    });
    await logAudit(user, { targetType: "person", targetId: personRecord.id, targetLabel: personRecord.name, action: "created" });
    revalidatePath("/", "layout");
    return { ok: true, id: personRecord.id, name: personRecord.name, existed: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create." };
  }
}

export async function createFormatInline(title: string): Promise<InlineResult> {
  try {
    const user = await requireRole("EDITOR");
    const clean = title.trim();
    if (!clean) return { ok: false, error: "Title is required." };
    const norm = normalizeName(clean);
    const candidates = await db.format.findMany({ where: { archived: false }, select: { id: true, title: true } });
    const exact = candidates.find((c) => normalizeName(c.title) === norm);
    if (exact) return { ok: true, id: exact.id, name: exact.title, existed: true };
    const format = await db.format.create({
      data: { slug: await freshSlug("format", clean), title: clean, ownerId: user.id },
    });
    await logAudit(user, { targetType: "format", targetId: format.id, targetLabel: format.title, action: "created" });
    revalidatePath("/", "layout");
    return { ok: true, id: format.id, name: format.title, existed: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create." };
  }
}

export async function createCollectionInline(name: string): Promise<InlineResult> {
  try {
    const user = await requireRole("EDITOR");
    const clean = name.trim();
    if (!clean) return { ok: false, error: "Name is required." };
    const existing = await db.collection.findFirst({
      where: { name: { equals: clean, mode: "insensitive" } },
    });
    if (existing) return { ok: true, id: existing.id, name: existing.name, existed: true };
    const collection = await db.collection.create({
      data: { slug: await freshSlug("collection", clean), name: clean, ownerId: user.id },
    });
    await logAudit(user, { targetType: "collection", targetId: collection.id, targetLabel: collection.name, action: "created" });
    revalidatePath("/", "layout");
    return { ok: true, id: collection.id, name: collection.name, existed: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create." };
  }
}
