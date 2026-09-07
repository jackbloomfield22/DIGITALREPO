// What matters today. Pure scoring over plain rows, so the Today page's
// judgement can be tested without a database and explained in words on the
// page: every item carries the reason it made the list.

import { ACTIVE_STAGES, TIER_CADENCE } from "@/lib/hq/vocab";

export type BriefTask = { id: string; title: string; kind: string; priority: number; dueAt: Date | null; relationshipName?: string | null; pipelineTitle?: string | null; status?: string; waitingSince?: Date | null; nudgeAfterDays?: number | null };
export type BriefNote = { id: string; title: string; kind: string; updatedAt: Date; pinned: boolean };
export type BriefEvent = { id: string; title: string; startsAt: Date; endsAt: Date | null; allDay: boolean; location?: string | null; relationshipName?: string | null; pipelineTitle?: string | null };
export type BriefPipeline = { id: string; title: string; stage: string; heat: number; nextStep: string | null; nextStepDue: Date | null; lastContactAt: Date | null; closedAt: Date | null; contactNames?: string[]; source?: string };
export type BriefRelationship = { id: string; name: string; tier: string; lastContactAt: Date | null; nextTouchAt: Date | null; cadenceDays: number | null; source?: string };
export type BriefIdea = { id: string; title: string; kind: string; status: string; rating: number; lastTouchedAt: Date };

export type FocusItem = { score: number; why: string; kind: "task" | "follow_up" | "event" | "pipeline" | "relationship" | "waiting" | "review" | "debrief"; id: string; title: string; href: string };

export type Brief = {
  focus: FocusItem[];
  eventsToday: BriefEvent[];
  eventsTomorrow: BriefEvent[];
  overdue: BriefTask[];
  dueToday: BriefTask[];
  followUps: BriefTask[];
  pipelineAttention: { item: BriefPipeline; why: string }[];
  goingCold: { item: BriefRelationship; why: string; daysSince: number | null }[];
  resurface: BriefIdea[];
  waiting: { item: BriefTask; days: number; nudge: boolean }[];
  reread: BriefNote | null;
  reviewDue: boolean;
  debriefs: BriefEvent[];
  counts: { openTasks: number; waiting: number; activeCards: number; relationships: number; ideas: number };
};

