import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { RecordTable } from "@/components/record-table";
import { orderForProjects, parseSort } from "@/lib/directory-sort";
import { requireUser, hasRole } from "@/lib/auth";
import { DirectoryControls, type DirChip } from "@/components/directory-controls";
import { KindBadge, StatusPill } from "@/components/ui";
import { PROJECT_ROLES, PROJECT_STATUSES, PROJECT_TYPES, labelFor } from "@/lib/taxonomy";
import { Pagination } from "@/components/pagination";
import { RowStatus } from "@/components/row-status";

export const metadata = { title: "Projects" };

const PAGE_SIZE = 30;

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = one(params.q)?.trim();
  const type = one(params.type);
  const status = one(params.status);
  const creatorId = one(params.creator);
  const role = one(params.role);
  const orgId = one(params.org);
  const entityId = one(params.entity);
  const year = one(params.year);
  const sort = parseSort(one(params.sort), "date-desc");
  const view = one(params.view) === "cards" ? "cards" : "table";
  const page = Math.max(1, Number(one(params.page) ?? 1) || 1);

  const and: Prisma.ProjectWhereInput[] = [{ archived: false }];
  if (q) and.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { aliases: { hasSome: [q] } }] });
  if (type) and.push({ projectType: type });
  if (status) and.push({ status });
  if (creatorId && role) and.push({ credits: { some: { creatorId, role } } });
  else if (creatorId) and.push({ credits: { some: { creatorId } } });
  else if (role) and.push({ credits: { some: { role } } });
  if (orgId) and.push({ organizations: { some: { organizationId: orgId } } });
  if (entityId) and.push({ entityLinks: { some: { entityId } } });
  if (year && Number(year)) and.push({ premiereYear: Number(year) });
  const where = { AND: and };

  const orderBy = orderForProjects(sort) as never;

  const [projects, total, creatorRecord, orgRecord, entityRecord] = await Promise.all([
    db.project.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        credits: { include: { creator: { select: { name: true, slug: true } } } },
        organizations: { include: { organization: { select: { name: true, slug: true } } } },
        entityLinks: { include: { entity: { select: { name: true } } } },
      },
    }),
    db.project.count({ where }),
    creatorId ? db.creator.findUnique({ where: { id: creatorId }, select: { name: true } }) : null,
    orgId ? db.organization.findUnique({ where: { id: orgId }, select: { name: true } }) : null,
    entityId ? db.entity.findUnique({ where: { id: entityId }, select: { name: true } }) : null,
  ]);

  const canEdit = hasRole(user, "EDITOR");
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const chips: DirChip[] = [
    ...(type ? [{ param: "type", value: type, label: labelFor(type) }] : []),
    ...(status ? [{ param: "status", value: status, label: labelFor(status) }] : []),
    ...(creatorRecord ? [{ param: "creator", value: creatorId!, label: creatorRecord.name }] : []),
    ...(role ? [{ param: "role", value: role, label: `Role: ${labelFor(role)}` }] : []),
    ...(orgRecord ? [{ param: "org", value: orgId!, label: orgRecord.name }] : []),
    ...(entityRecord ? [{ param: "entity", value: entityId!, label: entityRecord.name }] : []),
    ...(year ? [{ param: "year", value: year, label: year }] : []),
  ];


  return (
    <div>
      <DirectoryControls
        title="PROJECTS"
        total={total}
        createHref="/projects/new"
        createLabel="+ Add Project"
        searchPlaceholder="Search projects…"
        canEdit={canEdit}
        viewToggle
        savedViewType="projects"
        chips={chips}
        sorts={[
          { value: "date-desc", label: "Latest Activity" },
          { value: "status", label: "Status" },
          { value: "year-desc", label: "Premiere Year" },
          { value: "updated", label: "Recently Updated" },
          { value: "title", label: "Alphabetical" },
        ]}
        filters={[
          { param: "type", label: "Project Type", kind: "select", options: PROJECT_TYPES },
          { param: "status", label: "Status", kind: "select", options: PROJECT_STATUSES },
          { param: "creator", label: "Talent", kind: "lookup", lookupType: "creator" },
          { param: "role", label: "Talent Role", kind: "select", options: PROJECT_ROLES },
          { param: "org", label: "Company / Network / Brand", kind: "lookup", lookupType: "organization" },
          { param: "entity", label: "Genre / Topic", kind: "lookup", lookupType: "entity" },
        ]}
      />

      {projects.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-strong bg-wash/50 px-6 py-10 text-center text-sm text-muted">
          No projects match. {canEdit && <Link className="underline" href="/projects/new">Add one</Link>}
        </div>
      ) : view === "table" ? (
        <RecordTable
          sort={sort}
          columns={[
            { label: "Project", sortKey: "title" },
            { label: "Status", sortKey: "status" },
            { label: "Last activity", sortKey: "date" },
            { label: "Year", sortKey: "year", showAt: "hidden sm:table-cell" },
            { label: "Type", sortKey: "type", showAt: "hidden sm:table-cell" },
            { label: "Talent", showAt: "hidden md:table-cell" },
            { label: "Companies", showAt: "hidden lg:table-cell" },
          ]}
          rows={projects.map((p) => ({
            id: p.id,
            href: `/projects/${p.slug}`,
            cells: [
              <span key="t">
                {p.title}
                {p.logline && <span className="block text-xs font-normal text-muted line-clamp-1">{p.logline}</span>}
              </span>,
              <RowStatus key="s" type="project" id={p.id} status={p.status} name={p.title} canEdit={canEdit} />,
              <span key="d" className="whitespace-nowrap text-muted">
                {p.lastActivityAt ? formatDate(p.lastActivityAt) : <span className="text-faint">—</span>}
              </span>,
              <span key="y" className="text-muted">{p.premiereYear ?? <span className="text-faint">—</span>}</span>,
              <span key="ty" className="text-muted">{labelFor(p.projectType)}</span>,
              <span key="c" className="line-clamp-1 text-muted">{[...new Set(p.credits.map((c) => c.creator.name))].join(", ")}</span>,
              <span key="o" className="line-clamp-1 text-muted">{[...new Set(p.organizations.map((o) => o.organization.name))].join(", ")}</span>,
            ],
          }))}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const talent = [...new Map(p.credits.map((c) => [c.creator.slug, c.creator])).values()];
            const prodCo = p.organizations.find((o) => o.relationship === "production_company");
            const platform = p.organizations.find((o) => ["network", "streamer", "platform", "distributor"].includes(o.relationship));
            return (
              <Link key={p.id} href={`/projects/${p.slug}`} className="card block p-4 transition-shadow hover:shadow-pop">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-display text-base font-bold leading-snug">{p.title}</div>
                  <KindBadge kind="project" />
                </div>
                <div className="mt-1 text-xs text-muted">
                  {[labelFor(p.projectType), p.premiereYear, p.seasons ? `${p.seasons} seasons` : null].filter(Boolean).join(" · ")}
                </div>
                {p.logline && <p className="mt-2 line-clamp-2 text-sm text-charcoal">{p.logline}</p>}
                <div className="mt-2 space-y-0.5 text-xs text-muted">
                  {talent.length > 0 && <div className="truncate">Talent: {talent.map((t) => t.name).join(", ")}</div>}
                  {prodCo && <div className="truncate">Prod: {prodCo.organization.name}</div>}
                  {platform && <div className="truncate">On: {platform.organization.name}</div>}
                </div>
                <div className="mt-2"><StatusPill status={p.status} label={labelFor(p.status)} /></div>
              </Link>
            );
          })}
        </div>
      )}

      <Pagination page={page} pages={pages} />
    </div>
  );
}
