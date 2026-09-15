// The option lists, in memory, on both sides of the wire. The server primes
// this from the Option table once per request (cached for a short while per
// process); the client is handed the same rows by the layout. Everything that
// used to read a hardcoded list now reads `optionList(setKey, fallback)`, and
// falls back to the code list when a set has no rows yet.

import type { LabeledValue } from "@/lib/taxonomy";

export type OptionRow = {
  id: string;
  setKey: string;
  value: string;
  label: string;
  color: string | null;
  position: number;
  archivedAt: string | null;
};

let sets = new Map<string, OptionRow[]>();
let byValue = new Map<string, OptionRow>();
let primed = false;

export function setOptionCache(rows: OptionRow[]) {
  const next = new Map<string, OptionRow[]>();
  const values = new Map<string, OptionRow>();
  for (const r of rows) {
    const list = next.get(r.setKey) ?? [];
    list.push(r);
    next.set(r.setKey, list);
    if (!values.has(r.value) || !r.archivedAt) values.set(r.value, r);
  }
  for (const list of next.values()) list.sort((a, b) => a.position - b.position || a.label.localeCompare(b.label));
  sets = next;
  byValue = values;
  primed = true;
}

export const optionCachePrimed = () => primed;

/** Every row of a set, archived ones included, in display order. */
export function optionRows(setKey: string): OptionRow[] {
  return sets.get(setKey) ?? [];
}

/** The live choices of a set — what a picker offers. Falls back to the code list. */
export function optionList(setKey: string, fallback: LabeledValue[] = []): LabeledValue[] {
  const rows = sets.get(setKey);
  if (!rows || !rows.length) return fallback;
  return rows.filter((r) => !r.archivedAt).map((r) => ({ value: r.value, label: r.label }));
}

/** The label for a stored value, from whichever set carries it (archived ones still resolve). */
export function optionLabel(value: string, setKey?: string): string | null {
  const row = setKey ? sets.get(setKey)?.find((r) => r.value === value) : byValue.get(value);
  return row?.label ?? null;
}

export function optionColor(value: string, setKey?: string): string | null {
  const row = setKey ? sets.get(setKey)?.find((r) => r.value === value) : byValue.get(value);
  return row?.color ?? null;
}

export function allOptionSetKeys(): string[] {
  return [...sets.keys()].sort();
}

/** The ten colours an option can take; a new option is dealt the next one. */
export const OPTION_COLORS = ["gray", "red", "orange", "amber", "green", "teal", "blue", "indigo", "purple", "pink"] as const;
export type OptionColor = (typeof OPTION_COLORS)[number];

/** Tailwind classes for a pill in each colour (background + text). */
export const OPTION_COLOR_CLASS: Record<OptionColor, string> = {
  gray: "bg-wash text-muted",
  red: "bg-danger-wash text-danger",
  orange: "bg-warn-wash text-warn",
  amber: "bg-warn-wash text-warn",
  green: "bg-ok-wash text-ok",
  teal: "bg-ok-wash text-ok",
  blue: "bg-info-wash text-info",
  indigo: "bg-info-wash text-info",
  purple: "bg-accent-wash text-accent-deep",
  pink: "bg-accent-wash text-accent-deep",
};
