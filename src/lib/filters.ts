// The filter model every list shares. A filter is a field, an operator and
// values; filters stack with AND, and one group of them can be OR-ed. The
// whole state lives in the URL as repeated `f=` (and) and `or=` (the group)
// parameters shaped `field~op~value1,value2`, readable enough to paste into
// Slack. Older links using `status=`, `type=`, `creator=` still work: each
// list maps its legacy parameter names onto fields here.

import type { SearchParams } from "@/lib/directory-params";

export type LabeledValue = { value: string; label: string };
export type FilterKind = "select" | "multiselect" | "lookup" | "text" | "number" | "date" | "boolean";
export type LookupType = "creator" | "project" | "organization" | "format" | "person" | "entity" | "collection";
export type FilterField = {
  key: string;
  label: string;
  kind: FilterKind;
  options?: LabeledValue[];
  lookupType?: LookupType;
  lookupKind?: string;
  /** Older URL parameter that meant `field is value` (or `any of` when repeated). */
  legacy?: string;
  /** Fixed choices a lookup field also offers ("any", "none"). */
  presets?: LabeledValue[];
  placeholder?: string;
};
export type FilterOp = "is" | "is_not" | "any" | "none" | "contains" | "empty" | "not_empty" | "before" | "after" | "between" | "gt" | "lt";
export type Condition = { field: string; op: FilterOp; values: string[] };
export type FilterState = { and: Condition[]; or: Condition[] };

export const OPERATORS: Record<FilterKind, { value: FilterOp; label: string; arity: 0 | 1 | 2 | "many" }[]> = {
  select: [{ value: "is", label: "is", arity: 1 }, { value: "is_not", label: "is not", arity: 1 }, { value: "any", label: "is any of", arity: "many" }, { value: "none", label: "is none of", arity: "many" }, { value: "empty", label: "is empty", arity: 0 }, { value: "not_empty", label: "is not empty", arity: 0 }],
  multiselect: [{ value: "any", label: "has any of", arity: "many" }, { value: "none", label: "has none of", arity: "many" }, { value: "empty", label: "is empty", arity: 0 }, { value: "not_empty", label: "is not empty", arity: 0 }],
  lookup: [{ value: "any", label: "is any of", arity: "many" }, { value: "none", label: "is none of", arity: "many" }, { value: "empty", label: "is empty", arity: 0 }, { value: "not_empty", label: "is not empty", arity: 0 }],
  text: [{ value: "contains", label: "contains", arity: 1 }, { value: "is", label: "is", arity: 1 }, { value: "empty", label: "is empty", arity: 0 }, { value: "not_empty", label: "is not empty", arity: 0 }],
  number: [{ value: "is", label: "is", arity: 1 }, { value: "gt", label: "is at least", arity: 1 }, { value: "lt", label: "is at most", arity: 1 }, { value: "between", label: "is between", arity: 2 }, { value: "empty", label: "is empty", arity: 0 }, { value: "not_empty", label: "is not empty", arity: 0 }],
  date: [{ value: "before", label: "is before", arity: 1 }, { value: "after", label: "is after", arity: 1 }, { value: "between", label: "is between", arity: 2 }, { value: "empty", label: "is empty", arity: 0 }, { value: "not_empty", label: "is not empty", arity: 0 }],
  boolean: [{ value: "is", label: "is", arity: 1 }],
};

const SEP = "~";

export function serializeCondition(c: Condition): string {
  return [c.field, c.op, c.values.map((v) => encodeURIComponent(v)).join(",")].join(SEP);
}
export function parseCondition(raw: string, fields: FilterField[]): Condition | null {
  const [field, op, rest] = raw.split(SEP);
  const def = fields.find((f) => f.key === field);
  if (!def || !op) return null;
  const allowed = OPERATORS[def.kind].find((o) => o.value === op);
  if (!allowed) return null;
  const values = (rest ?? "").split(",").filter(Boolean).map((v) => { try { return decodeURIComponent(v); } catch { return v; } }).slice(0, 50);
  if (allowed.arity === 0) return { field, op: op as FilterOp, values: [] };
  if (!values.length) return null;
  if (allowed.arity === 1) return { field, op: op as FilterOp, values: values.slice(0, 1) };
  if (allowed.arity === 2) return values.length >= 2 ? { field, op: op as FilterOp, values: values.slice(0, 2) } : null;
  return { field, op: op as FilterOp, values };
}

const list = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]).map((s) => s.trim()).filter(Boolean);

/** The state in the URL, legacy parameters included. */
export function parseFilterParams(params: SearchParams, fields: FilterField[]): FilterState {
  const and: Condition[] = list(params.f).map((raw) => parseCondition(raw, fields)).filter((c): c is Condition => !!c);
  const or: Condition[] = list(params.or).map((raw) => parseCondition(raw, fields)).filter((c): c is Condition => !!c);
  for (const f of fields) {
    if (!f.legacy || and.some((c) => c.field === f.key)) continue;
    const values = list(params[f.legacy]);
    if (!values.length) continue;
    if (f.kind === "lookup") {
      const preset = f.presets?.find((p) => values.includes(p.value));
      if (preset) and.push({ field: f.key, op: preset.value === "none" ? "empty" : "not_empty", values: [] });
      else and.push({ field: f.key, op: "any", values });
    } else if (f.kind === "number") and.push({ field: f.key, op: "gt", values: [values[0]] });
    else if (f.kind === "multiselect") and.push({ field: f.key, op: "any", values });
    else if (values.length > 1) and.push({ field: f.key, op: "any", values });
    else and.push({ field: f.key, op: "is", values: [values[0]] });
  }
  return { and, or };
}

/** Write the state back into a query string, dropping legacy parameters. */
export function applyFilterState(params: URLSearchParams, state: FilterState, fields: FilterField[]) {
  params.delete("f"); params.delete("or"); params.delete("page");
  for (const f of fields) if (f.legacy) params.delete(f.legacy);
  for (const c of state.and) params.append("f", serializeCondition(c));
  for (const c of state.or) params.append("or", serializeCondition(c));
}

export function operatorLabel(kind: FilterKind, op: FilterOp): string {
  return OPERATORS[kind].find((o) => o.value === op)?.label ?? op;
}

/** What a chip says. `names` supplies labels for lookup ids. */
export function conditionLabel(c: Condition, fields: FilterField[], names: Map<string, string> = new Map()): string {
  const f = fields.find((x) => x.key === c.field);
  if (!f) return c.field;
  const name = (v: string) => f.options?.find((o) => o.value === v)?.label ?? names.get(v) ?? v;
  const op = operatorLabel(f.kind, c.op);
  if (!c.values.length) return `${f.label} ${op}`;
  if (c.op === "between") return `${f.label} ${c.values[0]} – ${c.values[1]}`;
  if (c.op === "is" && (f.kind === "select" || f.kind === "boolean")) return `${f.label}: ${name(c.values[0])}`;
  return `${f.label} ${op} ${c.values.map(name).join(", ")}`;
}

export const emptyState = (): FilterState => ({ and: [], or: [] });
export const countConditions = (s: FilterState) => s.and.length + s.or.length;
