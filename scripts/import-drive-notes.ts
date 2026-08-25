// One-shot import of the extracted "4.4.Forty Notes" Drive knowledge into the
// Repo database. Reads the batch JSON files produced during extraction (path
// via IMPORT_BATCH_DIR), consolidates them, and loads records with links,
// sources, and digests. Run with the target DATABASE_URL:
//
//   DATABASE_URL="postgres://..." IMPORT_BATCH_DIR=/path/to/batches \
//     npx tsx scripts/import-drive-notes.ts [--dry-run]
//
// Safety: takes a full snapshot before writing (unless --dry-run). Idempotent:
// records are matched by normalized name/title; notes are appended only if the
// exact text isn't already present.
//
// PRIVACY: batch files contain confidential business data. They are never
// committed to the repository — this script reads them from a local directory.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { slugify } from "../src/lib/slug";

const db = new PrismaClient();
const DRY = process.argv.includes("--dry-run");
const BATCH_DIR = process.env.IMPORT_BATCH_DIR ?? "";
const DRIVE_URL = "https://drive.google.com/drive/folders/137-FbU55NRMQ8PP-R-SRkGTr0oS-rHIj";

// ---------------------------------------------------------------------------
// Consolidation stores
// ---------------------------------------------------------------------------
type Org = { name: string; aliases: string[]; types: string[]; description?: string; website?: string; location?: string; notes: string[] };
type Person = { name: string; aliases: string[]; title?: string; roleType?: string; email?: string; phone?: string; org?: string; notes: string[]; uncertain?: boolean };
type Talent = { name: string; aliases: string[]; types: string[]; sports: string[]; interests: string[]; headline?: string; basedIn?: string; age?: number; notes: string[]; audience?: Record<string, number> };
type Project = { title: string; projectType?: string; status?: string; logline?: string; premiereYear?: number; notes: string[]; orgs: { name: string; relationship: string }[]; credits: { creator: string; role: string }[]; people: { name: string; role: string }[] };
type Format = { title: string; formatType?: string; status?: string; logline?: string; targetPlatform?: string; notes: string[]; talent: string[]; orgs: { name: string; relationship: string }[]; people: { name: string; role: string }[] };
type Opp = { title: string; type?: string; status?: string; description?: string; notes: string[]; orgs: string[] };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const orgs = new Map<string, Org>();
const people = new Map<string, Person>();
const talent = new Map<string, Talent>();
const projects = new Map<string, Project>();
const formats = new Map<string, Format>();
const opps = new Map<string, Opp>();

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

// ---------------------------------------------------------------------------
// Batch ingestion — tolerant walker over the extraction files
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ingestOppEntry(e: any) {
  if (!e?.title) return;
  const o = getOpp(e.title);
  if (e.type && !o.type) o.type = e.type;
  if (e.status && !o.status) o.status = e.status;
  if (e.description && !o.description) o.description = e.description;
  for (const org of e.orgs ?? []) if (typeof org === "string") o.orgs.push(org);
  pushNote(o.notes, e.notes);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walkBatch(data: any) {
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
      const p = getProject("Destination World Cup 2026");
      pushNote(p.notes, `SOCCER AGENT CONTACT GRID (DWC talent outreach, Oct 2025):\n${lines.join("\n")}`);
    } else if (k === "klutch_nil_roster_aug2025") {
      for (const row of value as string[]) {
        if (row.startsWith("SOURCE")) continue;
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
    // "source", "sources", "note", "skip_note", "extraction_note" — provenance only, carried in record notes already.
  }
}

// ---------------------------------------------------------------------------
// Vocab mapping to Repo taxonomy
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

async function ensureEntity(kind: string, name: string): Promise<string> {
  const slug = slugify(name);
  const existing = await db.entity.findFirst({ where: { OR: [{ kind, slug }, { kind, name }] } });
  if (existing) return existing.id;
  const created = await db.entity.create({ data: { kind, name, slug } });
  return created.id;
}

async function uniqueSlug(model: "creator" | "project" | "organization" | "format" | "opportunity" | "industryPerson", base: string): Promise<string> {
  let slug = base || "record";
  let i = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hit = await (db as any)[model].findUnique({ where: { slug } });
    if (!hit) return slug;
    slug = `${base}-${i++}`;
  }
}

