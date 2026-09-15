// Option sets on the server: loading them into the cache, what each set is
// called, which columns store its values (so a merge can count and re-point
// records), and the create/rename/merge primitives the Settings page and the
// pickers use.

import "server-only";
import { db } from "@/lib/db";
import { modelFor } from "@/lib/db-model";
import { logAudit } from "@/lib/audit";
import { slugify } from "@/lib/slug";
import { OPTION_COLORS, allOptionSetKeys, optionRows, setOptionCache, type OptionColor, type OptionRow } from "@/lib/option-cache";
import type { SessionUser } from "@/lib/roles";

const TTL_MS = 15_000;
let loadedAt = 0;
let loading: Promise<void> | null = null;

/** Load the Option table into the cache (once per TTL per process). */
export async function primeOptions(force = false): Promise<void> {
  if (!force && Date.now() - loadedAt < TTL_MS) return;
  if (!loading) {
    loading = (async () => {
      const rows = await db.option.findMany({ orderBy: [{ setKey: "asc" }, { position: "asc" }] });
      setOptionCache(rows.map(toRow));
      loadedAt = Date.now();
    })().finally(() => { loading = null; });
  }
  await loading;
}

export const bustOptions = () => { loadedAt = 0; };

const toRow = (r: { id: string; setKey: string; value: string; label: string; color: string | null; position: number; archivedAt: Date | null }): OptionRow => ({
  id: r.id, setKey: r.setKey, value: r.value, label: r.label, color: r.color, position: r.position, archivedAt: r.archivedAt ? r.archivedAt.toISOString() : null,
});

/** Rows for the client provider. */
export async function optionRowsForClient(): Promise<OptionRow[]> {
  await primeOptions();
  return allOptionSetKeys().flatMap((k) => optionRows(k));
}

/** Where a set's values are stored: a column on a model, sometimes an array. */
export type OptionColumn = { model: string; column: string; array?: boolean; targetType: string };

export type OptionSetSpec = { label: string; description?: string; columns: OptionColumn[] };

/** Every set the app knows by name. Sets created from the UI for custom fields carry no columns; their values live in `custom` JSON. */
export const OPTION_SETS: Record<string, OptionSetSpec> = {
  format_status: { label: "Format status", columns: [{ model: "format", column: "status", targetType: "format" }] },
  format_type: { label: "Format type", columns: [{ model: "format", column: "formatType", targetType: "format" }] },
  project_status: { label: "Project status", columns: [{ model: "project", column: "status", targetType: "project" }] },
  project_type: { label: "Project type", columns: [{ model: "project", column: "projectType", targetType: "project" }] },
  org_type: { label: "Company type", columns: [{ model: "organization", column: "types", array: true, targetType: "organization" }] },
  person_role_type: { label: "Industry person role", columns: [{ model: "industryPerson", column: "roleType", targetType: "person" }, { model: "personOrganization", column: "role", targetType: "person" }] },
  opportunity_status: { label: "Opportunity status", columns: [{ model: "opportunity", column: "status", targetType: "opportunity" }] },
  opportunity_type: { label: "Opportunity type", columns: [{ model: "opportunity", column: "type", targetType: "opportunity" }] },
  creator_status: { label: "Talent status", columns: [{ model: "creator", column: "status", targetType: "creator" }] },
  channel_status: { label: "Channel status", columns: [{ model: "channel", column: "status", targetType: "channel" }] },
  channel_idea_status: { label: "Channel idea status", columns: [{ model: "channelIdea", column: "status", targetType: "channel" }] },
  project_role: { label: "Talent role on a project", columns: [{ model: "creatorProjectCredit", column: "role", targetType: "project" }] },
  project_org_relationship: { label: "Company relationship to a project", columns: [{ model: "projectOrganization", column: "relationship", targetType: "project" }] },
  creator_org_relationship: { label: "Talent relationship to a company", columns: [{ model: "creatorOrganization", column: "relationship", targetType: "creator" }] },
  creator_person_relationship: { label: "Representation type", columns: [{ model: "creatorPerson", column: "relationship", targetType: "creator" }] },
  person_project_role: { label: "Industry person role on a project", columns: [{ model: "personProject", column: "role", targetType: "project" }, { model: "formatPerson", column: "role", targetType: "format" }] },
  creator_relationship: { label: "Talent ↔ talent relationship", columns: [{ model: "creatorRelationship", column: "relationship", targetType: "creator" }] },
  location_relationship: { label: "Location relationship", columns: [{ model: "creatorEntityLink", column: "relationship", targetType: "creator" }] },
  source_type: { label: "Source type", columns: [{ model: "source", column: "sourceType", targetType: "source" }] },
  format_org_relationship: { label: "Company relationship to a format", columns: [{ model: "formatOrganization", column: "relationship", targetType: "format" }] },
  channel_org_relationship: { label: "Company relationship to a channel", columns: [{ model: "channelOrganization", column: "relationship", targetType: "channel" }] },
  channel_person_relationship: { label: "Person relationship to a channel", columns: [{ model: "channelPerson", column: "relationship", targetType: "channel" }] },
  opportunity_candidate_status: { label: "Candidate stage on an opportunity", columns: [{ model: "opportunityCreator", column: "status", targetType: "opportunity" }] },
  deal_status: { label: "Deal status", columns: [] },
  availability: { label: "Availability", columns: [] },
  stage: { label: "Stage", columns: [] },
  opportunity_source: { label: "Opportunity source", columns: [] },
  genre: { label: "Genre", columns: [] },
};

