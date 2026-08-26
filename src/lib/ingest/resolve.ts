// Find-or-create resolution for records referenced by name in ingest ops.
// Exact normalized-name (and alias) matches reuse the existing record so the
// knowledge graph never fragments; misses create a minimal record, audited.

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { normalizeName, slugify, uniqueSlug } from "@/lib/slug";
import { ENTITY_KINDS } from "@/lib/taxonomy";
import type { SessionUser } from "@/lib/roles";
import type { IngestTargetType } from "@/lib/ingest/registry";

export type Resolution = { id: string; name: string; created: boolean };

async function freshSlug(
  find: (startsWith: string) => Promise<{ slug: string }[]>,
  name: string,
): Promise<string> {
  const rows = await find(slugify(name));
  return uniqueSlug(name, new Set(rows.map((r) => r.slug)));
}

export async function resolveCreator(name: string, user: SessionUser): Promise<Resolution> {
  const norm = normalizeName(name);
  const all = await db.creator.findMany({ select: { id: true, name: true, aliases: true } });
  const hit = all.find((c) => normalizeName(c.name) === norm || c.aliases.some((a) => normalizeName(a) === norm));
  if (hit) return { id: hit.id, name: hit.name, created: false };
  const creator = await db.creator.create({
    data: {
      name: name.trim(),
      slug: await freshSlug((s) => db.creator.findMany({ where: { slug: { startsWith: s } }, select: { slug: true } }), name),
    },
  });
  await logAudit(user, { targetType: "creator", targetId: creator.id, targetLabel: creator.name, action: "created", field: "ingest" });
  return { id: creator.id, name: creator.name, created: true };
}

export async function resolveProject(title: string, user: SessionUser, projectType?: string): Promise<Resolution> {
  const norm = normalizeName(title);
  const all = await db.project.findMany({ select: { id: true, title: true, aliases: true } });
  const hit = all.find((p) => normalizeName(p.title) === norm || p.aliases.some((a) => normalizeName(a) === norm));
  if (hit) return { id: hit.id, name: hit.title, created: false };
  const project = await db.project.create({
    data: {
      title: title.trim(),
      projectType,
      slug: await freshSlug((s) => db.project.findMany({ where: { slug: { startsWith: s } }, select: { slug: true } }), title),
    },
  });
  await logAudit(user, { targetType: "project", targetId: project.id, targetLabel: project.title, action: "created", field: "ingest" });
  return { id: project.id, name: project.title, created: true };
}

export async function resolveOrganization(name: string, user: SessionUser, orgType?: string): Promise<Resolution> {
  const norm = normalizeName(name);
  const all = await db.organization.findMany({ select: { id: true, name: true, aliases: true } });
  const hit = all.find((o) => normalizeName(o.name) === norm || o.aliases.some((a) => normalizeName(a) === norm));
  if (hit) return { id: hit.id, name: hit.name, created: false };
  const org = await db.organization.create({
    data: {
      name: name.trim(),
      types: orgType ? [orgType] : [],
      slug: await freshSlug((s) => db.organization.findMany({ where: { slug: { startsWith: s } }, select: { slug: true } }), name),
    },
  });
  await logAudit(user, { targetType: "organization", targetId: org.id, targetLabel: org.name, action: "created", field: "ingest" });
  return { id: org.id, name: org.name, created: true };
}

export async function resolvePerson(name: string, user: SessionUser, roleType?: string): Promise<Resolution> {
  const norm = normalizeName(name);
  const all = await db.industryPerson.findMany({ select: { id: true, name: true } });
  const hit = all.find((p) => normalizeName(p.name) === norm);
  if (hit) return { id: hit.id, name: hit.name, created: false };
  const person = await db.industryPerson.create({
    data: {
      name: name.trim(),
      roleType,
      slug: await freshSlug((s) => db.industryPerson.findMany({ where: { slug: { startsWith: s } }, select: { slug: true } }), name),
    },
  });
  await logAudit(user, { targetType: "person", targetId: person.id, targetLabel: person.name, action: "created", field: "ingest" });
  return { id: person.id, name: person.name, created: true };
}

