// Fields added from Settings → Fields. A definition says what a field is; the
// value lives in the record's `custom` JSON under the definition's key. From
// the definitions this module derives the Details rows, the validation, the
// list columns, the filter fields and the search text — nothing else in the
// app needs to know a field was added.

// No "server-only" guard here on purpose: the Vercel build loads this module
// through scripts/rebuild-digests.ts, which runs in plain Node where that
// import throws. The db import already keeps it off the client.
import { z } from "zod";
import { db } from "@/lib/db";
import { modelForType } from "@/lib/options";
import { optionList } from "@/lib/option-cache";
import { coerceField, plainValue, type DetailField, type PlainValue } from "@/lib/record-fields";
import type { FilterField } from "@/lib/filters";
import type { FieldMap } from "@/lib/filter-where";
import type { TableColumn } from "@/components/record-table";

export type FieldType = "text" | "longtext" | "number" | "date" | "checkbox" | "url" | "select" | "multiselect" | "relation" | "user";
export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" }, { value: "longtext", label: "Long text" }, { value: "number", label: "Number" }, { value: "date", label: "Date" },
  { value: "checkbox", label: "Checkbox" }, { value: "url", label: "URL" }, { value: "select", label: "Select" }, { value: "multiselect", label: "Multi-select" },
  { value: "relation", label: "Relation to a record" }, { value: "user", label: "Person on the team" },
];

export type FieldDef = {
  id: string; recordType: string; key: string; name: string; type: FieldType; optionSetKey: string | null; relationType: string | null;
  required: boolean; position: number; indexed: boolean; showInNeedsAttention: boolean; archivedAt: Date | null;
};

const TTL_MS = 15_000;
let cache: { at: number; defs: FieldDef[] } | null = null;
let users: { at: number; list: { value: string; label: string }[] } | null = null;

export const bustFieldDefinitions = () => { cache = null; };

/** Every definition, live ones first; archived ones still resolve labels. */
export async function allFieldDefinitions(): Promise<FieldDef[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.defs;
  const defs = (await db.fieldDefinition.findMany({ orderBy: [{ recordType: "asc" }, { position: "asc" }] })) as FieldDef[];
  cache = { at: Date.now(), defs };
  return defs;
}

export async function fieldDefinitions(recordType: string, includeArchived = false): Promise<FieldDef[]> {
  const defs = await allFieldDefinitions();
  return defs.filter((d) => d.recordType === recordType && (includeArchived || !d.archivedAt));
}

async function teamOptions(): Promise<{ value: string; label: string }[]> {
  if (users && Date.now() - users.at < TTL_MS) return users.list;
  const rows = await db.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  users = { at: Date.now(), list: rows.map((u) => ({ value: u.id, label: u.name })) };
  return users.list;
}

/** The kind an inline editor uses for each field type. */
export const KIND_OF: Record<FieldType, DetailField["kind"]> = {
  text: "text", longtext: "longtext", number: "number", date: "date", checkbox: "boolean", url: "url", select: "vocab", multiselect: "vocablist", relation: "relation", user: "vocab",
};

export const customFieldName = (key: string) => `custom.${key}`;
export const isCustomFieldName = (name: string) => name.startsWith("custom.");

/** A definition as a DetailField with the record's current value. */
export async function customDetailField(def: FieldDef, custom: unknown): Promise<DetailField> {
  const values = (custom && typeof custom === "object" ? custom : {}) as Record<string, unknown>;
  const options = def.type === "select" || def.type === "multiselect"
    ? optionList(def.optionSetKey ?? "")
    : def.type === "user" ? await teamOptions() : undefined;
  return {
    name: customFieldName(def.key), label: def.name, kind: KIND_OF[def.type], options, set: def.type === "select" || def.type === "multiselect" ? def.optionSetKey ?? undefined : undefined,
    lookupType: def.type === "relation" ? def.relationType ?? undefined : undefined, required: def.required, custom: true,
    maxLength: def.type === "text" ? 500 : def.type === "longtext" ? 8000 : undefined,
    value: plainValue(KIND_OF[def.type], values[def.key]),
  };
}

