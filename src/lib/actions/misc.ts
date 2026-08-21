"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function toggleFavorite(
  targetType: string,
  targetId: string,
): Promise<{ ok: boolean; favorited: boolean }> {
  const user = await requireUser();
  const existing = await db.favorite.findUnique({
    where: { userId_targetType_targetId: { userId: user.id, targetType, targetId } },
  });
  if (existing) {
    await db.favorite.delete({ where: { id: existing.id } });
    revalidatePath("/", "layout");
    return { ok: true, favorited: false };
  }
  await db.favorite.create({ data: { userId: user.id, targetType, targetId } });
  revalidatePath("/", "layout");
  return { ok: true, favorited: true };
}

/** Server-side recently-viewed tracking, called from detail pages. */
export async function recordRecentView(
  userId: string,
  targetType: string,
  targetId: string,
) {
  try {
    await db.recentView.upsert({
      where: { userId_targetType_targetId: { userId, targetType, targetId } },
      update: { viewedAt: new Date() },
      create: { userId, targetType, targetId },
    });
    // keep at most 50 per user
    const extras = await db.recentView.findMany({
      where: { userId },
      orderBy: { viewedAt: "desc" },
      skip: 50,
      select: { id: true },
    });
    if (extras.length) {
      await db.recentView.deleteMany({ where: { id: { in: extras.map((e) => e.id) } } });
    }
  } catch {
    // never block a page view on recents bookkeeping
  }
}

export async function saveView(input: {
  name: string;
  targetType: string;
  query: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const name = input.name.trim();
    if (!name) return { ok: false, error: "Name is required." };
    await db.savedView.create({
      data: {
        name,
        ownerId: user.id,
        targetType: input.targetType,
        query: input.query,
      },
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save view." };
  }
}

export async function deleteSavedView(id: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await db.savedView.deleteMany({ where: { id, ownerId: user.id } });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateCollection(input: {
  id: string;
  name: string;
  description?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireRole("EDITOR");
    const collection = await db.collection.update({
      where: { id: input.id },
      data: { name: input.name.trim(), description: input.description?.trim() || null },
    });
    await logAudit(user, {
      targetType: "collection",
      targetId: collection.id,
      targetLabel: collection.name,
      action: "updated",
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update collection." };
  }
}

export async function deleteCollection(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireRole("EDITOR");
    const collection = await db.collection.delete({ where: { id } });
    await logAudit(user, {
      targetType: "collection",
      targetId: id,
      targetLabel: collection.name,
      action: "archived",
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not delete collection." };
  }
}
