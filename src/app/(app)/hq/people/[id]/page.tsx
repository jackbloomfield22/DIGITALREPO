import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/hq/owner";
import { HqFrame } from "@/components/hq/nav";
import { InteractionLog, RelationshipEditor } from "@/components/hq/relationship";
import { TaskList, type TaskRow } from "@/components/hq/task-list";
import { NoteList } from "@/components/hq/note-list";
import { STAGES, hqLabel, repoPath } from "@/lib/hq/vocab";
import { Connections } from "@/components/hq/connections";
import { relationshipStrength } from "@/lib/hq/strength";
import { labelFor } from "@/lib/taxonomy";

export const dynamic = "force-dynamic";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  const { id } = await params;
  const rel = await db.hqRelationship.findFirst({
    where: { id, ownerId: user.id },
    include: {
      interactions: { orderBy: { at: "desc" }, take: 60 },
      tasks: { where: { status: { in: ["open", "waiting"] } }, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }], include: { relationship: { select: { id: true, name: true } }, pipeline: { select: { id: true, title: true } } } },
      notes_: { orderBy: { updatedAt: "desc" }, take: 20 },
      pipelines: { include: { pipeline: { select: { id: true, title: true, stage: true, heat: true } } } },
      events: { where: { startsAt: { gte: new Date(new Date().getTime() - 86_400_000) } }, orderBy: { startsAt: "asc" }, take: 5 },
    },
  });
  if (!rel) notFound();

  // The shared record behind this person, read-only here.
  const repo = rel.personType === "person"
    ? await db.industryPerson.findUnique({ where: { id: rel.personId }, include: { organizations: { include: { organization: { select: { name: true, slug: true } } } }, creators: { include: { creator: { select: { name: true, slug: true } } } } } })
    : null;
  const talent = rel.personType === "creator"
    ? await db.creator.findUnique({ where: { id: rel.personId }, include: { people: { include: { person: { select: { name: true, slug: true } } } }, socialProfiles: true } })
    : null;
  const href = repoPath(rel.personType, repo?.slug ?? talent?.slug ?? null);
  const tasks: TaskRow[] = rel.tasks.map((t) => ({ ...t, dueAt: t.dueAt?.toISOString() ?? null, waitingSince: t.waitingSince?.toISOString() ?? null }));
  const mentionCount = await db.hqMention.count({ where: { ownerId: user.id, targetType: "relationship", targetId: rel.id } });
  const strength = relationshipStrength({ tier: rel.tier, lastContactAt: rel.lastContactAt, interactionDates: rel.interactions.map((i) => i.at), cardsTogether: rel.pipelines.length, mentions: mentionCount });

  return (
    <HqFrame active="/hq/people">
      <div className="mb-3 text-xs text-muted"><Link href="/hq/people" className="hover:text-accent">← People</Link></div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{rel.name}</h1>
          <p className="text-sm text-muted">
            {repo ? [repo.title, repo.roleType ? labelFor(repo.roleType) : null, repo.organizations.map((o) => o.organization.name).join(", ") || null].filter(Boolean).join(" · ") : null}
            {talent ? [talent.headline, talent.people.length ? `repped by ${talent.people.map((p) => p.person.name).join(", ")}` : null].filter(Boolean).join(" · ") : null}
            {href && <> · <Link href={href} className="underline hover:text-accent">Repo page →</Link></>}
          </p>
        </div>
        <div className="text-right text-xs text-faint">
          <div><span className={`font-semibold ${strength.label === "strong" ? "text-ok" : strength.label === "fading" || strength.label === "dormant" ? "text-[#8a3a30]" : "text-charcoal"}`}>{strength.label}</span> · {strength.score}/100</div>
          <div>{strength.why}</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card p-4">
            <div className="overline mb-2">Conversations</div>
            <InteractionLog relationshipId={rel.id} name={rel.name.split(" ")[0]} interactions={rel.interactions.map((i) => ({ id: i.id, at: i.at.toISOString(), kind: i.kind, summary: i.summary, source: i.source }))} />
          </section>
          <div className="grid gap-6 md:grid-cols-2">
            <section className="card p-4">
              <div className="overline mb-2">Follow-ups &amp; tasks</div>
              <TaskList tasks={tasks} allowAdd defaults={{ relationshipId: rel.id, kind: "follow_up" }} emptyText="Nothing open with them." />
            </section>
            <section className="card p-4">
              <div className="overline mb-2">Notes about them</div>
              <NoteList notes={rel.notes_.map((n) => ({ id: n.id, title: n.title, kind: n.kind, updatedAt: n.updatedAt.toISOString() }))} newDefaults={{ relationshipId: rel.id, title: `${rel.name} — notes`, kind: "meeting" }} />
            </section>
          </div>
          <Connections ownerId={user.id} target={{ targetType: "relationship", targetId: rel.id }} source={{ type: "relationship", id: rel.id }} />
          {(rel.pipelines.length > 0 || rel.events.length > 0) && (
            <section className="card p-4">
              <div className="overline mb-2">In play together</div>
              <ul className="text-sm">
                {rel.pipelines.map((p) => (
                  <li key={p.pipeline.id} className="py-1"><Link href={`/hq/pipeline/${p.pipeline.id}`} className="font-medium hover:text-accent">{p.pipeline.title}</Link> <span className="text-xs text-faint">{hqLabel(STAGES, p.pipeline.stage)} · as {p.role.replace(/_/g, " ")}</span></li>
                ))}
                {rel.events.map((e) => <li key={e.id} className="py-1 text-muted">{e.startsAt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · {e.title}</li>)}
              </ul>
            </section>
          )}
        </div>
        <RelationshipEditor rel={{ id: rel.id, name: rel.name, tier: rel.tier, interests: rel.interests, howWeMet: rel.howWeMet, notes: rel.notes, opportunities: rel.opportunities, email: rel.email, lastContactAt: rel.lastContactAt?.toISOString() ?? null, nextTouchAt: rel.nextTouchAt?.toISOString() ?? null, cadenceDays: rel.cadenceDays }} />
      </div>
    </HqFrame>
  );
}