export async function resolveFormat(title: string, user: SessionUser): Promise<Resolution> {
  const norm = normalizeName(title);
  const all = await db.format.findMany({ select: { id: true, title: true } });
  const hit = all.find((f) => normalizeName(f.title) === norm);
  if (hit) return { id: hit.id, name: hit.title, created: false };
  const format = await db.format.create({
    data: {
      title: title.trim(),
      ownerId: user.id,
      slug: await freshSlug((s) => db.format.findMany({ where: { slug: { startsWith: s } }, select: { slug: true } }), title),
    },
  });
  await logAudit(user, { targetType: "format", targetId: format.id, targetLabel: format.title, action: "created", field: "ingest" });
  return { id: format.id, name: format.title, created: true };
}

export async function resolveEntity(kind: string, name: string): Promise<Resolution> {
  const safeKind = (ENTITY_KINDS as readonly string[]).includes(kind) ? kind : "tag";
  const slug = slugify(name);
  const existing = await db.entity.findUnique({ where: { kind_slug: { kind: safeKind, slug } } });
  if (existing) return { id: existing.id, name: existing.name, created: false };
  const aliasHit = await db.entity.findFirst({ where: { kind: safeKind, aliases: { has: name.trim() } } });
  if (aliasHit) return { id: aliasHit.id, name: aliasHit.name, created: false };
  const entity = await db.entity.create({ data: { kind: safeKind, slug, name: name.trim() } });
  return { id: entity.id, name: entity.name, created: true };
}

export async function resolveOpportunity(title: string, user: SessionUser): Promise<Resolution> {
  const norm = normalizeName(title);
  const all = await db.opportunity.findMany({ select: { id: true, title: true } });
  const hit = all.find((o) => normalizeName(o.title) === norm);
  if (hit) return { id: hit.id, name: hit.title, created: false };
  const opp = await db.opportunity.create({
    data: {
      title: title.trim(),
      ownerId: user.id,
      slug: await freshSlug((s) => db.opportunity.findMany({ where: { slug: { startsWith: s } }, select: { slug: true } }), title),
    },
  });
  await logAudit(user, { targetType: "opportunity", targetId: opp.id, targetLabel: opp.title, action: "created", field: "ingest" });
  return { id: opp.id, name: opp.title, created: true };
}

export async function resolveChannel(name: string, user: SessionUser): Promise<Resolution> {
  const norm = normalizeName(name);
  const all = await db.channel.findMany({ select: { id: true, name: true } });
  const hit = all.find((c) => normalizeName(c.name) === norm);
  if (hit) return { id: hit.id, name: hit.name, created: false };
  const channel = await db.channel.create({
    data: {
      name: name.trim(),
      ownerId: user.id,
      slug: await freshSlug((s) => db.channel.findMany({ where: { slug: { startsWith: s } }, select: { slug: true } }), name),
    },
  });
  await logAudit(user, { targetType: "channel", targetId: channel.id, targetLabel: channel.name, action: "created", field: "ingest" });
  return { id: channel.id, name: channel.name, created: true };
}

/** Resolve a by-name reference for any ingest target type. */
export async function resolveByType(
  targetType: IngestTargetType,
  name: string,
  user: SessionUser,
  hint?: string, // projectType / orgType / roleType / entity kind
): Promise<Resolution> {
  switch (targetType) {
    case "creator": return resolveCreator(name, user);
    case "project": return resolveProject(name, user, hint);
    case "organization": return resolveOrganization(name, user, hint);
    case "person": return resolvePerson(name, user, hint);
    case "format": return resolveFormat(name, user);
    case "opportunity": return resolveOpportunity(name, user);
    case "channel": return resolveChannel(name, user);
    case "entity": return resolveEntity(hint ?? "tag", name);
    case "event": {
      const existing = await db.sportsEvent.findFirst({ where: { title: { equals: name.trim(), mode: "insensitive" } } });
      if (existing) return { id: existing.id, name: existing.title, created: false };
      throw new Error("Ingest does not create sports events by reference — use a create op with a start date.");
    }
  }
}
