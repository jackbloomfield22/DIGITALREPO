import { redirect } from "next/navigation";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { directoryPageUrl, firstParam } from "@/lib/directory-params";
import { formatSearch } from "@/lib/search-where";
import { sweepQuietRecordsThrottled } from "@/lib/quiet";
import { DirectoryControls } from "@/components/directory-controls";
import { KindBadge, StatusPill } from "@/components/ui";
import { FORMAT_STATUSES, FORMAT_TYPES, labelFor } from "@/lib/taxonomy";
import { formatDate, relativeTime } from "@/lib/format";
import { RecordTable } from "@/components/record-table";
import { orderForFormats, parseSort } from "@/lib/directory-sort";
import { Pagination } from "@/components/pagination";
import { RowStatus } from "@/components/row-status";
import { parseFilterParams, type FilterField } from "@/lib/filters";
import { customCells, customColumns, customFieldMaps, customFilterFields } from "@/lib/custom-fields";
import { optionList } from "@/lib/option-cache";
import { filterWhere, filterNames, type FieldMap } from "@/lib/filter-where";
import { directoryUser, layoutFor, matchingIds, paging, liveOnly, showArchived } from "@/lib/directory";
import { statusOptionsFor } from "@/lib/row-status";

export const metadata = { title: "Formats" };

const baseFields = (): FilterField[] => [
  { key: "status", label: "Status", kind: "select", options: optionList("format_status", FORMAT_STATUSES), legacy: "status" },
  { key: "type", label: "Format type", kind: "select", options: optionList("format_type", FORMAT_TYPES), legacy: "type" },
  { key: "talent", label: "Talent", kind: "lookup", lookupType: "creator", legacy: "creator" },
  { key: "company", label: "Company / brand", kind: "lookup", lookupType: "organization", legacy: "org" },
  { key: "person", label: "Industry person", kind: "lookup", lookupType: "person" },
  { key: "topic", label: "Interest / sport / topic", kind: "lookup", lookupType: "entity", legacy: "entity" },
  { key: "platform", label: "Target platform", kind: "text" },
  { key: "location", label: "Location", kind: "text" },
  { key: "activity", label: "Last activity", kind: "date" },
  { key: "updated", label: "Updated", kind: "date" },
];
const BASE_MAPS: Record<string, FieldMap> = {
  status: { column: "status" }, type: { column: "formatType" }, platform: { column: "targetPlatform" }, location: { column: "location" },
  talent: { relation: "creators", idField: "creatorId" }, company: { relation: "organizations", idField: "organizationId" },
  person: { relation: "people", idField: "personId" }, topic: { relation: "entityLinks", idField: "entityId" },
  activity: { column: "lastActivityAt", kind: "date" }, updated: { column: "updatedAt", kind: "date" },
};
const DEFAULT_VIEWS = [
  { name: "All", query: "" },
  { name: "Active", query: "f=status~any~developing%2Coutbound%2Cpitched%2Cin_discussion" },
  { name: "Sold & beyond", query: "f=status~any~sold%2Cin_production%2Cpost_production%2Cproduced" },
  { name: "Recently updated", query: "sort=updated-desc" },
];

