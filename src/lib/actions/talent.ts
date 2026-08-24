"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { logAudit, logFieldChanges } from "@/lib/audit";
import { normalizeName, nameSimilarity, slugify, uniqueSlug } from "@/lib/slug";

const scalarSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  imageUrl: z.string().trim().max(500).optional().nullable(),
  headline: z.string().trim().max(300).optional().nullable(),
  status: z.string().trim().max(30).optional(),
  miniBio: z.string().max(8000).optional().nullable(),
  digitalSummary: z.string().max(8000).optional().nullable(),
  opportunityNotes: z.string().max(8000).optional().nullable(),
  internalNotes: z.string().max(8000).optional().nullable(),
  age: z.coerce.number().int().min(0).max(120).optional().nullable(),
  birthday: z.string().optional().nullable(),
  aliases: z.array(z.string().trim().max(120)).max(10).optional(),
});

export type CreatorScalarInput = z.infer<typeof scalarSchema>;

export type ActionResult =
  | { ok: true; slug?: string; id?: string }
  | { ok: false; error: string; conflict?: { editedBy: string; editedAt: string } };

function cleanScalars(data: CreatorScalarInput) {
  return {
    name: data.name,
    imageUrl: data.imageUrl || null,
    headline: data.headline || null,
    status: data.status || "active",
    miniBio: data.miniBio || null,
    digitalSummary: data.digitalSummary || null,
    opportunityNotes: data.opportunityNotes || null,
    internalNotes: data.internalNotes || null,
    age: data.age ?? null,
    birthday: data.birthday ? new Date(data.birthday) : null,
    aliases: data.aliases?.filter(Boolean) ?? [],
  };
}

/** Suggest likely duplicates before creating. */
export async function findSimilarCreators(name: string): Promise<{ slug: string; name: string }[]> {
  if (!name.trim()) return [];
  const all = await db.creator.findMany({
    where: { archived: false },
    select: { slug: true, name: true, aliases: true },
  });
  return all
    .filter(
      (c) =>
        nameSimilarity(c.name, name) >= 0.6 ||
        c.aliases.some((a) => normalizeName(a) === normalizeName(name)),
    )
    .slice(0, 5)
    .map((c) => ({ slug: c.slug, name: c.name }));
}

