import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { RecordTable } from "@/components/record-table";
import { RowStatus } from "@/components/row-status";
import { Pagination } from "@/components/pagination";
import { StatusPill } from "@/components/ui";
import { parseSort } from "@/lib/directory-sort";
import { compactNumber, formatDate, relativeTime, isStale } from "@/lib/format";
import { CHANNEL_STATUSES, labelFor } from "@/lib/taxonomy";
import { YouTubeHeader } from "@/components/youtube-nav";

export const metadata = { title: "Channels" };

// The athlete YouTube channels business. Not a filtered view of the Repo — a
// channel is a thing the company pitches, signs, launches and then runs, and
// the work of running one is the queue of ideas underneath it. Both live here.

const PAGE_SIZE = 30;

/** The pipeline, in the order a channel moves through it. */
const PIPELINE = ["prospect", "in_talks", "signed", "building", "live", "paused"];

/** A subscriber count nobody has checked in two months is a rumour. */
const STALE_DAYS = 60;

export default async function ChannelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = one(params.q)?.trim();
  const status = one(params.status);
  const view = one(params.view) === "board" ? "board" : "table";
  const sort = parseSort(one(params.sort), "subscribers-desc");
  const page = Math.max(1, Number(one(params.page) ?? 1) || 1);
  const canEdit = hasRole(user, "EDITOR");

  const and: Prisma.ChannelWhereInput[] = [{ archived: false }];
  if (q) and.push({ OR: [{ name: { contains: q, mode: "insensitive" } }, { handle: { contains: q, mode: "insensitive" } }] });
  if (status) and.push({ status });
  const where = { AND: and };

  const orderBy: Prisma.ChannelOrderByWithRelationInput[] =
    sort.key === "name"
      ? [{ name: sort.desc ? "desc" : "asc" }]
      : sort.key === "status"
        ? [{ status: sort.desc ? "desc" : "asc" }, { name: "asc" }]
        : sort.key === "date"
          ? [{ lastActivityAt: { sort: sort.desc ? "desc" : "asc", nulls: "last" } }, { name: "asc" }]
          : [{ subscribers: { sort: sort.desc ? "desc" : "asc", nulls: "last" } }, { name: "asc" }];

  const [channels, total, board, reach, live] = await Promise.all([
    db.channel.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        creator: { select: { name: true, slug: true } },
        owner: { select: { name: true } },
        _count: { select: { ideas: true } },
      },
    }),
    db.channel.count({ where }),
    db.channel.findMany({
      where: { archived: false, status: { in: PIPELINE } },
      orderBy: [{ subscribers: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
      include: { creator: { select: { name: true } }, _count: { select: { ideas: true } } },
    }),
    db.channel.aggregate({ _sum: { subscribers: true, totalViews: true }, where: { archived: false } }),
    db.channel.count({ where: { archived: false, status: "live" } }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const byStatus = new Map<string, typeof board>();
  for (const c of board) (byStatus.get(c.status) ?? byStatus.set(c.status, []).get(c.status)!).push(c);
  const columns = PIPELINE.filter((s) => (byStatus.get(s)?.length ?? 0) > 0);
  const ideasInFlight = board.reduce((n, c) => n + c._count.ideas, 0);

  const keep = (extra: Record<string, string | null>) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status) p.set("status", status);
    if (one(params.sort)) p.set("sort", one(params.sort)!);
    p.set("view", view);
    for (const [k, v] of Object.entries(extra)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    p.delete("page");
    return `/youtube?${p.toString()}`;
  };

  return (
    <div>
      <YouTubeHeader
        active="/youtube/channels"
        action={canEdit ? <Link href="/youtube/new" className="btn btn-primary btn-sm">+ Add Channel</Link> : null}
      />

      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="font-display text-xl font-bold">Channels</h2>
        <span className="text-sm text-muted">{total}</span>
        <span className="ml-auto text-xs text-faint">
          {live} live · {compactNumber(reach._sum.subscribers ?? 0)} subscribers · {ideasInFlight} ideas queued
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <Link href={keep({ status: null })} className={`chip ${!status ? "bg-wash font-semibold" : "text-muted hover:text-accent-deep"}`}>
          All
        </Link>
        {CHANNEL_STATUSES.filter((s) => s.value !== "archived").map((s) => (
          <Link
            key={s.value}
            href={keep({ status: s.value })}
            className={`chip ${status === s.value ? "bg-wash font-semibold" : "text-muted hover:text-accent-deep"}`}
          >
            {s.label}
          </Link>
        ))}
        <span className="ml-auto flex gap-1">
          <Link href={keep({ view: "table" })} className={`chip ${view === "table" ? "bg-wash font-semibold" : "text-muted"}`}>List</Link>
          <Link href={keep({ view: "board" })} className={`chip ${view === "board" ? "bg-wash font-semibold" : "text-muted"}`}>Pipeline</Link>
        </span>
      </div>

      <form className="mb-4 max-w-xs">
        <input type="search" name="q" placeholder="Search channels…" defaultValue={q ?? ""} aria-label="Search channels" />
        {status && <input type="hidden" name="status" value={status} />}
        <input type="hidden" name="view" value={view} />
      </form>

      {view === "board" ? (
        columns.length === 0 ? (
          <p className="text-sm text-faint">
            Nothing in the pipeline yet.{" "}
            {canEdit && <Link href="/youtube/new" className="underline">Add the first channel</Link>}
          </p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {columns.map((s) => (
              <div key={s} className="w-64 shrink-0">
                <div className="mb-1.5 flex items-baseline justify-between px-1">
                  <StatusPill status={s} label={labelFor(s)} />
                  <span className="text-xs text-faint">{byStatus.get(s)!.length}</span>
                </div>
                <div className="space-y-1.5">
                  {byStatus.get(s)!.map((c) => (
                    <div key={c.id} className="card px-3 py-2.5 transition-shadow hover:shadow-pop">
                      <Link href={`/youtube/${c.slug}`} className="block">
                        <div className="truncate text-sm font-semibold hover:text-accent">{c.name}</div>
                        <div className="mt-0.5 truncate text-[11px] text-faint">
                          {[c.creator?.name, c.handle, c.cadence].filter(Boolean).join(" · ") || "No details yet"}
                        </div>
                        <div className="mt-1 text-[11px] text-muted">
                          {[
                            c.subscribers ? `${compactNumber(c.subscribers)} subs` : null,
                            c._count.ideas ? `${c._count.ideas} idea${c._count.ideas === 1 ? "" : "s"}` : null,
                          ].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </Link>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <RowStatus type="channel" id={c.id} status={c.status} name={c.name} canEdit={canEdit} />
                        <span className="text-[11px] text-faint">{relativeTime(c.updatedAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          <RecordTable
            sort={sort}
            empty={q ? "No channels match." : "No channels yet."}
            columns={[
              { label: "Channel", sortKey: "name" },
              { label: "Status", sortKey: "status" },
              { label: "Athlete", showAt: "hidden sm:table-cell" },
              { label: "Subscribers", sortKey: "subscribers", align: "right" },
              { label: "Checked", showAt: "hidden md:table-cell" },
              { label: "Cadence", showAt: "hidden lg:table-cell" },
              { label: "Ideas", align: "right", showAt: "hidden md:table-cell" },
              { label: "Last activity", sortKey: "date", showAt: "hidden lg:table-cell" },
            ]}
            rows={channels.map((c) => ({
              id: c.id,
              href: `/youtube/${c.slug}`,
              cells: [
                <span key="n">
                  {c.name}
                  {c.handle && <span className="block text-xs font-normal text-muted">{c.handle}</span>}
                </span>,
                <RowStatus key="s" type="channel" id={c.id} status={c.status} name={c.name} canEdit={canEdit} />,
                <span key="a" className="line-clamp-1 text-muted">
                  {c.creator?.name ?? <span className="text-faint">—</span>}
                </span>,
                <span key="sub" className="tabular-nums font-medium">
                  {c.subscribers != null ? compactNumber(c.subscribers) : <span className="text-faint">—</span>}
                </span>,
                <span key="ch" className="whitespace-nowrap text-muted">
                  {c.countUpdatedAt ? (
                    <span className={isStale(c.countUpdatedAt, STALE_DAYS) ? "text-warn" : undefined}>
                      {relativeTime(c.countUpdatedAt)}
                    </span>
                  ) : (
                    <span className="text-faint">never</span>
                  )}
                </span>,
                <span key="cad" className="text-muted">{c.cadence ?? <span className="text-faint">—</span>}</span>,
                <span key="i" className="tabular-nums text-muted">{c._count.ideas || <span className="text-faint">—</span>}</span>,
                <span key="d" className="whitespace-nowrap text-muted">
                  {c.lastActivityAt ? formatDate(c.lastActivityAt) : <span className="text-faint">—</span>}
                </span>,
              ],
            }))}
          />
          <Pagination page={page} pages={pages} />
        </>
      )}
    </div>
  );
}
