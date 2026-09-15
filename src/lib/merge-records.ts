// Merging two records of the same type into one. Every relationship of the
// losing record is re-pointed at the winner (a link the winner already has
// is dropped rather than duplicated), the loser's name lives on as an alias,
// chosen field values are copied across, and the loser goes to the Archive
// marked "merged into …" — it is never deleted. The set of relationship
// tables comes from Prisma's own model metadata, so a new join table is
// covered the day it is added.

import { Prisma } from "@prisma/client";
import { ignore } from "@/lib/errors";
import { db } from "@/lib/db";
import { modelFor } from "@/lib/db-model";
import { logAudit } from "@/lib/audit";
import { clearDigestMemo, refreshDigest } from "@/lib/ingest/digest";
import { queueAirtableSync } from "@/lib/airtable/sync";
import { RECORD_REGISTRY, type IngestTargetType } from "@/lib/ingest/registry";
import { coerceField, plainValue } from "@/lib/record-fields";
import type { SessionUser } from "@/lib/roles";

export const MERGEABLE_TYPES = ["creator", "project", "organization", "format", "person", "opportunity"] as const;
export type MergeableType = (typeof MERGEABLE_TYPES)[number];

/** Tables keyed by (targetType, targetId) that should follow the winner. */
const TARGET_TABLES = ["favorite", "recentView", "collectionItem", "recordSource", "attachment", "airtableSync"] as const;

export type MergeInput = {
  type: MergeableType;
  winnerId: string;
  loserId: string;
  /** Field values to copy from the loser onto the winner (plain values). */
  picks?: Record<string, unknown>;
};

export type MergeOutcome = { winnerId: string; loserId: string; relinked: number; dropped: number; copied: string[] };

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

type Ref = { model: string; property: string; fk: string; hasId: boolean; uniques: string[][] };

/** Every (model, foreign key) pair that points at the given Prisma model. */
export function foreignKeysTo(modelName: string): Ref[] {
  const out: Ref[] = [];
  for (const m of Prisma.dmmf.datamodel.models) {
    const hasId = m.fields.some((f) => f.name === "id" && f.isId);
    for (const f of m.fields) {
      if (f.type === modelName && f.relationFromFields?.length) {
        out.push({ model: m.name, property: lowerFirst(m.name), fk: f.relationFromFields[0], hasId, uniques: m.uniqueFields.map((u) => [...u]) });
      }
    }
  }
  return out;
}

const uniquesOf = (modelName: string): string[][] => Prisma.dmmf.datamodel.models.find((m) => m.name === modelName)?.uniqueFields.map((u) => [...u]) ?? [];

/**
 * Would this row, re-pointed at the winner, collide with a row the winner
 * already has? Checked before the write: inside a Postgres transaction a
 * failed statement poisons everything after it, so a unique violation cannot
 * simply be caught.
 */
async function wouldClash(t: Record<string, { findFirst: (a: unknown) => Promise<unknown> }>, property: string, uniques: string[][], row: Record<string, unknown>, swap: Record<string, unknown>): Promise<boolean> {
  for (const key of uniques) {
    if (!key.some((k) => k in swap)) continue;
    const where: Record<string, unknown> = {};
    for (const k of key) where[k] = k in swap ? swap[k] : row[k];
    if (await t[property].findFirst({ where, select: { id: true } })) return true;
  }
  return false;
}

