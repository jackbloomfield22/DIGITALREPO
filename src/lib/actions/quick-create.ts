"use server";

// The quick-create sheet: a name and the few fields that matter, from any
// page. An exact existing name is offered back instead of a second copy.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { queueAirtableSync } from "@/lib/airtable/sync";
import { normalizeName, slugify, uniqueSlug } from "@/lib/slug";
import { RECORD_REGISTRY, type IngestTargetType } from "@/lib/ingest/registry";
import { coerceField, CREATE_TYPES, type CreateType } from "@/lib/record-fields";

export type CreateResult =
  | { ok: true; id: string; name: string; href: string }
  | { ok: false; error: string; existing?: { name: string; href: string } };

export async function createRecord(type: CreateType, values: Record<string, unknown>): Promise<CreateResult> {
  try {
    const user = await requireRole("EDITOR");
    if (!CREATE_TYPES.includes(type)) return { ok: false, error: "Unknown record type." };
    const spec = RECORD_REGISTRY[type as IngestTargetType];
    const name = String(values[spec.nameField] ?? values.name ?? "").trim();
    if (!name) return { ok: false, error: "A name is required." };
    if (name.length > 300) return { ok: false, error: "That name is too long." };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = (db as any)[spec.prismaModel];

    const norm = normalizeName(name);
    const existing: Record<string, string>[] = await model.findMany({ where: { archived: false }, select: { id: true, slug: true, [spec.nameField]: true } });
    const clash = existing.find((r) => normalizeName(r[spec.nameField]) === norm);
    if (clash) return { ok: false, error: `${clash[spec.nameField]} already exists.`, existing: { name: clash[spec.nameField], href: spec.path(clash.slug) } };

    const data: Record<string, unknown> = { [spec.nameField]: name };
    for (const field of spec.fields) {
      if (!(field.name in values) || values[field.name] == null || values[field.name] === "") continue;
      const c = coerceField(field, values[field.name]);
      if (!c.ok) return { ok: false, error: c.error };
      data[field.name] = c.value;
    }
    const base = slugify(name);
    const taken: { slug: string }[] = await model.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } });
    data.slug = uniqueSlug(name, new Set(taken.map((r) => r.slug)));

    const created = await model.create({ data });
    await logAudit(user, { targetType: type, targetId: created.id, targetLabel: name, action: "created" });
    await queueAirtableSync(type, created.id);
    revalidatePath("/", "layout");
    return { ok: true, id: created.id, name, href: spec.path(created.slug) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create that." };
  }
}
