// What the Repo knows it is missing: records nobody owns, records nobody has
// checked in ninety days, and records that are little more than a name. Shared
// by Settings → Health and the Home "Needs attention" module.

import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { modelFor } from "@/lib/db-model";
import { RECORD_REGISTRY, type IngestTargetType } from "@/lib/ingest/registry";
import { DETAIL_TYPES } from "@/lib/record-fields";

export const VERIFY_DAYS = 90;
export const staleBefore = () => new Date(Date.now() - VERIFY_DAYS * 86_400_000);

export type HealthRow = { type: string; id: string; name: string; slug: string; href: string; owner: string | null; verifiedAt: Date | null; filled: number; total: number };
export type HealthBucket = { key: "unowned" | "unverified" | "empty"; label: string; blurb: string; count: number; rows: HealthRow[] };

/**
 * The fields that make a record more than a name — used for the "empty"
 * bucket. Only real, optional text columns count: a status always has a value
 * so it says nothing about emptiness, and the registry carries a couple of
 * fields (a channel's ideas) that are rows elsewhere rather than columns.
 */
function substanceFields(type: IngestTargetType): string[] {
  const spec = RECORD_REGISTRY[type];
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name.charAt(0).toLowerCase() + m.name.slice(1) === spec.prismaModel);
  const optionalText = new Set(
    (model?.fields ?? []).filter((f) => f.kind === "scalar" && f.type === "String" && !f.isRequired && !f.isList).map((f) => f.name),
  );
  return spec.fields.filter((f) => (f.kind === "longtext" || f.kind === "text") && optionalText.has(f.name)).map((f) => f.name);
}

async function rowsFor(type: IngestTargetType, where: Record<string, unknown>, take: number): Promise<HealthRow[]> {
  const spec = RECORD_REGISTRY[type];
  const rows = await modelFor(spec.prismaModel).findMany({ where, orderBy: { updatedAt: "desc" }, take });
  const fields = substanceFields(type);
  return rows.map((r) => ({
    type,
    id: String(r.id),
    name: String(r[spec.nameField] ?? ""),
    slug: String(r.slug ?? ""),
    href: spec.path(String(r.slug ?? "")),
    owner: (r.ownerId as string | null) ?? null,
    verifiedAt: (r.verifiedAt as Date | null) ?? null,
    filled: fields.filter((f) => r[f] != null && r[f] !== "").length,
    total: fields.length,
  }));
}

const OWNED_TYPES: IngestTargetType[] = ["creator", "project", "organization", "person", "format", "opportunity", "channel"];

/** Everything that needs a person's attention, bucketed, with counts. */
export async function healthBuckets(limit = 25): Promise<{ buckets: HealthBucket[]; total: number }> {
  const stale = staleBefore();
  const counts = { unowned: 0, unverified: 0, empty: 0 };
  const rows = { unowned: [] as HealthRow[], unverified: [] as HealthRow[], empty: [] as HealthRow[] };

  for (const type of OWNED_TYPES) {
    const spec = RECORD_REGISTRY[type];
    const model = modelFor(spec.prismaModel);
    const live = { archived: false };

    const unownedWhere = { ...live, ownerId: null };
    const unverifiedWhere = { ...live, OR: [{ verifiedAt: null }, { verifiedAt: { lt: stale } }] };
    // "Empty" means every substance field is blank — a name and nothing else.
    const emptyWhere = { ...live, AND: substanceFields(type).map((f) => ({ OR: [{ [f]: null }, { [f]: "" }] })) };

    const [uo, uoRows, uv, uvRows, em, emRows] = await Promise.all([
      model.count({ where: unownedWhere }),
      rowsFor(type, unownedWhere, Math.ceil(limit / OWNED_TYPES.length) + 2),
      model.count({ where: unverifiedWhere }),
      rowsFor(type, unverifiedWhere, Math.ceil(limit / OWNED_TYPES.length) + 2),
      model.count({ where: emptyWhere }),
      rowsFor(type, emptyWhere, Math.ceil(limit / OWNED_TYPES.length) + 2),
    ]);
    counts.unowned += uo; rows.unowned.push(...uoRows);
    counts.unverified += uv; rows.unverified.push(...uvRows);
    counts.empty += em; rows.empty.push(...emRows);
  }

  const buckets: HealthBucket[] = [
    { key: "unowned", label: "Nobody owns these", blurb: "An owner is who to ask about a record. New records take the person who made them; these came in before that, or from an import.", count: counts.unowned, rows: rows.unowned.slice(0, limit) },
    { key: "unverified", label: `Not checked in ${VERIFY_DAYS} days`, blurb: "Open one, read it, and press Verify if it is still right. That stamp is what makes the rest of the Repo trustworthy.", count: counts.unverified, rows: rows.unverified.slice(0, limit) },
    { key: "empty", label: "A name and little else", blurb: "Created in passing and never filled in. Either give them something, or archive them.", count: counts.empty, rows: rows.empty.slice(0, limit) },
  ];
  return { buckets, total: counts.unowned + counts.unverified + counts.empty };
}

/** Records of one type in one bucket — what the Health page's tables show. */
export async function healthRows(bucket: "unowned" | "unverified" | "empty", type: string, take = 200): Promise<HealthRow[]> {
  if (!DETAIL_TYPES.includes(type as IngestTargetType)) return [];
  const t = type as IngestTargetType;
  const live = { archived: false };
  const where = bucket === "unowned"
    ? { ...live, ownerId: null }
    : bucket === "unverified"
      ? { ...live, OR: [{ verifiedAt: null }, { verifiedAt: { lt: staleBefore() } }] }
      : { ...live, AND: substanceFields(t).map((f) => ({ OR: [{ [f]: null }, { [f]: "" }] })) };
  return rowsFor(t, where, take);
}

/** Who owns what, for the owner picker on the Health page. */
export async function teamMembers(): Promise<{ id: string; name: string }[]> {
  return db.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
}