export default async function FormatsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await sweepQuietRecordsThrottled();
  const user = await requireUser();
  const params = await searchParams;
  const FIELDS = [...baseFields(), ...(await customFilterFields("format"))];
  const MAPS = { ...BASE_MAPS, ...(await customFieldMaps("format")) };
  const customCols = await customColumns("format");
  const q = firstParam(params.q)?.trim();
  const sort = parseSort(firstParam(params.sort), "date-desc");
  const state = parseFilterParams(params, FIELDS);
  const { prefs, views } = await directoryUser(user.id, "formats");
  const view = layoutFor(params, prefs, "formats");

  // Shelved formats live in the Archive — one place for everything that is no longer live.
  const and: Prisma.FormatWhereInput[] = [...liveOnly(params), ...(q ? [formatSearch(q)] : []), ...(filterWhere(MAPS, state) as Prisma.FormatWhereInput[])];
  const where = { AND: and };
  const total = await db.format.count({ where });
  const pg = paging(params, total);
  if (!pg.all && pg.requested > pg.pages) redirect(directoryPageUrl("/formats", params, pg.pages));

  const [formats, ids, names, archivedCount] = await Promise.all([
    db.format.findMany({
      where, orderBy: orderForFormats(sort) as never, skip: pg.skip, take: pg.take,
      include: { creators: { include: { creator: { select: { name: true, slug: true } } } }, entityLinks: { include: { entity: { select: { name: true } } } }, owner: { select: { name: true } } },
    }),
    matchingIds((args) => db.format.findMany(args as never), where),
    filterNames(FIELDS, state),
    db.format.count({ where: { archived: true } }),
  ]);
  const canEdit = hasRole(user, "EDITOR");

  const customByRow = await Promise.all(formats.map((r) => customCells("format", r.custom)));
  return (
    <div>
      <DirectoryControls showArchived={showArchived(params)} archivedCount={archivedCount}
        title="Formats" total={total} createHref="/formats/new" createLabel="+ Add Format" searchPlaceholder="Search formats…"
        canEdit={canEdit} viewToggle section="formats" fields={FIELDS} state={state} names={Object.fromEntries(names)} savedViews={views} defaultViews={DEFAULT_VIEWS}
        sorts={[
          { value: "date-desc", label: "Latest activity" }, { value: "date", label: "Oldest activity" }, { value: "status", label: "Status" },
          { value: "updated-desc", label: "Recently updated" }, { value: "title", label: "Alphabetical" },
        ]}
      />

      {formats.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-strong bg-wash/50 px-6 py-10 text-center text-sm text-muted">
          {q || state.and.length || state.or.length ? "No formats match these filters." : "No formats yet. A format is a show concept of ours in development."}
          {canEdit && <div className="mt-3"><Link className="btn btn-secondary btn-sm" href="/formats/new">+ Add Format</Link></div>}
        </div>
      ) : view === "table" ? (
        <RecordTable
          sort={sort} view="formats" recordType="format" selectable={canEdit} matchingIds={ids} statuses={statusOptionsFor("format")} taggable
          columns={[
            ...customCols,
            { key: "title", label: "Format", sortKey: "title" },
            { key: "status", label: "Status", sortKey: "status", filterKey: "status" },
            { key: "activity", label: "Last activity", sortKey: "date", filterKey: "activity" },
            { key: "type", label: "Type", sortKey: "type", filterKey: "type", showAt: "hidden sm:table-cell" },
            { key: "talent", label: "Talent", filterKey: "talent", showAt: "hidden md:table-cell" },
            { key: "topics", label: "Topics", filterKey: "topic", showAt: "hidden lg:table-cell" },
            { key: "updated", label: "Updated", sortKey: "updated", filterKey: "updated", showAt: "hidden xl:table-cell" },
          ]}
          rows={formats.map((f, i) => ({
            id: f.id, href: `/formats/${f.slug}`, archived: f.archived, peek: { type: "format", id: f.id },
            cells: [
              <span key="t">{f.title}{f.logline && <span className="block text-xs font-normal text-muted line-clamp-1">{f.logline}</span>}</span>,
              <RowStatus key="s" type="format" id={f.id} status={f.status} name={f.title} canEdit={canEdit} />,
              <span key="d" className="whitespace-nowrap text-muted">{f.lastActivityAt ? formatDate(f.lastActivityAt) : <span className="text-faint">—</span>}</span>,
              <span key="ty" className="text-muted">{labelFor(f.formatType)}</span>,
              <span key="c" className="line-clamp-1 text-muted">{f.creators.map((c) => c.creator.name).join(", ")}</span>,
              <span key="e" className="line-clamp-1 text-muted">{f.entityLinks.map((l) => l.entity.name).join(", ")}</span>,
              <span key="u" className="whitespace-nowrap text-muted">{relativeTime(f.updatedAt)}</span>,
              ...customByRow[i].map((v, j) => <span key={`c${j}`} className="text-muted">{v || <span className="text-faint">—</span>}</span>),
            ],
          }))}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {formats.map((f) => {
            const primary = f.creators.find((c) => c.isPrimary) ?? f.creators[0];
            return (
              <Link key={f.id} href={`/formats/${f.slug}`} className="card block p-4 transition-shadow hover:shadow-pop">
                <div className="flex items-start justify-between gap-2"><div className="font-display text-sm font-bold leading-snug">{f.title}</div><KindBadge kind="format" /></div>
                {f.logline && <p className="mt-1.5 line-clamp-2 text-sm text-charcoal">{f.logline}</p>}
                <div className="mt-2 space-y-0.5 text-xs text-muted">
                  {primary && <div className="truncate">{f.creators.length > 1 ? `${primary.creator.name} +${f.creators.length - 1} more` : primary.creator.name}</div>}
                  {f.entityLinks.length > 0 && <div className="truncate">{f.entityLinks.map((l) => l.entity.name).join(" · ")}</div>}
                </div>
                <div className="mt-2 flex items-center justify-between"><StatusPill status={f.status} label={labelFor(f.status)} /><span className="text-xs text-faint">{relativeTime(f.updatedAt)}</span></div>
              </Link>
            );
          })}
        </div>
      )}
      <Pagination page={pg.page} pages={pg.pages} total={total} all={pg.all} />
    </div>
  );
}
