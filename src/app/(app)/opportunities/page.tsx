import { redirect } from "next/navigation";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { directoryPageUrl, firstParam } from "@/lib/directory-params";
import { opportunitySearch } from "@/lib/search-where";
import { DirectoryControls } from "@/components/directory-controls";
import { StatusPill } from "@/components/ui";
import { OPPORTUNITY_STATUSES, OPPORTUNITY_TYPES, labelFor } from "@/lib/taxonomy";
import { formatDate, relativeTime } from "@/lib/format";
import { RecordTable } from "@/components/record-table";
import { orderForOpportunities, parseSort } from "@/lib/directory-sort";
import { Pagination } from "@/components/pagination";
import { RowStatus } from "@/components/row-status";
import { statusOptionsFor } from "@/lib/row-status";
import { parseFilterParams, type FilterField } from "@/lib/filters";
import { filterWhere, filterNames, type FieldMap } from "@/lib/filter-where";
import { directoryUser, layoutFor, matchingIds, paging } from "@/lib/directory";

export const metadata = { title: "Opportunities" };

const FIELDS: FilterField[] = [
  { key: "status", label: "Status", kind: "select", options: OPPORTUNITY_STATUSES, legacy: "status" },
  { key: "type", label: "Type", kind: "select", options: OPPORTUNITY_TYPES, legacy: "type" },
  { key: "talent", label: "Talent", kind: "lookup", lookupType: "creator" },
  { key: "company", label: "Company", kind: "lookup", lookupType: "organization" },
  { key: "topic", label: "Topic", kind: "lookup", lookupType: "entity" },
  { key: "deadline", label: "Deadline", kind: "date" },
  { key: "activity", label: "Last activity", kind: "date" },
  { key: "updated", label: "Updated", kind: "date" },
];
const MAPS: Record<string, FieldMap> = {
  status: { column: "status" }, type: { column: "type" }, deadline: { column: "deadline", kind: "date" },
  talent: { relation: "creators", idField: "creatorId" }, company: { relation: "organizations", idField: "organizationId" }, topic: { relation: "entityLinks", idField: "entityId" },
  activity: { column: "lastActivityAt", kind: "date" }, updated: { column: "updatedAt", kind: "date" },
};
const DEFAULT_VIEWS = [
  { name: "Open", query: "f=status~any~researching%2Cactive%2Coutbound%2Cin_discussion" },
  { name: "Needs follow-up", query: "f=status~any~on_hold%2Coutbound" },
  { name: "Closed", query: "f=status~any~completed%2Cpassed" },
  { name: "All", query: "" },
];

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const params = await searchParams;
  const q = firstParam(params.q)?.trim();
  const sort = parseSort(firstParam(params.sort), "date-desc");
  const state = parseFilterParams(params, FIELDS);
  const { prefs, views } = await directoryUser(user.id, "opportunities");
  const view = layoutFor(params, prefs, "opportunities");

  const where = { AND: [{ archived: false }, ...(q ? [opportunitySearch(q)] : []), ...(filterWhere(MAPS, state) as Prisma.OpportunityWhereInput[])] };
  const total = await db.opportunity.count({ where });
  const pg = paging(params, total);
  if (!pg.all && pg.requested > pg.pages) redirect(directoryPageUrl("/opportunities", params, pg.pages));

  const [opportunities, ids, names] = await Promise.all([
    db.opportunity.findMany({
      where, orderBy: orderForOpportunities(sort) as never, skip: pg.skip, take: pg.take,
      include: { owner: { select: { name: true } }, entityLinks: { include: { entity: { select: { name: true } } } }, _count: { select: { creators: true, formats: true } } },
    }),
    matchingIds((args) => db.opportunity.findMany(args as never), where),
    filterNames(FIELDS, state),
  ]);
  const canEdit = hasRole(user, "EDITOR");

  return (
    <div>
      <DirectoryControls
        title="Opportunities" total={total} createHref="/opportunities/new" createLabel="+ Add Opportunity" searchPlaceholder="Search opportunities…"
        canEdit={canEdit} viewToggle section="opportunities" fields={FIELDS} state={state} names={Object.fromEntries(names)} savedViews={views} defaultViews={DEFAULT_VIEWS}
        sorts={[{ value: "date-desc", label: "Latest activity" }, { value: "date", label: "Oldest activity" }, { value: "status", label: "Status" }, { value: "type", label: "Type" }, { value: "title", label: "Alphabetical" }]}
      />
      {view === "table" ? (
        <RecordTable
          sort={sort} view="opportunities" recordType="opportunity" selectable={canEdit} matchingIds={ids} statuses={statusOptionsFor("opportunity")} taggable
          empty={q || state.and.length || state.or.length ? "No opportunities match these filters." : "No opportunities yet. Briefs, asks and open doors live here."}
          columns={[
            { key: "title", label: "Opportunity", sortKey: "title" },
            { key: "status", label: "Status", sortKey: "status", filterKey: "status" },
            { key: "activity", label: "Last activity", sortKey: "date", filterKey: "activity" },
            { key: "type", label: "Type", sortKey: "type", filterKey: "type", showAt: "hidden sm:table-cell" },
            { key: "due", label: "Due", filterKey: "deadline", showAt: "hidden md:table-cell" },
            { key: "topics", label: "Topics", filterKey: "topic", showAt: "hidden lg:table-cell" },
            { key: "updated", label: "Updated", sortKey: "updated", filterKey: "updated", showAt: "hidden xl:table-cell" },
          ]}
          rows={opportunities.map((o) => ({
            id: o.id, href: `/opportunities/${o.slug}`, peek: { type: "opportunity", id: o.id },
            cells: [
              <span key="t">{o.title}{o.description && <span className="block text-xs font-normal text-muted line-clamp-1">{o.description}</span>}</span>,
              <RowStatus key="s" type="opportunity" id={o.id} status={o.status} name={o.title} canEdit={canEdit} />,
              <span key="d" className="whitespace-nowrap text-muted">{o.lastActivityAt ? formatDate(o.lastActivityAt) : <span className="text-faint">—</span>}</span>,
              <span key="ty" className="text-muted">{labelFor(o.type)}</span>,
              <span key="due" className="whitespace-nowrap text-muted">{o.deadline ? formatDate(o.deadline) : <span className="text-faint">—</span>}</span>,
              <span key="e" className="line-clamp-1 text-muted">{o.entityLinks.map((l) => l.entity.name).join(", ")}</span>,
              <span key="u" className="whitespace-nowrap text-muted">{relativeTime(o.updatedAt)}</span>,
            ],
          }))}
        />
      ) : (
        <div className="space-y-3">
          {opportunities.map((o) => (
            <Link key={o.id} href={`/opportunities/${o.slug}`} className="card block p-4 transition-shadow hover:shadow-pop">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0"><div className="font-display text-base font-bold">{o.title}</div><div className="mt-0.5 text-xs text-muted">{[labelFor(o.type), o.owner?.name, o.deadline ? `due ${formatDate(o.deadline)}` : null].filter(Boolean).join(" · ")}</div></div>
                <StatusPill status={o.status} label={labelFor(o.status)} />
              </div>
              {o.description && <p className="mt-2 line-clamp-2 max-w-3xl text-sm text-charcoal">{o.description}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">{o.entityLinks.length > 0 && <span>{o.entityLinks.map((l) => l.entity.name).join(" · ")}</span>}<span className="text-faint">{o._count.creators} talent · {o._count.formats} formats · updated {relativeTime(o.updatedAt)}</span></div>
            </Link>
          ))}
          {opportunities.length === 0 && <div className="rounded-md border border-dashed border-line-strong bg-wash/50 px-6 py-10 text-center text-sm text-muted">No opportunities match.</div>}
        </div>
      )}
      <Pagination page={pg.page} pages={pg.pages} total={total} all={pg.all} />
    </div>
  );
}
