"use server";

// Every write into HQ. Each one starts with requireOwner(): the section
// belongs to one person, and a server action is a public endpoint whatever
// the page around it looks like.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/hq/owner";
import { capture } from "@/lib/hq/capture";
import { parseIcs } from "@/lib/hq/ics";
import { seedFromRepo, importBrainBundle, parseBrainBundle } from "@/lib/hq/seed";
import { disconnectGoogle, runGoogleSync } from "@/lib/hq/google";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : "Something went wrong." });
const bump = () => revalidatePath("/hq", "layout");
const opt = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const dateIn = z.union([z.string(), z.date()]).optional().nullable().transform((v) => (v ? new Date(v) : null));
const id = z.string().min(1).max(60);

// ---------------------------------------------------------------------------
// People: a relationship row per person, created the first time HQ touches them.
// ---------------------------------------------------------------------------

async function relationshipFor(ownerId: string, personType: "person" | "creator", personId: string): Promise<string> {
  const existing = await db.hqRelationship.findUnique({ where: { ownerId_personType_personId: { ownerId, personType, personId } } });
  if (existing) return existing.id;
  const record = personType === "person"
    ? await db.industryPerson.findUnique({ where: { id: personId }, select: { name: true, email: true } })
    : await db.creator.findUnique({ where: { id: personId }, select: { name: true } });
  if (!record) throw new Error("That person is not in the Repo.");
  const created = await db.hqRelationship.create({
    data: { ownerId, personType, personId, name: record.name, email: (record as { email?: string | null }).email ?? null },
  });
  return created.id;
}

/** A name typed into the capture bar: an HQ relationship, then a Repo person or talent. */
async function relationshipByName(ownerId: string, name: string): Promise<{ id: string; name: string } | null> {
  const q = name.trim();
  if (!q) return null;
  const rel = await db.hqRelationship.findFirst({ where: { ownerId, name: { contains: q, mode: "insensitive" } }, orderBy: { updatedAt: "desc" } });
  if (rel) return { id: rel.id, name: rel.name };
  const person = await db.industryPerson.findFirst({ where: { archived: false, name: { contains: q, mode: "insensitive" } } });
  if (person) return { id: await relationshipFor(ownerId, "person", person.id), name: person.name };
  const creator = await db.creator.findFirst({ where: { archived: false, name: { contains: q, mode: "insensitive" } } });
  if (creator) return { id: await relationshipFor(ownerId, "creator", creator.id), name: creator.name };
  return null;
}

async function pipelineByRef(ownerId: string, ref: string): Promise<{ id: string; title: string } | null> {
  const q = ref.replace(/[-_]/g, " ").trim();
  const card = await db.hqPipeline.findFirst({ where: { ownerId, title: { contains: q, mode: "insensitive" } }, orderBy: { updatedAt: "desc" } });
  return card ? { id: card.id, title: card.title } : null;
}

export async function ensureRelationship(personType: "person" | "creator", personId: string): Promise<Result<{ id: string }>> {
  try {
    const user = await requireOwner();
    const rid = await relationshipFor(user.id, personType, personId);
    bump();
    return { ok: true, id: rid };
  } catch (e) { return fail(e); }
}

