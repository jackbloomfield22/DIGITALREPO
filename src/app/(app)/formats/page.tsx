import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { DirectoryControls, type DirChip } from "@/components/directory-controls";
import { KindBadge, StatusPill } from "@/components/ui";
import { FORMAT_STATUSES, FORMAT_TYPES, labelFor } from "@/lib/taxonomy";
import { relativeTime } from "@/lib/format";

export const metadata = { title: "Formats" };

const PAGE_SIZE = 30;

export default async function FormatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = one(params.q)?.trim();
  const status = one(params.status);
  const type = one(params.type);
  const creatorId = one(params.creator);
  const entityId = one(params.entity);
  const orgId = one(params.org);
  const sort = one(params.sort) ?? "updated";
  const view = one(params.view) === "table" ? "table" : "cards";
  const page = Math.max(1, Number(one(params.page) ?? 1) || 1);

  const and: Prisma.FormatWhereInput[] = [{ archived: false }];
  if (q) and.push({ title: { contains: q, mode: "insensitive" } });
  if (status) and.push({ status });
  if (type) and.push({ formatType: type });
  if (creatorId) and.push({ creators: { some: { creatorId } } });
  if (entityId) and.push({ entityLinks: { some: { entityId } } });
  if (orgId) and.push({ organizations: { some: { organizationId: orgId } } });
  const where = { AND: and };

  const [formats, total, creatorRecord, entityRecord, orgRecord] = await Promise.all([
    db.format.findMany({
      where,
      orderBy: sort === "title" ? { title: "asc" } : sort === "recent" ? { createdAt: "desc" } : { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        creators: { include: { creator: { select: { name: true, slug: true } } } },
        entityLinks: { include: { entity: { select: { name: true } } } },
        owner: { select: { name: true } },
      },
    }),
    db.format.count({ where }),
    creatorId ? db.creator.findUnique({ where: { id: creatorId }, select: { name: true } }) : null,
    entityId ? db.entity.findUnique({ where: { id: entityId }, select: { name: true } }) : null,
    orgId ? db.organization.findUnique({ where: { id: orgId }, select: { name: true } }) : null,
  ]);

  const chips: DirChip[] = [
    ...(status ? [{ param: "status", value: status, label: labelFor(status) }] : []),
    ...(type ? [{ param: "type", value: type, label: labelFor(type) }] : []),
    ...(creatorRecord ? [{ param: "creator", value: creatorId!, label: creatorRecord.name }] : []),
    ...(entityRecord ? [{ param: "entity", value: entityId!, label: entityRecord.name }] : []),
    ...(orgRecord ? [{ param: "org", value: orgId!, label: orgRecord.name }] : []),
  ];
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canEdit = hasRole(user, "EDITOR");

  return (
    <div>
      <DirectoryControls
        title="FORMATS"
        total={total}
        createHref="/formats/new"
        createLabel="+ Add Format"
        searchPlaceholder="Search formats…"
        canEdit={canEdit}
        viewToggle
        savedViewType="formats"
        chips={chips}
        sorts={[
          { value: "updated", label: "Recently Updated" },
          { value: "recent", label: "Recently Added" },
          { value: "title", label: "Alphabetical" },
        ]}
        filters={[
          { param: "status", label: "Status", kind: "select", options: FORMAT_STATUSES },
          { param: "type", label: "Format Type", kind: "select", options: FORMAT_TYPES },
          { param: "creator", label: "Talent", kind: "lookup", lookupType: "creator" },
          { param: "entity", label: "Interest / Sport / Topic", kind: "lookup", lookupType: "entity" },
          { param: "org", label: "Organization / Brand", kind: "lookup", lookupType: "organization" },
        ]}
      />

      {formats.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-strong bg-wash/50 px-6 py-10 text-center text-sm text-muted">
          No formats match. {canEdit && <Link className="underline" href="/formats/new">Create one</Link>}
        </div>
      ) : view === "table" ? (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-3 py-2 font-semibold">Format</th>
                <th className="px-3 py-2 font-semibold">Type</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Talent</th>
                <th className="px-3 py-2 font-semibold">Topics</th>
                <th className="px-3 py-2 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {formats.map((f) => (
                <tr key={f.id} className="border-b border-line last:border-0 hover:bg-wash/60">
                  <td className="px-3 py-2">
                    <Link href={`/formats/${f.slug}`} className="font-medium hover:text-accent-deep">{f.title}</Link>
                  </td>
                  <td className="px-3 py-2 text-muted">{labelFor(f.formatType)}</td>
                  <td className="px-3 py-2"><StatusPill status={f.status} label={labelFor(f.status)} /></td>
                  <td className="max-w-52 truncate px-3 py-2 text-muted">{f.creators.map((c) => c.creator.name).join(", ")}</td>
                  <td className="max-w-44 truncate px-3 py-2 text-muted">{f.entityLinks.map((l) => l.entity.name).join(", ")}</td>
                  <td className="px-3 py-2 text-muted">{relativeTime(f.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {formats.map((f) => {
            const primary = f.creators.find((c) => c.isPrimary) ?? f.creators[0];
            return (
              <Link key={f.id} href={`/formats/${f.slug}`} className="card block p-4 transition-shadow hover:shadow-pop">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-display text-base font-bold leading-snug">{f.title}</div>
                  <KindBadge kind="format" />
                </div>
                {f.logline && <p className="mt-1.5 line-clamp-2 text-sm text-charcoal">{f.logline}</p>}
                <div className="mt-2 space-y-0.5 text-xs text-muted">
                  {primary && (
                    <div className="truncate">
                      {f.creators.length > 1
                        ? `${primary.creator.name} +${f.creators.length - 1} more`
                        : primary.creator.name}
                    </div>
                  )}
                  {f.entityLinks.length > 0 && (
                    <div className="truncate">{f.entityLinks.map((l) => l.entity.name).join(" · ")}</div>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <StatusPill status={f.status} label={labelFor(f.status)} />
                  <span className="text-xs text-faint">{relativeTime(f.updatedAt)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <nav className="mt-6 flex justify-center gap-2 text-sm" aria-label="Pagination">
          {page > 1 && <Link className="btn btn-secondary btn-sm" href={`/formats?page=${page - 1}`}>← Previous</Link>}
          <span className="px-2 text-muted">Page {page} of {pages}</span>
          {page < pages && <Link className="btn btn-secondary btn-sm" href={`/formats?page=${page + 1}`}>Next →</Link>}
        </nav>
      )}
    </div>
  );
}
