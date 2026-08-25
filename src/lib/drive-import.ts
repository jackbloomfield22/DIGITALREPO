// Bulk knowledge import — shared core.
//
// Takes "batch" JSON (the shape produced when extracting a folder of notes into
// structured records), consolidates duplicates across files, and loads the
// result into the database. Used by two callers:
//
//   • Admin → Bulk Upload (browser): the file is staged, then loaded in small
//     chunks so a large bundle never exceeds a serverless request budget.
//   • scripts/import-drive-notes.ts (CLI): same code, run in one pass.
//
// Every step is idempotent. Records are matched by normalized name/title,
// blank fields are filled rather than overwritten, and note blocks are appended
// only when the exact text isn't already present — so re-running (or clicking
// Import twice) enriches instead of duplicating.

import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { refreshDigest } from "@/lib/ingest/digest";

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------
export type ImportOrg = { name: string; aliases: string[]; types: string[]; description?: string; website?: string; location?: string; notes: string[] };
export type ImportPerson = { name: string; aliases: string[]; title?: string; roleType?: string; email?: string; phone?: string; org?: string; notes: string[]; uncertain?: boolean };
export type ImportTalent = { name: string; aliases: string[]; types: string[]; sports: string[]; interests: string[]; headline?: string; basedIn?: string; age?: number; notes: string[]; audience?: Record<string, number> };
export type ImportProject = { title: string; projectType?: string; status?: string; logline?: string; premiereYear?: number; notes: string[]; orgs: { name: string; relationship: string }[]; credits: { creator: string; role: string }[]; people: { name: string; role: string }[] };
export type ImportFormat = { title: string; formatType?: string; status?: string; logline?: string; targetPlatform?: string; notes: string[]; talent: string[]; orgs: { name: string; relationship: string }[]; people: { name: string; role: string }[] };
export type ImportOpp = { title: string; type?: string; status?: string; description?: string; notes: string[]; orgs: string[] };

export type Consolidated = {
  orgs: ImportOrg[];
  people: ImportPerson[];
  talent: ImportTalent[];
  projects: ImportProject[];
  formats: ImportFormat[];
  opportunities: ImportOpp[];
};

export const IMPORT_PHASES = ["organizations", "people", "talent", "projects", "formats", "opportunities"] as const;
export type ImportPhase = (typeof IMPORT_PHASES)[number];

export const PHASE_LABELS: Record<ImportPhase, string> = {
  organizations: "Organizations",
  people: "Industry people",
  talent: "Talent",
  projects: "Projects",
  formats: "Formats",
  opportunities: "Opportunities",
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Accepts an array of batches, `{ batches: [...] }`, or a single batch object. */
export function parseBundle(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const maybe = (raw as { batches?: unknown }).batches;
    if (Array.isArray(maybe)) return maybe;
    return [raw];
  }
  throw new Error("Bundle must be a JSON object or array.");
}

