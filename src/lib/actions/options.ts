"use server";

// Settings → Options, and the "Create ‘X’" row inside every select.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { modelFor } from "@/lib/db-model";
import { refreshDigest } from "@/lib/ingest/digest";
import { bustOptions, ensureOption, OPTION_SETS, optionSetLabel, optionUsage, primeOptions, modelForType, type EnsureResult } from "@/lib/options";
import { OPTION_COLORS, optionRows, type OptionColor } from "@/lib/option-cache";
import { bustFieldDefinitions } from "@/lib/custom-fields";

type Result = { ok: true } | { ok: false; error: string };
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : "Could not save." });

/** From a picker: find or create an option by label. */
export async function createOption(setKey: string, label: string): Promise<EnsureResult> {
  try {
    const user = await requireRole("EDITOR");
    if (!/^[a-z0-9_]+$/.test(setKey)) return { ok: false, error: "Unknown option set." };
    const res = await ensureOption(setKey, label, user);
    if (res.ok) revalidatePath("/", "layout");
    return res;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create the option." };
  }
}

export async function renameOption(id: string, label: string): Promise<Result> {
  try {
    const user = await requireRole("EDITOR");
    const clean = label.trim().replace(/\s+/g, " ");
    if (!clean) return { ok: false, error: "Give it a name." };
    const row = await db.option.findUnique({ where: { id } });
    if (!row) return { ok: false, error: "That option is gone." };
    await primeOptions();
    const clash = optionRows(row.setKey).find((r) => r.id !== id && r.label.toLowerCase() === clean.toLowerCase());
    if (clash) return { ok: false, error: `“${clash.label}” already exists in this set.` };
    await db.option.update({ where: { id }, data: { label: clean } });
    await logAudit(user, { targetType: "option", targetId: id, targetLabel: `${optionSetLabel(row.setKey)}: ${clean}`, action: "updated", field: "label", oldValue: row.label, newValue: clean });
    bustOptions(); revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function recolorOption(id: string, color: string): Promise<Result> {
  try {
    const user = await requireRole("EDITOR");
    if (!(OPTION_COLORS as readonly string[]).includes(color)) return { ok: false, error: "Pick one of the palette colours." };
    const row = await db.option.update({ where: { id }, data: { color: color as OptionColor } });
    await logAudit(user, { targetType: "option", targetId: id, targetLabel: `${optionSetLabel(row.setKey)}: ${row.label}`, action: "updated", field: "color", newValue: color });
    bustOptions(); revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function reorderOptions(setKey: string, ids: string[]): Promise<Result> {
  try {
    await requireRole("EDITOR");
    await db.$transaction(ids.map((id, i) => db.option.update({ where: { id, setKey }, data: { position: (i + 1) * 10 } })));
    bustOptions(); revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function archiveOption(id: string, restore = false): Promise<Result> {
  try {
    const user = await requireRole("EDITOR");
    const row = await db.option.update({ where: { id }, data: { archivedAt: restore ? null : new Date() } });
    await logAudit(user, { targetType: "option", targetId: id, targetLabel: `${optionSetLabel(row.setKey)}: ${row.label}`, action: restore ? "restored" : "archived" });
    bustOptions(); revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function optionUsageCount(setKey: string, value: string): Promise<{ total: number; byColumn: { model: string; column: string; count: number }[] }> {
  await requireRole("EDITOR");
  return optionUsage(setKey, value);
}

/**
 * Point every record at the target option, archive the source with a
 * pointer, and write one audit row per record so the change can be traced.
 */
export async function mergeOption(sourceId: string, targetId: string): Promise<{ ok: true; reassigned: number } | { ok: false; error: string }> {
  try {
    const user = await requireRole("EDITOR");
    const [source, target] = await Promise.all([db.option.findUnique({ where: { id: sourceId } }), db.option.findUnique({ where: { id: targetId } })]);
    if (!source || !target) return { ok: false, error: "Pick two options." };
    if (source.setKey !== target.setKey) return { ok: false, error: "Options must be in the same set." };
    if (source.id === target.id) return { ok: false, error: "Pick two different options." };
    const spec = OPTION_SETS[source.setKey];
    let reassigned = 0;
    for (const col of spec?.columns ?? []) {
      const model = modelFor(col.model);
      const rows = await model.findMany({ where: col.array ? { [col.column]: { has: source.value } } : { [col.column]: source.value } });
      for (const row of rows) {
        const next = col.array ? [...new Set((row[col.column] as string[]).map((v) => (v === source.value ? target.value : v)))] : target.value;
        await model.update({ where: { id: row.id }, data: { [col.column]: next } });
        const targetType = col.targetType;
        const targetIdOf = String(row[`${targetType === "person" ? "person" : targetType}Id`] ?? row.id);
        await logAudit(user, { targetType, targetId: targetIdOf, targetLabel: String(row.name ?? row.title ?? ""), action: "updated", field: `${col.column} (option merge)`, oldValue: source.label, newValue: target.label });
        reassigned++;
      }
    }
    const defs = await db.fieldDefinition.findMany({ where: { optionSetKey: source.setKey, archivedAt: null } });
    for (const d of defs) {
      const modelName = modelForType(d.recordType);
      if (!modelName) continue;
      const model = modelFor(modelName);
      const rows = await model.findMany({ where: d.type === "multiselect" ? { custom: { path: [d.key], array_contains: [source.value] } } : { custom: { path: [d.key], equals: source.value } } });
      for (const row of rows) {
        const custom = { ...((row.custom ?? {}) as Record<string, unknown>) };
        custom[d.key] = d.type === "multiselect" ? [...new Set((custom[d.key] as string[]).map((v) => (v === source.value ? target.value : v)))] : target.value;
        await model.update({ where: { id: row.id }, data: { custom } });
        await logAudit(user, { targetType: d.recordType, targetId: row.id, targetLabel: String(row.name ?? row.title ?? ""), action: "updated", field: `${d.name} (option merge)`, oldValue: source.label, newValue: target.label });
        await refreshDigest(d.recordType, row.id);
        reassigned++;
      }
    }
    await db.option.update({ where: { id: source.id }, data: { archivedAt: new Date(), mergedInto: target.id } });
    await logAudit(user, { targetType: "option", targetId: source.id, targetLabel: `${optionSetLabel(source.setKey)}: ${source.label}`, action: "merged", newValue: target.label });
    bustOptions(); bustFieldDefinitions(); revalidatePath("/", "layout");
    return { ok: true, reassigned };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Merge failed." };
  }
}
