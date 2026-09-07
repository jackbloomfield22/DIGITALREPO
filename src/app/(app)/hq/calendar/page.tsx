import Link from "next/link";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/hq/owner";
import { HqFrame } from "@/components/hq/nav";
import { AddEvent, EventList, IcsImport, WeekStrip, type EventVM } from "@/components/hq/calendar";
import { googleConfigured } from "@/lib/hq/google";

export const metadata = { title: "HQ · Calendar" };
export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const user = await requireOwner();
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 21 * 86_400_000);
  const [events, conn] = await Promise.all([
    db.hqEvent.findMany({ where: { ownerId: user.id, startsAt: { gte: start, lt: end } }, orderBy: { startsAt: "asc" }, include: { relationship: { select: { id: true, name: true } }, pipeline: { select: { id: true, title: true } } } }),
    db.hqConnection.findUnique({ where: { ownerId_provider: { ownerId: user.id, provider: "google" } } }),
  ]);
  const vm: EventVM[] = events.map((e) => ({ id: e.id, title: e.title, startsAt: e.startsAt.toISOString(), endsAt: e.endsAt?.toISOString() ?? null, allDay: e.allDay, location: e.location, source: e.source, relationship: e.relationship, pipeline: e.pipeline, attendees: e.attendees }));
  const days = [...Array(7)].map((_, i) => new Date(start.getTime() + i * 86_400_000).toISOString());
  const connected = conn?.status === "connected";

  return (
    <HqFrame active="/hq/calendar">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Calendar</h1>
          <p className="text-sm text-muted">
            {connected ? `Synced with Google (${conn?.accountEmail ?? "connected"})${conn?.lastSyncAt ? `, last ${conn.lastSyncAt.toLocaleString()}` : ""}.` : googleConfigured() ? <>Google is ready to connect in <Link href="/hq/settings" className="underline hover:text-accent">Settings</Link>.</> : <>Your own calendar for now; Google sync switches on from <Link href="/hq/settings" className="underline hover:text-accent">Settings</Link> once credentials are in.</>}
          </p>
        </div>
      </div>
      <div className="mb-5"><WeekStrip days={days} events={vm} /></div>
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section className="card p-4">
          <div className="overline mb-2">Next three weeks</div>
          <EventList events={vm} />
        </section>
        <div className="space-y-4">
          <section className="card p-4"><div className="overline mb-2">Add an event</div><AddEvent /></section>
          <section className="card p-4"><div className="overline mb-2">Import</div><IcsImport /></section>
        </div>
      </div>
    </HqFrame>
  );
}
