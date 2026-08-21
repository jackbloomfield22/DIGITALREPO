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
): Promise<Result> {
  try {
    const admin = await requireRole("ADMIN");
    if (!(targetType in ARCHIVABLE)) return { ok: false, error: "Unknown record type." };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = ARCHIVABLE[targetType] as any;
    const record = await model.update({ where: { id: targetId }, data: { archived } });
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

// --- CSV import --------------------------------------------------------------

const importRowSchema = z.object({
  name: z.string().trim().min(1).max(200),
  headline: z.string().max(300).optional(),
  age: z.string().optional(),
  based_in: z.string().max(100).optional(),
  categories: z.string().max(500).optional(),
  interests: z.string().max(500).optional(),
  sports: z.string().max(500).optional(),
  mini_bio: z.string().max(8000).optional(),
  instagram_handle: z.string().max(120).optional(),
  instagram_followers: z.string().optional(),
  tiktok_handle: z.string().max(120).optional(),
  tiktok_followers: z.string().optional(),
  youtube_handle: z.string().max(120).optional(),
  youtube_followers: z.string().optional(),
});
export type ImportRow = z.infer<typeof importRowSchema>;

async function entityIdFor(kind: string, name: string): Promise<string> {
  const slug = slugify(name);
  const existing = await db.entity.findUnique({ where: { kind_slug: { kind, slug } } });
  if (existing) return existing.id;
  return (await db.entity.create({ data: { kind, slug, name: name.trim() } })).id;
}

export async function importCreators(rows: ImportRow[]): Promise<{
  ok: boolean;
  error?: string;
  imported?: number;
  skipped?: string[];
}> {
  try {
    const user = await requireRole("EDITOR");
    const skipped: string[] = [];
    let imported = 0;
    for (const raw of rows.slice(0, 500)) {
      const parsed = importRowSchema.safeParse(raw);
      if (!parsed.success) {
        skipped.push(`${raw.name || "(no name)"}: invalid row`);
        continue;
      }
      const row = parsed.data;
      const existing = await db.creator.findFirst({
        where: { name: { equals: row.name, mode: "insensitive" } },
      });
      if (existing) {
        skipped.push(`${row.name}: already exists`);
        continue;
      }
      const slugRows = await db.creator.findMany({
        where: { slug: { startsWith: slugify(row.name) } },
        select: { slug: true },
      });
      const split = (s?: string) => (s ?? "").split(/[;|]/).map((x) => x.trim()).filter(Boolean);
      const entityLinks: { entityId: string; relationship: string }[] = [];
      for (const c of split(row.categories)) entityLinks.push({ entityId: await entityIdFor("creator_category", c), relationship: "" });
      for (const i of split(row.interests)) entityLinks.push({ entityId: await entityIdFor("interest", i), relationship: "" });
      for (const s of split(row.sports)) entityLinks.push({ entityId: await entityIdFor("sport", s), relationship: "" });
      if (row.based_in) entityLinks.push({ entityId: await entityIdFor("location", row.based_in), relationship: "based_in" });

      const socials: { platform: string; handle: string; followerCount: number | null }[] = [];
      const social = (platform: string, handle?: string, followers?: string) => {
        if (handle || followers) {
          socials.push({ platform, handle: handle ?? "", followerCount: followers && !isNaN(Number(followers)) ? Number(followers) : null });
        }
      };
      social("instagram", row.instagram_handle, row.instagram_followers);
      social("tiktok", row.tiktok_handle, row.tiktok_followers);
      social("youtube", row.youtube_handle, row.youtube_followers);

      const creator = await db.creator.create({
        data: {
          name: row.name,
          slug: uniqueSlug(row.name, new Set(slugRows.map((r) => r.slug))),
          headline: row.headline || null,
          age: row.age && !isNaN(Number(row.age)) ? Number(row.age) : null,
          miniBio: row.mini_bio || null,
          entityLinks: { create: entityLinks },
          socialProfiles: {
            create: socials.map((s) => ({ ...s, countUpdatedAt: s.followerCount != null ? new Date() : null })),
          },
        },
      });
      await logAudit(user, { targetType: "creator", targetId: creator.id, targetLabel: creator.name, action: "created", field: "csv import" });
      imported++;
    }
    revalidatePath("/", "layout");
    return { ok: true, imported, skipped };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Import failed." };
  }
}
