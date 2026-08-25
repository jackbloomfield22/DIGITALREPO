"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { USER_ROLES } from "@/lib/taxonomy";
import { slugify, uniqueSlug } from "@/lib/slug";
import { mergeEntitiesCore, mergeOrganizationsCore } from "@/lib/merge";
import { normalizeTalentRows } from "@/lib/talent-import";

type Result = { ok: boolean; error?: string };

// --- Users -------------------------------------------------------------------

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  role: string;
}): Promise<Result> {
  try {
    const admin = await requireRole("ADMIN");
    const data = z
      .object({
        name: z.string().trim().min(1).max(100),
        email: z.string().trim().email().max(200),
        password: z.string().min(8).max(100),
        role: z.enum(USER_ROLES),
      })
      .parse(input);
    const user = await db.user.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        role: data.role,
        passwordHash: bcrypt.hashSync(data.password, 10),
      },
    });
    await logAudit(admin, { targetType: "user", targetId: user.id, targetLabel: user.name, action: "created" });
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create user." };
  }
}

export async function setUserRole(userId: string, role: string): Promise<Result> {
  try {
    const admin = await requireRole("ADMIN");
    if (!USER_ROLES.includes(role as (typeof USER_ROLES)[number])) {
      return { ok: false, error: "Unknown role." };
    }
    if (admin.id === userId) return { ok: false, error: "You can't change your own role." };
    const user = await db.user.update({ where: { id: userId }, data: { role } });
    await logAudit(admin, { targetType: "user", targetId: user.id, targetLabel: user.name, action: "updated", field: "role", newValue: role });
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update role." };
  }
}

// --- Archive / restore -------------------------------------------------------

const ARCHIVABLE = {
  creator: db.creator,
  project: db.project,
  organization: db.organization,
  format: db.format,
  opportunity: db.opportunity,
  person: db.industryPerson,
} as const;

