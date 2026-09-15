import { redirect } from "next/navigation";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { directoryPageUrl, firstParam } from "@/lib/directory-params";
import { projectSearch } from "@/lib/search-where";
import { sweepQuietRecordsThrottled } from "@/lib/quiet";
import { DirectoryControls } from "@/components/directory-controls";
import { KindBadge, StatusPill } from "@/components/ui";
import { PROJECT_ROLES, PROJECT_STATUSES, PROJECT_TYPES, labelFor } from "@/lib/taxonomy";
import { formatDate, relativeTime } from "@/lib/format";
import { RecordTable } from "@/components/record-table";
import { orderForProjects, parseSort } from "@/lib/directory-sort";
import { Pagination } from "@/components/pagination";
import { RowStatus } from "@/components/row-status";
import { statusOptionsFor } from "@/lib/row-status";
import { parseFilterParams, type FilterField } from "@/lib/filters";
import { customCells, customColumns, customFieldMaps, customFilterFields } from "@/lib/custom-fields";
import { optionList } from "@/lib/option-cache";
import { filterWhere, filterNames, type FieldMap } from "@/lib/filter-where";
import { directoryUser, layoutFor, matchingIds, paging, liveOnly, showArchived } from "@/lib/directory";

export const metadata = { title: "Projects" };

