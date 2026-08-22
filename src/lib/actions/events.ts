"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { slugify, uniqueSlug } from "@/lib/slug";
import { SPORTS_CALENDAR } from "@/lib/sports-calendar-data";

const eventSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  league: z.string().trim().max(80).optional().nullable(),
  sportName: z.string().trim().max(80).optional().nullable(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional().nullable(),
  location: z.string().trim().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  approximate: z.boolean().optional(),
});
export type EventInput = z.infer<typeof eventSchema>;

type Result = { ok: boolean; error?: string };

async function sportEntityId(name: string | null | undefined): Promise<string | null> {
  const clean = name?.trim();
  if (!clean) return null;
  const slug = slugify(clean);
  const existing = await db.entity.findUnique({ where: { kind_slug: { kind: "sport", slug } } });
  if (existing) return existing.id;
  return (await db.entity.create({ data: { kind: "sport", slug, name: clean } })).id;
}

async function freshEventSlug(title: string, start: string): Promise<string> {
  const base = `${title} ${start.slice(0, 4)}`;
  const rows = await db.sportsEvent.findMany({
    where: { slug: { startsWith: slugify(base) } },
    select: { slug: true },
  });
  return uniqueSlug(base, new Set(rows.map((r) => r.slug)));
}

export async function createEvent(input: EventInput): Promise<Result> {
  try {
    const user = await requireRole("EDITOR");
    const data = eventSchema.parse(input);
    const event = await db.sportsEvent.create({
      data: {
        slug: await freshEventSlug(data.title, data.startDate),
        title: data.title,
        league: data.league || null,
        sportId: await sportEntityId(data.sportName),
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        location: data.location || null,
        notes: data.notes || null,
        approximate: !!data.approximate,
      },
    });
    await logAudit(user, { targetType: "event", targetId: event.id, targetLabel: event.title, action: "created" });
    revalidatePath("/calendar");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create event." };
  }
}

export async function updateEvent(id: string, input: EventInput): Promise<Result> {
  try {
    const user = await requireRole("EDITOR");
    const data = eventSchema.parse(input);
    const event = await db.sportsEvent.update({
      where: { id },
      data: {
        title: data.title,
        league: data.league || null,
        sportId: await sportEntityId(data.sportName),
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        location: data.location || null,
        notes: data.notes || null,
        approximate: !!data.approximate,
      },
    });
    await logAudit(user, { targetType: "event", targetId: event.id, targetLabel: event.title, action: "updated" });
    revalidatePath("/calendar");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update event." };
  }
}

export async function deleteEvent(id: string): Promise<Result> {
  try {
    const user = await requireRole("EDITOR");
    const event = await db.sportsEvent.delete({ where: { id } });
    await logAudit(user, { targetType: "event", targetId: id, targetLabel: event.title, action: "archived" });
    revalidatePath("/calendar");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not delete event." };
  }
}

/**
 * Load the curated US pro + world sports calendar. Idempotent: events are
 * keyed by slug, so re-importing only adds ones that are missing (and never
 * resurrects an event an editor deliberately edited under the same slug).
 */
export async function importStandardCalendar(): Promise<Result & { added?: number }> {
  try {
    const user = await requireRole("EDITOR");
    let added = 0;
    for (const def of SPORTS_CALENDAR) {
      const slug = slugify(`${def.title} ${def.start.slice(0, 4)}`);
      const existing = await db.sportsEvent.findUnique({ where: { slug } });
      if (existing) continue;
      await db.sportsEvent.create({
        data: {
          slug,
          title: def.title,
          league: def.league ?? null,
          sportId: await sportEntityId(def.sport),
          startDate: new Date(def.start),
          endDate: def.end ? new Date(def.end) : null,
          location: def.location ?? null,
          notes: def.notes ?? null,
          approximate: !!def.approximate,
        },
      });
      added++;
    }
    await logAudit(user, {
      targetType: "event",
      targetId: "standard-calendar",
      targetLabel: "Standard sports calendar",
      action: "created",
      newValue: `${added} events`,
    });
    revalidatePath("/calendar");
    return { ok: true, added };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Import failed." };
  }
}
