import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { resolveTargets } from "@/lib/resolve-targets";
import { attentionCounts } from "@/lib/attention";
import { HomeSearch } from "@/components/home-search";
import { Portrait, StatusPill } from "@/components/ui";
import { labelFor, targetTypeLabel } from "@/lib/taxonomy";
import { daysAgo, formatDate, nowDate, relativeTime } from "@/lib/format";

// The command center: what should I know, continue, or investigate right now?

const ACTIVE_FORMAT_STATUSES = ["developing", "outbound", "pitched", "in_discussion"];

function Module({ title, action, children }: {
  title: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="overline">{title}</h2>
        {action && (
          <Link href={action.href} className="text-xs text-muted hover:text-accent-deep hover:underline">
            {action.label} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export default async function Home() {
  const user = await requireUser();
  const canEdit = hasRole(user, "EDITOR");
  const now = nowDate();

  const [recents, activeFormats, deadlines, events, attention, activity, favorites, collections] =
    await Promise.all([
      db.recentView.findMany({ where: { userId: user.id }, orderBy: { viewedAt: "desc" }, take: 8 }),
      db.format.findMany({
        where: { archived: false, status: { in: ACTIVE_FORMAT_STATUSES } },
        orderBy: { updatedAt: "desc" },
        take: 5,
        include: { creators: { include: { creator: { select: { name: true } } }, take: 3 } },
      }),
      db.opportunity.findMany({
        where: { archived: false, deadline: { gte: now, lte: daysAgo(-21) } },
        orderBy: { deadline: "asc" },
        take: 5,
        select: { title: true, slug: true, deadline: true, type: true },
      }),
      db.sportsEvent.findMany({
        where: { startDate: { gte: now } },
        orderBy: { startDate: "asc" },
        take: 6,
      }),
      attentionCounts(),
      db.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, userName: true, action: true, targetType: true, targetLabel: true, createdAt: true },
      }),
      db.favorite.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 6 }),
      db.collection.findMany({
        orderBy: { updatedAt: "desc" },
        take: 4,
        include: { _count: { select: { items: true } } },
      }),
    ]);

  const [recentResolved, favResolved] = await Promise.all([
    resolveTargets(recents),
    resolveTargets(favorites),
  ]);

  const attentionRows = [
    { count: attention.deadlinesThisWeek, label: "opportunity deadlines this week" },
    { count: attention.talentWithoutRep, label: "talent without current representation" },
    { count: attention.staleSocialCounts, label: "stale social counts" },
    { count: attention.projectsWithoutCompany, label: "projects missing a production company" },
    { count: attention.talentWithoutSource, label: "talent profiles without a source" },
    { count: attention.unverifiedTalent, label: "profiles not verified in 90+ days" },
  ].filter((r) => r.count > 0);

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <div className="overline mb-1">{formatDate(now)}</div>
        <h1 className="mb-4 font-display text-3xl font-bold tracking-tight">
          THE 4.4.FORTY REPO
        </h1>
        <HomeSearch />
        {canEdit && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[
              { href: "/talent/new", label: "+ Talent" },
              { href: "/formats/new", label: "+ Format" },
              { href: "/projects/new", label: "+ Project" },
              { href: "/opportunities/new", label: "+ Opportunity" },
              { href: "/organizations/new", label: "+ Organization" },
              { href: "/ingest", label: "+ Ingest research" },
            ].map((a) => (
              <Link key={a.href} href={a.href} className="chip text-muted hover:text-accent-deep">
                {a.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-8">
          {recents.length > 0 && (
            <Module title="Continue Working" action={{ href: "/recent", label: "All recent" }}>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {recents.map((r) => {
                  const res = recentResolved.get(`${r.targetType}:${r.targetId}`);
                  if (!res || res.archived) return null;
                  return (
                    <Link key={r.id} href={res.href} className="card flex items-center gap-2.5 px-3 py-2 transition-shadow hover:shadow-pop">
                      {r.targetType === "creator" ? (
                        <Portrait name={res.label} imageUrl={res.imageUrl} className="h-7 w-7 shrink-0 rounded" textClass="text-[10px]" />
                      ) : (
                        <span className="kind-badge kind-project shrink-0">{targetTypeLabel(r.targetType)}</span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{res.label}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </Module>
          )}

          <Module title="Active Development" action={{ href: "/development", label: "Development" }}>
            <div className="space-y-1.5">
              {activeFormats.map((f) => (
                <Link key={f.id} href={`/formats/${f.slug}`} className="card flex items-baseline justify-between gap-3 px-3.5 py-2.5 transition-shadow hover:shadow-pop">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{f.title}</span>
                    <span className="block truncate text-xs text-muted">
                      {[f.logline, f.creators.length ? f.creators.map((c) => c.creator.name).join(", ") : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusPill status={f.status} label={labelFor(f.status)} />
                    <span className="text-xs text-faint">{relativeTime(f.updatedAt)}</span>
                  </span>
                </Link>
              ))}
              {activeFormats.length === 0 && (
                <p className="text-sm text-faint">No formats in active development. The slate lives under Development.</p>
              )}
              {deadlines.map((o) => (
                <Link key={o.slug} href={`/opportunities/${o.slug}`} className="card flex items-baseline justify-between gap-3 px-3.5 py-2.5 transition-shadow hover:shadow-pop">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{o.title}</span>
                    <span className="block truncate text-xs text-muted">{labelFor(o.type)}</span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-accent-deep">
                    due {formatDate(o.deadline)}
                  </span>
                </Link>
              ))}
            </div>
          </Module>

          <Module title="Team Activity" action={{ href: "/activity", label: "All activity" }}>
            <div className="space-y-1">
              {activity.map((a) => (
                <div key={a.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{a.userName}</span>{" "}
                    <span className="text-muted">{a.action}</span>{" "}
                    <span className="font-medium">{a.targetLabel}</span>{" "}
                    <span className="text-xs text-faint">({targetTypeLabel(a.targetType)})</span>
                  </span>
                  <span className="shrink-0 text-xs text-faint">{relativeTime(a.createdAt)}</span>
                </div>
              ))}
              {activity.length === 0 && <p className="text-sm text-faint">No activity yet.</p>}
            </div>
          </Module>
        </div>

        <div className="space-y-8">
          {attentionRows.length > 0 && (
            <Module title="Needs Attention" action={{ href: "/attention", label: "Work the queue" }}>
              <Link href="/attention" className="card block px-3.5 py-2.5 transition-shadow hover:shadow-pop">
                <div className="space-y-1 text-sm">
                  {attentionRows.map((r) => (
                    <div key={r.label} className="flex items-baseline gap-2">
                      <span className="w-7 shrink-0 text-right font-display font-bold text-accent-deep">{r.count}</span>
                      <span className="text-muted">{r.label}</span>
                    </div>
                  ))}
                </div>
              </Link>
            </Module>
          )}

          <Module title="Upcoming" action={{ href: "/calendar", label: "Calendar" }}>
            <div className="space-y-1">
              {events.map((e) => (
                <div key={e.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    {e.league && <span className="text-xs font-semibold text-muted">{e.league} · </span>}
                    {e.title}
                  </span>
                  <span className="shrink-0 text-xs text-faint">
                    {formatDate(e.startDate)}
                    {e.approximate ? " (approx.)" : ""}
                  </span>
                </div>
              ))}
              {events.length === 0 && <p className="text-sm text-faint">No upcoming events on the calendar.</p>}
            </div>
          </Module>

          {(favorites.length > 0 || collections.length > 0) && (
            <Module title="Pinned" action={{ href: "/favorites", label: "Favorites" }}>
              <div className="flex flex-wrap gap-1.5">
                {favorites.map((f) => {
                  const res = favResolved.get(`${f.targetType}:${f.targetId}`);
                  if (!res || res.archived) return null;
                  return (
                    <Link key={f.id} href={res.href} className="chip hover:text-accent-deep">
                      ★ {res.label}
                    </Link>
                  );
                })}
                {collections.map((c) => (
                  <Link key={c.id} href={`/collections/${c.slug}`} className="chip hover:text-accent-deep">
                    {c.name} <span className="text-xs text-muted">{c._count.items}</span>
                  </Link>
                ))}
              </div>
            </Module>
          )}
        </div>
      </div>
    </div>
  );
}