export async function mergeRecordsCore(input: MergeInput, user: SessionUser | null): Promise<MergeOutcome> {
  const { type, winnerId, loserId } = input;
  if (!MERGEABLE_TYPES.includes(type)) throw new Error("This record type cannot be merged.");
  if (winnerId === loserId) throw new Error("Pick two different records.");
  const spec = RECORD_REGISTRY[type as IngestTargetType];
  const model = modelFor(spec.prismaModel);
  const [winner, loser] = await Promise.all([model.findUnique({ where: { id: winnerId } }), model.findUnique({ where: { id: loserId } })]);
  if (!winner || !loser) throw new Error("One of those records is no longer here.");
  const winnerName = String(winner[spec.nameField]);
  const loserName = String(loser[spec.nameField]);
  const modelName = spec.prismaModel.charAt(0).toUpperCase() + spec.prismaModel.slice(1);

  // Values chosen from the loser, coerced exactly as an inline edit would be.
  const data: Record<string, unknown> = {};
  const copied: string[] = [];
  for (const [name, raw] of Object.entries(input.picks ?? {})) {
    const field = spec.fields.find((f) => f.name === name);
    if (!field) continue;
    const c = coerceField(field, raw);
    if (!c.ok) throw new Error(c.error);
    data[name] = c.value;
    copied.push(field.label);
  }
  if ("aliases" in winner) {
    const aliases = new Set<string>([...(winner.aliases ?? []), loserName, ...((loser.aliases as string[] | undefined) ?? [])]);
    aliases.delete(winnerName);
    data.aliases = [...aliases];
  }
  if (spec.hasVersion) data.version = { increment: 1 };

  let relinked = 0;
  let dropped = 0;
  await db.$transaction(async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = tx as any;
    for (const ref of foreignKeysTo(modelName)) {
      const rows: Record<string, unknown>[] = await t[ref.property].findMany({ where: { [ref.fk]: loserId } });
      for (const row of rows) {
        // A relationship between the two records themselves has no meaning once they are one.
        const selfLink = ref.model === "CreatorRelationship" && Object.entries(row).some(([k, v]) => k !== ref.fk && k.endsWith("Id") && v === winnerId);
        const clash = selfLink || (await wouldClash(t, ref.property, ref.uniques, row, { [ref.fk]: winnerId }));
        if (clash) {
          if (ref.hasId) await t[ref.property].delete({ where: { id: row.id } });
          else await t[ref.property].deleteMany({ where: { [ref.fk]: loserId, ...pickKeys(row) } });
          dropped++;
          continue;
        }
        if (ref.hasId) await t[ref.property].update({ where: { id: row.id }, data: { [ref.fk]: winnerId } });
        else await t[ref.property].updateMany({ where: { [ref.fk]: loserId, ...pickKeys(row) }, data: { [ref.fk]: winnerId } });
        relinked++;
      }
    }
    for (const table of TARGET_TABLES) {
      const modelOf = table.charAt(0).toUpperCase() + table.slice(1);
      const rows: Record<string, unknown>[] = await t[table].findMany({ where: { targetType: type, targetId: loserId } });
      for (const row of rows) {
        if (await wouldClash(t, table, uniquesOf(modelOf), row, { targetId: winnerId })) await t[table].delete({ where: { id: row.id } });
        else await t[table].update({ where: { id: row.id }, data: { targetId: winnerId } });
      }
    }
    await t[spec.prismaModel].update({ where: { id: winnerId }, data });
    await t[spec.prismaModel].update({
      where: { id: loserId },
      data: { archived: true, archivedReason: `Merged into ${winnerName}`, archivedAt: new Date(), ...(spec.hasVersion ? { version: { increment: 1 } } : {}) },
    });
    await t.appSetting.upsert({
      where: { key: `merged:${type}:${loserId}` },
      create: { key: `merged:${type}:${loserId}`, value: { into: winnerId, name: winnerName, when: new Date().toISOString(), by: user?.name ?? null } },
      update: { value: { into: winnerId, name: winnerName, when: new Date().toISOString(), by: user?.name ?? null } },
    });
  }, { timeout: 60_000 });

  await logAudit(user, { targetType: type, targetId: loserId, targetLabel: loserName, action: "merged", field: "merged into", newValue: winnerName });
  await logAudit(user, { targetType: type, targetId: winnerId, targetLabel: winnerName, action: "updated", field: "merge", oldValue: loserName, newValue: copied.length ? `took ${copied.join(", ")}` : `absorbed ${loserName}` });
  // The audit rows above already refreshed both digests, but through a short
  // memo that can skip a second refresh in the same moment — and this one
  // must land, because it is what takes the loser out of search.
  clearDigestMemo();
  await Promise.all([refreshDigest(type, winnerId), refreshDigest(type, loserId)]).catch(ignore("merge-records"));
  await queueAirtableSync(type, winnerId);
  await queueAirtableSync(type, loserId);
  return { winnerId, loserId, relinked, dropped, copied };
}

function pickKeys(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (k.endsWith("Id") && typeof v === "string") out[k] = v;
  return out;
}

export type MergedInto = { into: string; name: string; when: string; by: string | null; href: string | null };

/** Where an archived record went, if it was merged. */
export async function mergedInto(type: string, id: string): Promise<MergedInto | null> {
  const row = await db.appSetting.findUnique({ where: { key: `merged:${type}:${id}` } });
  const value = row?.value as Omit<MergedInto, "href"> | null;
  if (!value) return null;
  const spec = RECORD_REGISTRY[type as IngestTargetType];
  const winner = spec ? await modelFor(spec.prismaModel).findUnique({ where: { id: value.into }, select: { slug: true } }) : null;
  return { ...value, href: winner?.slug ? spec.path(String(winner.slug)) : null };
}

export type Duplicate = { id: string; name: string; slug: string; sim: number };

/** The closest same-type name that is not this record — a likely duplicate when close enough. */
export async function possibleDuplicates(type: string, id: string, name: string, limit = 3): Promise<Duplicate[]> {
  if (!name.trim()) return [];
  try {
    const rows = await db.$queryRaw<Duplicate[]>(Prisma.sql`
      SELECT "targetId" AS id, name, slug, similarity(name, ${name}) AS sim
      FROM "KnowledgeDigest"
      WHERE "targetType" = ${type} AND "targetId" <> ${id} AND archived = false
        AND similarity(name, ${name}) >= 0.55
      ORDER BY sim DESC LIMIT ${limit}`);
    return rows.map((r) => ({ ...r, sim: Number(r.sim) }));
  } catch {
    return [];
  }
}

/** The values a merge could copy: plain values for both records, field by field. */
export function compareValues(type: MergeableType, a: Record<string, unknown>, b: Record<string, unknown>) {
  const spec = RECORD_REGISTRY[type as IngestTargetType];
  return spec.fields
    .map((f) => ({
      name: f.name, label: f.label, kind: f.kind,
      options: f.vocab ? f.vocab().filter((o) => o.value !== "") : undefined,
      a: plainValue(f.kind, a[f.name]), b: plainValue(f.kind, b[f.name]),
    }));
}
