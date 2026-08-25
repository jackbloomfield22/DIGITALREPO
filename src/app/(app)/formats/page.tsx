import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { DirectoryControls, type DirChip } from "@/components/directory-controls";
import { KindBadge, StatusPill } from "@/components/ui";
import { FORMAT_STATUSES, FORMAT_TYPES, labelFor } from "@/lib/taxonomy";
import { formatDate, relativeTime } from "@/lib/format";
import { RecordTable } from "@/components/record-table";
import { orderForFormats, parseSort } from "@/lib/directory-sort";
import { Pagination } from "@/components/pagination";

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
  const sort = parseSort(one(params.sort), "date-desc");
  const view = one(params.view) === "cards" ? "cards" : "table";
  const page = Math.max(1, Number(one(params.page) ?? 1) || 1);

  const and: Prisma.FormatWhereInput[] = [{ archived: false }];
  if (q) and.push({ title: { contains: q, mode: "insensitive" } });
  // The slate keeps its development archive as a separate section, and it is by
  // far the largest one — showing it by default would bury live work. Asking
  // for the archived status explicitly still brings it back.
  const showingArchive = status === "archived" || one(params.archive) === "1";
  if (status) and.push({ status });
  else if (!showingArchive) and.push({ status: { not: "archived" } });
  if (type) and.push({ formatType: type });
  if (creatorId) and.push({ creators: { some: { creatorId } } });
  if (entityId) and.push({ entityLinks: { some: { entityId } } });
  if (orgId) and.push({ organizations: { some: { organizationId: orgId } } });
  const where = { AND: and };

  const [formats, total, creatorRecord, entityRecord, orgRecord] = await Promise.all([
    db.format.findMany({
      where,
      orderBy: orderForFormats(sort) as never,
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

  const archivedCount = await db.format.count({ where: { archived: false, status: "archived" } });
  // Keep whatever the reader is already looking at when revealing the archive.
  const archiveHref = (() => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      const val = Array.isArray(v) ? v[0] : v;
      if (val && k !== "page" && k !== "archive") p.set(k, val);
    }
    p.set("archive", "1");
    return `/formats?${p.toString()}`;
  })();
  const chips: DirChip[] = [
    ...(status ? [{ param: "status", value: status, label: labelFor(status) }] : []),
    ...(one(params.archive) === "1" ? [{ param: "archive", value: "1", label: "Including archive" }] : []),
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
          { value: "date-desc", label: "Latest Activity" },
          { value: "date", label: "Oldest Activity" },
          { value: "status", label: "Status" },
          { value: "updated", label: "Recently Updated" },
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

      {!showingArchive && archivedCount > 0 && (
        <p className="-mt-2 mb-3 text-xs text-muted">
          {archivedCount} archived formats hidden.{" "}
          <Link className="underline hover:text-accent" href={archiveHref}>
            Include them
          </Link>
        </p>
      )}

      {formats.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-strong bg-wash/50 px-6 py-10 text-center text-sm text-muted">
          No formats match. {canEdit && <Link className="underline" href="/formats/new">Create one</Link>}
        </div>
      ) : view === "table" ? (
        <RecordTable
          sort={sort}
          columns={[
            { label: "Format", sortKey: "title" },
            { label: "Status", sortKey: "status" },
            { label: "Last activity", sortKey: "date" },
            { label: "Type", sortKey: "type", showAt: "hidden sm:table-cell" },
            { label: "Talent", showAt: "hidden md:table-cell" },
            { label: "Topics", showAt: "hidden lg:table-cell" },
          ]}
          rows={formats.map((f) => ({
            id: f.id,
            href: `/formats/${f.slug}`,
            cells: [
              <span key="t">
                {f.title}
                {f.logline && <span className="block text-xs font-normal text-muted line-clamp-1">{f.logline}</span>}
              </span>,
              <StatusPill key="s" status={f.status} label={labelFor(f.status)} />,
              <span key="d" className="whitespace-nowrap text-muted">
                {f.lastActivityAt ? formatDate(f.lastActivityAt) : <span className="text-faint">—</span>}
              </span>,
              <span key="ty" className="text-muted">{labelFor(f.formatType)}</span>,
              <span key="c" className="line-clamp-1 text-muted">{f.creators.map((c) => c.creator.name).join(", ")}</span>,
              <span key="e" className="line-clamp-1 text-muted">{f.entityLinks.map((l) => l.entity.name).join(", ")}</span>,
            ],
          }))}
        />
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

      <Pagination page={page} pages={pages} />
    </div>
  );
}