// ---------------------------------------------------------------------------
// Consolidation — tolerant walker over the extraction files
// ---------------------------------------------------------------------------
/* eslint-disable @typescript-eslint/no-explicit-any */
export function consolidateBatches(batches: unknown[]): Consolidated {
  const orgs = new Map<string, ImportOrg>();
  const people = new Map<string, ImportPerson>();
  const talent = new Map<string, ImportTalent>();
  const projects = new Map<string, ImportProject>();
  const formats = new Map<string, ImportFormat>();
  const opps = new Map<string, ImportOpp>();

  const getOrg = (name: string) => {
    const k = norm(name);
    if (!orgs.has(k)) orgs.set(k, { name: name.trim(), aliases: [], types: [], notes: [] });
    return orgs.get(k)!;
  };
  const getPerson = (name: string) => {
    const k = norm(name);
    if (!people.has(k)) people.set(k, { name: name.trim(), aliases: [], notes: [] });
    return people.get(k)!;
  };
  const getTalent = (name: string) => {
    const k = norm(name);
    if (!talent.has(k)) talent.set(k, { name: name.trim(), aliases: [], types: [], sports: [], interests: [], notes: [] });
    return talent.get(k)!;
  };
  const getProject = (title: string) => {
    const k = norm(title);
    if (!projects.has(k)) projects.set(k, { title: title.trim(), notes: [], orgs: [], credits: [], people: [] });
    return projects.get(k)!;
  };
  const getFormat = (title: string) => {
    const k = norm(title);
    if (!formats.has(k)) formats.set(k, { title: title.trim(), notes: [], talent: [], orgs: [], people: [] });
    return formats.get(k)!;
  };
  const getOpp = (title: string) => {
    const k = norm(title);
    if (!opps.has(k)) opps.set(k, { title: title.trim(), notes: [], orgs: [] });
    return opps.get(k)!;
  };

  const pushNote = (arr: string[], note?: unknown) => {
    if (typeof note === "string" && note.trim() && !arr.includes(note.trim())) arr.push(note.trim());
  };

  function ingestOrgEntry(e: any) {
    if (!e?.name) return;
    const o = getOrg(e.name);
    for (const a of e.aliases ?? []) if (!o.aliases.includes(a)) o.aliases.push(a);
    for (const t of e.types ?? []) if (!o.types.includes(t)) o.types.push(t);
    if (e.description && !o.description) o.description = e.description;
    else pushNote(o.notes, e.description && e.description !== o.description ? e.description : undefined);
    if (e.website) o.website = o.website ?? e.website;
    if (e.location) o.location = o.location ?? e.location;
    pushNote(o.notes, e.notes);
    pushNote(o.notes, e.update);
  }

  function ingestPersonEntry(e: any) {
    if (!e?.name) return;
    const p = getPerson(e.name);
    for (const a of e.aliases ?? []) if (!p.aliases.includes(a)) p.aliases.push(a);
    if (e.title && !p.title) p.title = e.title;
    if (e.roleType && !p.roleType) p.roleType = e.roleType;
    if (e.email) p.email = p.email ?? e.email;
    if (e.phone) p.phone = p.phone ?? e.phone;
    if (e.org && !p.org) p.org = e.org;
    if (e.uncertain) p.uncertain = true;
    pushNote(p.notes, e.notes);
    pushNote(p.notes, e.update);
  }

  function ingestTalentEntry(e: any) {
    if (!e?.name) return;
    const t = getTalent(e.name);
    for (const a of e.aliases ?? []) if (!t.aliases.includes(a)) t.aliases.push(a);
    for (const ty of e.types ?? []) if (!t.types.includes(ty)) t.types.push(ty);
    for (const s of e.sports ?? []) if (!t.sports.includes(s)) t.sports.push(s);
    for (const i of e.interests ?? []) if (!t.interests.includes(i)) t.interests.push(i);
    if (e.headline && !t.headline) t.headline = e.headline;
    if (e.basedIn && !t.basedIn) t.basedIn = e.basedIn;
    if (typeof e.age === "number") t.age = t.age ?? e.age;
    if (e.audience) t.audience = t.audience ?? e.audience;
    pushNote(t.notes, e.notes);
    pushNote(t.notes, e.appendNotes);
    pushNote(t.notes, e.update);
  }

  function ingestProjectEntry(titleKey: string | undefined, e: any) {
    const title = e?.title ?? titleKey;
    if (!title) return;
    const p = getProject(title);
    if (e.projectType && !p.projectType) p.projectType = e.projectType;
    if (e.status && !p.status) p.status = e.status;
    if (e.logline && !p.logline) p.logline = e.logline;
    if (typeof e.premiereYear === "number") p.premiereYear = p.premiereYear ?? e.premiereYear;
    for (const o of e.orgs ?? []) if (o?.name) p.orgs.push({ name: o.name, relationship: o.relationship ?? "partner" });
    for (const c of e.credits ?? []) if (c?.creator) p.credits.push({ creator: c.creator, role: c.role ?? "talent" });
    for (const pp of e.people ?? []) if (pp?.name) p.people.push({ name: pp.name, role: pp.role ?? "" });
    for (const key of ["notes", "appendNotes", "appendNotes2", "appendNotes3", "update"]) pushNote(p.notes, e[key]);
  }

  function ingestFormatEntry(titleKey: string | undefined, e: any) {
    const title = e?.title ?? titleKey;
    if (!title || e?.noop) return;
    const f = getFormat(title);
    if (e.formatType && !f.formatType) f.formatType = e.formatType;
    if (e.status && !f.status) f.status = e.status;
    if (e.logline && !f.logline) f.logline = e.logline;
    if (e.targetPlatform && !f.targetPlatform) f.targetPlatform = e.targetPlatform;
    if (e.sensitive) pushNote(f.notes, "SENSITIVE — handle with care.");
    for (const t of e.talent ?? []) if (!f.talent.includes(t)) f.talent.push(t);
    for (const o of e.orgs ?? []) if (o?.name) f.orgs.push({ name: o.name, relationship: o.relationship ?? "partner" });
    for (const pp of e.people ?? []) if (pp?.name) f.people.push({ name: pp.name, role: pp.role ?? "" });
    for (const key of ["notes", "appendNotes", "appendNotes2", "appendNotes3", "update"]) pushNote(f.notes, e[key]);
  }

  function ingestOppEntry(e: any) {
    if (!e?.title) return;
    const o = getOpp(e.title);
    if (e.type && !o.type) o.type = e.type;
    if (e.status && !o.status) o.status = e.status;
    if (e.description && !o.description) o.description = e.description;
    for (const org of e.orgs ?? []) if (typeof org === "string") o.orgs.push(org);
    pushNote(o.notes, e.notes);
  }

  function walkBatch(data: any) {
    if (!data || typeof data !== "object") return;
    for (const [key, value] of Object.entries<any>(data)) {
      const k = key.toLowerCase();
      if (k.includes("organization")) {
        for (const e of Array.isArray(value) ? value : []) ingestOrgEntry(e);
      } else if (k.startsWith("people") || k === "people_new") {
        for (const e of Array.isArray(value) ? value : []) ingestPersonEntry(e);
      } else if (k.startsWith("talent")) {
        for (const e of Array.isArray(value) ? value : []) ingestTalentEntry(e);
      } else if (k.startsWith("project")) {
        if (Array.isArray(value)) for (const e of value) ingestProjectEntry(undefined, e);
        else for (const [t, e] of Object.entries<any>(value ?? {})) ingestProjectEntry(t, e ?? {});
      } else if (k.startsWith("format")) {
        if (Array.isArray(value)) for (const e of value) ingestFormatEntry(undefined, e);
        else for (const [t, e] of Object.entries<any>(value ?? {})) ingestFormatEntry(t, e ?? {});
      } else if (k.includes("opportunit")) {
        for (const e of Array.isArray(value) ? value : []) ingestOppEntry(e);
      } else if (k === "soccer_agent_contacts") {
        const lines = (value as any[]).map((r) => `${r.player} — ${r.agency}: ${r.contacts}`);
        pushNote(getProject("Destination World Cup 2026").notes, `SOCCER AGENT CONTACT GRID (DWC talent outreach, Oct 2025):\n${lines.join("\n")}`);
      } else if (k === "klutch_nil_roster_aug2025") {
        for (const row of (value as string[]) ?? []) {
          if (typeof row !== "string" || row.startsWith("SOURCE")) continue;
          const [name, school] = row.split(" — ");
          if (!name) continue;
          const t = getTalent(name.trim());
          if (!t.types.includes("Athlete")) t.types.push("Athlete");
          if (!t.sports.includes("Football")) t.sports.push("Football");
          pushNote(t.notes, `KLUTCH NIL client (roster as of Aug 2025)${school ? ` — ${school}` : ""}.`);
        }
      } else if (k === "notes_misc") {
        for (const n of Array.isArray(value) ? value : []) {
          const s = String(n);
          if (s.startsWith("4.4.Forty Digital Roadmap")) pushNote(getOrg("4.4.Forty Media").notes, s);
          else if (s.startsWith("Sprite")) pushNote(getOrg("Sprite").notes, s);
          else if (s.startsWith("Sensodyne")) pushNote(getOrg("Sensodyne").notes, s);
          else if (s.startsWith("Draymond BROKE")) pushNote(getFormat("BROKE").notes, s);
          else if (s.startsWith("WCBB research")) pushNote(getOpp("Bleacher Report digital slate").notes, s);
        }
      }
      // "source", "sources", "note", "extraction_note" — provenance only; it is
      // already carried inside each record's notes.
    }
  }

  for (const b of batches) walkBatch(b);

  // Every person named on a project or format also earns a person record.
  for (const p of projects.values()) for (const pp of p.people) getPerson(pp.name);
  for (const f of formats.values()) for (const pp of f.people) getPerson(pp.name);

  return {
    orgs: [...orgs.values()],
    people: [...people.values()],
    talent: [...talent.values()],
    projects: [...projects.values()],
    formats: [...formats.values()],
    opportunities: [...opps.values()],
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function phaseItems(c: Consolidated, phase: ImportPhase): unknown[] {
  switch (phase) {
    case "organizations": return c.orgs;
    case "people": return c.people;
    case "talent": return c.talent;
    case "projects": return c.projects;
    case "formats": return c.formats;
    case "opportunities": return c.opportunities;
  }
}

export function importTotals(c: Consolidated): Record<ImportPhase, number> {
  return {
    organizations: c.orgs.length,
    people: c.people.length,
    talent: c.talent.length,
    projects: c.projects.length,
    formats: c.formats.length,
    opportunities: c.opportunities.length,
  };
}

// ---------------------------------------------------------------------------
// Load helpers
// ---------------------------------------------------------------------------
const FORMAT_STATUS: Record<string, string> = {
  idea: "idea", concept: "concept", researching: "concept", developing: "developing",
  outbound: "outbound", pitched: "pitched", in_discussion: "in_discussion",
  sold: "sold", produced: "produced", passed: "passed", archived: "archived",
};
const PROJECT_STATUS: Record<string, string> = {
  in_production: "in_production", post_production: "in_production", released: "released",
  airing: "airing", announced: "announced",
};

/** Append note blocks that aren't already present, so re-runs never duplicate. */
function mergeNotes(existing: string | null | undefined, incoming: string): string | null {
  const current = (existing ?? "").trim();
  const blocks = incoming
    .split("\n\n")
    .map((b) => b.trim())
    .filter((b) => b && !current.includes(b));
  if (!blocks.length) return current || null;
  return [current, ...blocks].filter(Boolean).join("\n\n");
}

const joinNotes = (notes: string[]) => notes.join("\n\n");

async function ensureEntity(kind: string, name: string): Promise<string> {
  const slug = slugify(name);
  const existing = await db.entity.findFirst({ where: { OR: [{ kind, slug }, { kind, name }] } });
  if (existing) return existing.id;
  return (await db.entity.create({ data: { kind, name, slug } })).id;
}

type SlugModel = "creator" | "project" | "organization" | "format" | "opportunity" | "industryPerson";
async function uniqueSlug(model: SlugModel, base: string): Promise<string> {
  let slug = base || "record";
  let i = 2;
  for (;;) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hit = await (db as any)[model].findUnique({ where: { slug } });
    if (!hit) return slug;
    slug = `${base}-${i++}`;
  }
}

async function resolveOrgIds(names: string[]): Promise<Map<string, string>> {
  const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const map = new Map<string, string>();
  if (!wanted.length) return map;
  const rows = await db.organization.findMany({
    where: { OR: [{ name: { in: wanted } }, { aliases: { hasSome: wanted } }] },
    select: { id: true, name: true, aliases: true },
  });
  for (const r of rows) {
    map.set(norm(r.name), r.id);
    for (const a of r.aliases) if (!map.has(norm(a))) map.set(norm(a), r.id);
  }
  return map;
}

async function resolvePersonIds(names: string[]): Promise<Map<string, string>> {
  const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const map = new Map<string, string>();
  if (!wanted.length) return map;
  const rows = await db.industryPerson.findMany({ where: { name: { in: wanted } }, select: { id: true, name: true } });
  for (const r of rows) map.set(norm(r.name), r.id);
  return map;
}

async function resolveTalentIds(names: string[]): Promise<Map<string, string>> {
  const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const map = new Map<string, string>();
  if (!wanted.length) return map;
  const rows = await db.creator.findMany({
    where: { OR: [{ name: { in: wanted } }, { aliases: { hasSome: wanted } }] },
    select: { id: true, name: true, aliases: true },
  });
  for (const r of rows) {
    map.set(norm(r.name), r.id);
    for (const a of r.aliases) if (!map.has(norm(a))) map.set(norm(a), r.id);
  }
  return map;
}

/**
 * Stamped on every RecordSource row an import creates. Records that already
 * existed are enriched instead, and get no link — so this marker identifies
 * exactly the rows an import brought into being, and nothing else.
 */
export const IMPORT_RECORD_NOTE = "Created by the bulk knowledge import.";

export type ImportSourceInfo = { id: string; title: string; url: string };

/** The provenance record every imported row is linked to. Idempotent. */
export async function ensureImportSource(
  addedById: string,
  title: string,
  url: string,
  notes: string,
): Promise<ImportSourceInfo> {
  const existing = await db.source.findFirst({ where: { title } });
  if (existing) return { id: existing.id, title: existing.title ?? title, url: existing.url ?? url };
  const created = await db.source.create({
    data: { title, url, sourceType: "internal", notes, addedById },
  });
  return { id: created.id, title: created.title ?? title, url: created.url ?? url };
}

async function linkSource(sourceId: string, targetType: string, targetId: string, note: string) {
  await db.recordSource.upsert({
    where: { sourceId_targetType_targetId: { sourceId, targetType, targetId } },
    update: {},
    create: { sourceId, targetType, targetId, note },
  });
}

export type ChunkResult = {
  phase: ImportPhase;
  processed: number;
  created: number;
  enriched: number;
  total: number;
  nextOffset: number | null;
};

// ---------------------------------------------------------------------------
// Chunked loader — one slice of one phase per call
// ---------------------------------------------------------------------------
export async function runImportChunk(
  c: Consolidated,
  phase: ImportPhase,
  offset: number,
  limit: number,
  sourceId: string,
): Promise<ChunkResult> {
  const all = phaseItems(c, phase);
  const slice = all.slice(offset, offset + limit);
  const sourceNote = IMPORT_RECORD_NOTE;
  let created = 0;
  let enriched = 0;

  if (phase === "organizations") {
    for (const o of slice as ImportOrg[]) {
      const existing = await db.organization.findFirst({ where: { OR: [{ name: o.name }, { aliases: { has: o.name } }] } });
      let id: string;
      if (existing) {
        id = existing.id;
        await db.organization.update({
          where: { id },
          data: {
            aliases: [...new Set([...existing.aliases, ...o.aliases])],
            types: [...new Set([...existing.types, ...o.types])],
            description: existing.description ?? o.description ?? null,
            website: existing.website ?? o.website ?? null,
            location: existing.location ?? o.location ?? null,
            internalNotes: mergeNotes(existing.internalNotes, joinNotes(o.notes)),
          },
        });
        enriched++;
      } else {
        const row = await db.organization.create({
          data: {
            name: o.name, slug: await uniqueSlug("organization", slugify(o.name)),
            aliases: o.aliases, types: o.types.length ? o.types : ["other"],
            description: o.description ?? null, website: o.website ?? null, location: o.location ?? null,
            internalNotes: joinNotes(o.notes) || null,
          },
        });
        id = row.id;
        created++;
        await linkSource(sourceId, "organization", id, sourceNote);
      }
      await refreshDigest("organization", id);
    }
  }

  if (phase === "people") {
    const orgIds = await resolveOrgIds((slice as ImportPerson[]).map((p) => p.org ?? ""));
    for (const p of slice as ImportPerson[]) {
      const noteText = [p.uncertain ? "NAME UNCERTAIN — from meeting notes; verify." : "", joinNotes(p.notes)]
        .filter(Boolean)
        .join("\n");
      // Promote an email mentioned in the notes into the structured field.
      let email = p.email;
      if (!email) {
        const m = noteText.match(/[\w.+-]+@[\w-]+\.[\w.-]+\w/);
        if (m) email = m[0];
      }
      const existing = await db.industryPerson.findFirst({ where: { name: p.name.trim() } });
      let id: string;
      if (existing) {
        id = existing.id;
        await db.industryPerson.update({
          where: { id },
          data: {
            title: existing.title ?? p.title ?? null,
            roleType: existing.roleType ?? p.roleType ?? null,
            email: existing.email ?? email ?? null,
            phone: existing.phone ?? p.phone ?? null,
            notes: mergeNotes(existing.notes, noteText),
          },
        });
        enriched++;
      } else {
        const row = await db.industryPerson.create({
          data: {
            name: p.name.trim(), slug: await uniqueSlug("industryPerson", slugify(p.name)),
            title: p.title ?? null, roleType: p.roleType ?? null,
            email: email ?? null, phone: p.phone ?? null, notes: noteText || null,
          },
        });
        id = row.id;
        created++;
        await linkSource(sourceId, "person", id, sourceNote);
      }
      const orgId = p.org ? orgIds.get(norm(p.org)) : undefined;
      if (orgId) {
        const clash = await db.personOrganization.findFirst({ where: { personId: id, organizationId: orgId } });
        if (!clash) await db.personOrganization.create({ data: { personId: id, organizationId: orgId, role: p.title ?? null, current: true } });
      }
      await refreshDigest("person", id);
    }
  }

  if (phase === "talent") {
    for (const t of slice as ImportTalent[]) {
      const existing = await db.creator.findFirst({ where: { OR: [{ name: t.name.trim() }, { aliases: { has: t.name.trim() } }] } });
      let id: string;
      if (existing) {
        id = existing.id;
        await db.creator.update({
          where: { id },
          data: {
            headline: existing.headline ?? t.headline ?? null,
            age: existing.age ?? t.age ?? null,
            aliases: [...new Set([...existing.aliases, ...t.aliases])],
            internalNotes: mergeNotes(existing.internalNotes, joinNotes(t.notes)),
          },
        });
        enriched++;
      } else {
        const row = await db.creator.create({
          data: {
            name: t.name.trim(), slug: await uniqueSlug("creator", slugify(t.name)),
            aliases: t.aliases, headline: t.headline ?? null, age: t.age ?? null,
            internalNotes: joinNotes(t.notes) || null, status: "active",
          },
        });
        id = row.id;
        created++;
        await linkSource(sourceId, "creator", id, sourceNote);
      }

      const links: { kind: string; name: string; relationship?: string }[] = [
        ...t.types.map((x) => ({ kind: "creator_category", name: x })),
        ...t.sports.map((x) => ({ kind: "sport", name: x })),
        ...t.interests.map((x) => ({ kind: "interest", name: x })),
        ...(t.basedIn ? [{ kind: "location", name: t.basedIn, relationship: "based_in" }] : []),
      ];
      for (const l of links) {
        const entityId = await ensureEntity(l.kind, l.name);
        await db.creatorEntityLink.upsert({
          where: { creatorId_entityId_relationship: { creatorId: id, entityId, relationship: l.relationship ?? "" } },
          update: {},
          create: { creatorId: id, entityId, relationship: l.relationship ?? "" },
        });
      }
      if (t.audience) {
        for (const [platform, count] of Object.entries(t.audience)) {
          const clash = await db.socialProfile.findFirst({ where: { creatorId: id, platform } });
          if (!clash) await db.socialProfile.create({ data: { creatorId: id, platform, followerCount: count, countUpdatedAt: new Date() } });
        }
      }
      await refreshDigest("creator", id);
    }
  }

  if (phase === "projects") {
    const items = slice as ImportProject[];
    const orgIds = await resolveOrgIds(items.flatMap((p) => p.orgs.map((o) => o.name)));
    const personIds = await resolvePersonIds(items.flatMap((p) => p.people.map((x) => x.name)));
    const talentIds = await resolveTalentIds(items.flatMap((p) => p.credits.map((x) => x.creator)));
    for (const p of items) {
      const existing = await db.project.findFirst({ where: { title: p.title.trim() } });
      let id: string;
      if (existing) {
        id = existing.id;
        await db.project.update({
          where: { id },
          data: {
            logline: existing.logline ?? p.logline ?? null,
            status: PROJECT_STATUS[p.status ?? ""] ?? existing.status,
            internalNotes: mergeNotes(existing.internalNotes, joinNotes(p.notes)),
          },
        });
        enriched++;
      } else {
        const row = await db.project.create({
          data: {
            title: p.title.trim(), slug: await uniqueSlug("project", slugify(p.title)),
            projectType: p.projectType ?? "other",
            status: PROJECT_STATUS[p.status ?? ""] ?? "in_production",
            logline: p.logline ?? null, premiereYear: p.premiereYear ?? null,
            internalNotes: joinNotes(p.notes) || null,
          },
        });
        id = row.id;
        created++;
        await linkSource(sourceId, "project", id, sourceNote);
      }
      for (const o of p.orgs) {
        const orgId = orgIds.get(norm(o.name));
        if (!orgId) continue;
        const clash = await db.projectOrganization.findFirst({ where: { projectId: id, organizationId: orgId, relationship: o.relationship } });
        if (!clash) await db.projectOrganization.create({ data: { projectId: id, organizationId: orgId, relationship: o.relationship } });
      }
      for (const cr of p.credits) {
        const creatorId = talentIds.get(norm(cr.creator));
        if (!creatorId) continue;
        const clash = await db.creatorProjectCredit.findFirst({ where: { projectId: id, creatorId, role: cr.role } });
        if (!clash) await db.creatorProjectCredit.create({ data: { projectId: id, creatorId, role: cr.role } });
      }
      for (const pp of p.people) {
        const personId = personIds.get(norm(pp.name));
        if (!personId) continue;
        const clash = await db.personProject.findFirst({ where: { projectId: id, personId } });
        if (!clash) await db.personProject.create({ data: { projectId: id, personId, role: pp.role || "producer" } });
      }
      await refreshDigest("project", id);
    }
  }

  if (phase === "formats") {
    const items = slice as ImportFormat[];
    const orgIds = await resolveOrgIds(items.flatMap((f) => f.orgs.map((o) => o.name)));
    const talentIds = await resolveTalentIds(items.flatMap((f) => f.talent));
    for (const f of items) {
      const dirNotes = f.people.length
        ? [`Key people: ${f.people.map((p) => `${p.name}${p.role ? ` (${p.role})` : ""}`).join("; ")}`]
        : [];
      const incoming = [...dirNotes, joinNotes(f.notes)].filter(Boolean).join("\n\n");
      const existing = await db.format.findFirst({ where: { title: f.title.trim() } });
      let id: string;
      if (existing) {
        id = existing.id;
        await db.format.update({
          where: { id },
          data: {
            logline: existing.logline ?? f.logline ?? null,
            status: FORMAT_STATUS[f.status ?? ""] ?? existing.status,
            targetPlatform: existing.targetPlatform ?? f.targetPlatform ?? null,
            notes: mergeNotes(existing.notes, incoming),
          },
        });
        enriched++;
      } else {
        const row = await db.format.create({
          data: {
            title: f.title.trim(), slug: await uniqueSlug("format", slugify(f.title)),
            formatType: f.formatType ?? "other",
            status: FORMAT_STATUS[f.status ?? ""] ?? "developing",
            logline: f.logline ?? null, targetPlatform: f.targetPlatform ?? null,
            notes: incoming || null,
          },
        });
        id = row.id;
        created++;
        await linkSource(sourceId, "format", id, sourceNote);
      }
      for (const tn of f.talent) {
        const creatorId = talentIds.get(norm(tn));
        if (!creatorId) continue;
        const clash = await db.creatorFormat.findFirst({ where: { formatId: id, creatorId } });
        if (!clash) await db.creatorFormat.create({ data: { formatId: id, creatorId } });
      }
      for (const o of f.orgs) {
        const orgId = orgIds.get(norm(o.name));
        if (!orgId) continue;
        const clash = await db.formatOrganization.findFirst({ where: { formatId: id, organizationId: orgId } });
        if (!clash) await db.formatOrganization.create({ data: { formatId: id, organizationId: orgId, relationship: o.relationship } });
      }
      await refreshDigest("format", id);
    }
  }

  if (phase === "opportunities") {
    const items = slice as ImportOpp[];
    const orgIds = await resolveOrgIds(items.flatMap((o) => o.orgs));
    for (const o of items) {
      const existing = await db.opportunity.findFirst({ where: { title: o.title.trim() } });
      let id: string;
      if (existing) {
        id = existing.id;
        await db.opportunity.update({
          where: { id },
          data: {
            description: existing.description ?? o.description ?? null,
            notes: mergeNotes(existing.notes, joinNotes(o.notes)),
          },
        });
        enriched++;
      } else {
        const row = await db.opportunity.create({
          data: {
            title: o.title.trim(), slug: await uniqueSlug("opportunity", slugify(o.title)),
            type: o.type ?? "other", status: o.status ?? "researching",
            description: o.description ?? null, notes: joinNotes(o.notes) || null,
          },
        });
        id = row.id;
        created++;
        await linkSource(sourceId, "opportunity", id, sourceNote);
      }
      for (const orgName of o.orgs) {
        const orgId = orgIds.get(norm(orgName));
        if (!orgId) continue;
        const clash = await db.opportunityOrganization.findFirst({ where: { opportunityId: id, organizationId: orgId } });
        if (!clash) await db.opportunityOrganization.create({ data: { opportunityId: id, organizationId: orgId } });
      }
      await refreshDigest("opportunity", id);
    }
  }

  const next = offset + slice.length;
  return {
    phase,
    processed: slice.length,
    created,
    enriched,
    total: all.length,
    nextOffset: next < all.length ? next : null,
  };
}
