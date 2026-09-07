import Link from "next/link";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/hq/owner";
import { HqFrame } from "@/components/hq/nav";
import { CloseReview, OverdueTaskActions, StalledCardActions } from "@/components/hq/review";
import { ACTIVE_STAGES, STAGES, TIER_CADENCE, hqLabel } from "@/lib/hq/vocab";

export const metadata = { title: "HQ · Weekly review" };
export const dynamic = "force-dynamic";

// GTD's reflect step: once a week, look at everything with fresh eyes and
// decide — push, park or drop — so nothing rots quietly.

export default async function ReviewPage() {
  const user = await requireOwner();
  const now = new Date();
  const week = new Date(now.getTime() - 7 * 86_400_000);
  const fortnight = new Date(now.getTime() - 14 * 86_400_000);
  const [journal, cards, tasks, rels, ideas, settings] = await Promise.all([
    db.hqActivity.findMany({ where: { ownerId: user.id, at: { gte: week } }, orderBy: { at: "desc" }, take: 200 }),
    db.hqPipeline.findMany({ where: { ownerId: user.id, closedAt: null, stage: { in: ACTIVE_STAGES } }, include: { contacts: { include: { relationship: { select: { id: true } } } } } }),
    db.hqTask.findMany({ where: { ownerId: user.id, status: { in: ["open", "waiting"] } }, include: { relationship: { select: { name: true } } } }),
    db.hqRelationship.findMany({ where: { ownerId: user.id, tier: { in: ["inner", "active"] } }, select: { id: true, name: true, tier: true, lastContactAt: true, cadenceDays: true } }),
    db.hqIdea.findMany({ where: { ownerId: user.id, createdAt: { gte: week } }, select: { id: true, title: true } }),
    db.hqSettings.findUnique({ where: { ownerId: user.id } }),
  ]);
  const touched = new Set(journal.map((j) => `${j.targetType}:${j.targetId}`));
  const recentInteractions = await db.hqInteraction.findMany({ where: { ownerId: user.id, at: { gte: fortnight } }, select: { relationshipId: true } });
  const activeRel = new Set(recentInteractions.map((i) => i.relationshipId));
  const stalled = cards.filter((c) => !touched.has(`pipeline:${c.id}`) && (!c.lastContactAt || c.lastContactAt < fortnight) && !c.contacts.some((x) => activeRel.has(x.relationship.id)) && c.source !== "seed");
  const overdue = tasks.filter((t) => t.status === "open" && t.dueAt && t.dueAt < now).sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime());
  const waiting = tasks.filter((t) => t.status === "waiting");
  const cold = rels.filter((r) => { const c = r.cadenceDays ?? TIER_CADENCE[r.tier]; return c && r.lastContactAt && now.getTime() - r.lastContactAt.getTime() > c * 86_400_000; });
  const byDay = new Map<string, typeof journal>();
  for (const j of journal) { const k = j.at.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }); byDay.set(k, [...(byDay.get(k) ?? []), j]); }
  const counts = { moved: journal.filter((j) => j.kind === "card_moved").length, done: journal.filter((j) => j.kind === "task_done").length, talks: journal.filter((j) => j.kind === "interaction" || j.kind === "debrief").length, notes: journal.filter((j) => j.kind === "note").length };

  return (
    <HqFrame active="/hq/review">
      <div className="mb-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Weekly review</h1>
        <p className="text-sm text-muted">
          {settings?.lastReviewAt ? `Last closed ${settings.lastReviewAt.toLocaleDateString()}. ` : "First one. "}
          This week: {counts.moved} cards moved · {counts.done} tasks done · {counts.talks} conversations · {counts.notes} notes · {ideas.length} ideas.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <section className="card p-4">
            <div className="overline mb-2">Stalled cards — push, park or drop</div>
            {stalled.length === 0 ? <div className="text-sm text-faint">Every card you have touched is moving.</div> : (
              <ul className="divide-y divide-line">
                {stalled.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <span className="min-w-0 flex-1"><Link href={`/hq/pipeline/${c.id}`} className="font-medium hover:text-accent">{c.title}</Link> <span className="text-xs text-faint">{hqLabel(STAGES, c.stage)}{c.nextStep ? "" : " · no next step"}</span></span>
                    <StalledCardActions id={c.id} title={c.title} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card p-4">
            <div className="overline mb-2">Overdue — done, later, or drop</div>
            {overdue.length === 0 ? <div className="text-sm text-faint">Nothing overdue.</div> : (
              <ul className="divide-y divide-line">
                {overdue.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <span className="min-w-0 flex-1">{t.title}{t.relationship && <span className="text-xs text-faint"> · {t.relationship.name}</span>} <span className="text-xs text-[#8a3a30]">{Math.floor((now.getTime() - t.dueAt!.getTime()) / 86_400_000)}d</span></span>
                    <OverdueTaskActions id={t.id} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          {waiting.length > 0 && (
            <section className="card p-4">
              <div className="overline mb-2">Still waiting on</div>
              <ul className="divide-y divide-line text-sm">
                {waiting.map((t) => <li key={t.id} className="py-1.5">{t.title}{t.relationship && <span className="text-xs text-faint"> · {t.relationship.name}</span>}<span className="text-xs text-faint"> · {t.waitingSince ? `${Math.floor((now.getTime() - t.waitingSince.getTime()) / 86_400_000)}d` : ""}</span></li>)}
              </ul>
            </section>
          )}
          {cold.length > 0 && (
            <section className="card p-4">
              <div className="overline mb-2">Slipping out of touch</div>
              <ul className="text-sm">{cold.slice(0, 12).map((r) => <li key={r.id} className="py-1"><Link href={`/hq/people/${r.id}`} className="hover:text-accent">{r.name}</Link> <span className="text-xs text-faint">{hqLabel([], r.tier)} · {Math.floor((now.getTime() - r.lastContactAt!.getTime()) / 86_400_000)}d</span></li>)}</ul>
            </section>
          )}
        </div>
        <div className="space-y-6">
          <section className="card p-4">
            <div className="overline mb-2">What happened this week</div>
            {journal.length === 0 ? <div className="text-sm text-faint">Nothing logged yet. Everything you do in HQ lands here.</div> : (
              <div className="space-y-3">
                {[...byDay.entries()].map(([day, items]) => (
                  <div key={day}>
                    <div className="text-xs font-semibold uppercase tracking-wide text-faint">{day}</div>
                    <ul className="mt-0.5 text-sm">{items.map((j) => <li key={j.id} className="py-0.5"><span className="text-xs text-faint">{j.kind.replace(/_/g, " ")} · </span>{j.summary}</li>)}</ul>
                  </div>
                ))}
              </div>
            )}
          </section>
          <CloseReview />
        </div>
      </div>
    </HqFrame>
  );
}
