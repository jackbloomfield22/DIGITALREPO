import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { daysAgo, nowDate } from "@/lib/format";
import { AddEventButton, EditEventButton, ImportCalendarButton, type EventVM } from "@/components/calendar-editor";

export const metadata = { title: "Sports Calendar" };

function dateRange(start: Date, end: Date | null): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const startStr = start.toLocaleDateString("en-US", opts);
  if (!end) return startStr;
  const endStr = end.toLocaleDateString(
    "en-US",
    end.getMonth() === start.getMonth() ? { day: "numeric" } : opts,
  );
  return `${startStr}–${endStr}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ sport?: string }>;
}) {
  const user = await requireUser();
  const { sport: sportFilter } = await searchParams;
  const canEdit = hasRole(user, "EDITOR");

  // Show ongoing events (ended within the last 2 weeks still visible) onward.
  const cutoff = daysAgo(14);
  const events = await db.sportsEvent.findMany({
    where: {
      OR: [{ startDate: { gte: cutoff } }, { endDate: { gte: cutoff } }],
      ...(sportFilter ? { sportId: sportFilter } : {}),
    },
    orderBy: { startDate: "asc" },
    include: { sport: { select: { id: true, name: true, slug: true } } },
    take: 200,
  });

  // Sport filter chips built from all upcoming events (unfiltered)
  const allUpcoming = await db.sportsEvent.findMany({
    where: { OR: [{ startDate: { gte: cutoff } }, { endDate: { gte: cutoff } }] },
    select: { sport: { select: { id: true, name: true } } },
  });
  const sportCounts = new Map<string, { id: string; name: string; n: number }>();
  for (const e of allUpcoming) {
    if (!e.sport) continue;
    const entry = sportCounts.get(e.sport.id) ?? { ...e.sport, n: 0 };
    entry.n++;
    sportCounts.set(e.sport.id, entry);
  }
  const sports = [...sportCounts.values()].sort((a, b) => b.n - a.n);

  // Group by month
  const byMonth = new Map<string, typeof events>();
  for (const e of events) {
    const key = e.startDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    (byMonth.get(key) ?? byMonth.set(key, []).get(key)!).push(e);
  }

  const now = nowDate();

  return (
    <div className="max-w-4xl">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">SPORTS CALENDAR</h1>
        {canEdit && (
          <div className="flex gap-2">
            {events.length > 0 && <ImportCalendarButton compact />}
            <AddEventButton />
          </div>
        )}
      </div>
      <p className="mb-5 text-sm text-muted">
        Upcoming US professional and major world sports events. Fully editable — dates marked{" "}
        <span className="text-warn">≈</span> are traditional windows not yet officially locked.
      </p>

      {sports.length > 1 && (
        <div className="mb-6 flex flex-wrap items-center gap-1.5">
          <Link href="/calendar" className={`chip ${!sportFilter ? "bg-wash font-semibold" : ""}`}>
            All sports
          </Link>
          {sports.map((s) => (
            <Link
              key={s.id}
              href={`/calendar?sport=${s.id}`}
              className={`chip ${sportFilter === s.id ? "bg-wash font-semibold" : ""}`}
            >
              {s.name}
              <span className="text-xs text-faint">{s.n}</span>
            </Link>
          ))}
        </div>
      )}

      {events.length === 0 && (
        <div className="rounded-md border border-dashed border-line-strong bg-wash/50 px-6 py-10 text-center text-sm text-muted">
          {sportFilter ? (
            <>No upcoming events for this sport.</>
          ) : canEdit ? (
            <div className="space-y-3">
              <p>The calendar is empty — load the curated US pro + world sports calendar to start.</p>
              <ImportCalendarButton />
            </div>
          ) : (
            <>No upcoming events yet.</>
          )}
        </div>
      )}

      {[...byMonth.entries()].map(([month, monthEvents]) => (
        <section key={month} className="mb-8">
          <h2 className="overline mb-2.5 border-b border-line pb-1.5">{month}</h2>
          <div className="space-y-1.5">
            {monthEvents.map((e) => {
              const ongoing =
                e.startDate <= now && (e.endDate ? e.endDate >= now : e.startDate.toDateString() === now.toDateString());
              return (
                <div key={e.id} className="card flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <div className="w-24 shrink-0 text-sm font-semibold">
                    {dateRange(e.startDate, e.endDate)}
                    {e.approximate && (
                      <span className="ml-1 text-warn" title="Dates approximate — not officially announced yet">≈</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{e.title}</span>
                      {ongoing && (
                        <span className="rounded bg-[#eef2ec] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ok">
                          Live
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted">
                      {[e.league, e.location].filter(Boolean).join(" · ")}
                      {e.notes && <span className="text-faint"> — {e.notes}</span>}
                    </div>
                  </div>
                  {e.sport && (
                    <Link href={`/explore/sport/${e.sport.slug}`} className="chip shrink-0">
                      {e.sport.name}
                    </Link>
                  )}
                  {canEdit && (
                    <EditEventButton
                      event={{
                        id: e.id,
                        title: e.title,
                        league: e.league,
                        sportName: e.sport?.name ?? null,
                        startDate: e.startDate.toISOString().slice(0, 10),
                        endDate: e.endDate?.toISOString().slice(0, 10) ?? null,
                        location: e.location,
                        notes: e.notes,
                        approximate: e.approximate,
                      } satisfies EventVM}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
