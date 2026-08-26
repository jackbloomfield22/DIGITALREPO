import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { RowRestore } from "@/components/row-status";
import { RecordTable } from "@/components/record-table";
import { Pagination } from "@/components/pagination";
import { StatusPill } from "@/components/ui";
import { labelFor } from "@/lib/taxonomy";
import { parseSort } from "@/lib/directory-sort";
import { formatDate } from "@/lib/format";
import type { ArchiveType } from "@/lib/row-status";

export const metadata = { title: "Archive" };

// The Repo's long memory. Most of 4.4.Forty's work is finished, shelved or
// paused at any given moment, and burying it inside the live directories buries
// the things actually in play — so it lives here instead: everything, still
// searchable, still linked, one button away from coming back.

const PAGE_SIZE = 40;

type Kind = {
  type: ArchiveType;
  model: string;
  nameField: "name" | "title";
  label: string;
  plural: string;
  path: (slug: string) => string;
  hasStatus: boolean;
};

const KINDS: Kind[] = [
  { type: "project", model: "project", nameField: "title", label: "Project", plural: "Projects", path: (s) => `/projects/${s}`, hasStatus: true },
  { type: "format", model: "format", nameField: "title", label: "Format", plural: "Formats", path: (s) => `/formats/${s}`, hasStatus: true },
  { type: "opportunity", model: "opportunity", nameField: "title", label: "Opportunity", plural: "Opportunities", path: (s) => `/opportunities/${s}`, hasStatus: true },
  { type: "creator", model: "creator", nameField: "name", label: "Talent", plural: "Talent", path: (s) => `/talent/${s}`, hasStatus: true },
  { type: "organization", model: "organization", nameField: "name", label: "Organization", plural: "Organizations", path: (s) => `/organizations/${s}`, hasStatus: false },
  { type: "person", model: "industryPerson", nameField: "name", label: "Industry Person", plural: "Industry People", path: (s) => `/people/${s}`, hasStatus: false },
];

type Row = {
  id: string;
  kind: Kind;
  name: string;
  slug: string;
  status: string | null;
  reason: string | null;
  archivedAt: Date | null;
  updatedAt: Date;
};

/** Ordering, matched between the per-table queries so a merged page stays sorted. */
function orderFor(sort: { key: string; desc: boolean }, nameField: "name" | "title") {
  const dir = sort.desc ? "desc" : "asc";
  if (sort.key === "name") return { [nameField]: dir };
  if (sort.key === "kind") return { [nameField]: "asc" };
  return [{ archivedAt: { sort: dir, nulls: "last" } }, { updatedAt: dir }];
}

