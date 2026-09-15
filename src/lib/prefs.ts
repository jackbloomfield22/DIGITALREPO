// Per-person preferences: density, layout per section, column set-up per
// view, and anything else that should follow someone between devices. Kept
// in the database under one AppSetting row per user, so nothing lives in the
// browser's storage and a new laptop looks the way the old one did.

import "server-only";
import { db } from "@/lib/db";

export type Density = "compact" | "regular" | "relaxed";
export type ColumnPrefs = { order?: string[]; hidden?: string[]; widths?: Record<string, number>; pinned?: string[] };
export type UserPrefs = {
  density?: Density;
  /** Table or cards, per directory section ("talent", "projects"…). */
  layout?: Record<string, "table" | "cards">;
  /** Column order, visibility, widths and pins, per view key. */
  columns?: Record<string, ColumnPrefs>;
  /** Filter-panel open state per section. */
  filtersOpen?: Record<string, boolean>;
};

const KEY = (userId: string) => `prefs:${userId}`;

export async function readPrefs(userId: string): Promise<UserPrefs> {
  const row = await db.appSetting.findUnique({ where: { key: KEY(userId) } });
  return ((row?.value ?? {}) as UserPrefs) || {};
}

/** Shallow-merge a patch; nested maps (layout, columns) merge one level down. */
export async function writePrefs(userId: string, patch: UserPrefs): Promise<UserPrefs> {
  const current = await readPrefs(userId);
  const next: UserPrefs = {
    ...current,
    ...patch,
    layout: { ...(current.layout ?? {}), ...(patch.layout ?? {}) },
    columns: { ...(current.columns ?? {}), ...(patch.columns ?? {}) },
    filtersOpen: { ...(current.filtersOpen ?? {}), ...(patch.filtersOpen ?? {}) },
  };
  await db.appSetting.upsert({ where: { key: KEY(userId) }, update: { value: next }, create: { key: KEY(userId), value: next } });
  return next;
}
