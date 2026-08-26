"use server";

// The athlete YouTube channels business: creating a channel, keeping its
// numbers current, and working the list of things it could make.
//
// Ideas are the part that matters day to day. On the slate they are the whole
// entry — "Tyrese YouTube ideas: doc series, podcast, Maxey drill, content
// with the dogs" — so they are records here rather than a paragraph of notes,
// and adding one has to be as quick as typing it into a doc, or nobody will.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { logAudit, logFieldChanges } from "@/lib/audit";
import { refreshDigest } from "@/lib/ingest/digest";
import { slugify, uniqueSlug } from "@/lib/slug";
import { CHANNEL_IDEA_STATUSES, CHANNEL_STATUSES } from "@/lib/taxonomy";

export type ChannelResult = { ok: boolean; error?: string; slug?: string; id?: string };

const channelSchema = z.object({
  name: z.string().trim().min(1, "A channel needs a name").max(200),
  handle: z.string().trim().max(120).optional().nullable(),
  url: z.string().trim().max(500).optional().nullable(),
  status: z.string().trim().max(30).optional(),
  creatorId: z.string().trim().max(50).optional().nullable(),
  premise: z.string().max(4000).optional().nullable(),
  cadence: z.string().trim().max(120).optional().nullable(),
  revenueModel: z.string().max(4000).optional().nullable(),
  notes: z.string().max(8000).optional().nullable(),
  subscribers: z.coerce.number().int().min(0).max(2_000_000_000).optional().nullable(),
  totalViews: z.coerce.number().int().min(0).max(2_000_000_000).optional().nullable(),
  videoCount: z.coerce.number().int().min(0).max(1_000_000).optional().nullable(),
  launchedAt: z.string().trim().max(30).optional().nullable(),
});
export type ChannelInput = z.infer<typeof channelSchema>;

/** Empty strings clear a field; a bare handle gets its @ back. */
function clean(input: ChannelInput) {
  const data = Object.fromEntries(
    Object.entries(input).map(([k, v]) => [k, v === "" ? null : v]),
  ) as ChannelInput;
  if (data.handle) data.handle = data.handle.startsWith("@") ? data.handle : `@${data.handle}`;
  return data;
}

