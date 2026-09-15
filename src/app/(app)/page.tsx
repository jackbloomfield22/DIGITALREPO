import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { attentionCounts, attentionWheres } from "@/lib/attention";
import { resolveRecordRefs } from "@/lib/record-refs";
import { HomeSearch } from "@/components/home-search";
import { typeLabel } from "@/lib/record-types";
import { daysAgo, formatDate, nowDate, relativeTime } from "@/lib/format";
import { quietClock, onQuietTimer } from "@/lib/quiet-rules";

// Home: what you starred, what changed, and what needs a hand — nothing
// decorative. Every block links to the place the work happens.

function Module({ title, action, children }: { title: string; action?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3 border-b border-line pb-1.5">
        <h2 className="overline">{title}</h2>
        {action && <Link href={action.href} className="text-xs text-muted hover:text-accent">{action.label} →</Link>}
      </div>
      {children}
    </section>
  );
}

export default async function Home() {
  const user = await requireUser();
  const canEdit = hasRole(user, "EDITOR");
  const now = nowDate();
  const soon = daysAgo(-30);
  const { noRep, noProdCo, unverified } = attentionWheres();
  const [favorites, audits, counts, deadlines, quietCandidates, events, noRepList, noCoList, unverifiedList] = await Promise.all([
    db.favorite.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 12, select: { targetType: true, targetId: true } }),
    db.auditLog.findMany({ where: { targetType: { in: ["creator", "project", "organization", "format", "person", "opportunity", "channel"] } }, orderBy: { createdAt: "desc" }, take: 120, select: { targetType: true, targetId: true, targetLabel: true, userName: true, action: true, field: true, createdAt: true } }),
    attentionCounts(),
    db.opportunity.findMany({ where: { archived: false, deadline: { lte: soon } }, orderBy: { deadline: "asc" }, take: 8, select: { id: true, title: true, slug: true, deadline: true, status: true } }),
    Promise.all([
      db.format.findMany({ where: { archived: false, status: { in: ["idea", "concept", "developing"] } }, select: { id: true, title: true, slug: true, status: true, updatedAt: true, lastActivityAt: true }, take: 300 }),
      db.project.findMany({ where: { archived: false, status: "announced" }, select: { id: true, title: true, slug: true, status: true, updatedAt: true, lastActivityAt: true }, take: 300 }),
    ]),
    db.sportsEvent.findMany({ where: { startDate: { gte: daysAgo(1), lte: daysAgo(-21) } }, orderBy: { startDate: "asc" }, take: 5, select: { id: true, title: true, slug: true, startDate: true, sport: { select: { name: true } } } }),
    db.creator.findMany({ where: noRep, select: { id: true, name: true, slug: true }, take: 5, orderBy: { updatedAt: "desc" } }),
    db.project.findMany({ where: noProdCo, select: { id: true, title: true, slug: true }, take: 5, orderBy: { updatedAt: "desc" } }),
    db.creator.findMany({ where: unverified, select: { id: true, name: true, slug: true, lastVerifiedAt: true }, take: 5, orderBy: { lastVerifiedAt: { sort: "asc", nulls: "first" } } }),
  ]);

  // Recently updated: one row per record, newest first, with who and when.
  const seen = new Set<string>();
  const recent = audits.filter((a) => { const k = `${a.targetType}:${a.targetId}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 20);
  const [favRefs, recentRefs] = await Promise.all([resolveRecordRefs(favorites), resolveRecordRefs(recent)]);
  const refOf = new Map(recentRefs.map((r) => [`${r.type}:${r.id}`, r]));

  const quiet = [
    ...quietCandidates[0].map((f) => ({ type: "format", href: `/formats/${f.slug}`, name: f.title, status: f.status, clock: quietClock(f, now), on: onQuietTimer("format", f.status) })),
    ...quietCandidates[1].map((p) => ({ type: "project", href: `/projects/${p.slug}`, name: p.title, status: p.status, clock: quietClock(p, now), on: onQuietTimer("project", p.status) })),
  ].filter((x) => x.on && x.clock.daysLeft <= 14).sort((a, b) => a.clock.daysLeft - b.clock.daysLeft).slice(0, 6);

  const QUICK = [
    { href: "/talent/new", label: "+ Talent" }, { href: "/projects/new", label: "+ Project" }, { href: "/organizations/new", label: "+ Company" },
    { href: "/formats/new", label: "+ Format" }, { href: "/opportunities/new", label: "+ Opportunity" }, { href: "/people/new", label: "+ Person" }, { href: "/ingest", label: "+ Add information" },
  ];

  return (
    <div>
      <div className="mb-8">
        <div className="overline mb-1">{formatDate(now)}</div>
        <h1 className="mb-4 font-display text-2xl font-bold tracking-tight">The 4.4.Forty Repo</h1>
        <HomeSearch />
        {canEdit && <div className="mt-3 flex flex-wrap gap-1.5">{QUICK.map((a) => <Link key={a.href} href={a.href} className="chip text-muted hover:text-accent-deep">{a.label}</Link>)}</div>}
      </div>

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-8">
          <Module title="Favorites" action={{ href: "/favorites", label: "All favorites" }}>
            {favRefs.length ? (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {favRefs.map((r) => (
                  <Link key={`${r.type}:${r.id}`} href={r.href} className="card flex items-center gap-2.5 px-3 py-2 transition-shadow hover:shadow-pop">
                    <span className="w-14 shrink-0 text-[10px] uppercase tracking-wide text-faint">{typeLabel(r.type)}</span>
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{r.name}</span>{r.sub && <span className="block truncate text-xs text-muted">{r.sub}</span>}</span>
                  </Link>
                ))}
              </div>
            ) : <p className="text-sm text-faint">Star a record with ☆ and it lands here, and in the sidebar.</p>}
          </Module>

          <Module title="Recently updated" action={{ href: "/activity", label: "All activity" }}>
            {recent.length ? (
              <ul className="divide-y divide-line rounded-md border border-line bg-surface">
                {recent.map((a) => {
                  const r = refOf.get(`${a.targetType}:${a.targetId}`);
                  return (
                    <li key={`${a.targetType}:${a.targetId}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                      <span className="w-14 shrink-0 text-[10px] uppercase tracking-wide text-faint">{typeLabel(a.targetType)}</span>
                      {r ? <Link href={r.href} className="font-medium hover:text-accent-deep">{r.name}</Link> : <span className="text-muted">{a.targetLabel}</span>}
                      <span className="text-xs text-muted">{a.action}{a.field ? ` · ${a.field}` : ""}</span>
                      <span className="ml-auto text-xs text-faint">{a.userName ?? "System"} · {relativeTime(a.createdAt)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-sm text-faint">Changes to records show up here, with who made them and when.</p>}
          </Module>
        </div>

        <div className="space-y-8">
          <Module title="Needs attention" action={{ href: "/attention", label: "Work the queue" }}>
            <div className="space-y-4 text-sm">
              {deadlines.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-semibold text-muted">Deadlines overdue or within 30 days</div>
                  <ul className="space-y-1">{deadlines.map((o) => { const overdue = o.deadline && o.deadline < now; return <li key={o.id} className="flex items-baseline justify-between gap-2"><Link href={`/opportunities/${o.slug}`} className="truncate font-medium hover:text-accent-deep">{o.title}</Link><span className={`shrink-0 text-xs ${overdue ? "text-accent-deep" : "text-muted"}`}>{overdue ? "overdue · " : ""}{formatDate(o.deadline)}</span></li>; })}</ul>
                </div>
              )}
              {quiet.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-semibold text-muted">About to archive on the two-month timer</div>
                  <ul className="space-y-1">{quiet.map((x) => <li key={x.href} className="flex items-baseline justify-between gap-2"><Link href={x.href} className="truncate font-medium hover:text-accent-deep">{x.name}</Link><span className="shrink-0 text-xs text-muted">{x.clock.daysLeft === 0 ? "next sweep" : `${x.clock.daysLeft} days`}</span></li>)}</ul>
                </div>
              )}
              {unverifiedList.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-semibold text-muted">Not verified in 90 days <span className="font-normal text-faint">({counts.unverifiedTalent} talent)</span></div>
                  <ul className="space-y-1">{unverifiedList.map((c) => <li key={c.id} className="flex items-baseline justify-between gap-2"><Link href={`/talent/${c.slug}`} className="truncate font-medium hover:text-accent-deep">{c.name}</Link><span className="shrink-0 text-xs text-muted">{c.lastVerifiedAt ? relativeTime(c.lastVerifiedAt) : "never"}</span></li>)}</ul>
                </div>
              )}
              {(noRepList.length > 0 || noCoList.length > 0) && (
                <div>
                  <div className="mb-1 text-xs font-semibold text-muted">Missing key fields</div>
                  <ul className="space-y-1">
                    {noRepList.map((c) => <li key={c.id} className="flex items-baseline justify-between gap-2"><Link href={`/talent/${c.slug}`} className="truncate font-medium hover:text-accent-deep">{c.name}</Link><span className="shrink-0 text-xs text-muted">no rep</span></li>)}
                    {noCoList.map((p) => <li key={p.id} className="flex items-baseline justify-between gap-2"><Link href={`/projects/${p.slug}`} className="truncate font-medium hover:text-accent-deep">{p.title}</Link><span className="shrink-0 text-xs text-muted">no company</span></li>)}
                  </ul>
                  <p className="mt-1 text-xs text-faint">{counts.talentWithoutRep} talent without a rep · {counts.projectsWithoutCompany} projects without a company · {counts.staleSocialCounts} stale social counts</p>
                </div>
              )}
              {counts.total === 0 && quiet.length === 0 && <p className="text-faint">Nothing needs attention right now.</p>}
            </div>
          </Module>

          {events.length > 0 && (
            <Module title="Coming up" action={{ href: "/calendar", label: "Calendar" }}>
              <ul className="space-y-1 text-sm">{events.map((e) => <li key={e.id} className="flex items-baseline justify-between gap-2"><Link href={`/calendar#${e.slug}`} className="truncate hover:text-accent-deep">{e.title}</Link><span className="shrink-0 text-xs text-muted">{formatDate(e.startDate)}{e.sport ? ` · ${e.sport.name}` : ""}</span></li>)}</ul>
            </Module>
          )}
        </div>
      </div>
    </div>
  );
}