export async function customDetailFields(recordType: string, custom: unknown): Promise<DetailField[]> {
  const defs = await fieldDefinitions(recordType);
  return Promise.all(defs.map((d) => customDetailField(d, custom)));
}

/** Validate one custom value the way the inline editor and quick-create do. */
export async function coerceCustom(def: FieldDef, raw: unknown): Promise<{ ok: true; value: unknown; plain: PlainValue } | { ok: false; error: string }> {
  const field = await customDetailField(def, {});
  const c = coerceField(field, raw);
  if (!c.ok) return c;
  if (def.required && (c.plain == null || c.plain === "" || (Array.isArray(c.plain) && !c.plain.length))) return { ok: false, error: `${def.name} is required.` };
  // JSON stores dates as "YYYY-MM-DD" strings, not Date objects.
  return { ok: true, value: c.value instanceof Date ? c.plain : c.value, plain: c.plain };
}

/** A zod schema for a whole custom object, from the definitions. */
export function customSchema(defs: FieldDef[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const d of defs) {
    let t: z.ZodTypeAny;
    switch (d.type) {
      case "number": t = z.number(); break;
      case "checkbox": t = z.boolean(); break;
      case "multiselect": t = z.array(z.string()); break;
      case "relation": t = z.object({ id: z.string(), name: z.string() }); break;
      case "date": t = z.string().regex(/^\d{4}-\d{2}-\d{2}$/); break;
      default: t = z.string();
    }
    shape[d.key] = d.required ? t : t.nullable().optional();
  }
  return z.object(shape).partial();
}

/** Filter fields for a list, from the type's definitions. */
export async function customFilterFields(recordType: string): Promise<FilterField[]> {
  const defs = await fieldDefinitions(recordType);
  return defs.map((d): FilterField => {
    const key = `c_${d.key}`;
    switch (d.type) {
      case "select": return { key, label: d.name, kind: "select", options: optionList(d.optionSetKey ?? "") };
      case "multiselect": return { key, label: d.name, kind: "multiselect", options: optionList(d.optionSetKey ?? "") };
      case "number": return { key, label: d.name, kind: "number" };
      case "date": return { key, label: d.name, kind: "date" };
      case "checkbox": return { key, label: d.name, kind: "boolean" };
      case "relation": return { key, label: d.name, kind: "lookup", lookupType: (d.relationType ?? "creator") as FilterField extends { lookupType?: infer T } ? T : never };
      default: return { key, label: d.name, kind: "text" };
    }
  });
}

/** How each custom filter reaches the JSON column. */
export async function customFieldMaps(recordType: string): Promise<Record<string, FieldMap>> {
  const defs = await fieldDefinitions(recordType);
  const maps: Record<string, FieldMap> = {};
  for (const d of defs) {
    const path = [d.key];
    const empty = { OR: [{ custom: { path, equals: "" } }, { custom: { path, equals: null } }, { NOT: { custom: { path, not: undefined } } }] };
    maps[`c_${d.key}`] = {
      custom: (c) => {
        const one = c.values[0];
        const num = (v: string) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
        switch (c.op) {
          case "is": return d.type === "number" ? { custom: { path, equals: num(one) } } : d.type === "checkbox" ? { custom: { path, equals: one === "true" || one === "1" } } : { custom: { path, equals: one } };
          case "is_not": return { NOT: { custom: { path, equals: one } } };
          case "any": return d.type === "multiselect" ? { OR: c.values.map((v) => ({ custom: { path, array_contains: [v] } })) } : d.type === "relation" ? { OR: c.values.map((v) => ({ custom: { path: [d.key, "id"], equals: v } })) } : { OR: c.values.map((v) => ({ custom: { path, equals: v } })) };
          case "none": return { NOT: d.type === "multiselect" ? { OR: c.values.map((v) => ({ custom: { path, array_contains: [v] } })) } : d.type === "relation" ? { OR: c.values.map((v) => ({ custom: { path: [d.key, "id"], equals: v } })) } : { OR: c.values.map((v) => ({ custom: { path, equals: v } })) } };
          case "contains": return { custom: { path, string_contains: one } };
          case "empty": return empty;
          case "not_empty": return { NOT: empty };
          case "gt": case "after": return d.type === "number" ? { custom: { path, gte: num(one) } } : { custom: { path, gte: one } };
          case "lt": case "before": return d.type === "number" ? { custom: { path, lte: num(one) } } : { custom: { path, lte: one } };
          case "between": return d.type === "number" ? { custom: { path, gte: num(c.values[0]), lte: num(c.values[1]) } } : { custom: { path, gte: c.values[0], lte: c.values[1] } };
          default: return null;
        }
      },
    };
  }
  return maps;
}

