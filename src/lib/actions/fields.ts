"use server";

// Settings → Fields: add a field to a record type, archive or restore one,
// reorder them. A field's type never changes after creation.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { slugify } from "@/lib/slug";
import { bustFieldDefinitions, FIELD_TYPES, type FieldType } from "@/lib/custom-fields";
import { modelForType, OPTION_SETS, bustOptions } from "@/lib/options";
import { DETAIL_TYPES } from "@/lib/record-fields";

type Result = { ok: true; id?: string } | { ok: false; error: string };
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : "Could not save." });

export type NewField = {
  recordType: string; name: string; type: FieldType; optionSetKey?: string; newOptionSet?: string; relationType?: string;
  required?: boolean; indexed?: boolean; showInNeedsAttention?: boolean;
};

export async function createFieldDefinition(input: NewField): Promise<Result> {
  try {
    const user = await requireRole("EDITOR");
    if (!(DETAIL_TYPES as readonly string[]).includes(input.recordType)) return { ok: false, error: "Unknown record type." };
    if (!FIELD_TYPES.some((t) => t.value === input.type)) return { ok: false, error: "Unknown field type." };
    const name = input.name.trim().replace(/\s+/g, " ");
    if (!name) return { ok: false, error: "Give the field a name." };
    let optionSetKey: string | null = null;
    if (input.type === "select" || input.type === "multiselect") {
      optionSetKey = input.optionSetKey?.trim() || slugify(input.newOptionSet?.trim() || name).replace(/-/g, "_");
      if (!/^[a-z0-9_]+$/.test(optionSetKey)) return { ok: false, error: "Option set keys are lower-case letters, digits and underscores." };
    }
    if (input.type === "relation" && !(DETAIL_TYPES as readonly string[]).includes(input.relationType ?? "")) return { ok: false, error: "Pick the record type the relation points at." };
    const base = slugify(name).replace(/-/g, "_") || "field";
    const existing = await db.fieldDefinition.findMany({ where: { recordType: input.recordType }, select: { key: true, position: true } });
    let key = base; let n = 2;
    while (existing.some((e) => e.key === key)) key = `${base}_${n++}`;
    const position = Math.max(0, ...existing.map((e) => e.position)) + 10;
    const def = await db.fieldDefinition.create({
      data: { recordType: input.recordType, key, name, type: input.type, optionSetKey, relationType: input.type === "relation" ? input.relationType : null, required: !!input.required, indexed: !!input.indexed, showInNeedsAttention: !!input.showInNeedsAttention && input.type === "date", position },
    });
    if (def.indexed) await ensureIndex(input.recordType, key);
    await logAudit(user, { targetType: "field", targetId: def.id, targetLabel: `${input.recordType}: ${name}`, action: "created", field: key, newValue: input.type });
    bustFieldDefinitions(); bustOptions(); revalidatePath("/", "layout");
    return { ok: true, id: def.id };
  } catch (e) { return fail(e); }
}

/** An expression index on the JSON path, so filters on the field stay quick. */
async function ensureIndex(recordType: string, key: string) {
  const model = modelForType(recordType);
  if (!model || !/^[a-z0-9_]+$/.test(key)) return;
  const table = model.charAt(0).toUpperCase() + model.slice(1);
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "${table}_custom_${key}_idx" ON "${table}" (("custom"->>'${key}'))`);
}

export async function updateFieldDefinition(id: string, patch: { name?: string; required?: boolean; indexed?: boolean; showInNeedsAttention?: boolean }): Promise<Result> {
  try {
    const user = await requireRole("EDITOR");
    const def = await db.fieldDefinition.findUnique({ where: { id } });
    if (!def) return { ok: false, error: "That field is gone." };
    const data: Record<string, unknown> = {};
    if (patch.name !== undefined) { const name = patch.name.trim(); if (!name) return { ok: false, error: "Give the field a name." }; data.name = name; }
    if (patch.required !== undefined) data.required = patch.required;
    if (patch.indexed !== undefined) data.indexed = patch.indexed;
    if (patch.showInNeedsAttention !== undefined) data.showInNeedsAttention = patch.showInNeedsAttention && def.type === "date";
    const updated = await db.fieldDefinition.update({ where: { id }, data });
    if (patch.indexed && !def.indexed) await ensureIndex(def.recordType, def.key);
    await logAudit(user, { targetType: "field", targetId: id, targetLabel: `${def.recordType}: ${updated.name}`, action: "updated", field: Object.keys(data).join(", ") });
    bustFieldDefinitions(); revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function archiveFieldDefinition(id: string, restore = false): Promise<Result> {
  try {
    const user = await requireRole("EDITOR");
    const def = await db.fieldDefinition.update({ where: { id }, data: { archivedAt: restore ? null : new Date() } });
    await logAudit(user, { targetType: "field", targetId: id, targetLabel: `${def.recordType}: ${def.name}`, action: restore ? "restored" : "archived" });
    bustFieldDefinitions(); revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function reorderFieldDefinitions(recordType: string, ids: string[]): Promise<Result> {
  try {
    await requireRole("EDITOR");
    await db.$transaction(ids.map((id, i) => db.fieldDefinition.update({ where: { id, recordType }, data: { position: (i + 1) * 10 } })));
    bustFieldDefinitions(); revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** The option sets a new select field can draw from. */
export async function optionSetChoicesPublic(): Promise<{ value: string; label: string }[]> {
  await requireRole("EDITOR");
  const known = Object.entries(OPTION_SETS).map(([value, s]) => ({ value, label: s.label }));
  const extra = await db.option.findMany({ distinct: ["setKey"], select: { setKey: true } });
  for (const e of extra) if (!known.some((k) => k.value === e.setKey)) known.push({ value: e.setKey, label: e.setKey.replace(/_/g, " ") });
  return known.sort((a, b) => a.label.localeCompare(b.label));
}
