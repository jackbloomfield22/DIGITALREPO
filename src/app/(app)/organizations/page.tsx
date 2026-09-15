import { redirect } from "next/navigation";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { directoryPageUrl, firstParam } from "@/lib/directory-params";
import { organizationSearch } from "@/lib/search-where";
import { DirectoryControls } from "@/components/directory-controls";
import { Portrait } from "@/components/ui";
import { ORG_TYPES, labelFor } from "@/lib/taxonomy";
import { relativeTime } from "@/lib/format";
import { RecordTable } from "@/components/record-table";
import { orderForOrganizations, parseSort } from "@/lib/directory-sort";
import { Pagination } from "@/components/pagination";
import { RowArchive } from "@/components/row-status";
import { parseFilterParams, type FilterField } from "@/lib/filters";
import { filterWhere, filterNames, type FieldMap } from "@/lib/filter-where";
import { directoryUser, layoutFor, matchingIds, paging } from "@/lib/directory";

export const metadata = { title: "Companies" };

const FIELDS: FilterField[] = [
  { key: "type", label: "Company type", kind: "multiselect", options: ORG_TYPES, legacy: "type" },
  { key: "location", label: "Location", kind: "text" },
  { key: "talent", label: "Talent", kind: "lookup", lookupType: "creator" },
  { key: "person", label: "Industry person", kind: "lookup", lookupType: "person" },
  { key: "project", label: "Project", kind: "lookup", lookupType: "project" },
  { key: "updated", label: "Updated", kind: "date" },
];
const MAPS: Record<string, FieldMap> = {
  type: { column: "types", kind: "array" }, location: { column: "location" },
  talent: { relation: "creators", idField: "creatorId" }, person: { relation: "people", idField: "personId" }, project: { relation: "projects", idField: "projectId" },
  updated: { column: "updatedAt", kind: "date" },
};
const DEFAULT_VIEWS = [
  { name: "All", query: "" },
  { name: "Buyers", query: "f=type~any~network%2Cstreamer%2Cdigital_platform%2Cstudio" },
  { name: "Brands", query: "f=type~any~brand" },
  { name: "Agencies", query: "f=type~any~agency%2Cmanagement_company" },
  { name: "Recently updated", query: "sort=updated-desc" },
];

export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const params = await searchParams;
  const q = firstParam(params.q)?.trim();
  const sort = parseSort(firstParam(params.sort), "name");
  const state = parseFilterParams(params, FIELDS);
  const { prefs, views } = await directoryUser(user.id, "organizations");
  const view = layoutFor(params, prefs, "organizations");

  const where = { AND: [{ archived: false }, ...(q ? [organizationSearch(q)] : []), ...(filterWhere(MAPS, state) as Prisma.OrganizationWhereInput[])] };
  const total = await db.organization.count({ where });
  const pg = paging(params, total);
  if (!pg.all && pg.requested > pg.pages) redirect(directoryPageUrl("/organizations", params, pg.pages));

  const [organizations, ids, names] = await Promise.all([
    db.organization.findMany({ where, orderBy: orderForOrganizations(sort) as never, skip: pg.skip, take: pg.take, include: { _count: { select: { projects: true, creators: true, formats: true, people: true } } } }),
    matchingIds((args) => db.organization.findMany(args as never), where),
    filterNames(FIELDS, state),
  ]);
  const canEdit = hasRole(user, "EDITOR");

  return (
    <div>
      <DirectoryControls
        title="Companies" total={total} createHref="/organizations/new" createLabel="+ Add Company" searchPlaceholder="Search companies…"
        canEdit={canEdit} viewToggle section="organizations" fields={FIELDS} state={state} names={Object.fromEntries(names)} savedViews={views} defaultViews={DEFAULT_VIEWS}
        sorts={[{ value: "name", label: "Alphabetical" }, { value: "location", label: "Location" }, { value: "updated-desc", label: "Recently updated" }, { value: "created-desc", label: "Recently added" }]}
      />
      {view === "table" ? (
        <RecordTable
          sort={sort} view="organizations" recordType="organization" selectable={canEdit} matchingIds={ids}
          empty={q || state.and.length || state.or.length ? "No companies match these filters." : "No companies yet. Buyers, brands, agencies and production companies live here."}
          columns={[
            { key: "name", label: "Company", sortKey: "name" },
            { key: "types", label: "Types", filterKey: "type" },
            { key: "location", label: "Location", sortKey: "location", filterKey: "location", showAt: "hidden sm:table-cell" },
            { key: "projects", label: "Projects", align: "right", showAt: "hidden md:table-cell" },
            { key: "formats", label: "Formats", align: "right", showAt: "hidden md:table-cell" },
            { key: "people", label: "People", align: "right", showAt: "hidden lg:table-cell" },
            { key: "updated", label: "Updated", sortKey: "updated", filterKey: "updated", showAt: "hidden xl:table-cell" },
            { key: "actions", label: "", align: "right" },
          ]}
          rows={organizations.map((o) => ({
            id: o.id, href: `/organizations/${o.slug}`, peek: { type: "organization", id: o.id },
            cells: [
              <span key="n">{o.name}</span>,
              <span key="t" className="line-clamp-1 text-muted">{o.types.map(labelFor).join(", ") || "—"}</span>,
              <span key="l" className="text-muted">{o.location ?? <span className="text-faint">—</span>}</span>,
              <span key="p" className="tabular-nums text-muted">{o._count.projects || <span className="text-faint">—</span>}</span>,
              <span key="f" className="tabular-nums text-muted">{o._count.formats || <span className="text-faint">—</span>}</span>,
              <span key="pe" className="tabular-nums text-muted">{o._count.people || <span className="text-faint">—</span>}</span>,
              <span key="u" className="whitespace-nowrap text-muted">{relativeTime(o.updatedAt)}</span>,
              <RowArchive key="a" type="organization" id={o.id} name={o.name} canEdit={canEdit} />,
            ],
          }))}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {organizations.map((o) => (
            <Link key={o.id} href={`/organizations/${o.slug}`} className="card flex items-start gap-3 p-4 transition-shadow hover:shadow-pop">
              <Portrait name={o.name} imageUrl={o.imageUrl} className="h-11 w-11 shrink-0 rounded" textClass="text-sm" />
              <div className="min-w-0">
                <div className="truncate font-semibold">{o.name}</div>
                <div className="truncate text-xs text-muted">{o.types.map(labelFor).join(" · ") || "Company"}</div>
                <div className="mt-1 text-xs text-faint">{[o._count.projects ? `${o._count.projects} projects` : null, o._count.creators ? `${o._count.creators} talent` : null, o._count.formats ? `${o._count.formats} formats` : null].filter(Boolean).join(" · ") || "No links yet"}</div>
              </div>
            </Link>
          ))}
          {organizations.length === 0 && <p className="text-sm text-faint">No companies match.</p>}
        </div>
      )}
      <Pagination page={pg.page} pages={pg.pages} total={total} all={pg.all} />
    </div>
  );
}