export async function setArchived(
  targetType: keyof typeof ARCHIVABLE,
  targetId: string,
  archived: boolean,
  reason?: string,
): Promise<Result> {
  try {
    const admin = await requireRole("ADMIN");
    if (!(targetType in ARCHIVABLE)) return { ok: false, error: "Unknown record type." };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = ARCHIVABLE[targetType] as any;
    const record = await model.update({
      where: { id: targetId },
      data: archived
        ? { archived: true, archivedReason: reason?.trim() || "Archived manually", archivedAt: new Date() }
        : { archived: false, archivedReason: null, archivedAt: null },
    });
    await logAudit(admin, {
      targetType,
      targetId,
      targetLabel: record.name ?? record.title ?? "?",
      action: archived ? "archived" : "restored",
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update." };
  }
}

// --- Entity merge ------------------------------------------------------------

export async function mergeEntities(sourceId: string, targetId: string): Promise<Result> {
  try {
    const admin = await requireRole("ADMIN");
    if (sourceId === targetId) return { ok: false, error: "Pick two different entities." };
    const [source, target] = await Promise.all([
      db.entity.findUnique({ where: { id: sourceId } }),
      db.entity.findUnique({ where: { id: targetId } }),
    ]);
    if (!source || !target) return { ok: false, error: "Entity not found." };

    await mergeEntitiesCore(sourceId, targetId);

    await logAudit(admin, {
      targetType: "entity",
      targetId,
      targetLabel: target.name,
      action: "merged",
      oldValue: source.name,
      newValue: target.name,
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Merge failed." };
  }
}

// --- Organization merge ------------------------------------------------------

export async function mergeOrganizations(sourceId: string, targetId: string): Promise<Result> {
  try {
    const admin = await requireRole("ADMIN");
    if (sourceId === targetId) return { ok: false, error: "Pick two different organizations." };
    const [source, target] = await Promise.all([
      db.organization.findUnique({ where: { id: sourceId } }),
      db.organization.findUnique({ where: { id: targetId } }),
    ]);
    if (!source || !target) return { ok: false, error: "Organization not found." };

    await mergeOrganizationsCore(sourceId, targetId);

    await logAudit(admin, {
      targetType: "organization",
      targetId,
      targetLabel: target.name,
      action: "merged",
      oldValue: source.name,
      newValue: target.name,
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Merge failed." };
  }
}

// --- Talent spreadsheet import ------------------------------------------------

async function entityIdFor(kind: string, name: string): Promise<string> {
  const slug = slugify(name);
  const existing = await db.entity.findUnique({ where: { kind_slug: { kind, slug } } });
  if (existing) return existing.id;
  return (await db.entity.create({ data: { kind, slug, name: name.trim() } })).id;
}

export type ImportOutcome = {
  ok: boolean;
  error?: string;
  created?: number;
  enriched?: number;
  details?: string[];
};

/**
 * Import talent from any spreadsheet a creator tool exports. Rows are
 * normalized by src/lib/talent-import.ts, so column names and number formats
 * don't have to match ours.
 *
 * Existing talent is ENRICHED rather than skipped: empty fields get filled,
 * new taxonomy links and social accounts are added, and follower/engagement
 * numbers refresh (that's the point of re-importing). Text already written by
 * the team is never overwritten.
 */
export async function importCreators(rawRows: Record<string, string>[]): Promise<ImportOutcome> {
  try {
    const user = await requireRole("EDITOR");
    const parsed = normalizeTalentRows(rawRows).slice(0, 500);
    const details: string[] = [];
    let created = 0;
    let enriched = 0;

    for (const row of parsed) {
      const name = row.name.trim();
      const links: { entityId: string; relationship: string }[] = [];
      for (const c of row.categories) links.push({ entityId: await entityIdFor("creator_category", c), relationship: "" });
      for (const i of row.interests) links.push({ entityId: await entityIdFor("interest", i), relationship: "" });
      for (const s of row.sports) links.push({ entityId: await entityIdFor("sport", s), relationship: "" });
      if (row.basedIn) links.push({ entityId: await entityIdFor("location", row.basedIn), relationship: "based_in" });

      const existing = await db.creator.findFirst({
        where: { OR: [{ name: { equals: name, mode: "insensitive" } }, { aliases: { has: name } }] },
      });

      const creator =
        existing ??
        (await db.creator.create({
          data: {
            name,
            slug: uniqueSlug(
              name,
              new Set(
                (await db.creator.findMany({ where: { slug: { startsWith: slugify(name) } }, select: { slug: true } })).map((r) => r.slug),
              ),
            ),
            headline: row.headline || null,
            miniBio: row.miniBio || null,
            age: row.age ?? null,
          },
        }));

      if (existing) {
        // Fill blanks only — never clobber what the team has written.
        const fill: Record<string, string | number> = {};
        if (!existing.headline && row.headline) fill.headline = row.headline;
        if (!existing.miniBio && row.miniBio) fill.miniBio = row.miniBio;
        if (existing.age == null && row.age != null) fill.age = row.age;
        if (Object.keys(fill).length) await db.creator.update({ where: { id: creator.id }, data: fill });
      }

      for (const link of links) {
        await db.creatorEntityLink.upsert({
          where: { creatorId_entityId_relationship: { creatorId: creator.id, entityId: link.entityId, relationship: link.relationship } },
          update: {},
          create: { creatorId: creator.id, entityId: link.entityId, relationship: link.relationship },
        });
      }

      for (const social of row.socials) {
        const current = await db.socialProfile.findFirst({ where: { creatorId: creator.id, platform: social.platform } });
        const metrics = {
          ...(social.followerCount != null ? { followerCount: social.followerCount, countUpdatedAt: new Date() } : {}),
          ...(social.engagementRate != null ? { engagementRate: social.engagementRate } : {}),
        };
        if (current) {
          await db.socialProfile.update({
            where: { id: current.id },
            data: { handle: current.handle ?? social.handle ?? null, url: current.url ?? social.url ?? null, ...metrics },
          });
          if (social.followerCount != null) {
            await db.socialSnapshot.create({ data: { socialProfileId: current.id, followerCount: social.followerCount } });
          }
        } else {
          await db.socialProfile.create({
            data: { creatorId: creator.id, platform: social.platform, handle: social.handle ?? null, url: social.url ?? null, ...metrics },
          });
        }
      }

      const summary = row.socials
        .map((s) => `${s.platform}${s.followerCount != null ? ` ${s.followerCount}` : ""}${s.engagementRate != null ? ` @ ${s.engagementRate}%` : ""}`)
        .join(", ");
      await logAudit(user, {
        targetType: "creator",
        targetId: creator.id,
        targetLabel: creator.name,
        action: existing ? "updated" : "created",
        field: existing ? "spreadsheet import (enriched)" : "spreadsheet import",
        newValue: summary || undefined,
      });
      if (existing) {
        enriched++;
        details.push(`${name}: enriched (${summary || "no new metrics"})`);
      } else {
        created++;
      }
    }

    revalidatePath("/", "layout");
    return { ok: true, created, enriched, details };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Import failed." };
  }
}
