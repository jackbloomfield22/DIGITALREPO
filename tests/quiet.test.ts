// The two-month timer on early-stage formats and projects: the clock the
// page shows, and the sweep that moves quiet records to the Archive.

import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { quietClock, onQuietTimer, QUIET_REASON } from "@/lib/quiet-rules";
import { sweepQuietRecords } from "@/lib/quiet";

describe("the quiet timer", () => {
  it("reads the clock from whichever moved last, and knows who is on it", () => {
    const now = new Date("2026-09-08T12:00:00");
    const d = (days: number) => new Date(now.getTime() - days * 86_400_000);
    expect(quietClock({ updatedAt: d(70), lastActivityAt: null }, now)).toEqual({ quietDays: 70, daysLeft: 0 });
    expect(quietClock({ updatedAt: d(70), lastActivityAt: d(10) }, now)).toEqual({ quietDays: 10, daysLeft: 50 });
    expect(onQuietTimer("format", "concept")).toBe(true);
    expect(onQuietTimer("format", "pitched")).toBe(false);
    expect(onQuietTimer("project", "announced")).toBe(true);
    expect(onQuietTimer("project", "airing")).toBe(false);
  });

  it("archives only what has gone quiet at an early stage", async () => {
    const P = "ZZQuiet";
    const old = new Date(Date.now() - 75 * 86_400_000);
    const mk = (title: string, status: string, data: object = {}) => db.format.create({ data: { title: `${P} ${title}`, slug: `zzquiet-${title.toLowerCase().replace(/\s+/g, "-")}`, status, formatType: "docuseries", ...data } });
    const stale = await mk("Stale Concept", "concept");
    await mk("Active Concept", "concept");
    const pitched = await mk("Stale Pitched", "pitched");
    const revived = await mk("Revived Concept", "concept", { lastActivityAt: new Date() });
    // Age the records under the ORM's back: updatedAt is set on every write.
    await db.$executeRaw`UPDATE "Format" SET "updatedAt" = ${old} WHERE id IN (${stale.id}, ${pitched.id}, ${revived.id})`;
    const proj = await db.project.create({ data: { title: `${P} Announced`, slug: "zzquiet-announced", status: "announced" } });
    await db.$executeRaw`UPDATE "Project" SET "updatedAt" = ${old} WHERE id = ${proj.id}`;

    const out = await sweepQuietRecords();
    expect(out.titles).toContain(`${P} Stale Concept`);
    expect(out.titles).toContain(`${P} Announced`);
    expect(out.titles).not.toContain(`${P} Active Concept`);
    expect(out.titles).not.toContain(`${P} Stale Pitched`);
    expect(out.titles).not.toContain(`${P} Revived Concept`);
    expect(await db.format.findUnique({ where: { id: stale.id } })).toMatchObject({ archived: true, archivedReason: QUIET_REASON });
    expect((await db.format.findUnique({ where: { id: pitched.id } }))?.archived).toBe(false);
    // Running again finds nothing.
    expect((await sweepQuietRecords()).titles.filter((t) => t.startsWith(P))).toEqual([]);

    await db.format.deleteMany({ where: { title: { startsWith: P } } });
    await db.project.deleteMany({ where: { title: { startsWith: P } } });
  });
});
