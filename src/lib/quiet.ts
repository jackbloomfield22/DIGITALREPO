// The two-month timer. A format still at the idea, concept or developing
// stage, or a project still only announced, that nobody has touched for
// sixty days moves to the Archive on its own — so the live lists show what
// is actually moving. "Touched" means the record itself was edited or its
// last-activity date was moved; the reason it was archived is written on it,
// and the Archive brings it back with one click if it comes around again.

import "server-only";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { QUIET_DAYS, QUIET_FORMAT_STATUSES, QUIET_PROJECT_STATUSES, QUIET_REASON } from "@/lib/quiet-rules";

export type QuietSweep = { formats: number; projects: number; titles: string[] };

let lastSweep = 0;
const SWEEP_EVERY = 10 * 60_000;

/** Archive everything whose timer has run out. Safe to call often; cheap when there is nothing to do. */
export async function sweepQuietRecords(): Promise<QuietSweep> {
  const cutoff = new Date(Date.now() - QUIET_DAYS * 86_400_000);
  const stale = { updatedAt: { lt: cutoff }, OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: cutoff } }] };
  const [formats, projects] = await Promise.all([
    db.format.findMany({ where: { archived: false, status: { in: [...QUIET_FORMAT_STATUSES] }, ...stale }, select: { id: true, title: true } }),
    db.project.findMany({ where: { archived: false, status: { in: [...QUIET_PROJECT_STATUSES] }, ...stale }, select: { id: true, title: true } }),
  ]);
  const now = new Date();
  if (formats.length) await db.format.updateMany({ where: { id: { in: formats.map((f) => f.id) } }, data: { archived: true, archivedReason: QUIET_REASON, archivedAt: now } });
  if (projects.length) await db.project.updateMany({ where: { id: { in: projects.map((p) => p.id) } }, data: { archived: true, archivedReason: QUIET_REASON, archivedAt: now } });
  for (const f of formats) await logAudit(null, { targetType: "format", targetId: f.id, targetLabel: f.title, action: "archived", field: "quiet timer", newValue: QUIET_REASON });
  for (const p of projects) await logAudit(null, { targetType: "project", targetId: p.id, targetLabel: p.title, action: "archived", field: "quiet timer", newValue: QUIET_REASON });
  return { formats: formats.length, projects: projects.length, titles: [...formats, ...projects].map((r) => r.title) };
}

/** The directory pages call this on load, so the timer works even without the daily job; it runs at most every ten minutes per server. */
export async function sweepQuietRecordsThrottled(): Promise<void> {
  if (Date.now() - lastSweep < SWEEP_EVERY) return;
  lastSweep = Date.now();
  await sweepQuietRecords().catch((e) => console.error("Quiet sweep failed:", e));
}