const joinNotes = (notes: string[]) => notes.join("\n\n");

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------
async function main() {
  if (!BATCH_DIR) throw new Error("Set IMPORT_BATCH_DIR to the batches directory.");
  const files = readdirSync(BATCH_DIR).filter((f) => f.endsWith(".json")).sort();
  for (const f of files) walkBatch(JSON.parse(readFileSync(path.join(BATCH_DIR, f), "utf8")));

  // Every person referenced on projects/formats also gets a person record.
  for (const p of projects.values()) for (const pp of p.people) getPerson(pp.name);
  for (const f of formats.values()) for (const pp of f.people) getPerson(pp.name);

  console.log(`Consolidated: ${orgs.size} orgs, ${people.size} people, ${talent.size} talent, ${projects.size} projects, ${formats.size} formats, ${opps.size} opportunities.`);
  if (DRY) {
    for (const t of talent.values()) console.log("TALENT:", t.name, t.types.join("/"), "|", t.sports.join(","));
    return;
  }

  const user =
    (await db.user.findUnique({ where: { email: "jackbloomfield22@gmail.com" } })) ??
    (await db.user.findFirst({ where: { role: "ADMIN" } }));
  if (!user) throw new Error("No attribution user found.");

  console.log("Taking pre-import snapshot…");
  const { createSnapshot } = await import("../src/lib/backup");
  await createSnapshot("manual", "pre-drive-import");

  const source = await db.source.create({
    data: {
      title: "4.4.Forty Notes (Google Drive import)",
      url: DRIVE_URL,
      sourceType: "internal",
      notes: "Bulk import of Jack's notes & research (Mar 2025 – Aug 2026). Per-record provenance (doc + as-of date) lives in each record's notes.",
      addedById: user.id,
    },
  });
  const sourceLinks: { targetType: string; targetId: string }[] = [];

  // Organizations
  const orgIds = new Map<string, string>();
  for (const o of orgs.values()) {
    const existing = await db.organization.findFirst({ where: { OR: [{ name: o.name }, { aliases: { has: o.name } }] } });
    if (existing) {
      orgIds.set(norm(o.name), existing.id);
      const notes = [existing.internalNotes, joinNotes(o.notes)].filter(Boolean).join("\n\n");
      await db.organization.update({
        where: { id: existing.id },
        data: {
          aliases: [...new Set([...existing.aliases, ...o.aliases])],
          types: [...new Set([...existing.types, ...o.types])],
          description: existing.description ?? o.description,
          website: existing.website ?? o.website,
          location: existing.location ?? o.location,
          internalNotes: notes || null,
        },
      });
    } else {
      const created = await db.organization.create({
        data: {
          name: o.name, slug: await uniqueSlug("organization", slugify(o.name)),
          aliases: o.aliases, types: o.types.length ? o.types : ["other"],
          description: o.description ?? null, website: o.website ?? null, location: o.location ?? null,
          internalNotes: joinNotes(o.notes) || null,
        },
      });
      orgIds.set(norm(o.name), created.id);
      sourceLinks.push({ targetType: "organization", targetId: created.id });
    }
    for (const a of o.aliases) orgIds.set(norm(a), orgIds.get(norm(o.name))!);
  }
  console.log(`Organizations done (${orgIds.size} keys).`);

  // People
  const personIds = new Map<string, string>();
  for (const p of people.values()) {
    const noteText = [p.uncertain ? "NAME UNCERTAIN — from meeting notes; verify." : "", joinNotes(p.notes)].filter(Boolean).join("\n");
    // Promote an email mentioned in notes into the structured contact field.
    if (!p.email) {
      const m = noteText.match(/[\w.+-]+@[\w-]+\.[\w.-]+\w/);
      if (m) p.email = m[0];
    }
    const existing = await db.industryPerson.findFirst({ where: { name: p.name.trim() } });
    let id: string;
    if (existing) {
      id = existing.id;
      await db.industryPerson.update({
        where: { id },
        data: {
          title: existing.title ?? p.title, roleType: existing.roleType ?? p.roleType,
          email: existing.email ?? p.email, phone: existing.phone ?? p.phone,
          notes: [existing.notes, noteText].filter(Boolean).join("\n\n") || null,
        },
      });
    } else {
      const created = await db.industryPerson.create({
        data: {
          name: p.name.trim(), slug: await uniqueSlug("industryPerson", slugify(p.name)),
          title: p.title ?? null, roleType: p.roleType ?? null,
          email: p.email ?? null, phone: p.phone ?? null, notes: noteText || null,
        },
      });
      id = created.id;
      sourceLinks.push({ targetType: "person", targetId: id });
    }
    personIds.set(norm(p.name), id);
    for (const a of p.aliases) personIds.set(norm(a), id);
    const orgId = p.org ? orgIds.get(norm(p.org)) : undefined;
    if (orgId) {
      const clash = await db.personOrganization.findFirst({ where: { personId: id, organizationId: orgId } });
      if (!clash) await db.personOrganization.create({ data: { personId: id, organizationId: orgId, role: p.title ?? null, current: true } });
    }
  }
  console.log(`People done (${people.size}).`);

  // Talent
  const talentIds = new Map<string, string>();
  for (const t of talent.values()) {
    const existing = await db.creator.findFirst({ where: { OR: [{ name: t.name.trim() }, { aliases: { has: t.name.trim() } }] } });
    let id: string;
    if (existing) {
      id = existing.id;
      await db.creator.update({
        where: { id },
        data: {
          headline: existing.headline ?? t.headline,
          internalNotes: [existing.internalNotes, joinNotes(t.notes)].filter(Boolean).join("\n\n") || null,
          aliases: [...new Set([...existing.aliases, ...t.aliases])],
        },
      });
    } else {
      const created = await db.creator.create({
        data: {
          name: t.name.trim(), slug: await uniqueSlug("creator", slugify(t.name)),
          aliases: t.aliases, headline: t.headline ?? null, age: t.age ?? null,
          internalNotes: joinNotes(t.notes) || null, status: "active",
        },
      });
      id = created.id;
      sourceLinks.push({ targetType: "creator", targetId: id });
    }
    talentIds.set(norm(t.name), id);
    for (const a of t.aliases) talentIds.set(norm(a), id);

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
  }
  console.log(`Talent done (${talent.size}).`);

  // Projects
  for (const p of projects.values()) {
    const existing = await db.project.findFirst({ where: { title: p.title.trim() } });
    let id: string;
    if (existing) {
      id = existing.id;
      await db.project.update({
        where: { id },
        data: {
          logline: existing.logline ?? p.logline,
          status: PROJECT_STATUS[p.status ?? ""] ?? existing.status,
          internalNotes: [existing.internalNotes, joinNotes(p.notes)].filter(Boolean).join("\n\n") || null,
        },
      });
    } else {
      const created = await db.project.create({
        data: {
          title: p.title.trim(), slug: await uniqueSlug("project", slugify(p.title)),
          projectType: p.projectType ?? "other", status: PROJECT_STATUS[p.status ?? ""] ?? "in_production",
          logline: p.logline ?? null, premiereYear: p.premiereYear ?? null,
          internalNotes: joinNotes(p.notes) || null,
        },
      });
      id = created.id;
      sourceLinks.push({ targetType: "project", targetId: id });
    }
    for (const o of p.orgs) {
      const orgId = orgIds.get(norm(o.name));
      if (!orgId) continue;
      const clash = await db.projectOrganization.findFirst({ where: { projectId: id, organizationId: orgId, relationship: o.relationship } });
      if (!clash) await db.projectOrganization.create({ data: { projectId: id, organizationId: orgId, relationship: o.relationship } });
    }
    for (const c of p.credits) {
      const creatorId = talentIds.get(norm(c.creator));
      if (!creatorId) continue;
      const clash = await db.creatorProjectCredit.findFirst({ where: { projectId: id, creatorId, role: c.role } });
      if (!clash) await db.creatorProjectCredit.create({ data: { projectId: id, creatorId, role: c.role } });
    }
    for (const pp of p.people) {
      const personId = personIds.get(norm(pp.name));
      if (!personId) continue;
      const clash = await db.personProject.findFirst({ where: { projectId: id, personId } });
      if (!clash) await db.personProject.create({ data: { projectId: id, personId, role: pp.role || "producer" } });
    }
  }
  console.log(`Projects done (${projects.size}).`);

  // Formats
  for (const f of formats.values()) {
    const dirNotes = f.people.length ? [`Key people: ${f.people.map((p) => `${p.name}${p.role ? ` (${p.role})` : ""}`).join("; ")}`] : [];
    const existing = await db.format.findFirst({ where: { title: f.title.trim() } });
    let id: string;
    if (existing) {
      id = existing.id;
      await db.format.update({
        where: { id },
        data: {
          logline: existing.logline ?? f.logline,
          status: FORMAT_STATUS[f.status ?? ""] ?? existing.status,
          targetPlatform: existing.targetPlatform ?? f.targetPlatform,
          notes: [existing.notes, ...dirNotes, joinNotes(f.notes)].filter(Boolean).join("\n\n") || null,
        },
      });
    } else {
      const created = await db.format.create({
        data: {
          title: f.title.trim(), slug: await uniqueSlug("format", slugify(f.title)),
          formatType: f.formatType ?? "other", status: FORMAT_STATUS[f.status ?? ""] ?? "developing",
          logline: f.logline ?? null, targetPlatform: f.targetPlatform ?? null,
          notes: [...dirNotes, joinNotes(f.notes)].filter(Boolean).join("\n\n") || null,
        },
      });
      id = created.id;
      sourceLinks.push({ targetType: "format", targetId: id });
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
  }
  console.log(`Formats done (${formats.size}).`);

  // Opportunities
  for (const o of opps.values()) {
    const existing = await db.opportunity.findFirst({ where: { title: o.title.trim() } });
    let id: string;
    if (existing) {
      id = existing.id;
      await db.opportunity.update({
        where: { id },
        data: { notes: [existing.notes, joinNotes(o.notes)].filter(Boolean).join("\n\n") || null },
      });
    } else {
      const created = await db.opportunity.create({
        data: {
          title: o.title.trim(), slug: await uniqueSlug("opportunity", slugify(o.title)),
          type: o.type ?? "other", status: o.status ?? "researching",
          description: o.description ?? null, notes: joinNotes(o.notes) || null,
        },
      });
      id = created.id;
      sourceLinks.push({ targetType: "opportunity", targetId: id });
    }
    for (const orgName of o.orgs) {
      const orgId = orgIds.get(norm(orgName));
      if (!orgId) continue;
      const clash = await db.opportunityOrganization.findFirst({ where: { opportunityId: id, organizationId: orgId } });
      if (!clash) await db.opportunityOrganization.create({ data: { opportunityId: id, organizationId: orgId } });
    }
  }
  console.log(`Opportunities done (${opps.size}).`);

  // Sources + summary audit
  for (const l of sourceLinks) {
    await db.recordSource.upsert({
      where: { sourceId_targetType_targetId: { sourceId: source.id, targetType: l.targetType, targetId: l.targetId } },
      update: {},
      create: { sourceId: source.id, targetType: l.targetType, targetId: l.targetId, note: "Created by the 4.4.Forty Notes Drive import." },
    });
  }
  await db.auditLog.create({
    data: {
      userId: user.id, userName: user.name, targetType: "source", targetId: source.id,
      targetLabel: "4.4.Forty Notes (Google Drive import)", action: "created",
      field: `imported ${sourceLinks.length} records`,
    },
  });

  console.log("Rebuilding knowledge digests…");
  const { rebuildAllDigests } = await import("../src/lib/ingest/digest");
  await rebuildAllDigests();

  console.log(`DONE. Created ${sourceLinks.length} new records (existing records enriched in place).`);
}

main()
  .catch((e) => {
    console.error("Import failed:", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
