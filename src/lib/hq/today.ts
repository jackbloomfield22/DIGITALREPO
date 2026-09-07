import "server-only";

// Loads what the Today page needs and hands it to the brief scorer.

import { db } from "@/lib/db";
import { buildBrief, type Brief } from "@/lib/hq/brief";

export async function loadBrief(ownerId: string, now = new Date()): Promise<Brief> {
  const from = new Date(now.getTime() - 1 * 86_400_000);
  const to = new Date(now.getTime() + 3 * 86_400_000);
  const [tasks, events, pipelines, relationships, ideas, notes, settings, pastEvents] = await Promise.all([
    db.hqTask.findMany({ where: { ownerId, status: { in: ["open", "waiting"] } }, include: { relationship: { select: { name: true } }, pipeline: { select: { title: true } } } }),
    db.hqEvent.findMany({ where: { ownerId, startsAt: { gte: from, lte: to } }, include: { relationship: { select: { name: true } }, pipeline: { select: { title: true } } } }),
    db.hqPipeline.findMany({ where: { ownerId, closedAt: null }, include: { contacts: { include: { relationship: { select: { name: true } } } } } }),
    db.hqRelationship.findMany({ where: { ownerId }, select: { id: true, name: true, tier: true, lastContactAt: true, nextTouchAt: true, cadenceDays: true, source: true } }),
    db.hqIdea.findMany({ where: { ownerId, status: { in: ["spark", "developing"] } }, select: { id: true, title: true, kind: true, status: true, rating: true, lastTouchedAt: true } }),
    db.hqNote.findMany({ where: { ownerId }, select: { id: true, title: true, kind: true, updatedAt: true, pinned: true } }),
    db.hqSettings.findUnique({ where: { ownerId } }),
    db.hqEvent.findMany({ where: { ownerId, debriefedAt: null, startsAt: { gte: new Date(now.getTime() - 3 * 86_400_000), lt: now }, OR: [{ relationshipId: { not: null } }, { pipelineId: { not: null } }] }, include: { relationship: { select: { name: true } }, pipeline: { select: { title: true } } } }),
  ]);
  return buildBrief(
    {
      tasks: tasks.map((t) => ({ id: t.id, title: t.title, kind: t.kind, priority: t.priority, dueAt: t.dueAt, relationshipName: t.relationship?.name, pipelineTitle: t.pipeline?.title, status: t.status, waitingSince: t.waitingSince, nudgeAfterDays: t.nudgeAfterDays })),
      events: events.map((e) => ({ id: e.id, title: e.title, startsAt: e.startsAt, endsAt: e.endsAt, allDay: e.allDay, location: e.location, relationshipName: e.relationship?.name, pipelineTitle: e.pipeline?.title })),
      pipelines: pipelines.map((p) => ({ id: p.id, title: p.title, stage: p.stage, heat: p.heat, nextStep: p.nextStep, nextStepDue: p.nextStepDue, lastContactAt: p.lastContactAt, closedAt: p.closedAt, contactNames: p.contacts.map((c) => c.relationship.name), source: p.source })),
      relationships,
      ideas,
      notes,
      lastReviewAt: settings?.lastReviewAt ?? null,
      pastEvents: pastEvents.map((e) => ({ id: e.id, title: e.title, startsAt: e.startsAt, endsAt: e.endsAt, allDay: e.allDay, location: e.location, relationshipName: e.relationship?.name, pipelineTitle: e.pipeline?.title })),
    },
    now,
  );
}
