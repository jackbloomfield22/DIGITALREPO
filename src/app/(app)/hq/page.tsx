import Link from "next/link";
import { requireOwner } from "@/lib/hq/owner";
import { loadBrief } from "@/lib/hq/today";
import { db } from "@/lib/db";
import { HqFrame } from "@/components/hq/nav";
import { TaskList, type TaskRow } from "@/components/hq/task-list";
import { hqLabel, plural, STAGES, IDEA_KINDS } from "@/lib/hq/vocab";

export const metadata = { title: "HQ" };
export const dynamic = "force-dynamic";

// Today: what matters, then everything that feeds it. The focus list at the
// top is computed, and every line says why it is there.

const fmtTime = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const KIND_WORD: Record<string, string> = { task: "Task", follow_up: "Follow-up", event: "Event", pipeline: "Card", relationship: "Person" };

export default async function HqTodayPage() {
  const user = await requireOwner();
  const now = new Date();
  const [brief, openTasks, recentNotes, settings] = await Promise.all([
    loadBrief(user.id, now),
    db.hqTask.findMany({
      where: { ownerId: user.id, status: "open" },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { priority: "asc" }, { createdAt: "desc" }],
      take: 40,
      include: { relationship: { select: { id: true, name: true } }, pipeline: { select: { id: true, title: true } } },
    }),
    db.hqNote.findMany({ where: { ownerId: user.id }, orderBy: { updatedAt: "desc" }, take: 5, select: { id: true, title: true, kind: true, updatedAt: true } }),
    db.hqSettings.findUnique({ where: { ownerId: user.id } }),
  ]);
  const empty = brief.counts.openTasks + brief.counts.activeCards + brief.counts.relationships + brief.counts.ideas === 0;
  const rows: TaskRow[] = openTasks.map((t) => ({ ...t, dueAt: t.dueAt?.toISOString() ?? null }));
  const greeting = now.getHours() < 12 ? "Morning" : now.getHours() < 18 ? "Afternoon" : "Evening";

  return (
    <HqFrame active="/hq">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {greeting}, {user.name.split(" ")[0]}.
        </h1>
        <div className="text-sm text-muted">
          {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          {" · "}{brief.counts.openTasks} open · {plural(brief.counts.activeCards, "card")} in play · {brief.counts.relationships} people · {plural(brief.counts.ideas, "idea")}
        </div>
      </div>

      {empty && (
        <div className="card mb-6 p-5">
          <div className="font-display text-lg font-bold">This is your operating system. It is empty until it isn&rsquo;t.</div>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            The fastest start is <Link href="/hq/settings" className="underline hover:text-accent">Settings → Seed from the Repo</Link>: every live format, channel and
            production becomes a pipeline card, and every person and talent becomes a relationship you can start logging against.
            Or just type into the box above — “call Alex tomorrow” is enough.
          </p>
        </div>
      )}

      {brief.focus.length > 0 && (
        <section className="card mb-6 p-4">
          <div className="overline mb-2">What matters today</div>
          <ol className="space-y-1.5">
            {brief.focus.map((f) => (
              <li key={`${f.kind}:${f.id}`} className="flex flex-wrap items-baseline gap-x-2">
                <span className="w-16 shrink-0 text-xs uppercase tracking-wide text-faint">{KIND_WORD[f.kind]}</span>
                <Link href={f.href} className="font-medium hover:text-accent">{f.title}</Link>
                <span className="text-sm text-muted">— {f.why}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section id="tasks" className="card p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <div className="overline">Tasks &amp; follow-ups</div>
              <span className="text-xs text-faint">{brief.overdue.length ? `${brief.overdue.length} overdue · ` : ""}{brief.followUps.length} follow-ups due</span>
            </div>
            <TaskList tasks={rows} allowAdd emptyText="Nothing open. Type into the capture bar, or pull some in from the pipeline." />
          </section>

          <section className="card p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <div className="overline">Pipeline needing attention</div>
              <Link href="/hq/pipeline" className="text-xs text-muted hover:text-accent">Board →</Link>
            </div>
            {brief.pipelineAttention.length === 0 ? (
              <div className="text-sm text-faint">Every open card has a next step and recent contact.</div>
            ) : (
              <ul className="divide-y divide-line">
                {brief.pipelineAttention.slice(0, 8).map(({ item, why }) => (
                  <li key={item.id} className="flex flex-wrap items-baseline gap-x-2 py-1.5 text-sm">
                    <span className={`inline-block h-2 w-2 rounded-full ${item.heat === 3 ? "bg-accent" : item.heat === 2 ? "bg-warn" : "bg-faint"}`} title={`heat ${item.heat}`} />
                    <Link href={`/hq/pipeline/${item.id}`} className="font-medium hover:text-accent">{item.title}</Link>
                    <span className="text-xs text-faint">{hqLabel(STAGES, item.stage)}</span>
                    <span className="text-muted">— {why}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <div className="overline">Going cold</div>
              <Link href="/hq/people?filter=cold" className="text-xs text-muted hover:text-accent">People →</Link>
            </div>
            {brief.goingCold.length === 0 ? (
              <div className="text-sm text-faint">No one in your circles is overdue a touch-point.</div>
            ) : (
              <ul className="divide-y divide-line">
                {brief.goingCold.slice(0, 8).map(({ item, why }) => (
                  <li key={item.id} className="flex flex-wrap items-baseline gap-x-2 py-1.5 text-sm">
                    <Link href={`/hq/people/${item.id}`} className="font-medium hover:text-accent">{item.name}</Link>
                    <span className="text-muted">— {why}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="card p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <div className="overline">Today &amp; tomorrow</div>
              <Link href="/hq/calendar" className="text-xs text-muted hover:text-accent">Calendar →</Link>
            </div>
            {brief.eventsToday.length + brief.eventsTomorrow.length === 0 ? (
              <div className="text-sm text-faint">Nothing on the calendar. {settings ? "" : ""}Add events in Calendar, import an .ics, or connect Google in Settings.</div>
            ) : (
              <div className="space-y-3 text-sm">
                {[{ label: "Today", list: brief.eventsToday }, { label: "Tomorrow", list: brief.eventsTomorrow }].map(({ label, list }) => list.length > 0 && (
                  <div key={label}>
                    <div className="text-xs font-semibold uppercase tracking-wide text-faint">{label}</div>
                    <ul className="mt-1 space-y-1">
                      {list.map((e) => (
                        <li key={e.id} className="flex gap-2">
                          <span className="w-16 shrink-0 text-muted">{e.allDay ? "all day" : fmtTime(e.startsAt)}</span>
                          <span>
                            {e.title}
                            {(e.relationshipName || e.pipelineTitle) && <span className="text-faint"> · {[e.relationshipName, e.pipelineTitle].filter(Boolean).join(" · ")}</span>}
                            {e.location && <span className="block text-xs text-faint">{e.location}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <div className="overline">From the archive</div>
              <Link href="/hq/ideas" className="text-xs text-muted hover:text-accent">Ideas →</Link>
            </div>
            {brief.resurface.length === 0 ? (
              <div className="text-sm text-faint">No ideas saved yet. “idea: …” in the capture bar is all it takes.</div>
            ) : (
              <ul className="space-y-2">
                {brief.resurface.map((i) => (
                  <li key={i.id} className="text-sm">
                    <Link href={`/hq/ideas/${i.id}`} className="font-medium hover:text-accent">{i.title}</Link>
                    <div className="text-xs text-faint">{hqLabel(IDEA_KINDS, i.kind)} · untouched {Math.floor((now.getTime() - i.lastTouchedAt.getTime()) / 86_400_000)}d{i.rating ? ` · ${"★".repeat(i.rating)}` : ""}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <div className="overline">Recent notes</div>
              <Link href="/hq/brain" className="text-xs text-muted hover:text-accent">Brain →</Link>
            </div>
            {recentNotes.length === 0 ? (
              <div className="text-sm text-faint">No notes yet.</div>
            ) : (
              <ul className="space-y-1 text-sm">
                {recentNotes.map((n) => (
                  <li key={n.id}><Link href={`/hq/brain/${n.id}`} className="hover:text-accent">{n.title}</Link> <span className="text-xs text-faint">{n.kind.replace(/_/g, " ")}</span></li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </HqFrame>
  );
}