export const optionSetLabel = (key: string) => OPTION_SETS[key]?.label ?? key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** The next colour in the palette for a set, so new options look distinct. */
function nextColor(setKey: string): OptionColor {
  const used = optionRows(setKey).map((r) => r.color).filter(Boolean);
  const counts = new Map<string, number>(OPTION_COLORS.map((c) => [c, 0]));
  for (const c of used) counts.set(c!, (counts.get(c!) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => a[1] - b[1])[0][0] as OptionColor;
}

export type EnsureResult = { ok: true; value: string; label: string; created: boolean } | { ok: false; error: string };

/**
 * Find or create an option by label, trimmed and matched case-insensitively.
 * The value is a slug of the label and never changes afterwards.
 */
export async function ensureOption(setKey: string, rawLabel: string, user: SessionUser | null): Promise<EnsureResult> {
  const label = rawLabel.trim().replace(/\s+/g, " ");
  if (!label) return { ok: false, error: "Give the option a name." };
  if (label.length > 80) return { ok: false, error: "Keep option names under 80 characters." };
  await primeOptions();
  const existing = optionRows(setKey).find((r) => r.label.toLowerCase() === label.toLowerCase() || r.value === slugify(label).replace(/-/g, "_"));
  if (existing) {
    if (existing.archivedAt) {
      await db.option.update({ where: { id: existing.id }, data: { archivedAt: null } });
      bustOptions();
    }
    return { ok: true, value: existing.value, label: existing.label, created: false };
  }
  let value = slugify(label).replace(/-/g, "_") || `option_${Date.now()}`;
  const taken = new Set(optionRows(setKey).map((r) => r.value));
  let n = 2;
  while (taken.has(value)) value = `${slugify(label).replace(/-/g, "_")}_${n++}`;
  const position = Math.max(0, ...optionRows(setKey).map((r) => r.position)) + 10;
  const row = await db.option.create({ data: { setKey, value, label, color: nextColor(setKey), position } });
  await logAudit(user, { targetType: "option", targetId: row.id, targetLabel: `${optionSetLabel(setKey)}: ${label}`, action: "created", field: setKey, newValue: value });
  bustOptions();
  await primeOptions(true);
  return { ok: true, value, label, created: true };
}

/** How many rows store a value of this set, per column. */
export async function optionUsage(setKey: string, value: string): Promise<{ total: number; byColumn: { model: string; column: string; count: number }[] }> {
  const spec = OPTION_SETS[setKey];
  const byColumn: { model: string; column: string; count: number }[] = [];
  for (const col of spec?.columns ?? []) {
    const where = col.array ? { [col.column]: { has: value } } : { [col.column]: value };
    const count = await modelFor(col.model).count({ where });
    byColumn.push({ model: col.model, column: col.column, count });
  }
  // Custom fields that use this set.
  const defs = await db.fieldDefinition.findMany({ where: { optionSetKey: setKey, archivedAt: null } });
  for (const d of defs) {
    const model = modelForType(d.recordType);
    if (!model) continue;
    const count = await modelFor(model).count({ where: d.type === "multiselect" ? { custom: { path: [d.key], array_contains: [value] } } : { custom: { path: [d.key], equals: value } } });
    byColumn.push({ model, column: `custom.${d.key}`, count });
  }
  return { total: byColumn.reduce((n, c) => n + c.count, 0), byColumn };
}

export function modelForType(recordType: string): string | null {
  return ({ creator: "creator", project: "project", organization: "organization", person: "industryPerson", format: "format", opportunity: "opportunity", channel: "channel" } as Record<string, string>)[recordType] ?? null;
}