/** Extra list columns, one per custom field that reads well in a table. */
export async function customColumns(recordType: string): Promise<TableColumn[]> {
  const defs = await fieldDefinitions(recordType);
  return defs.filter((d) => d.type !== "longtext").map((d) => ({ key: `c_${d.key}`, label: d.name, filterKey: `c_${d.key}`, showAt: "hidden xl:table-cell", align: d.type === "number" ? "right" : "left" }));
}

/** The cells for those columns, as text. */
export async function customCells(recordType: string, custom: unknown): Promise<string[]> {
  const defs = (await fieldDefinitions(recordType)).filter((d) => d.type !== "longtext");
  const values = (custom && typeof custom === "object" ? custom : {}) as Record<string, unknown>;
  return defs.map((d) => {
    const v = values[d.key];
    if (v == null || v === "") return "";
    if (d.type === "checkbox") return v ? "Yes" : "";
    if (d.type === "select") return optionList(d.optionSetKey ?? "").find((o) => o.value === v)?.label ?? String(v);
    if (d.type === "multiselect" && Array.isArray(v)) return v.map((x) => optionList(d.optionSetKey ?? "").find((o) => o.value === x)?.label ?? String(x)).join(", ");
    if (d.type === "relation" && typeof v === "object") return String((v as { name?: string }).name ?? "");
    return String(v);
  });
}

/** Text worth searching from a record's custom values (labels, not slugs). */
export function customSearchText(custom: unknown): string[] {
  const values = (custom && typeof custom === "object" ? custom : {}) as Record<string, unknown>;
  const out: string[] = [];
  for (const v of Object.values(values)) {
    if (typeof v === "string" && v && !/^\d{4}-\d{2}-\d{2}$/.test(v) && !/^https?:/.test(v)) out.push(v);
    else if (Array.isArray(v)) out.push(...v.map(String));
    else if (v && typeof v === "object" && "name" in v) out.push(String((v as { name: string }).name));
  }
  return out;
}

export type DateAlert = { recordType: string; id: string; name: string; href: string; field: string; date: string; overdue: boolean };

/** Dated custom fields flagged for Needs attention: due within 30 days or overdue. */
export async function customDateAlerts(limit = 20): Promise<DateAlert[]> {
  const defs = (await allFieldDefinitions()).filter((d) => !d.archivedAt && d.type === "date" && d.showInNeedsAttention);
  const out: DateAlert[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const PATH: Record<string, string> = { creator: "/talent", project: "/projects", organization: "/organizations", person: "/people", format: "/formats", opportunity: "/opportunities", channel: "/youtube" };
  for (const d of defs) {
    const model = modelForType(d.recordType);
    if (!model) continue;
    const nameField = d.recordType === "project" || d.recordType === "format" || d.recordType === "opportunity" ? "title" : "name";
    const rows = await db.$queryRawUnsafe<{ id: string; name: string; slug: string; due: string }[]>(
      `SELECT id, "${nameField}" AS name, slug, custom->>'${d.key}' AS due FROM "${model.charAt(0).toUpperCase() + model.slice(1)}" WHERE archived = false AND custom->>'${d.key}' IS NOT NULL AND custom->>'${d.key}' <= $1 ORDER BY custom->>'${d.key}' ASC LIMIT ${limit}`,
      soon,
    );
    for (const r of rows) out.push({ recordType: d.recordType, id: r.id, name: r.name, href: `${PATH[d.recordType]}/${r.slug}`, field: d.name, date: r.due, overdue: r.due < today });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit);
}
