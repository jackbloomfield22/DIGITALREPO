// Turn the shared filter model into a Prisma `where`. Each list says how its
// fields map onto columns and relations; nothing here knows a particular
// record type. Used by every directory page and by "select all N matching".

import "server-only";
import type { Condition, FilterField, FilterState } from "@/lib/filters";
import { resolveRecordRefs } from "@/lib/record-refs";

type Where = Record<string, unknown>;

/** How one filter field reaches the database. */
export type FieldMap =
  | { column: string; kind?: "string" | "number" | "date" | "boolean" | "array" }
  | { relation: string; idField: string; extra?: Where }
  | { custom: (c: Condition) => Where | null };

const num = (v: string) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const date = (v: string) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };

function columnWhere(col: string, kind: "string" | "number" | "date" | "boolean" | "array", c: Condition): Where | null {
  const one = c.values[0];
  const cast = (v: string): unknown => (kind === "number" ? num(v) : kind === "date" ? date(v) : kind === "boolean" ? v === "true" || v === "1" : v);
  const empty = kind === "string" ? { OR: [{ [col]: null }, { [col]: "" }] } : kind === "array" ? { [col]: { isEmpty: true } } : { [col]: null };
  switch (c.op) {
    case "is": return kind === "array" ? { [col]: { has: one } } : { [col]: cast(one) };
    case "is_not": return { NOT: kind === "array" ? { [col]: { has: one } } : { [col]: cast(one) } };
    case "any": return kind === "array" ? { [col]: { hasSome: c.values } } : { [col]: { in: c.values.map(cast).filter((v) => v !== null) } };
    case "none": return { NOT: kind === "array" ? { [col]: { hasSome: c.values } } : { [col]: { in: c.values.map(cast).filter((v) => v !== null) } } };
    case "contains": return { [col]: { contains: one, mode: "insensitive" } };
    case "empty": return empty;
    case "not_empty": return { NOT: empty };
    case "gt": case "after": { const v = cast(one); return v === null ? null : { [col]: { gte: v } }; }
    case "lt": case "before": { const v = cast(one); return v === null ? null : { [col]: { lte: v } }; }
    case "between": { const a = cast(c.values[0]); const b = cast(c.values[1]); return a === null || b === null ? null : { [col]: { gte: a, lte: b } }; }
    default: return null;
  }
}

function relationWhere(rel: string, idField: string, extra: Where | undefined, c: Condition): Where | null {
  const base = extra ?? {};
  switch (c.op) {
    case "is": case "any": return { [rel]: { some: { ...base, [idField]: { in: c.values } } } };
    case "is_not": case "none": return { NOT: { [rel]: { some: { ...base, [idField]: { in: c.values } } } } };
    case "empty": return { [rel]: { none: base } };
    case "not_empty": return { [rel]: { some: base } };
    default: return null;
  }
}

export function conditionWhere(map: FieldMap, c: Condition): Where | null {
  if ("custom" in map) return map.custom(c);
  if ("relation" in map) return relationWhere(map.relation, map.idField, map.extra, c);
  return columnWhere(map.column, map.kind ?? "string", c);
}

/** AND of the stacked conditions, with the OR group as one more AND-ed clause. */
export function filterWhere(maps: Record<string, FieldMap>, state: FilterState): Where[] {
  const build = (c: Condition) => { const m = maps[c.field]; return m ? conditionWhere(m, c) : null; };
  const and = state.and.map(build).filter((w): w is Where => !!w);
  const or = state.or.map(build).filter((w): w is Where => !!w);
  return or.length ? [...and, { OR: or }] : and;
}

const LOOKUP_TYPE: Record<string, string> = { creator: "creator", project: "project", organization: "organization", format: "format", person: "person", entity: "entity", collection: "collection" };

/** Names for the record ids in lookup conditions, so chips read as names. */
export async function filterNames(fields: FilterField[], state: FilterState): Promise<Map<string, string>> {
  const refs: { targetType: string; targetId: string }[] = [];
  for (const c of [...state.and, ...state.or]) {
    const f = fields.find((x) => x.key === c.field);
    if (f?.kind === "lookup" && f.lookupType && LOOKUP_TYPE[f.lookupType]) for (const id of c.values) refs.push({ targetType: LOOKUP_TYPE[f.lookupType], targetId: id });
  }
  if (!refs.length) return new Map();
  const resolved = await resolveRecordRefs(refs);
  return new Map(resolved.map((r) => [r.id, r.name]));
}
