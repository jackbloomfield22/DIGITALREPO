"use server";

// Create/update actions for projects, organizations, formats, opportunities,
// and industry people. All follow the same contract: editor-gated, validated,
// slugged, audited, optimistic-concurrency-checked on update.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { logAudit, logFieldChanges } from "@/lib/audit";
import { slugify, uniqueSlug } from "@/lib/slug";

export type RecordResult =
  | { ok: true; slug: string; id: string }
  | { ok: false; error: string; conflict?: { editedBy: string } };

const fail = (e: unknown): RecordResult => ({
  ok: false,
  error: e instanceof Error ? e.message : "Could not save.",
});

async function nextSlug(
  find: (startsWith: string) => Promise<{ slug: string }[]>,
  name: string,
): Promise<string> {
  const rows = await find(slugify(name));
  return uniqueSlug(name, new Set(rows.map((r) => r.slug)));
}

async function conflictInfo(targetType: string, targetId: string) {
  const lastEdit = await db.auditLog.findFirst({
    where: { targetType, targetId },
    orderBy: { createdAt: "desc" },
  });
  return { editedBy: lastEdit?.userName ?? "another editor" };
}

// --- Projects ----------------------------------------------------------------

const projectSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  imageUrl: z.string().trim().max(500).optional().nullable(),
  projectType: z.string().trim().max(40).optional().nullable(),
  status: z.string().trim().max(30).optional(),
  logline: z.string().max(500).optional().nullable(),
  description: z.string().max(8000).optional().nullable(),
  premiereYear: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
  endYear: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
  seasons: z.coerce.number().int().min(0).optional().nullable(),
  episodes: z.coerce.number().int().min(0).optional().nullable(),
  runtimeMinutes: z.coerce.number().int().min(0).optional().nullable(),
  country: z.string().trim().max(80).optional().nullable(),
  trailerUrl: z.string().trim().max(500).optional().nullable(),
  officialUrl: z.string().trim().max(500).optional().nullable(),
  imdbUrl: z.string().trim().max(500).optional().nullable(),
  youtubeUrl: z.string().trim().max(500).optional().nullable(),
  internalNotes: z.string().max(8000).optional().nullable(),
});
export type ProjectInput = z.infer<typeof projectSchema>;

function nn<T extends Record<string, unknown>>(data: T): T {
  // empty strings -> null so optional fields clear correctly
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, v === "" ? null : v]),
  ) as T;
}

export async function createProject(input: ProjectInput): Promise<RecordResult> {
  try {
    const user = await requireRole("EDITOR");
    const data = nn(projectSchema.parse(input));
    const slug = await nextSlug(
      (s) => db.project.findMany({ where: { slug: { startsWith: s } }, select: { slug: true } }),
      data.title,
    );
    const project = await db.project.create({ data: { ...data, slug, status: data.status || "released" } });
    await logAudit(user, { targetType: "project", targetId: project.id, targetLabel: project.title, action: "created" });
    revalidatePath("/", "layout");
    return { ok: true, slug: project.slug, id: project.id };
  } catch (e) {
    return fail(e);
  }
}