export async function createChannel(input: ChannelInput): Promise<ChannelResult> {
  try {
    const user = await requireRole("EDITOR");
    const data = clean(channelSchema.parse(input));
    if (data.status && !CHANNEL_STATUSES.some((s) => s.value === data.status)) {
      return { ok: false, error: "That isn't a status a channel can have." };
    }
    const taken = await db.channel.findMany({
      where: { slug: { startsWith: slugify(data.name) } },
      select: { slug: true },
    });
    const channel = await db.channel.create({
      data: {
        name: data.name,
        handle: data.handle ?? null,
        url: data.url ?? null,
        status: data.status || "prospect",
        creatorId: data.creatorId || null,
        premise: data.premise ?? null,
        cadence: data.cadence ?? null,
        revenueModel: data.revenueModel ?? null,
        notes: data.notes ?? null,
        subscribers: data.subscribers ?? null,
        totalViews: data.totalViews ?? null,
        videoCount: data.videoCount ?? null,
        countUpdatedAt: data.subscribers != null ? new Date() : null,
        launchedAt: data.launchedAt ? new Date(data.launchedAt) : null,
        lastActivityAt: new Date(),
        ownerId: user.id,
        slug: uniqueSlug(data.name, new Set(taken.map((t) => t.slug))),
      },
    });
    await logAudit(user, {
      targetType: "channel", targetId: channel.id, targetLabel: channel.name, action: "created",
    });
    await refreshDigest("channel", channel.id);
    revalidatePath("/", "layout");
    return { ok: true, slug: channel.slug, id: channel.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create that channel." };
  }
}

export async function updateChannel(input: {
  id: string;
  expectedVersion: number;
  data: ChannelInput;
}): Promise<ChannelResult> {
  try {
    const user = await requireRole("EDITOR");
    const data = clean(channelSchema.parse(input.data));
    const existing = await db.channel.findUnique({ where: { id: input.id } });
    if (!existing) return { ok: false, error: "That channel is no longer here." };
    if (existing.version !== input.expectedVersion) {
      return { ok: false, error: "Someone else changed this channel while you were editing." };
    }

    // A subscriber count is only worth having with a date on it, so the date
    // moves when the number does — and not when something else does.
    const countsChanged =
      data.subscribers !== existing.subscribers ||
      data.totalViews !== existing.totalViews ||
      data.videoCount !== existing.videoCount;

    const channel = await db.channel.update({
      where: { id: input.id, version: input.expectedVersion },
      data: {
        name: data.name,
        handle: data.handle ?? null,
        url: data.url ?? null,
        status: data.status || existing.status,
        creatorId: data.creatorId || null,
        premise: data.premise ?? null,
        cadence: data.cadence ?? null,
        revenueModel: data.revenueModel ?? null,
        notes: data.notes ?? null,
        subscribers: data.subscribers ?? null,
        totalViews: data.totalViews ?? null,
        videoCount: data.videoCount ?? null,
        ...(countsChanged ? { countUpdatedAt: new Date() } : {}),
        launchedAt: data.launchedAt ? new Date(data.launchedAt) : null,
        lastActivityAt: new Date(),
        version: { increment: 1 },
      },
    });
    await logFieldChanges(
      user, "channel", channel.id, channel.name,
      existing as unknown as Record<string, unknown>,
      data as unknown as Record<string, unknown>,
    );
    await refreshDigest("channel", channel.id);
    revalidatePath("/", "layout");
    return { ok: true, slug: channel.slug, id: channel.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save that channel." };
  }
}

// --- Ideas -------------------------------------------------------------------

export async function addChannelIdea(channelId: string, title: string): Promise<ChannelResult> {
  try {
    const user = await requireRole("EDITOR");
    const clean = title.trim().slice(0, 300);
    if (!clean) return { ok: false, error: "An idea needs a title." };
    const channel = await db.channel.findUnique({ where: { id: channelId }, select: { name: true, slug: true } });
    if (!channel) return { ok: false, error: "That channel is no longer here." };

    const last = await db.channelIdea.findFirst({
      where: { channelId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const idea = await db.channelIdea.create({
      data: { channelId, title: clean, sortOrder: (last?.sortOrder ?? 0) + 1 },
    });
    await db.channel.update({ where: { id: channelId }, data: { lastActivityAt: new Date() } });
    await logAudit(user, {
      targetType: "channel", targetId: channelId, targetLabel: channel.name,
      action: "updated", field: "idea added", newValue: clean,
    });
    await refreshDigest("channel", channelId);
    revalidatePath(`/youtube/${channel.slug}`);
    return { ok: true, id: idea.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not add that idea." };
  }
}

export async function setChannelIdea(
  ideaId: string,
  patch: { title?: string; status?: string; notes?: string },
): Promise<ChannelResult> {
  try {
    const user = await requireRole("EDITOR");
    const idea = await db.channelIdea.findUnique({
      where: { id: ideaId },
      include: { channel: { select: { id: true, name: true, slug: true } } },
    });
    if (!idea) return { ok: false, error: "That idea is no longer here." };
    if (patch.status && !CHANNEL_IDEA_STATUSES.some((s) => s.value === patch.status)) {
      return { ok: false, error: "That isn't a status an idea can have." };
    }
    await db.channelIdea.update({
      where: { id: ideaId },
      data: {
        ...(patch.title != null ? { title: patch.title.trim().slice(0, 300) } : {}),
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.notes != null ? { notes: patch.notes.slice(0, 4000) || null } : {}),
      },
    });
    await db.channel.update({ where: { id: idea.channel.id }, data: { lastActivityAt: new Date() } });
    await logAudit(user, {
      targetType: "channel", targetId: idea.channel.id, targetLabel: idea.channel.name,
      action: "updated", field: `idea: ${idea.title}`,
      oldValue: idea.status, newValue: patch.status ?? patch.title ?? "edited",
    });
    await refreshDigest("channel", idea.channel.id);
    revalidatePath(`/youtube/${idea.channel.slug}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update that idea." };
  }
}

export async function removeChannelIdea(ideaId: string): Promise<ChannelResult> {
  try {
    const user = await requireRole("EDITOR");
    const idea = await db.channelIdea.findUnique({
      where: { id: ideaId },
      include: { channel: { select: { id: true, name: true, slug: true } } },
    });
    if (!idea) return { ok: true };
    await db.channelIdea.delete({ where: { id: ideaId } });
    await logAudit(user, {
      targetType: "channel", targetId: idea.channel.id, targetLabel: idea.channel.name,
      action: "updated", field: "idea removed", oldValue: idea.title,
    });
    await refreshDigest("channel", idea.channel.id);
    revalidatePath(`/youtube/${idea.channel.slug}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not remove that idea." };
  }
}