function compare(a: Row, b: Row, sort: { key: string; desc: boolean }): number {
  const flip = sort.desc ? -1 : 1;
  if (sort.key === "name") return a.name.localeCompare(b.name) * flip;
  if (sort.key === "kind") return (a.kind.label.localeCompare(b.kind.label) || a.name.localeCompare(b.name)) * flip;
  const at = a.archivedAt?.getTime() ?? a.updatedAt.getTime();
  const bt = b.archivedAt?.getTime() ?? b.updatedAt.getTime();
  return (at - bt) * flip;
}

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = one(params.q)?.trim();
  const typeParam = one(params.type);
  const sort = parseSort(one(params.sort), "date-desc");
  const page = Math.max(1, Number(one(params.page) ?? 1) || 1);
  const canEdit = hasRole(user, "EDITOR");

  const selected = KINDS.find((k) => k.type === typeParam) ?? null;
  const wanted = selected ? [selected] : KINDS;

  const where = (kind: Kind) => ({
    archived: true,
    ...(q ? { [kind.nameField]: { contains: q, mode: "insensitive" } } : {}),
  });

  // Counts drive the type chips, and are what makes the Archive legible at a
  // glance: how much history there is, and of what.
  const counts = await Promise.all(
    KINDS.map(async (kind) => ({
      kind,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      count: (await (db as any)[kind.model].count({ where: where(kind) })) as number,
    })),
  );
  const total = counts
    .filter(({ kind }) => !selected || kind.type === selected.type)
    .reduce((n, c) => n + c.count, 0);

  // One type: the database paginates. Everything: take enough of each list to
  // cover the requested page, merge, then slice — each list is already sorted
  // the same way, so the merge is correct up to that depth.
  const perType = selected ? PAGE_SIZE : page * PAGE_SIZE;
  const skip = selected ? (page - 1) * PAGE_SIZE : 0;

  const fetched = await Promise.all(
    wanted.map(async (kind) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: Record<string, unknown>[] = await (db as any)[kind.model].findMany({
        where: where(kind),
        orderBy: orderFor(sort, kind.nameField),
        skip,
        take: perType,
        select: {
          id: true,
          slug: true,
          [kind.nameField]: true,
          archivedReason: true,
          archivedAt: true,
          updatedAt: true,
          ...(kind.hasStatus ? { status: true } : {}),
        },
      });
      return rows.map<Row>((r) => ({
        id: r.id as string,
        kind,
        name: (r[kind.nameField] as string) ?? "—",
        slug: (r.slug as string) ?? "",
        status: kind.hasStatus ? ((r.status as string) ?? null) : null,
        reason: (r.archivedReason as string | null) ?? null,
        archivedAt: (r.archivedAt as Date | null) ?? null,
        updatedAt: r.updatedAt as Date,
      }));
    }),
  );

  const merged = fetched.flat().sort((a, b) => compare(a, b, sort));
  const rows = selected ? merged : merged.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Who put it here, from the audit trail, plus the document it came from.
  const audits = rows.length
    ? await db.auditLog.findMany({
        where: {
          action: "archived",
          OR: rows.map((r) => ({ targetType: r.kind.type, targetId: r.id })),
        },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const auditFor = new Map<string, (typeof audits)[number]>();
  for (const a of audits) if (!auditFor.has(`${a.targetType}:${a.targetId}`)) auditFor.set(`${a.targetType}:${a.targetId}`, a);

  const chipHref = (type: string | null) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (one(params.sort)) p.set("sort", one(params.sort)!);
    if (type) p.set("type", type);
    const qs = p.toString();
    return `/archive${qs ? `?${qs}` : ""}`;
  };

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight">ARCHIVE</h1>
          <span className="text-sm text-muted">{total}</span>
        </div>
      </div>
      <p className="mb-5 max-w-2xl text-sm text-muted">
        Everything 4.4.Forty has worked on that isn&apos;t live right now — finished
        productions, shelved concepts, closed opportunities, dormant relationships. Nothing
        here is deleted: it stays searchable and keeps all its links, and{" "}
        <span className="text-charcoal">Restore</span> puts it straight back on the live
        lists if a project comes around again.
      </p>

      <form className="mb-3 max-w-xs">
        <input type="search" name="q" placeholder="Search the archive…" defaultValue={q ?? ""} aria-label="Search the archive" />
        {typeParam && <input type="hidden" name="type" value={typeParam} />}
      </form>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <Link href={chipHref(null)} className={`chip ${!selected ? "bg-wash font-semibold" : "text-muted hover:text-accent-deep"}`}>
          Everything <span className="text-xs text-faint">{counts.reduce((n, c) => n + c.count, 0)}</span>
        </Link>
        {counts
          .filter((c) => c.count > 0 || c.kind.type === typeParam)
          .map(({ kind, count }) => (
            <Link
              key={kind.type}
              href={chipHref(kind.type)}
              className={`chip ${selected?.type === kind.type ? "bg-wash font-semibold" : "text-muted hover:text-accent-deep"}`}
            >
              {kind.plural} <span className="text-xs text-faint">{count}</span>
            </Link>
          ))}
      </div>

      <RecordTable
        sort={sort}
        empty={q ? "Nothing in the archive matches that." : "Nothing is archived yet."}
        columns={[
          { label: "Name", sortKey: "name" },
          { label: "Kind", sortKey: "kind", showAt: "hidden sm:table-cell" },
          { label: "Last status", showAt: "hidden md:table-cell" },
          { label: "Archived", sortKey: "date" },
          { label: "Why", showAt: "hidden lg:table-cell" },
          { label: "", align: "right" },
        ]}
        rows={rows.map((r) => {
          const audit = auditFor.get(`${r.kind.type}:${r.id}`);
          const ingestMatch = audit?.field?.match(/ingest (\w+)/);
          return {
            id: `${r.kind.type}:${r.id}`,
            href: r.kind.path(r.slug),
            cells: [
              <span key="n">{r.name}</span>,
              <span key="k" className="text-muted">{r.kind.label}</span>,
              <span key="s">
                {/* A status of "archived" only repeats where the row already is. */}
                {r.status && r.status !== "archived" ? (
                  <StatusPill status={r.status} label={labelFor(r.status)} />
                ) : (
                  <span className="text-faint">—</span>
                )}
              </span>,
              <span key="d" className="whitespace-nowrap text-muted">
                {r.archivedAt ? formatDate(r.archivedAt) : <span className="text-faint">—</span>}
                {audit?.userName && <span className="block text-xs text-faint">by {audit.userName}</span>}
              </span>,
              <span key="w" className="line-clamp-2 text-muted">
                {r.reason ?? <span className="text-faint">No reason recorded</span>}
                {ingestMatch && (
                  <>
                    {" · "}
                    <Link href={`/ingest/${ingestMatch[1]}`} className="underline underline-offset-2 hover:text-accent">
                      source
                    </Link>
                  </>
                )}
              </span>,
              <RowRestore key="r" type={r.kind.type} id={r.id} name={r.name} canEdit={canEdit} />,
            ],
          };
        })}
      />

      <Pagination page={page} pages={pages} />
    </div>
  );
}
