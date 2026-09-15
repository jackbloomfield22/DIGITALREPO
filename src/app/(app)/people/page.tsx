import { redirect } from "next/navigation";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { directoryPageUrl, firstParam } from "@/lib/directory-params";
import { personSearch } from "@/lib/search-where";
import { DirectoryControls } from "@/components/directory-controls";
import { PERSON_ROLE_TYPES, labelFor } from "@/lib/taxonomy";
import { relativeTime } from "@/lib/format";
import { RecordTable } from "@/components/record-table";
import { orderForPeople, parseSort } from "@/lib/directory-sort";
import { Pagination } from "@/components/pagination";
import { RowArchive } from "@/components/row-status";
import { parseFilterParams, type FilterField } from "@/lib/filters";
import { customCells, customColumns, customFieldMaps, customFilterFields } from "@/lib/custom-fields";
import { optionList } from "@/lib/option-cache";
import { filterWhere, filterNames, type FieldMap } from "@/lib/filter-where";
import { directoryUser, layoutFor, matchingIds, paging, liveOnly, showArchived } from "@/lib/directory";

export const metadata = { title: "Industry People" };

const baseFields = (): FilterField[] => [
  { key: "role", label: "Role", kind: "select", options: optionList("person_role_type", PERSON_ROLE_TYPES), legacy: "role" },
  { key: "company", label: "Company", kind: "lookup", lookupType: "organization", legacy: "org" },
  { key: "talent", label: "Represents / works with", kind: "lookup", lookupType: "creator" },
  { key: "title", label: "Job title", kind: "text" },
  { key: "email", label: "Email", kind: "text" },
  { key: "updated", label: "Updated", kind: "date" },
];
const BASE_MAPS: Record<string, FieldMap> = {
  role: { column: "roleType" }, title: { column: "title" }, email: { column: "email" },
  company: { relation: "organizations", idField: "organizationId" }, talent: { relation: "creators", idField: "creatorId" },
  updated: { column: "updatedAt", kind: "date" },
};
const DEFAULT_VIEWS = [
  { name: "All", query: "" },
  { name: "Agents & managers", query: "f=role~any~agent%2Cmanager" },
  { name: "Executives", query: "f=role~any~executive" },
  { name: "Recently updated", query: "sort=updated-desc" },
];

export default async function PeoplePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const params = await searchParams;
  const FIELDS = [...baseFields(), ...(await customFilterFields("person"))];
  const MAPS = { ...BASE_MAPS, ...(await customFieldMaps("person")) };
  const customCols = await customColumns("person");
  const q = firstParam(params.q)?.trim();
  const sort = parseSort(firstParam(params.sort), "name");
  const state = parseFilterParams(params, FIELDS);
  const { prefs, views } = await directoryUser(user.id, "people");
  const view = layoutFor(params, prefs, "people");
  const canEdit = hasRole(user, "EDITOR");

  const where: Prisma.IndustryPersonWhereInput = { AND: [...liveOnly(params), ...(q ? [personSearch(q)] : []), ...(filterWhere(MAPS, state) as Prisma.IndustryPersonWhereInput[])] };
  const total = await db.industryPerson.count({ where });
  const pg = paging(params, total);
  if (!pg.all && pg.requested > pg.pages) redirect(directoryPageUrl("/people", params, pg.pages));

  const [people, ids, names] = await Promise.all([
    db.industryPerson.findMany({
      where, orderBy: orderForPeople(sort) as never, skip: pg.skip, take: pg.take,
      include: { organizations: { include: { organization: { select: { name: true, slug: true } } } }, _count: { select: { creators: true, projects: true } } },
    }),
    matchingIds((args) => db.industryPerson.findMany(args as never), where),
    filterNames(FIELDS, state),
  ]);

  const customByRow = await Promise.all(people.map((r) => customCells("person", r.custom)));
  return (
    <div>
      <DirectoryControls showArchived={showArchived(params)}
        title="Industry people" total={total} createHref="/people/new" createLabel="+ Add Person" searchPlaceholder="Search names, roles, companies, email…"
        canEdit={canEdit} viewToggle section="people" fields={FIELDS} state={state} names={Object.fromEntries(names)} savedViews={views} defaultViews={DEFAULT_VIEWS}
        sorts={[{ value: "name", label: "Alphabetical" }, { value: "title", label: "Job title" }, { value: "role", label: "Role" }, { value: "updated-desc", label: "Recently updated" }]}
      />
      {view === "table" ? (
        <RecordTable
          sort={sort} view="people" recordType="person" selectable={canEdit} matchingIds={ids}
          empty={q || state.and.length || state.or.length ? "No people match these filters." : "No industry people yet. Agents, managers, executives and contacts live here."}
          columns={[
            ...customCols,
            { key: "name", label: "Name", sortKey: "name" },
            { key: "title", label: "Title", sortKey: "title", filterKey: "title" },
            { key: "role", label: "Role", sortKey: "role", filterKey: "role", showAt: "hidden sm:table-cell" },
            { key: "company", label: "Company", filterKey: "company", showAt: "hidden md:table-cell" },
            { key: "email", label: "Email", filterKey: "email", showAt: "hidden lg:table-cell" },
            { key: "projects", label: "Projects", align: "right", showAt: "hidden md:table-cell" },
            { key: "updated", label: "Updated", sortKey: "updated", filterKey: "updated", showAt: "hidden xl:table-cell" },
            { key: "actions", label: "", align: "right" },
          ]}
          rows={people.map((p, i) => ({
            id: p.id, href: `/people/${p.slug}`, archived: p.archived, peek: { type: "person", id: p.id },
            cells: [
              <span key="n">{p.name}</span>,
              <span key="t" className="line-clamp-1 text-muted">{p.title ?? <span className="text-faint">—</span>}</span>,
              <span key="r" className="text-muted">{labelFor(p.roleType) || <span className="text-faint">—</span>}</span>,
              <span key="o" className="line-clamp-1 text-muted">{p.organizations.map((x) => x.organization.name).join(", ") || <span className="text-faint">—</span>}</span>,
              <span key="e" className="line-clamp-1 text-muted">{p.email ?? <span className="text-faint">—</span>}</span>,
              <span key="p" className="tabular-nums text-muted">{p._count.projects || <span className="text-faint">—</span>}</span>,
              <span key="u" className="whitespace-nowrap text-muted">{relativeTime(p.updatedAt)}</span>,
              <RowArchive key="a" type="person" id={p.id} name={p.name} canEdit={canEdit} />,
              ...customByRow[i].map((v, j) => <span key={`c${j}`} className="text-muted">{v || <span className="text-faint">—</span>}</span>),
            ],
          }))}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {people.map((p) => (
            <Link key={p.id} href={`/people/${p.slug}`} className="card block p-4 transition-shadow hover:shadow-pop">
              <div className="font-semibold">{p.name}</div>
              <div className="text-xs text-muted">{[p.title, labelFor(p.roleType)].filter(Boolean).join(" · ")}</div>
              {p.organizations[0] && <div className="mt-1 text-xs text-muted">{p.organizations[0].organization.name}</div>}
              <div className="mt-1.5 text-xs text-faint">{p._count.creators} talent · {p._count.projects} projects</div>
            </Link>
          ))}
          {people.length === 0 && <p className="text-sm text-faint">No people match.</p>}
        </div>
      )}
      <Pagination page={pg.page} pages={pg.pages} total={total} all={pg.all} />
    </div>
  );
}
