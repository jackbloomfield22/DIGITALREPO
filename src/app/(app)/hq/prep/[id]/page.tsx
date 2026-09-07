import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/hq/owner";
import { HqFrame } from "@/components/hq/nav";
import { DebriefForm } from "@/components/hq/debrief";
import { backlinksTo } from "@/lib/hq/network";
import { STAGES, TIERS, hqLabel } from "@/lib/hq/vocab";

export const dynamic = "force-dynamic";

// The prep sheet: everything worth having in your head before you walk in,
// on one page. Afterwards, the same page takes the debrief.

export default async function PrepPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  const { id } = await params;
  const ev = await db.hqEvent.findFirst({
    where: { id, ownerId: user.id },
    include: { relationship: true, pipeline: { include: { contacts: { include: { relationship: true } }, notes_: { orderBy: { updatedAt: "desc" }, take: 3 } } } },
  });
  if (!ev) notFound();

  // People: the linked one, the card's contacts, and attendees matched by name or email.
  const peopleIds = new Set<string>();
  if (ev.relationshipId) peopleIds.add(ev.relationshipId);
  for (const c of ev.pipeline?.contacts ?? []) peopleIds.add(c.relationshipId);
  if (ev.attendees.length) {
    const emails = ev.attendees.map((a) => a.match(/<([^>]+)>/)?.[1] ?? (a.includes("@") ? a : null)).filter((x): x is string => !!x);
    const names = ev.attendees.map((a) => a.replace(/<[^>]+>/, "").trim()).filter((n) => n && !n.includes("@"));
    const matched = await db.hqRelationship.findMany({ where: { ownerId: user.id, OR: [...(emails.length ? [{ email: { in: emails, mode: "insensitive" as const } }] : []), ...names.map((n) => ({ name: { equals: n, mode: "insensitive" as const } }))] }, select: { id: true } });
    for (const m of matched) peopleIds.add(m.id);
  }
  const people = peopleIds.size
    ? await db.hqRelationship.findMany({
        where: { id: { in: [...peopleIds] } },
        include: { interactions: { orderBy: { at: "desc" }, take: 5 }, tasks: { where: { status: { in: ["open", "waiting"] } }, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }] } },
      })
    : [];
  const past = ev.startsAt < new Date();
  const mentions = ev.pipelineId ? await backlinksTo(user.id, { targetType: "pipeline", targetId: ev.pipelineId }, 6) : [];

  return (
    <HqFrame active="/hq/calendar">
      <div className="mb-3 text-xs text-muted"><Link href="/hq" className="hover:text-accent">← Today</Link></div>
      <div className="mb-4">
        <div className="overline">{past ? "Debrief" : "Prep"}</div>
        <h1 className="font-display text-2xl font-bold tracking-tight">{ev.title}</h1>
        <p className="text-sm text-muted">
          {ev.startsAt.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}{ev.allDay ? "" : ` · ${ev.startsAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`}{ev.location ? ` · ${ev.location}` : ""}
          {ev.attendees.length > 0 && <span className="block text-xs text-faint">With: {ev.attendees.join(", ")}</span>}
        </p>
      </div>

      {past && !ev.debriefedAt && <div className="mb-6"><DebriefForm eventId={ev.id} people={people.map((p) => ({ id: p.id, name: p.name }))} hasCard={!!ev.pipelineId} /></div>}
      {ev.debriefedAt && <div className="mb-6 rounded bg-wash px-3 py-2 text-sm text-muted">Written up on {ev.debriefedAt.toLocaleDateString()}.</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        {people.map((p) => (
          <section key={p.id} className="card p-4">
            <div className="mb-1 flex items-baseline justify-between">
              <Link href={`/hq/people/${p.id}`} className="font-display text-lg font-bold hover:text-accent">{p.name}</Link>
              <span className="text-xs text-faint">{hqLabel(TIERS, p.tier)}{p.lastContactAt ? ` · last contact ${p.lastContactAt.toLocaleDateString()}` : " · no contact logged"}</span>
            </div>
            {p.interests.length > 0 && <div className="mb-1 text-sm"><span className="text-faint">Interests: </span>{p.interests.join(", ")}</div>}
            {p.howWeMet && <div className="mb-1 text-sm"><span className="text-faint">How we met: </span>{p.howWeMet}</div>}
            {p.opportunities && <div className="mb-1 text-sm"><span className="text-faint">Opportunities: </span>{p.opportunities}</div>}
            {p.tasks.length > 0 && (
              <div className="mt-2 text-sm">
                <div className="overline">Open with them</div>
                <ul className="mt-1">{p.tasks.map((t) => <li key={t.id}>{t.status === "waiting" ? "⏳ " : "• "}{t.title}</li>)}</ul>
              </div>
            )}
            {p.interactions.length > 0 && (
              <div className="mt-2 text-sm">
                <div className="overline">Last conversations</div>
                <ul className="mt-1 space-y-1">{p.interactions.map((i) => <li key={i.id}><span className="text-xs text-faint">{i.at.toLocaleDateString()} · {i.kind} — </span>{i.summary.slice(0, 220)}</li>)}</ul>
              </div>
            )}
            {p.notes && <div className="mt-2 whitespace-pre-wrap text-sm text-muted">{p.notes.slice(0, 600)}</div>}
          </section>
        ))}

        {ev.pipeline && (
          <section className="card p-4">
            <div className="mb-1 flex items-baseline justify-between">
              <Link href={`/hq/pipeline/${ev.pipeline.id}`} className="font-display text-lg font-bold hover:text-accent">{ev.pipeline.title}</Link>
              <span className="text-xs text-faint">{hqLabel(STAGES, ev.pipeline.stage)} · heat {ev.pipeline.heat}</span>
            </div>
            {ev.pipeline.whyItMatters && <p className="text-sm">{ev.pipeline.whyItMatters}</p>}
            {ev.pipeline.nextStep && <p className="mt-1 text-sm"><span className="text-faint">Next step: </span>{ev.pipeline.nextStep}{ev.pipeline.nextStepDue ? ` (${ev.pipeline.nextStepDue.toLocaleDateString()})` : ""}</p>}
            {ev.pipeline.contacts.length > 0 && <p className="mt-1 text-sm"><span className="text-faint">People: </span>{ev.pipeline.contacts.map((c) => `${c.relationship.name} (${c.role.replace(/_/g, " ")})`).join(", ")}</p>}
            {ev.pipeline.notes && <div className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-wash p-2 text-xs">{ev.pipeline.notes.slice(-1500)}</div>}
            {ev.pipeline.notes_.length > 0 && <ul className="mt-2 text-sm">{ev.pipeline.notes_.map((n) => <li key={n.id}><Link href={`/hq/brain/${n.id}`} className="hover:text-accent">{n.title}</Link></li>)}</ul>}
            {mentions.length > 0 && (
              <div className="mt-2 text-xs text-muted">Also comes up in: {mentions.map((m) => <Link key={`${m.sourceType}:${m.sourceId}`} href={m.href} className="mr-2 underline hover:text-accent">{m.title}</Link>)}</div>
            )}
          </section>
        )}
        {people.length === 0 && !ev.pipeline && <div className="card p-4 text-sm text-muted">This event is not linked to anyone or any card yet. Link it from the Calendar to get a real prep sheet.</div>}
      </div>
      {ev.notes && <div className="mt-6 whitespace-pre-wrap rounded bg-wash p-3 text-sm">{ev.notes}</div>}
    </HqFrame>
  );
}
