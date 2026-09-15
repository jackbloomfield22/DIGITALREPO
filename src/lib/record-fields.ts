// The editable fields of a record, in a shape that can cross the server →
// client boundary. RECORD_REGISTRY carries vocabularies as functions; the
// details panel and the inline editors need plain lists and plain values.

import { RECORD_REGISTRY, type EditableField, type IngestTargetType } from "@/lib/ingest/registry";
import type { LabeledValue } from "@/lib/taxonomy";

export type FieldKind = EditableField["kind"];

export type DetailField = {
  name: string;
  label: string;
  kind: FieldKind;
  options?: LabeledValue[];
  maxLength?: number;
  description?: string;
  /** Plain value: string, number, string[] or null. Dates are "YYYY-MM-DD". */
  value: string | number | string[] | null;
};

/** The record types the quick-create sheet can make. */
export const CREATE_TYPES = ["creator", "project", "organization", "format", "person", "opportunity"] as const;
export type CreateType = (typeof CREATE_TYPES)[number];

/** The record types with a page and a details panel. */
export const DETAIL_TYPES: IngestTargetType[] = ["creator", "project", "organization", "format", "person", "opportunity", "channel"];

const NAME_LABEL: Record<string, string> = { name: "Name", title: "Title" };

/** Fields shown in the details panel, in registry order, minus the ones a page renders elsewhere. */
export function detailFields(type: IngestTargetType, record: Record<string, unknown>, opts: { omit?: string[] } = {}): DetailField[] {
  const spec = RECORD_REGISTRY[type];
  const omit = new Set(opts.omit ?? []);
  return spec.fields
    .filter((f) => !omit.has(f.name))
    .map((f) => ({
      name: f.name,
      label: f.label,
      kind: f.kind,
      options: f.vocab ? f.vocab().filter((o) => o.value !== "") : undefined,
      maxLength: f.maxLength,
      description: f.description,
      value: plainValue(f.kind, record[f.name]),
    }));
}

/** The name/title field as a DetailField, for the editable heading. */
export function nameField(type: IngestTargetType, record: Record<string, unknown>): DetailField {
  const spec = RECORD_REGISTRY[type];
  return { name: spec.nameField, label: NAME_LABEL[spec.nameField] ?? "Name", kind: "text", maxLength: 300, value: plainValue("text", record[spec.nameField]) };
}

export function plainValue(kind: FieldKind, v: unknown): DetailField["value"] {
  if (v == null) return null;
  if (kind === "date") {
    const d = v instanceof Date ? v : new Date(String(v));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  if (kind === "list" || kind === "vocablist") return Array.isArray(v) ? v.map(String) : String(v).split(",").map((s) => s.trim()).filter(Boolean);
  if (kind === "number" || kind === "year") return typeof v === "number" ? v : Number(v);
  return String(v);
}

export function isEmptyValue(v: DetailField["value"]): boolean {
  return v == null || v === "" || (Array.isArray(v) && v.length === 0);
}

/** Two plain values mean the same thing. */
export function sameValue(a: DetailField["value"], b: DetailField["value"]): boolean {
  if (isEmptyValue(a) && isEmptyValue(b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  return String(a) === String(b);
}

export type Coerced = { ok: true; value: unknown; plain: DetailField["value"] } | { ok: false; error: string };

/**
 * Turn what an editor typed into what the column takes. Empty means null for
 * every optional field; a vocabulary field must name one of its values.
 */
export function coerceField(field: EditableField | DetailField, raw: unknown): Coerced {
  const kind = field.kind;
  const options = "options" in field ? field.options : "vocab" in field && field.vocab ? field.vocab() : undefined;
  const str = raw == null ? "" : Array.isArray(raw) ? raw.join(", ") : String(raw);
  const trimmed = str.trim();
  switch (kind) {
    case "text":
    case "longtext": {
      const max = field.maxLength ?? (kind === "text" ? 500 : 8000);
      if (trimmed.length > max) return { ok: false, error: `${field.label} can be at most ${max} characters.` };
      return { ok: true, value: trimmed || null, plain: trimmed || null };
    }
    case "number":
    case "year": {
      if (!trimmed) return { ok: true, value: null, plain: null };
      const n = Number(trimmed.replace(/[,\s]/g, ""));
      if (!Number.isFinite(n)) return { ok: false, error: `${field.label} must be a number.` };
      if (kind === "year" && (n < 1800 || n > 2200)) return { ok: false, error: `${field.label} must be a year.` };
      return { ok: true, value: Math.round(n), plain: Math.round(n) };
    }
    case "date": {
      if (!trimmed) return { ok: true, value: null, plain: null };
      const d = new Date(trimmed.length === 10 ? `${trimmed}T00:00:00Z` : trimmed);
      if (Number.isNaN(d.getTime())) return { ok: false, error: `${field.label} must be a date.` };
      return { ok: true, value: d, plain: d.toISOString().slice(0, 10) };
    }
    case "vocab": {
      if (!trimmed) return { ok: true, value: null, plain: null };
      if (options && !options.some((o) => o.value === trimmed)) return { ok: false, error: `"${trimmed}" is not one of the ${field.label} options.` };
      return { ok: true, value: trimmed, plain: trimmed };
    }
    case "list":
    case "vocablist": {
      const items = (Array.isArray(raw) ? raw.map(String) : str.split(/[,\n]/)).map((s) => s.trim()).filter(Boolean);
      const unique = [...new Set(items)];
      if (kind === "vocablist" && options) {
        const bad = unique.find((v) => !options.some((o) => o.value === v));
        if (bad) return { ok: false, error: `"${bad}" is not one of the ${field.label} options.` };
      }
      return { ok: true, value: unique, plain: unique };
    }
  }
}

/** Human-readable form of a plain value for audit rows and read-only display. */
export function displayValue(field: Pick<DetailField, "kind" | "options">, v: DetailField["value"]): string {
  if (isEmptyValue(v)) return "";
  if (Array.isArray(v)) return v.map((x) => field.options?.find((o) => o.value === x)?.label ?? x).join(", ");
  if (field.kind === "vocab") return field.options?.find((o) => o.value === String(v))?.label ?? String(v);
  if (field.kind === "number") return typeof v === "number" ? v.toLocaleString("en-US") : String(v);
  return String(v);
}

/** The named fields, in the order given, dropping any that do not exist. */
export function pickFields(fields: DetailField[], names: string[]): DetailField[] {
  return names.map((n) => fields.find((f) => f.name === n)).filter((f): f is DetailField => !!f);
}

/** One field by name — for a long-text section rendered on its own. */
export function fieldNamed(fields: DetailField[], name: string): DetailField {
  const f = fields.find((x) => x.name === name);
  if (!f) throw new Error(`No field named ${name}`);
  return f;
}