export async function createCreator(input: {
  scalars: CreatorScalarInput;
  entityIds?: { entityId: string; relationship?: string }[];
  socials?: { platform: string; handle?: string | null; url?: string | null; followerCount?: number | null }[];
}): Promise<ActionResult> {
  try {
    const user = await requireRole("EDITOR");
    const scalars = scalarSchema.parse(input.scalars);
    const taken = new Set(
      (
        await db.creator.findMany({
          where: { slug: { startsWith: slugify(scalars.name) } },
          select: { slug: true },
        })
      ).map((r) => r.slug),
    );
    const creator = await db.creator.create({
      data: {
        slug: uniqueSlug(scalars.name, taken),
        ...cleanScalars(scalars),
        lastVerifiedAt: new Date(),
        entityLinks: input.entityIds?.length
          ? {
              create: input.entityIds.map((e) => ({
                entityId: e.entityId,
                relationship: e.relationship ?? "",
              })),
            }
          : undefined,
        socialProfiles: input.socials?.length
          ? {
              create: input.socials
                .filter((s) => s.platform)
                .map((s) => ({
                  platform: s.platform,
                  handle: s.handle || null,
                  url: s.url || null,
                  followerCount: s.followerCount ?? null,
                  countUpdatedAt: s.followerCount != null ? new Date() : null,
                })),
            }
          : undefined,
      },
    });
    await logAudit(user, {
      targetType: "creator",
      targetId: creator.id,
      targetLabel: creator.name,
      action: "created",
    });
    revalidatePath("/", "layout");
    return { ok: true, slug: creator.slug, id: creator.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create creator." };
  }
}

export async function updateCreator(input: {
  id: string;
  expectedVersion: number;
  scalars: CreatorScalarInput;
}): Promise<ActionResult> {
  try {
    const user = await requireRole("EDITOR");
    const scalars = scalarSchema.parse(input.scalars);
    const existing = await db.creator.findUnique({ where: { id: input.id } });
    if (!existing) return { ok: false, error: "Creator not found." };

    if (existing.version !== input.expectedVersion) {
      const lastEdit = await db.auditLog.findFirst({
        where: { targetType: "creator", targetId: input.id, action: { in: ["updated", "created"] } },
        orderBy: { createdAt: "desc" },
      });
      return {
        ok: false,
        error: "This profile was changed by someone else while you were editing.",
        conflict: {
          editedBy: lastEdit?.userName ?? "another editor",
          editedAt: (lastEdit?.createdAt ?? existing.updatedAt).toISOString(),
        },
      };
    }

    const next = cleanScalars(scalars);
    const updated = await db.creator.update({
      where: { id: input.id, version: input.expectedVersion },
      data: { ...next, version: { increment: 1 } },
    });
    await logFieldChanges(
      user,
      "creator",
      updated.id,
      updated.name,
      existing as unknown as Record<string, unknown>,
      next as unknown as Record<string, unknown>,
    );
    revalidatePath("/", "layout");
    return { ok: true, slug: updated.slug, id: updated.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save changes." };
  }
}

const socialSchema = z.array(
  z.object({
    id: z.string().optional(),
    platform: z.string().min(1).max(30),
    handle: z.string().trim().max(120).optional().nullable(),
    url: z.string().trim().max(500).optional().nullable(),
    followerCount: z.coerce.number().int().min(0).optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
  }),
);

export async function updateSocialProfiles(
  creatorId: string,
  profiles: z.infer<typeof socialSchema>,
): Promise<ActionResult> {
  try {
    const user = await requireRole("EDITOR");
    const parsed = socialSchema.parse(profiles);
    const creator = await db.creator.findUnique({
      where: { id: creatorId },
      include: { socialProfiles: true },
    });
    if (!creator) return { ok: false, error: "Creator not found." };

    const keepIds = new Set(parsed.map((p) => p.id).filter(Boolean));
    for (const old of creator.socialProfiles) {
      if (!keepIds.has(old.id)) {
        await db.socialProfile.delete({ where: { id: old.id } });
      }
    }
    for (const p of parsed) {
      const existing = p.id ? creator.socialProfiles.find((s) => s.id === p.id) : undefined;
      if (existing) {
        const countChanged =
          p.followerCount != null && p.followerCount !== existing.followerCount;
        await db.socialProfile.update({
          where: { id: existing.id },
          data: {
            platform: p.platform,
            handle: p.handle || null,
            url: p.url || null,
            followerCount: p.followerCount ?? null,
            notes: p.notes || null,
            ...(countChanged ? { countUpdatedAt: new Date() } : {}),
          },
        });
        if (countChanged && existing.followerCount != null) {
          await db.socialSnapshot.create({
            data: { socialProfileId: existing.id, followerCount: existing.followerCount, recordedAt: existing.countUpdatedAt ?? new Date() },
          }).catch(() => {});
        }
      } else {
        await db.socialProfile.create({
          data: {
            creatorId,
            platform: p.platform,
            handle: p.handle || null,
            url: p.url || null,
            followerCount: p.followerCount ?? null,
            notes: p.notes || null,
            countUpdatedAt: p.followerCount != null ? new Date() : null,
          },
        });
      }
    }
    await logAudit(user, {
      targetType: "creator",
      targetId: creator.id,
      targetLabel: creator.name,
      action: "updated",
      field: "social profiles",
    });
    revalidatePath("/", "layout");
    return { ok: true, slug: creator.slug };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save social profiles." };
  }
}

export async function markVerified(creatorId: string): Promise<ActionResult> {
  try {
    const user = await requireRole("EDITOR");
    const creator = await db.creator.update({
      where: { id: creatorId },
      data: { lastVerifiedAt: new Date() },
    });
    await logAudit(user, {
      targetType: "creator",
      targetId: creator.id,
      targetLabel: creator.name,
      action: "updated",
      field: "lastVerifiedAt",
      newValue: new Date().toISOString(),
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update." };
  }
}

// --- Bulk actions ------------------------------------------------------------

export async function bulkAddToCollection(
  creatorIds: string[],
  collectionId: string,
): Promise<ActionResult> {
  try {
    const user = await requireRole("EDITOR");
    for (const targetId of creatorIds.slice(0, 200)) {
      await db.collectionItem.upsert({
        where: { collectionId_targetType_targetId: { collectionId, targetType: "creator", targetId } },
        update: {},
        create: { collectionId, targetType: "creator", targetId },
      });
    }
    const collection = await db.collection.findUnique({ where: { id: collectionId } });
    await logAudit(user, {
      targetType: "collection",
      targetId: collectionId,
      targetLabel: collection?.name ?? "?",
      action: "linked",
      newValue: `${creatorIds.length} creators`,
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Bulk add failed." };
  }
}

export async function bulkAddEntity(
  creatorIds: string[],
  entityId: string,
): Promise<ActionResult> {
  try {
    const user = await requireRole("EDITOR");
    for (const creatorId of creatorIds.slice(0, 200)) {
      await db.creatorEntityLink.upsert({
        where: { creatorId_entityId_relationship: { creatorId, entityId, relationship: "" } },
        update: {},
        create: { creatorId, entityId, relationship: "" },
      });
    }
    const entity = await db.entity.findUnique({ where: { id: entityId } });
    await logAudit(user, {
      targetType: "entity",
      targetId: entityId,
      targetLabel: entity?.name ?? "?",
      action: "linked",
      newValue: `${creatorIds.length} creators`,
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Bulk tag failed." };
  }
}

export async function bulkSetStatus(
  creatorIds: string[],
  status: string,
): Promise<ActionResult> {
  try {
    const user = await requireRole("EDITOR");
    await db.creator.updateMany({
      where: { id: { in: creatorIds.slice(0, 200) } },
      data: { status },
    });
    await logAudit(user, {
      targetType: "creator",
      targetId: creatorIds[0] ?? "?",
      targetLabel: `${creatorIds.length} creators`,
      action: "updated",
      field: "status",
      newValue: status,
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Bulk update failed." };
  }
}

export async function bulkArchive(creatorIds: string[]): Promise<ActionResult> {
  try {
    const user = await requireRole("ADMIN");
    await db.creator.updateMany({
      where: { id: { in: creatorIds.slice(0, 200) } },
      data: { archived: true, archivedReason: "Archived from talent table", archivedAt: new Date() },
    });
    await logAudit(user, {
      targetType: "creator",
      targetId: creatorIds[0] ?? "?",
      targetLabel: `${creatorIds.length} creators`,
      action: "archived",
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Archive failed." };
  }
}