export async function updateProject(input: { id: string; expectedVersion: number; data: ProjectInput }): Promise<RecordResult> {
  try {
    const user = await requireRole("EDITOR");
    const data = nn(projectSchema.parse(input.data));
    const existing = await db.project.findUnique({ where: { id: input.id } });
    if (!existing) return { ok: false, error: "Project not found." };
    if (existing.version !== input.expectedVersion) {
      return { ok: false, error: "This project was changed by someone else while you were editing.", conflict: await conflictInfo("project", input.id) };
    }
    const project = await db.project.update({
      where: { id: input.id, version: input.expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    await logFieldChanges(user, "project", project.id, project.title, existing as unknown as Record<string, unknown>, data as Record<string, unknown>);
    revalidatePath("/", "layout");
    return { ok: true, slug: project.slug, id: project.id };
  } catch (e) {
    return fail(e);
  }
}

// --- Organizations -----------------------------------------------------------

const orgSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(300),
  types: z.array(z.string().max(40)).max(8).optional(),
  imageUrl: z.string().trim().max(500).optional().nullable(),
  description: z.string().max(8000).optional().nullable(),
  website: z.string().trim().max(500).optional().nullable(),
  location: z.string().trim().max(120).optional().nullable(),
  internalNotes: z.string().max(8000).optional().nullable(),
  aliases: z.array(z.string().trim().max(120)).max(10).optional(),
});
export type OrganizationInput = z.infer<typeof orgSchema>;

export async function createOrganization(input: OrganizationInput): Promise<RecordResult> {
  try {
    const user = await requireRole("EDITOR");
    const data = nn(orgSchema.parse(input));
    const slug = await nextSlug(
      (s) => db.organization.findMany({ where: { slug: { startsWith: s } }, select: { slug: true } }),
      data.name,
    );
    const organization = await db.organization.create({
      data: { ...data, types: data.types ?? [], aliases: data.aliases ?? [], slug },
    });
    await logAudit(user, { targetType: "organization", targetId: organization.id, targetLabel: organization.name, action: "created" });
    revalidatePath("/", "layout");
    return { ok: true, slug: organization.slug, id: organization.id };
  } catch (e) {
    return fail(e);
  }
}

export async function updateOrganization(input: { id: string; expectedVersion: number; data: OrganizationInput }): Promise<RecordResult> {
  try {
    const user = await requireRole("EDITOR");
    const data = nn(orgSchema.parse(input.data));
    const existing = await db.organization.findUnique({ where: { id: input.id } });
    if (!existing) return { ok: false, error: "Organization not found." };
    if (existing.version !== input.expectedVersion) {
      return { ok: false, error: "This organization was changed by someone else while you were editing.", conflict: await conflictInfo("organization", input.id) };
    }
    const organization = await db.organization.update({
      where: { id: input.id, version: input.expectedVersion },
      data: { ...data, types: data.types ?? existing.types, aliases: data.aliases ?? existing.aliases, version: { increment: 1 } },
    });
    await logFieldChanges(user, "organization", organization.id, organization.name, existing as unknown as Record<string, unknown>, data as Record<string, unknown>);
    revalidatePath("/", "layout");
    return { ok: true, slug: organization.slug, id: organization.id };
  } catch (e) {
    return fail(e);
  }
}

// --- Formats -----------------------------------------------------------------

const formatSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  logline: z.string().max(500).optional().nullable(),
  description: z.string().max(8000).optional().nullable(),
  formatType: z.string().trim().max(40).optional().nullable(),
  status: z.string().trim().max(30).optional(),
  targetPlatform: z.string().trim().max(120).optional().nullable(),
  episodeStructure: z.string().max(2000).optional().nullable(),
  episodeLength: z.string().trim().max(80).optional().nullable(),
  productionScale: z.string().trim().max(120).optional().nullable(),
  location: z.string().trim().max(120).optional().nullable(),
  sponsorFit: z.string().max(2000).optional().nullable(),
  notes: z.string().max(8000).optional().nullable(),
});
export type FormatInput = z.infer<typeof formatSchema>;

export async function createFormat(input: FormatInput): Promise<RecordResult> {
  try {
    const user = await requireRole("EDITOR");
    const data = nn(formatSchema.parse(input));
    const slug = await nextSlug(
      (s) => db.format.findMany({ where: { slug: { startsWith: s } }, select: { slug: true } }),
      data.title,
    );
    const format = await db.format.create({
      data: { ...data, slug, status: data.status || "idea", ownerId: user.id },
    });
    await logAudit(user, { targetType: "format", targetId: format.id, targetLabel: format.title, action: "created" });
    revalidatePath("/", "layout");
    return { ok: true, slug: format.slug, id: format.id };
  } catch (e) {
    return fail(e);
  }
}

