// Where the Airtable mirror points. The token lives in the environment only;
// the base, the table names and the on/off switches live in the database so
// an admin can change them on the site without a deploy.

import "server-only";
import { db } from "@/lib/db";
import type { MirrorType } from "@/lib/airtable/fields";

export type AirtableConfig = {
  baseId: string;
  tables: Record<MirrorType, string>;
  enabled: Record<MirrorType, boolean>;
  /** The primary field's name per table, learned from the base when it isn't "Name". */
  primaryField: Partial<Record<MirrorType, string>>;
};

const KEY = "airtable";
const DEFAULTS: Omit<AirtableConfig, "baseId"> = {
  tables: { format: "Formats", project: "Projects" },
  enabled: { format: true, project: true },
  primaryField: {},
};

export function airtableToken(): string | null {
  const t = process.env.AIRTABLE_TOKEN ?? process.env.AIRTABLE_API_KEY ?? process.env.AIRTABLE_PAT;
  return t?.trim() || null;
}

let cache: { at: number; value: AirtableConfig } | null = null;
const CACHE_MS = 30_000;

export async function airtableConfig(): Promise<AirtableConfig> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const row = await db.appSetting.findUnique({ where: { key: KEY } });
  const stored = (row?.value ?? {}) as Partial<AirtableConfig>;
  const value: AirtableConfig = {
    baseId: (stored.baseId?.trim() || process.env.AIRTABLE_BASE_ID?.trim() || "").trim(),
    tables: { ...DEFAULTS.tables, ...(stored.tables ?? {}) },
    enabled: { ...DEFAULTS.enabled, ...(stored.enabled ?? {}) },
    primaryField: { ...(stored.primaryField ?? {}) },
  };
  cache = { at: Date.now(), value };
  return value;
}

export async function saveAirtableConfig(patch: Partial<AirtableConfig>): Promise<AirtableConfig> {
  // Merge onto what is stored, not onto the resolved config: a base id that
  // came from the environment must not be written into the database.
  const row = await db.appSetting.findUnique({ where: { key: KEY } });
  const stored = (row?.value ?? {}) as Partial<AirtableConfig>;
  const next: Partial<AirtableConfig> = {
    baseId: (patch.baseId ?? stored.baseId ?? "").trim(),
    tables: { ...DEFAULTS.tables, ...(stored.tables ?? {}), ...(patch.tables ?? {}) },
    enabled: { ...DEFAULTS.enabled, ...(stored.enabled ?? {}), ...(patch.enabled ?? {}) },
    primaryField: { ...(stored.primaryField ?? {}), ...(patch.primaryField ?? {}) },
  };
  await db.appSetting.upsert({ where: { key: KEY }, update: { value: next }, create: { key: KEY, value: next } });
  cache = null;
  return airtableConfig();
}

export function forgetAirtableConfig() { cache = null; }

/** The config when the mirror can actually run: a token and a base id. Null otherwise. */
export async function airtableReady(): Promise<AirtableConfig | null> {
  if (!airtableToken()) return null;
  const cfg = await airtableConfig();
  return cfg.baseId ? cfg : null;
}

/** Where links back to the Repo point. Vercel names the production host; local dev falls back. */
export function siteOrigin(): string {
  const explicit = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}
