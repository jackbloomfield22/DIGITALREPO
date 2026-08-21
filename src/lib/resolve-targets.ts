import "server-only";
import { db } from "@/lib/db";
import { labelFor, targetPath } from "@/lib/taxonomy";

export type ResolvedTarget = {
  targetType: string;
  targetId: string;
  label: string;
  sub?: string;
  href: string;
  imageUrl?: string | null;
  archived?: boolean;
};

/** Resolve polymorphic (targetType, targetId) references to display data. */
export async function resolveTargets(
  refs: { targetType: string; targetId: string }[],
): Promise<Map<string, ResolvedTarget>> {
  const byType = new Map<string, string[]>();
  for (const r of refs) {
    const list = byType.get(r.targetType) ?? [];
    list.push(r.targetId);
    byType.set(r.targetType, list);
  }
  const out = new Map<string, ResolvedTarget>();
  const put = (targetType: string, targetId: string, label: string, href: string, sub?: string, imageUrl?: string | null, archived?: boolean) =>
    out.set(`${targetType}:${targetId}`, { targetType, targetId, label, sub, href, imageUrl, archived });

  const jobs: Promise<void>[] = [];
  for (const [type, ids] of byType) {
    if (type === "creator") {
      jobs.push(
        db.creator.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true, imageUrl: true, headline: true, archived: true } }).then((rows) => {
          rows.forEach((r) => put(type, r.id, r.name, targetPath(type, r.slug), r.headline ?? undefined, r.imageUrl, r.archived));
        }),
      );
    } else if (type === "project") {
      jobs.push(
        db.project.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, slug: true, projectType: true, archived: true } }).then((rows) => {
          rows.forEach((r) => put(type, r.id, r.title, targetPath(type, r.slug), labelFor(r.projectType) || undefined, null, r.archived));
        }),
      );
    } else if (type === "organization") {
      jobs.push(
        db.organization.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true, types: true, archived: true } }).then((rows) => {
          rows.forEach((r) => put(type, r.id, r.name, targetPath(type, r.slug), r.types.map(labelFor).join(" · ") || undefined, null, r.archived));
        }),
      );
    } else if (type === "format") {
      jobs.push(
        db.format.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, slug: true, status: true, archived: true } }).then((rows) => {
          rows.forEach((r) => put(type, r.id, r.title, targetPath(type, r.slug), labelFor(r.status), null, r.archived));
        }),
      );
    } else if (type === "opportunity") {
      jobs.push(
        db.opportunity.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, slug: true, status: true, archived: true } }).then((rows) => {
          rows.forEach((r) => put(type, r.id, r.title, targetPath(type, r.slug), labelFor(r.status), null, r.archived));
        }),
      );
    } else if (type === "person") {
      jobs.push(
        db.industryPerson.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true, title: true, archived: true } }).then((rows) => {
          rows.forEach((r) => put(type, r.id, r.name, targetPath(type, r.slug), r.title ?? undefined, null, r.archived));
        }),
      );
    } else if (type === "collection") {
      jobs.push(
        db.collection.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true } }).then((rows) => {
          rows.forEach((r) => put(type, r.id, r.name, targetPath(type, r.slug)));
        }),
      );
    } else if (type === "entity") {
      jobs.push(
        db.entity.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true, kind: true } }).then((rows) => {
          rows.forEach((r) => put(type, r.id, r.name, `/explore/${r.kind}/${r.slug}`, labelFor(r.kind)));
        }),
      );
    }
  }
  await Promise.all(jobs);
  return out;
}