const DAY = 86_400_000;
const days = (from: Date | null, to: Date) => (from ? Math.floor((to.getTime() - from.getTime()) / DAY) : null);
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function buildBrief(
  input: { tasks: BriefTask[]; events: BriefEvent[]; pipelines: BriefPipeline[]; relationships: BriefRelationship[]; ideas: BriefIdea[]; notes?: BriefNote[]; lastReviewAt?: Date | null; pastEvents?: BriefEvent[] },
  now = new Date(),
): Brief {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + DAY);
  const endTomorrow = new Date(today.getTime() + 2 * DAY);

  const eventsToday = input.events.filter((e) => e.startsAt >= today && e.startsAt < tomorrow).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const eventsTomorrow = input.events.filter((e) => e.startsAt >= tomorrow && e.startsAt < endTomorrow).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const open = input.tasks.filter((t) => t.status !== "waiting");
  // Waiting-for: the ball is in their court, and after a few days it is time to nudge.
  const waiting = input.tasks.filter((t) => t.status === "waiting").map((t) => {
    const days_ = t.waitingSince ? Math.floor((now.getTime() - t.waitingSince.getTime()) / DAY) : 0;
    return { item: t, days: days_, nudge: days_ >= (t.nudgeAfterDays ?? 5) };
  }).sort((a, b) => b.days - a.days);
  const overdue = open.filter((t) => t.dueAt && t.dueAt < today).sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime());
  const dueToday = open.filter((t) => t.dueAt && sameDay(t.dueAt, today) && t.kind !== "follow_up");
  const followUps = open.filter((t) => t.kind === "follow_up" && t.dueAt && t.dueAt < tomorrow).sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime());

  const pipelineAttention: Brief["pipelineAttention"] = [];
  // A seeded row the owner has never touched is not nagged for what nobody
  // has written yet; it earns attention once it has been edited, or when the
  // Repo's own dates say it has gone quiet.
  for (const p of input.pipelines) {
    if (p.closedAt || !ACTIVE_STAGES.includes(p.stage)) continue;
    const untouched = p.source === "seed";
    const since = days(p.lastContactAt, now);
    if (p.nextStepDue && p.nextStepDue < today) pipelineAttention.push({ item: p, why: `next step was due ${-days(p.nextStepDue, today)! === 0 ? "yesterday" : `${days(p.nextStepDue, today)} days ago`}` });
    else if (!p.nextStep && !untouched) pipelineAttention.push({ item: p, why: "no next step written down" });
    else if (since !== null && since > (p.heat === 3 ? 7 : 14)) pipelineAttention.push({ item: p, why: `${p.heat === 3 ? "hot, and " : ""}no contact for ${since} days` });
    else if (since === null && p.heat >= 2 && !untouched) pipelineAttention.push({ item: p, why: "no contact on record" });
  }
  pipelineAttention.sort((a, b) => b.item.heat - a.item.heat);

  const goingCold: Brief["goingCold"] = [];
  for (const r of input.relationships) {
    const since = days(r.lastContactAt, now);
    if (r.nextTouchAt && r.nextTouchAt < tomorrow) { goingCold.push({ item: r, why: r.nextTouchAt < today ? "touch-point missed" : "touch-point today", daysSince: since }); continue; }
    const cadence = r.cadenceDays ?? TIER_CADENCE[r.tier] ?? null;
    if (cadence && since !== null && since > cadence) goingCold.push({ item: r, why: `${since} days since contact, ${r.tier} circle`, daysSince: since });
    else if (cadence && since === null && (r.tier === "inner" || r.tier === "active") && r.source !== "seed") goingCold.push({ item: r, why: `${r.tier} circle with no contact logged`, daysSince: null });
  }
  goingCold.sort((a, b) => (b.daysSince ?? 9999) - (a.daysSince ?? 9999));

  // Three ideas a day, oldest-untouched first, rotated by the date so the same
  // page does not show the same three forever.
  const pool = input.ideas.filter((i) => i.status === "spark" || i.status === "developing").sort((a, b) => a.lastTouchedAt.getTime() - b.lastTouchedAt.getTime());
  const seed = Math.floor(today.getTime() / DAY);
  const resurface = pool.length <= 3 ? pool : [0, 1, 2].map((k) => pool[(seed + k * 7) % pool.length]).filter((v, i, a) => a.indexOf(v) === i);

  // A note worth re-reading: something substantial that has sat untouched, one a day.
  const notePool = (input.notes ?? []).filter((n) => (n.kind === "meeting" || n.kind === "research" || n.kind === "pitch" || n.pinned) && now.getTime() - n.updatedAt.getTime() > 45 * DAY)
    .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
  const reread = notePool.length ? notePool[seed % notePool.length] : null;
  const reviewDue = !input.lastReviewAt || now.getTime() - input.lastReviewAt.getTime() > 7 * DAY;
  // Meetings that happened and were never written up.
  const debriefs = (input.pastEvents ?? []).filter((e) => e.startsAt < now && (e.relationshipName || e.pipelineTitle));

  // The short list at the top: what would hurt most to miss today.
  const focus: FocusItem[] = [];
  for (const w of waiting.filter((w) => w.nudge)) focus.push({ score: 75 + Math.min(15, w.days), why: `waiting ${w.days} days${w.item.relationshipName ? ` on ${w.item.relationshipName}` : ""} — nudge`, kind: "waiting", id: w.item.id, title: w.item.title, href: "/hq#tasks" });
  for (const e of debriefs.slice(0, 2)) focus.push({ score: 78, why: `happened ${e.startsAt.toLocaleDateString(undefined, { weekday: "short" })} — write it up while it's fresh`, kind: "debrief", id: e.id, title: e.title, href: `/hq/prep/${e.id}` });
  if (reviewDue && (input.lastReviewAt || input.pipelines.length + input.relationships.length > 0)) focus.push({ score: 30, why: input.lastReviewAt ? `last review ${Math.floor((now.getTime() - input.lastReviewAt.getTime()) / DAY)} days ago` : "no review yet — ten minutes to see what moved and what stalled", kind: "review", id: "review", title: "Weekly review", href: "/hq/review" });
  for (const t of overdue) focus.push({ score: 90 + (3 - t.priority) * 5 + Math.min(20, days(t.dueAt, today)!), why: `${t.kind === "follow_up" ? "follow-up" : "task"} overdue by ${days(t.dueAt, today)} day${days(t.dueAt, today) === 1 ? "" : "s"}`, kind: t.kind === "follow_up" ? "follow_up" : "task", id: t.id, title: t.title, href: "/hq#tasks" });
  for (const t of followUps.filter((t) => !overdue.includes(t))) focus.push({ score: 80, why: `follow-up due today${t.relationshipName ? ` with ${t.relationshipName}` : ""}`, kind: "follow_up", id: t.id, title: t.title, href: "/hq#tasks" });
  for (const e of eventsToday) if (e.pipelineTitle || e.relationshipName) focus.push({ score: 85, why: `today${e.allDay ? "" : ` at ${e.startsAt.toTimeString().slice(0, 5)}`} — prep${e.pipelineTitle ? ` for ${e.pipelineTitle}` : ""}${e.relationshipName ? ` with ${e.relationshipName}` : ""}`, kind: "event", id: e.id, title: e.title, href: `/hq/prep/${e.id}` });
  for (const e of eventsTomorrow) if (e.pipelineTitle || e.relationshipName) focus.push({ score: 60, why: `tomorrow — prep${e.pipelineTitle ? ` for ${e.pipelineTitle}` : ""}${e.relationshipName ? ` with ${e.relationshipName}` : ""}`, kind: "event", id: e.id, title: e.title, href: `/hq/prep/${e.id}` });
  for (const t of dueToday) focus.push({ score: 70 + (3 - t.priority) * 5, why: "due today", kind: "task", id: t.id, title: t.title, href: "/hq#tasks" });
  for (const p of pipelineAttention.slice(0, 4)) focus.push({ score: 50 + p.item.heat * 8, why: p.why, kind: "pipeline", id: p.item.id, title: p.item.title, href: `/hq/pipeline/${p.item.id}` });
  for (const r of goingCold.slice(0, 3)) focus.push({ score: 40 + (r.item.tier === "inner" ? 15 : r.item.tier === "active" ? 8 : 0), why: r.why, kind: "relationship", id: r.item.id, title: r.item.name, href: `/hq/people/${r.item.id}` });
  focus.sort((a, b) => b.score - a.score);

  return {
    focus: focus.slice(0, 7),
    eventsToday, eventsTomorrow, overdue, dueToday, followUps, pipelineAttention, goingCold, resurface,
    waiting, reread, reviewDue, debriefs,
    counts: {
      openTasks: open.length,
      waiting: waiting.length,
      activeCards: input.pipelines.filter((p) => !p.closedAt && ACTIVE_STAGES.includes(p.stage)).length,
      relationships: input.relationships.length,
      ideas: input.ideas.filter((i) => i.status !== "dead").length,
    },
  };
}