const relationshipSchema = z.object({
  id,
  tier: z.enum(["inner", "active", "warm", "cold"]).optional(),
  interests: z.array(z.string().trim().max(60)).max(40).optional(),
  howWeMet: opt(500), notes: opt(20000), opportunities: opt(5000), email: opt(200),
  nextTouchAt: dateIn, cadenceDays: z.number().int().min(1).max(365).nullable().optional(),
});
export async function saveRelationship(input: z.input<typeof relationshipSchema>): Promise<Result> {
  try {
    const user = await requireOwner();
    const { id: rid, ...data } = relationshipSchema.parse(input);
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    await db.hqRelationship.update({ where: { id: rid, ownerId: user.id }, data: { ...clean, source: "manual" } });
    bump();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function deleteRelationship(rid: string): Promise<Result> {
  try {
    const user = await requireOwner();
    await db.hqRelationship.delete({ where: { id: rid, ownerId: user.id } });
    bump();
    return { ok: true };
  } catch (e) { return fail(e); }
}

const interactionSchema = z.object({
  relationshipId: id, kind: z.string().max(20).default("note"), summary: z.string().trim().min(1).max(5000),
  at: dateIn, followUpInDays: z.number().int().min(0).max(365).optional().nullable(), followUpTitle: opt(300),
});
export async function logInteraction(input: z.input<typeof interactionSchema>): Promise<Result<{ id: string }>> {
  try {
    const user = await requireOwner();
    const data = interactionSchema.parse(input);
    const rel = await db.hqRelationship.findFirst({ where: { id: data.relationshipId, ownerId: user.id } });
    if (!rel) throw new Error("Not one of your people.");
    const at = data.at ?? new Date();
    const made = await db.hqInteraction.create({ data: { ownerId: user.id, relationshipId: rel.id, kind: data.kind, summary: data.summary, at } });
    const updates: Record<string, unknown> = {};
    if (!rel.lastContactAt || rel.lastContactAt < at) updates.lastContactAt = at;
    if (data.followUpInDays != null) {
      const due = new Date(at.getTime() + data.followUpInDays * 86_400_000);
      await db.hqTask.create({ data: { ownerId: user.id, kind: "follow_up", title: data.followUpTitle || `Follow up with ${rel.name}`, dueAt: due, relationshipId: rel.id, source: "capture" } });
      updates.nextTouchAt = due;
    } else if (rel.nextTouchAt && rel.nextTouchAt <= at) {
      updates.nextTouchAt = rel.cadenceDays ? new Date(at.getTime() + rel.cadenceDays * 86_400_000) : null;
    }
    updates.source = "manual";
    await db.hqRelationship.update({ where: { id: rel.id }, data: updates });
    bump();
    return { ok: true, id: made.id };
  } catch (e) { return fail(e); }
}

export async function deleteInteraction(iid: string): Promise<Result> {
  try {
    const user = await requireOwner();
    await db.hqInteraction.delete({ where: { id: iid, ownerId: user.id } });
    bump();
    return { ok: true };
  } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------------------
// The capture bar.
// ---------------------------------------------------------------------------

export async function captureQuick(text: string): Promise<Result<{ kind: string; id: string; href: string; title: string; reading: string[]; resolved: string[] }>> {
  try {
    const user = await requireOwner();
    const raw = String(text ?? "").trim();
    if (!raw) throw new Error("Nothing to capture.");
    const c = capture(raw);
    const resolved: string[] = [];
    const person = c.personName ? await relationshipByName(user.id, c.personName) : null;
    if (c.personName) resolved.push(person ? `${c.personName} → ${person.name}` : `${c.personName}: not in the Repo yet`);
    const card = c.pipelineRef ? await pipelineByRef(user.id, c.pipelineRef) : null;
    const tags = [...c.tags, ...(c.pipelineRef && !card ? [c.pipelineRef] : [])];
    if (c.pipelineRef) resolved.push(card ? `#${c.pipelineRef} → ${card.title}` : `#${c.pipelineRef} kept as a tag`);
    const base = { ownerId: user.id, source: "capture" };

    if (c.kind === "idea") {
      const row = await db.hqIdea.create({ data: { ...base, title: c.title, body: c.body ?? null, tags } });
      bump();
      return { ok: true, kind: "idea", id: row.id, href: `/hq/ideas/${row.id}`, title: row.title, reading: c.reading, resolved };
    }
    if (c.kind === "note") {
      const row = await db.hqNote.create({ data: { ...base, title: c.title.slice(0, 120), body: c.body ? `${c.title}\n\n${c.body}` : c.title, tags, relationshipId: person?.id ?? null, pipelineId: card?.id ?? null } });
      bump();
      return { ok: true, kind: "note", id: row.id, href: `/hq/brain/${row.id}`, title: row.title, reading: c.reading, resolved };
    }
    if (c.kind === "event") {
      const startsAt = c.startsAt ?? new Date();
      const row = await db.hqEvent.create({ data: { ...base, title: c.title, startsAt, endsAt: c.hasTime ? new Date(startsAt.getTime() + 3600_000) : null, allDay: !c.hasTime, notes: c.body ?? null, relationshipId: person?.id ?? null, pipelineId: card?.id ?? null } });
      bump();
      return { ok: true, kind: "event", id: row.id, href: "/hq/calendar", title: row.title, reading: c.reading, resolved };
    }
    const row = await db.hqTask.create({ data: { ...base, kind: c.kind, title: c.title, notes: c.body ?? null, dueAt: c.dueAt ?? null, relationshipId: person?.id ?? null, pipelineId: card?.id ?? null } });
    if (person && c.kind === "follow_up" && c.dueAt) await db.hqRelationship.update({ where: { id: person.id }, data: { nextTouchAt: c.dueAt } });
    bump();
    return { ok: true, kind: c.kind, id: row.id, href: "/hq#tasks", title: row.title, reading: c.reading, resolved };
  } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------------------
// Tasks and events.
// ---------------------------------------------------------------------------

const taskSchema = z.object({
  id: id.optional(), title: z.string().trim().min(1).max(300), notes: opt(5000), kind: z.enum(["task", "follow_up"]).optional(),
  priority: z.number().int().min(1).max(3).optional(), dueAt: dateIn, relationshipId: opt(60), pipelineId: opt(60),
});
export async function saveTask(input: z.input<typeof taskSchema>): Promise<Result<{ id: string }>> {
  try {
    const user = await requireOwner();
    const { id: tid, ...data } = taskSchema.parse(input);
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    const row = tid
      ? await db.hqTask.update({ where: { id: tid, ownerId: user.id }, data: clean })
      : await db.hqTask.create({ data: { ownerId: user.id, title: data.title, ...clean } });
    bump();
    return { ok: true, id: row.id };
  } catch (e) { return fail(e); }
}

export async function setTaskStatus(tid: string, status: "open" | "done" | "dropped"): Promise<Result> {
  try {
    const user = await requireOwner();
    const task = await db.hqTask.update({ where: { id: tid, ownerId: user.id }, data: { status, completedAt: status === "done" ? new Date() : null } });
    // Finishing a follow-up is contact.
    if (status === "done" && task.kind === "follow_up" && task.relationshipId) {
      await db.hqRelationship.update({ where: { id: task.relationshipId }, data: { lastContactAt: new Date(), nextTouchAt: null } });
      await db.hqInteraction.create({ data: { ownerId: user.id, relationshipId: task.relationshipId, kind: "note", summary: `Done: ${task.title}`, source: "manual" } });
    }
    bump();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function deleteTask(tid: string): Promise<Result> {
  try {
    const user = await requireOwner();
    await db.hqTask.delete({ where: { id: tid, ownerId: user.id } });
    bump();
    return { ok: true };
  } catch (e) { return fail(e); }
}

const eventSchema = z.object({
  id: id.optional(), title: z.string().trim().min(1).max(300), startsAt: z.union([z.string(), z.date()]).transform((v) => new Date(v)),
  endsAt: dateIn, allDay: z.boolean().optional(), location: opt(300), notes: opt(5000), relationshipId: opt(60), pipelineId: opt(60),
});
export async function saveEvent(input: z.input<typeof eventSchema>): Promise<Result<{ id: string }>> {
  try {
    const user = await requireOwner();
    const { id: eid, ...data } = eventSchema.parse(input);
    if (isNaN(data.startsAt.getTime())) throw new Error("That start time did not read as a date.");
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    const row = eid
      ? await db.hqEvent.update({ where: { id: eid, ownerId: user.id }, data: clean })
      : await db.hqEvent.create({ data: { ownerId: user.id, title: data.title, startsAt: data.startsAt, ...clean } });
    bump();
    return { ok: true, id: row.id };
  } catch (e) { return fail(e); }
}

export async function deleteEvent(eid: string): Promise<Result> {
  try {
    const user = await requireOwner();
    await db.hqEvent.delete({ where: { id: eid, ownerId: user.id } });
    bump();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function importIcs(text: string): Promise<Result<{ imported: number; skipped: number }>> {
  try {
    const user = await requireOwner();
    const events = parseIcs(String(text ?? ""));
    if (!events.length) throw new Error("No events found in that file.");
    let imported = 0, skipped = 0;
    const horizon = new Date(Date.now() - 90 * 86_400_000);
    for (const e of events) {
      if (e.startsAt < horizon) { skipped++; continue; }
      const externalId = e.uid ?? `${e.title}@${e.startsAt.toISOString()}`;
      await db.hqEvent.upsert({
        where: { ownerId_source_externalId: { ownerId: user.id, source: "ics", externalId } },
        update: { title: e.title, startsAt: e.startsAt, endsAt: e.endsAt, allDay: e.allDay, location: e.location, notes: e.description, attendees: e.attendees },
        create: { ownerId: user.id, source: "ics", externalId, title: e.title, startsAt: e.startsAt, endsAt: e.endsAt, allDay: e.allDay, location: e.location, notes: e.description, attendees: e.attendees },
      });
      imported++;
    }
    bump();
    return { ok: true, imported, skipped };
  } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------------------
// Notes and ideas.
// ---------------------------------------------------------------------------

const noteSchema = z.object({
  id: id.optional(), title: z.string().trim().min(1).max(300), body: z.string().max(200_000).optional(), kind: z.string().max(30).optional(),
  tags: z.array(z.string().trim().max(40)).max(30).optional(), pinned: z.boolean().optional(),
  relationshipId: opt(60), pipelineId: opt(60), linkTargetType: opt(30), linkTargetId: opt(60),
});
export async function saveNote(input: z.input<typeof noteSchema>): Promise<Result<{ id: string }>> {
  try {
    const user = await requireOwner();
    const { id: nid, ...data } = noteSchema.parse(input);
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    const row = nid
      ? await db.hqNote.update({ where: { id: nid, ownerId: user.id }, data: clean })
      : await db.hqNote.create({ data: { ownerId: user.id, title: data.title, ...clean } });
    bump();
    return { ok: true, id: row.id };
  } catch (e) { return fail(e); }
}

export async function deleteNote(nid: string): Promise<Result> {
  try {
    const user = await requireOwner();
    await db.hqNote.delete({ where: { id: nid, ownerId: user.id } });
    bump();
    return { ok: true };
  } catch (e) { return fail(e); }
}

const ideaSchema = z.object({
  id: id.optional(), title: z.string().trim().min(1).max(300), body: opt(50_000), kind: z.string().max(30).optional(),
  status: z.string().max(20).optional(), rating: z.number().int().min(0).max(5).optional(), tags: z.array(z.string().trim().max(40)).max(30).optional(),
});
export async function saveIdea(input: z.input<typeof ideaSchema>): Promise<Result<{ id: string }>> {
  try {
    const user = await requireOwner();
    const { id: iid, ...data } = ideaSchema.parse(input);
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    const row = iid
      ? await db.hqIdea.update({ where: { id: iid, ownerId: user.id }, data: { ...clean, lastTouchedAt: new Date() } })
      : await db.hqIdea.create({ data: { ownerId: user.id, title: data.title, ...clean } });
    bump();
    return { ok: true, id: row.id };
  } catch (e) { return fail(e); }
}

export async function deleteIdea(iid: string): Promise<Result> {
  try {
    const user = await requireOwner();
    await db.hqIdea.delete({ where: { id: iid, ownerId: user.id } });
    bump();
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** An idea good enough to work on becomes a pipeline card and is marked promoted. */
export async function promoteIdea(iid: string): Promise<Result<{ pipelineId: string }>> {
  try {
    const user = await requireOwner();
    const idea = await db.hqIdea.findFirst({ where: { id: iid, ownerId: user.id } });
    if (!idea) throw new Error("Idea not found.");
    const card = await db.hqPipeline.create({ data: { ownerId: user.id, title: idea.title, stage: "idea", heat: Math.max(1, Math.min(3, Math.ceil(idea.rating / 2))) || 2, whyItMatters: idea.body?.slice(0, 2000) ?? null, source: "manual" } });
    await db.hqIdea.update({ where: { id: iid }, data: { status: "promoted", promotedToType: "pipeline", promotedToId: card.id, lastTouchedAt: new Date() } });
    bump();
    return { ok: true, pipelineId: card.id };
  } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------------------
// The pipeline.
// ---------------------------------------------------------------------------

const pipelineSchema = z.object({
  id: id.optional(), title: z.string().trim().min(1).max(300), stage: z.string().max(30).optional(), heat: z.number().int().min(1).max(3).optional(),
  whyItMatters: opt(5000), nextStep: opt(1000), nextStepDue: dateIn, lastContactAt: dateIn, notes: opt(50_000),
  targetType: opt(30), targetId: opt(60),
});
export async function savePipeline(input: z.input<typeof pipelineSchema>): Promise<Result<{ id: string }>> {
  try {
    const user = await requireOwner();
    const { id: pid, ...data } = pipelineSchema.parse(input);
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    if (clean.stage) clean.closedAt = clean.stage === "passed" ? new Date() : null;
    const row = pid
      ? await db.hqPipeline.update({ where: { id: pid, ownerId: user.id }, data: { ...clean, source: "manual" } })
      : await db.hqPipeline.create({ data: { ownerId: user.id, title: data.title, ...clean } });
    bump();
    return { ok: true, id: row.id };
  } catch (e) { return fail(e); }
}

export async function movePipeline(pid: string, stage: string): Promise<Result> {
  try {
    const user = await requireOwner();
    const top = await db.hqPipeline.aggregate({ where: { ownerId: user.id, stage }, _min: { order: true } });
    await db.hqPipeline.update({
      where: { id: pid, ownerId: user.id },
      data: { stage, order: (top._min.order ?? 0) - 1, closedAt: stage === "passed" ? new Date() : null, source: "manual" },
    });
    bump();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function deletePipeline(pid: string): Promise<Result> {
  try {
    const user = await requireOwner();
    await db.hqPipeline.delete({ where: { id: pid, ownerId: user.id } });
    bump();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function setPipelineContact(pid: string, relationshipId: string, role: string, note?: string | null): Promise<Result> {
  try {
    const user = await requireOwner();
    const [card, rel] = await Promise.all([
      db.hqPipeline.findFirst({ where: { id: pid, ownerId: user.id } }),
      db.hqRelationship.findFirst({ where: { id: relationshipId, ownerId: user.id } }),
    ]);
    if (!card || !rel) throw new Error("Not found.");
    await db.hqPipelineContact.upsert({
      where: { pipelineId_relationshipId: { pipelineId: pid, relationshipId } },
      update: { role, note: note ?? undefined },
      create: { pipelineId: pid, relationshipId, role, note: note ?? null },
    });
    bump();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function removePipelineContact(pid: string, relationshipId: string): Promise<Result> {
  try {
    const user = await requireOwner();
    const card = await db.hqPipeline.findFirst({ where: { id: pid, ownerId: user.id } });
    if (!card) throw new Error("Not found.");
    await db.hqPipelineContact.deleteMany({ where: { pipelineId: pid, relationshipId } });
    bump();
    return { ok: true };
  } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------------------
// Studio and settings.
// ---------------------------------------------------------------------------

export async function saveStyleGuide(text: string): Promise<Result> {
  try {
    const user = await requireOwner();
    await db.hqSettings.upsert({ where: { ownerId: user.id }, update: { styleGuide: String(text ?? "").slice(0, 100_000) }, create: { ownerId: user.id, styleGuide: String(text ?? "").slice(0, 100_000) } });
    bump();
    return { ok: true };
  } catch (e) { return fail(e); }
}

const exampleSchema = z.object({ kind: z.string().max(30), title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(200_000), notes: opt(2000) });
export async function addStyleExample(input: z.input<typeof exampleSchema>): Promise<Result<{ id: string }>> {
  try {
    const user = await requireOwner();
    const data = exampleSchema.parse(input);
    const row = await db.hqStyleExample.create({ data: { ownerId: user.id, ...data } });
    bump();
    return { ok: true, id: row.id };
  } catch (e) { return fail(e); }
}

export async function deleteStyleExample(xid: string): Promise<Result> {
  try {
    const user = await requireOwner();
    await db.hqStyleExample.delete({ where: { id: xid, ownerId: user.id } });
    bump();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function saveHqSettings(input: { aiEnabled?: boolean; aiDailyCapCents?: number }): Promise<Result> {
  try {
    const user = await requireOwner();
    const data = z.object({ aiEnabled: z.boolean().optional(), aiDailyCapCents: z.number().int().min(0).max(100_000).optional() }).parse(input);
    await db.hqSettings.upsert({ where: { ownerId: user.id }, update: data, create: { ownerId: user.id, ...data } });
    bump();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function seedHq(): Promise<Result<{ pipelines: number; relationships: number; contacts: number }>> {
  try {
    const user = await requireOwner();
    const out = await seedFromRepo(user.id);
    bump();
    return { ok: true, ...out };
  } catch (e) { return fail(e); }
}

export async function importBrain(raw: string): Promise<Result<{ summary: string; unresolved: string[] }>> {
  try {
    const user = await requireOwner();
    const bundle = parseBrainBundle(String(raw ?? ""));
    if (!bundle) throw new Error("That is not a brain bundle (expected kind \"44forty-brain\").");
    const out = await importBrainBundle(user.id, bundle);
    bump();
    const summary = Object.entries(out).filter(([k, v]) => k !== "unresolved" && v).map(([k, v]) => `${v} ${k}`).join(", ") || "nothing new";
    return { ok: true, summary, unresolved: out.unresolved };
  } catch (e) { return fail(e); }
}

export async function googleSyncNow(): Promise<Result<{ summary: string }>> {
  try {
    const user = await requireOwner();
    const out = await runGoogleSync(user.id);
    bump();
    return out.ok ? { ok: true, summary: out.summary } : { ok: false, error: out.summary };
  } catch (e) { return fail(e); }
}

export async function googleDisconnect(): Promise<Result> {
  try {
    const user = await requireOwner();
    await disconnectGoogle(user.id);
    bump();
    return { ok: true };
  } catch (e) { return fail(e); }
}
