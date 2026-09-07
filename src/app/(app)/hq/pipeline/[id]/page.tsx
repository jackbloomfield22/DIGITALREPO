import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/hq/owner";
import { HqFrame } from "@/components/hq/nav";
import { PipelineCardEditor, type CardDetail } from "@/components/hq/pipeline-card";
import { TaskList, type TaskRow } from "@/components/hq/task-list";
import { NoteList } from "@/components/hq/note-list";
import { repoPath } from "@/lib/hq/vocab";
import { Connections } from "@/components/hq/connections";
import { cardMomentum } from "@/lib/hq/strength";

export const dynamic = "force-dynamic";

async function repoSlug(targetType: string | null, targetId: string | null): Promise<string | null> {
  if (!targetType || !targetId) return null;
  const model: Record<string, string> = { format: "format", project: "project", channel: "channel", opportunity: "opportunity" };
  if (!model[targetType]) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (db as any)[model[targetType]].findUnique({ where: { id: targetId }, select: { slug: true } });
  return row?.slug ?? null;
}

export default async function PipelineCardPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  const { id } = await params;
  const card = await db.hqPipeline.findFirst({
    where: { id, ownerId: user.id },
    include: {
      contacts: { include: { relationship: { select: { id: true, name: true, tier: true, lastContactAt: true } } } },
      tasks: { where: { status: { in: ["open", "waiting"] } }, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }], include: { relationship: { select: { id: true, name: true } }, pipeline: { select: { id: true, title: true } } } },
      notes_: { orderBy: { updatedAt: "desc" }, take: 20 },
      events: { where: { startsAt: { gte: new Date(new Date().getTime() - 86_400_000) } }, orderBy: { startsAt: "asc" }, take: 5 },
    },
  });
  if (!card) notFound();
  const slug = await repoSlug(card.targetType, card.targetId);
  const vm: CardDetail = {
    id: card.id, title: card.title, stage: card.stage, heat: card.heat, whyItMatters: card.whyItMatters, nextStep: card.nextStep,
    nextStepDue: card.nextStepDue?.toISOString() ?? null, lastContactAt: card.lastContactAt?.toISOString() ?? null, notes: card.notes,
    targetType: card.targetType, repoHref: repoPath(card.targetType, slug),
    contacts: card.contacts.map((c) => ({ relationshipId: c.relationshipId, name: c.relationship.name, role: c.role, note: c.note, tier: c.relationship.tier, lastContactAt: c.relationship.lastContactAt?.toISOString() ?? null })),
  };
  const tasks: TaskRow[] = card.tasks.map((t) => ({ ...t, dueAt: t.dueAt?.toISOString() ?? null, waitingSince: t.waitingSince?.toISOString() ?? null }));
  // The card's people, and everything said to them lately: the conversation around this project.
  const recent = card.contacts.length
    ? await db.hqInteraction.findMany({ where: { ownerId: user.id, relationshipId: { in: card.contacts.map((c) => c.relationshipId) } }, orderBy: { at: "desc" }, take: 8, include: { relationship: { select: { id: true, name: true } } } })
    : [];

  const activity30 = recent.filter((i) => i.at > new Date(new Date().getTime() - 30 * 86_400_000)).length + (await db.hqActivity.count({ where: { ownerId: user.id, targetType: "pipeline", targetId: card.id, at: { gte: new Date(new Date().getTime() - 30 * 86_400_000) } } }));
  const momentum = cardMomentum({ heat: card.heat, stage: card.stage, nextStep: card.nextStep, nextStepDue: card.nextStepDue, lastContactAt: card.lastContactAt, updatedAt: card.updatedAt, activity30 });
  return (
    <HqFrame active="/hq/pipeline">
      <div className="mb-3 flex items-baseline justify-between text-xs text-muted">
        <Link href="/hq/pipeline" className="hover:text-accent">← Pipeline</Link>
        <span>Momentum <span className={`font-semibold ${momentum.label === "moving" ? "text-ok" : momentum.label === "stalled" ? "text-[#8a3a30]" : "text-charcoal"}`}>{momentum.label}</span> · {momentum.score}/100 · {momentum.why}</span>
      </div>
      <PipelineCardEditor card={vm} />
      <div className="mt-6"><Connections ownerId={user.id} target={{ targetType: "pipeline", targetId: card.id }} source={{ type: "pipeline", id: card.id }} /></div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card p-4">
          <div className="overline mb-2">Tasks on this</div>
          <TaskList tasks={tasks} allowAdd defaults={{ pipelineId: card.id }} emptyText="No open tasks." />
        </section>
        <section className="card p-4">
          <div className="overline mb-2">Notes on this</div>
          <NoteList notes={card.notes_.map((n) => ({ id: n.id, title: n.title, kind: n.kind, updatedAt: n.updatedAt.toISOString() }))} newDefaults={{ pipelineId: card.id, title: `${card.title} — notes` }} />
        </section>
        <section className="card p-4">
          <div className="overline mb-2">Recent conversations</div>
          {card.events.length > 0 && (
            <ul className="mb-2 text-sm">
              {card.events.map((e) => <li key={e.id} className="text-charcoal">{e.startsAt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}{e.allDay ? "" : ` ${e.startsAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`} · {e.title}</li>)}
            </ul>
          )}
          {recent.length === 0 ? <div className="text-sm text-faint">Nothing logged with these people yet.</div> : (
            <ul className="divide-y divide-line text-sm">
              {recent.map((i) => (
                <li key={i.id} className="py-1.5">
                  <span className="text-xs text-faint">{i.at.toLocaleDateString()} · {i.kind} · </span>
                  <Link href={`/hq/people/${i.relationship.id}`} className="font-medium hover:text-accent">{i.relationship.name}</Link>
                  <div className="text-charcoal">{i.summary.slice(0, 200)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </HqFrame>
  );
}
