// Turn (type, id) pairs into something a person can click: the record's name,
// its page, and a line of context. Favorites, recents and the palette all
// need this, so it lives in one place and batches by type.

import "server-only";
import { db } from "@/lib/db";
import { labelFor } from "@/lib/taxonomy";

export type RecordRef = { type: string; id: string; name: string; href: string; sub?: string; archived?: boolean; unverified?: boolean };

const STALE_MS = 90 * 86_400_000;
const stale = (d: Date | null | undefined) => !d || Date.now() - d.getTime() > STALE_MS;

export { typeLabel } from "@/lib/record-types";

export async function resolveRecordRefs(refs: { targetType: string; targetId: string }[]): Promise<RecordRef[]> {
  const byType = new Map<string, string[]>();
  for (const r of refs) byType.set(r.targetType, [...(byType.get(r.targetType) ?? []), r.targetId]);
  const found = new Map<string, RecordRef>();
  const put = (type: string, r: RecordRef) => found.set(`${type}:${r.id}`, r);
  const ids = (t: string) => ({ id: { in: byType.get(t) ?? [] } });
  await Promise.all([
    byType.has("creator") && db.creator.findMany({ where: ids("creator"), select: { id: true, verifiedAt: true, name: true, slug: true, headline: true, archived: true, organizations: { take: 1, select: { organization: { select: { name: true } } } } } })
      .then((rows) => rows.forEach((r) => put("creator", { type: "creator", id: r.id, name: r.name, href: `/talent/${r.slug}`, sub: r.headline ?? r.organizations[0]?.organization.name ?? undefined, archived: r.archived, unverified: stale(r.verifiedAt) }))),
    byType.has("project") && db.project.findMany({ where: ids("project"), select: { id: true, verifiedAt: true, title: true, slug: true, status: true, archived: true, credits: { take: 1, select: { creator: { select: { name: true } } } } } })
      .then((rows) => rows.forEach((r) => put("project", { type: "project", id: r.id, name: r.title, href: `/projects/${r.slug}`, sub: [labelFor(r.status), r.credits[0]?.creator.name].filter(Boolean).join(" · "), archived: r.archived, unverified: stale(r.verifiedAt) }))),
    byType.has("organization") && db.organization.findMany({ where: ids("organization"), select: { id: true, verifiedAt: true, name: true, slug: true, types: true, archived: true } })
      .then((rows) => rows.forEach((r) => put("organization", { type: "organization", id: r.id, name: r.name, href: `/organizations/${r.slug}`, sub: r.types.map(labelFor).join(" · ") || undefined, archived: r.archived, unverified: stale(r.verifiedAt) }))),
    byType.has("format") && db.format.findMany({ where: ids("format"), select: { id: true, verifiedAt: true, title: true, slug: true, status: true, archived: true } })
      .then((rows) => rows.forEach((r) => put("format", { type: "format", id: r.id, name: r.title, href: `/formats/${r.slug}`, sub: labelFor(r.status), archived: r.archived, unverified: stale(r.verifiedAt) }))),
    byType.has("person") && db.industryPerson.findMany({ where: ids("person"), select: { id: true, verifiedAt: true, name: true, slug: true, title: true, archived: true, organizations: { take: 1, select: { organization: { select: { name: true } } } } } })
      .then((rows) => rows.forEach((r) => put("person", { type: "person", id: r.id, name: r.name, href: `/people/${r.slug}`, sub: [r.title, r.organizations[0]?.organization.name].filter(Boolean).join(" · ") || undefined, archived: r.archived, unverified: stale(r.verifiedAt) }))),
    byType.has("opportunity") && db.opportunity.findMany({ where: ids("opportunity"), select: { id: true, verifiedAt: true, title: true, slug: true, status: true, archived: true } })
      .then((rows) => rows.forEach((r) => put("opportunity", { type: "opportunity", id: r.id, name: r.title, href: `/opportunities/${r.slug}`, sub: labelFor(r.status), archived: r.archived, unverified: stale(r.verifiedAt) }))),
    byType.has("channel") && db.channel.findMany({ where: ids("channel"), select: { id: true, verifiedAt: true, name: true, slug: true, status: true, archived: true } })
      .then((rows) => rows.forEach((r) => put("channel", { type: "channel", id: r.id, name: r.name, href: `/youtube/${r.slug}`, sub: labelFor(r.status), archived: r.archived, unverified: stale(r.verifiedAt) }))),
    byType.has("entity") && db.entity.findMany({ where: ids("entity"), select: { id: true, name: true, slug: true, kind: true } })
      .then((rows) => rows.forEach((r) => put("entity", { type: "entity", id: r.id, name: r.name, href: `/explore/${r.kind}/${r.slug}`, sub: labelFor(r.kind) }))),
    byType.has("collection") && db.collection.findMany({ where: ids("collection"), select: { id: true, name: true, slug: true } })
      .then((rows) => rows.forEach((r) => put("collection", { type: "collection", id: r.id, name: r.name, href: `/collections/${r.slug}` }))),
  ]);
  // Original order, minus anything that no longer exists.
  return refs.map((r) => found.get(`${r.targetType}:${r.targetId}`)).filter((r): r is RecordRef => !!r);
}

/** The signed-in person's starred records and the last few they opened. */
export async function sidebarLists(userId: string): Promise<{ favorites: RecordRef[]; recents: RecordRef[] }> {
  const [favs, recents] = await Promise.all([
    db.favorite.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 12, select: { targetType: true, targetId: true } }),
    db.recentView.findMany({ where: { userId }, orderBy: { viewedAt: "desc" }, take: 8, select: { targetType: true, targetId: true } }),
  ]);
  const [favorites, recent] = await Promise.all([resolveRecordRefs(favs), resolveRecordRefs(recents)]);
  return { favorites, recents: recent };
}
