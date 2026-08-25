import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { StatusPill } from "@/components/ui";
import { labelFor } from "@/lib/taxonomy";
import { formatDate, nowDate, relativeTime } from "@/lib/format";

export const metadata = { title: "Development" };

// The development slate at a glance: formats moving through the pipeline and
// the opportunities they could serve. Formats are 4.4.Forty's own ideas —
// distinct from Projects, which are existing outside productions.

const PIPELINE = ["idea", "concept", "developing", "outbound", "pitched", "in_discussion", "sold", "produced"];

export default async function DevelopmentPage() {
  await requireUser();
  const now = nowDate();

  const [formats, deadlines, recentOpps, activity] = await Promise.all([
    db.format.findMany({
      where: { archived: false, status: { in: PIPELINE } },
      orderBy: { updatedAt: "desc" },
      include: {
        creators: { include: { creator: { select: { name: true, slug: true } } }, take: 3 },
        owner: { select: { name: true } },
      },
    }),
    db.opportunity.findMany({
      where: { archived: false, deadline: { gte: now } },
      orderBy: { deadline: "asc" },
      take: 8,
      select: { title: true, slug: true, deadline: true, type: true, status: true },
    }),
    db.opportunity.findMany({
      where: { archived: false, status: { in: ["researching", "active", "outbound", "in_discussion"] } },
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: { _count: { select: { creators: true } } },
    }),
    db.auditLog.findMany({
      where: { targetType: { in: ["format", "opportunity"] } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, userName: true, action: true, targetLabel: true, targetType: true, createdAt: true },
    }),
  ]);

  const byStatus = new Map<string, typeof formats>();
  for (const f of formats) {
    (byStatus.get(f.status) ?? byStatus.set(f.status, []).get(f.status)!).push(f);
  }
  const columns = PIPELINE.filter((s) => (byStatus.get(s)?.length ?? 0) > 0);

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-3xl font-bold tracking-tight">DEVELOPMENT</h1>
        <div className="flex gap-2 text-sm">
          <Link href="/formats" className="btn btn-secondary btn-sm">All Formats</Link>
          <Link href="/opportunities" className="btn btn-secondary btn-sm">All Opportunities</Link>
        </div>
      </div>
      <p className="mb-8 max-w-2xl text-sm text-muted">
        The 4.4.Forty slate — our own formats and concepts moving from idea to sold, and the
        opportunities they can serve. Existing outside productions live under{" "}
        <Link href="/projects" className="underline underline-offset-2 hover:text-accent-deep">Projects</Link>.
      </p>

      <div className="overline mb-2">The Slate</div>
      {columns.length === 0 ? (
        <p className="mb-8 text-sm text-faint">
          Nothing on the slate yet. <Link href="/formats/new" className="underline">Add a format</Link>.
        </p>
      ) : (
        <div className="mb-10 flex gap-3 overflow-x-auto pb-2">
          {columns.map((status) => (
            <div key={status} className="w-60 shrink-0">
              <div className="mb-1.5 flex items-baseline justify-between px-1">
                <StatusPill status={status} label={labelFor(status)} />
                <span className="text-xs text-faint">{byStatus.get(status)!.length}</span>
              </div>
              <div className="space-y-1.5">
                {byStatus.get(status)!.slice(0, 8).map((f) => (
                  <Link key={f.id} href={`/formats/${f.slug}`} className="card block px-3 py-2.5 transition-shadow hover:shadow-pop">
                    <div className="truncate text-sm font-semibold">{f.title}</div>
                    {f.logline && <div className="mt-0.5 line-clamp-2 text-xs text-muted">{f.logline}</div>}
                    <div className="mt-1 truncate text-[11px] text-faint">
                      {[
                        f.creators.length ? f.creators.map((c) => c.creator.name).join(", ") : null,
                        f.targetPlatform,
                        f.owner?.name,
                      ]
                        .filter(Boolean)
                        .join(" · ") || labelFor(f.formatType ?? "")}
                    </div>
                    <div className="mt-0.5 text-[11px] text-faint">{relativeTime(f.updatedAt)}</div>
                  </Link>
                ))}
                {byStatus.get(status)!.length > 8 && (
                  <Link href={`/formats?status=${status}`} className="block px-1 text-xs text-muted hover:text-accent-deep">
                    +{byStatus.get(status)!.length - 8} more →
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
        <section>
          <div className="overline mb-2">Deadlines</div>
          <div className="space-y-1.5">
            {deadlines.map((o) => (
              <Link key={o.slug} href={`/opportunities/${o.slug}`} className="card flex items-baseline justify-between gap-3 px-3.5 py-2.5 transition-shadow hover:shadow-pop">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{o.title}</span>
                  <span className="block truncate text-xs text-muted">{labelFor(o.type)} · {labelFor(o.status)}</span>
                </span>
                <span className="shrink-0 text-xs font-medium text-accent-deep">due {formatDate(o.deadline)}</span>
              </Link>
            ))}
            {deadlines.length === 0 && <p className="text-sm text-faint">No upcoming deadlines.</p>}
          </div>
        </section>

        <section>
          <div className="overline mb-2">Open Opportunities</div>
          <div className="space-y-1.5">
            {recentOpps.map((o) => (
              <Link key={o.id} href={`/opportunities/${o.slug}`} className="card flex items-baseline justify-between gap-3 px-3.5 py-2.5 transition-shadow hover:shadow-pop">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{o.title}</span>
                  <span className="block truncate text-xs text-muted">
                    {labelFor(o.type)}
                    {o._count.creators === 0 ? " · no candidates yet" : ` · ${o._count.creators} candidate${o._count.creators === 1 ? "" : "s"}`}
                  </span>
                </span>
                <StatusPill status={o.status} label={labelFor(o.status)} />
              </Link>
            ))}
            {recentOpps.length === 0 && <p className="text-sm text-faint">No open opportunities.</p>}
          </div>

          <div className="overline mb-2 mt-8">Recent Development Activity</div>
          <div className="space-y-1">
            {activity.map((a) => (
              <div key={a.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{a.userName}</span>{" "}
                  <span className="text-muted">{a.action}</span>{" "}
                  <span className="font-medium">{a.targetLabel}</span>
                </span>
                <span className="shrink-0 text-xs text-faint">{relativeTime(a.createdAt)}</span>
              </div>
            ))}
            {activity.length === 0 && <p className="text-sm text-faint">No development activity yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