const baseFields = (): FilterField[] => [
  { key: "status", label: "Status", kind: "select", options: optionList("project_status", PROJECT_STATUSES), legacy: "status" },
  { key: "type", label: "Project type", kind: "select", options: optionList("project_type", PROJECT_TYPES), legacy: "type" },
  { key: "talent", label: "Talent", kind: "lookup", lookupType: "creator", legacy: "creator" },
  { key: "role", label: "Talent role", kind: "select", options: optionList("project_role", PROJECT_ROLES), legacy: "role" },
  { key: "company", label: "Company / network / brand", kind: "lookup", lookupType: "organization", legacy: "org" },
  { key: "person", label: "Industry person", kind: "lookup", lookupType: "person" },
  { key: "topic", label: "Genre / topic", kind: "lookup", lookupType: "entity", legacy: "entity" },
  { key: "year", label: "Premiere year", kind: "number", legacy: "year", placeholder: "e.g. 2024" },
  { key: "activity", label: "Last activity", kind: "date" },
  { key: "updated", label: "Updated", kind: "date" },
];
const BASE_MAPS: Record<string, FieldMap> = {
  status: { column: "status" }, type: { column: "projectType" }, year: { column: "premiereYear", kind: "number" },
  talent: { relation: "credits", idField: "creatorId" }, role: { custom: (c) => c.op === "is" ? { credits: { some: { role: c.values[0] } } } : c.op === "any" ? { credits: { some: { role: { in: c.values } } } } : c.op === "is_not" ? { credits: { none: { role: c.values[0] } } } : c.op === "none" ? { credits: { none: { role: { in: c.values } } } } : null },
  company: { relation: "organizations", idField: "organizationId" }, person: { relation: "people", idField: "personId" }, topic: { relation: "entityLinks", idField: "entityId" },
  activity: { column: "lastActivityAt", kind: "date" }, updated: { column: "updatedAt", kind: "date" },
};
const DEFAULT_VIEWS = [
  { name: "All", query: "" },
  { name: "Announced & in production", query: "f=status~any~announced%2Cin_production" },
  { name: "Airing", query: "f=status~is~airing" },
  { name: "Recently updated", query: "sort=updated-desc" },
];

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await sweepQuietRecordsThrottled();
  const user = await requireUser();
  const params = await searchParams;
  const FIELDS = [...baseFields(), ...(await customFilterFields("project"))];
  const MAPS = { ...BASE_MAPS, ...(await customFieldMaps("project")) };
  const customCols = await customColumns("project");
  const q = firstParam(params.q)?.trim();
  const sort = parseSort(firstParam(params.sort), "date-desc");
  const state = parseFilterParams(params, FIELDS);
  const { prefs, views } = await directoryUser(user.id, "projects");
  const view = layoutFor(params, prefs, "projects");

  const where = { AND: [...liveOnly(params), ...(q ? [projectSearch(q)] : []), ...(filterWhere(MAPS, state) as Prisma.ProjectWhereInput[])] };
  const total = await db.project.count({ where });
  const pg = paging(params, total);
  if (!pg.all && pg.requested > pg.pages) redirect(directoryPageUrl("/projects", params, pg.pages));

  const [projects, ids, names] = await Promise.all([
    db.project.findMany({
      where, orderBy: orderForProjects(sort) as never, skip: pg.skip, take: pg.take,
      include: {
        credits: { include: { creator: { select: { name: true, slug: true } } } },
        organizations: { include: { organization: { select: { name: true, slug: true } } } },
        entityLinks: { include: { entity: { select: { name: true } } } },
      },
    }),
    matchingIds((args) => db.project.findMany(args as never), where),
    filterNames(FIELDS, state),
  ]);
  const canEdit = hasRole(user, "EDITOR");

  const customByRow = await Promise.all(projects.map((r) => customCells("project", r.custom)));
  return (
    <div>
      <DirectoryControls showArchived={showArchived(params)}
        title="Projects" total={total} createHref="/projects/new" createLabel="+ Add Project" searchPlaceholder="Search projects…"
        canEdit={canEdit} viewToggle section="projects" fields={FIELDS} state={state} names={Object.fromEntries(names)} savedViews={views} defaultViews={DEFAULT_VIEWS}
        sorts={[
          { value: "date-desc", label: "Latest activity" }, { value: "status", label: "Status" }, { value: "year-desc", label: "Premiere year" },
          { value: "updated-desc", label: "Recently updated" }, { value: "title", label: "Alphabetical" },
        ]}
      />

      {projects.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-strong bg-wash/50 px-6 py-10 text-center text-sm text-muted">
          {q || state.and.length || state.or.length ? "No projects match these filters." : "No projects yet. A project is a real, existing production."}
          {canEdit && <div className="mt-3"><Link className="btn btn-secondary btn-sm" href="/projects/new">+ Add Project</Link></div>}
        </div>
      ) : view === "table" ? (
        <RecordTable
          sort={sort} view="projects" recordType="project" selectable={canEdit} matchingIds={ids} statuses={statusOptionsFor("project")} taggable
          columns={[
            ...customCols,
            { key: "title", label: "Project", sortKey: "title" },
            { key: "status", label: "Status", sortKey: "status", filterKey: "status" },
            { key: "activity", label: "Last activity", sortKey: "date", filterKey: "activity" },
            { key: "year", label: "Year", sortKey: "year", filterKey: "year", align: "right", showAt: "hidden sm:table-cell" },
            { key: "type", label: "Type", sortKey: "type", filterKey: "type", showAt: "hidden sm:table-cell" },
            { key: "talent", label: "Talent", filterKey: "talent", showAt: "hidden md:table-cell" },
            { key: "companies", label: "Companies", filterKey: "company", showAt: "hidden lg:table-cell" },
            { key: "updated", label: "Updated", sortKey: "updated", filterKey: "updated", showAt: "hidden xl:table-cell" },
          ]}
          rows={projects.map((p, i) => ({
            id: p.id, href: `/projects/${p.slug}`, archived: p.archived, peek: { type: "project", id: p.id },
            cells: [
              <span key="t">{p.title}{p.logline && <span className="block text-xs font-normal text-muted line-clamp-1">{p.logline}</span>}</span>,
              <RowStatus key="s" type="project" id={p.id} status={p.status} name={p.title} canEdit={canEdit} />,
              <span key="d" className="whitespace-nowrap text-muted">{p.lastActivityAt ? formatDate(p.lastActivityAt) : <span className="text-faint">—</span>}</span>,
              <span key="y" className="text-muted">{p.premiereYear ?? <span className="text-faint">—</span>}</span>,
              <span key="ty" className="text-muted">{labelFor(p.projectType)}</span>,
              <span key="c" className="line-clamp-1 text-muted">{[...new Set(p.credits.map((c) => c.creator.name))].join(", ")}</span>,
              <span key="o" className="line-clamp-1 text-muted">{[...new Set(p.organizations.map((o) => o.organization.name))].join(", ")}</span>,
              <span key="u" className="whitespace-nowrap text-muted">{relativeTime(p.updatedAt)}</span>,
              ...customByRow[i].map((v, j) => <span key={`c${j}`} className="text-muted">{v || <span className="text-faint">—</span>}</span>),
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
                <div className="flex items-start justify-between gap-2"><div className="font-display text-sm font-bold leading-snug">{p.title}</div><KindBadge kind="project" /></div>
                <div className="mt-1 text-xs text-muted">{[labelFor(p.projectType), p.premiereYear, p.seasons ? `${p.seasons} seasons` : null].filter(Boolean).join(" · ")}</div>
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
      <Pagination page={pg.page} pages={pg.pages} total={total} all={pg.all} />
    </div>
  );
}