export async function updateFormat(input: { id: string; expectedVersion: number; data: FormatInput }): Promise<RecordResult> {
  try {
    const user = await requireRole("EDITOR");
    const data = nn(formatSchema.parse(input.data));
    const existing = await db.format.findUnique({ where: { id: input.id } });
    if (!existing) return { ok: false, error: "Format not found." };
    if (existing.version !== input.expectedVersion) {
      return { ok: false, error: "This format was changed by someone else while you were editing.", conflict: await conflictInfo("format", input.id) };
    }
    const format = await db.format.update({
      where: { id: input.id, version: input.expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    await logFieldChanges(user, "format", format.id, format.title, existing as unknown as Record<string, unknown>, data as Record<string, unknown>);
    revalidatePath("/", "layout");
    return { ok: true, slug: format.slug, id: format.id };
  } catch (e) {
    return fail(e);
  }
}

// --- Opportunities -----------------------------------------------------------

const opportunitySchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  type: z.string().trim().max(40).optional().nullable(),
  status: z.string().trim().max(30).optional(),
  description: z.string().max(8000).optional().nullable(),
  audienceRequirements: z.string().max(2000).optional().nullable(),
  platformRequirements: z.string().max(2000).optional().nullable(),
  outcome: z.string().max(4000).optional().nullable(),
  notes: z.string().max(8000).optional().nullable(),
  deadline: z.string().optional().nullable(),
});
export type OpportunityInput = z.infer<typeof opportunitySchema>;

export async function createOpportunity(input: OpportunityInput): Promise<RecordResult> {
  try {
    const user = await requireRole("EDITOR");
    const parsed = nn(opportunitySchema.parse(input));
    const { deadline, ...rest } = parsed;
    const slug = await nextSlug(
      (s) => db.opportunity.findMany({ where: { slug: { startsWith: s } }, select: { slug: true } }),
      parsed.title,
    );
    const opportunity = await db.opportunity.create({
      data: { ...rest, slug, status: parsed.status || "researching", deadline: deadline ? new Date(deadline) : null, ownerId: user.id },
    });
    await logAudit(user, { targetType: "opportunity", targetId: opportunity.id, targetLabel: opportunity.title, action: "created" });
    revalidatePath("/", "layout");
    return { ok: true, slug: opportunity.slug, id: opportunity.id };
  } catch (e) {
    return fail(e);
  }
}

export async function updateOpportunity(input: { id: string; expectedVersion: number; data: OpportunityInput }): Promise<RecordResult> {
  try {
    const user = await requireRole("EDITOR");
    const parsed = nn(opportunitySchema.parse(input.data));
    const { deadline, ...rest } = parsed;
    const existing = await db.opportunity.findUnique({ where: { id: input.id } });
    if (!existing) return { ok: false, error: "Opportunity not found." };
    if (existing.version !== input.expectedVersion) {
      return { ok: false, error: "This opportunity was changed by someone else while you were editing.", conflict: await conflictInfo("opportunity", input.id) };
    }
    const opportunity = await db.opportunity.update({
      where: { id: input.id, version: input.expectedVersion },
      data: { ...rest, deadline: deadline ? new Date(deadline) : null, version: { increment: 1 } },
    });
    await logFieldChanges(user, "opportunity", opportunity.id, opportunity.title, existing as unknown as Record<string, unknown>, rest as Record<string, unknown>);
    revalidatePath("/", "layout");
    return { ok: true, slug: opportunity.slug, id: opportunity.id };
  } catch (e) {
    return fail(e);
  }
}

// --- Industry people ---------------------------------------------------------

const personSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  title: z.string().trim().max(200).optional().nullable(),
  roleType: z.string().trim().max(40).optional().nullable(),
  notes: z.string().max(8000).optional().nullable(),
});
export type PersonInput = z.infer<typeof personSchema>;

export async function createPerson(input: PersonInput): Promise<RecordResult> {
  try {
    const user = await requireRole("EDITOR");
    const data = nn(personSchema.parse(input));
    const slug = await nextSlug(
      (s) => db.industryPerson.findMany({ where: { slug: { startsWith: s } }, select: { slug: true } }),
      data.name,
    );
    const person = await db.industryPerson.create({ data: { ...data, slug } });
    await logAudit(user, { targetType: "person", targetId: person.id, targetLabel: person.name, action: "created" });
    revalidatePath("/", "layout");
    return { ok: true, slug: person.slug, id: person.id };
  } catch (e) {
    return fail(e);
  }
}

export async function updatePerson(input: { id: string; data: PersonInput }): Promise<RecordResult> {
  try {
    const user = await requireRole("EDITOR");
    const data = nn(personSchema.parse(input.data));
    const person = await db.industryPerson.update({ where: { id: input.id }, data });
    await logAudit(user, { targetType: "person", targetId: person.id, targetLabel: person.name, action: "updated" });
    revalidatePath("/", "layout");
    return { ok: true, slug: person.slug, id: person.id };
  } catch (e) {
    return fail(e);
  }
}
