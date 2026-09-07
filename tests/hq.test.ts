// HQ: the owner's private operating system. The judgement lives in pure
// modules — reading a captured line, scoring the day, reading a question,
// parsing a calendar file, matching mail to people — so it is tested here
// without a browser; the database parts round-trip seeding and search.

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { slugify } from "@/lib/slug";
import { capture, readDate } from "@/lib/hq/capture";
import { buildBrief } from "@/lib/hq/brief";
import { parseIcs } from "@/lib/hq/ics";
import { mapGoogleEvent, matchMessage } from "@/lib/hq/google";
import { readQuestion, searchBrain } from "@/lib/hq/search";
import { seedFromRepo, importBrainBundle, parseBrainBundle } from "@/lib/hq/seed";
import { refreshDigest } from "@/lib/ingest/digest";
import { PRIVATE_TABLES, TABLE_ORDER, buildBackup } from "@/lib/backup";

const db = new PrismaClient();
const P = "ZZHq";
const OWNER = "u-hq-owner-test";
const NOW = new Date("2026-09-08T09:00:00"); // a Tuesday

async function cleanup() {
  await db.hqPipelineContact.deleteMany({ where: { pipeline: { ownerId: OWNER } } });
  for (const t of ["hqInteraction", "hqTask", "hqEvent", "hqNote", "hqIdea", "hqPipeline", "hqRelationship", "hqStyleExample", "hqAiUsage", "hqConnection"]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any)[t].deleteMany({ where: { ownerId: OWNER } });
  }
  await db.hqSettings.deleteMany({ where: { ownerId: OWNER } });
  await db.format.deleteMany({ where: { title: { startsWith: P } } });
  await db.creator.deleteMany({ where: { name: { startsWith: P } } });
  await db.industryPerson.deleteMany({ where: { name: { startsWith: P } } });
  await db.knowledgeDigest.deleteMany({ where: { name: { startsWith: P } } });
}

beforeAll(async () => {
  await db.user.upsert({ where: { id: OWNER }, update: {}, create: { id: OWNER, email: "zz-hq@example.test", name: "HQ Owner", role: "ADMIN", passwordHash: "x" } });
  await cleanup(); // leftovers from an interrupted run
});
afterAll(async () => {
  await cleanup();
  await db.user.deleteMany({ where: { id: OWNER } });
  await db.$disconnect();
});

describe("the capture bar reads a line", () => {
  it("files a reach-out as a follow-up with the person and the day", () => {
    const c = capture("call Alex Chen tomorrow about the deck", NOW);
    expect(c.kind).toBe("follow_up");
    expect(c.personName).toBe("Alex Chen");
    expect(c.dueAt?.toDateString()).toBe(new Date("2026-09-09T00:00:00").toDateString());
    expect(c.title).toMatch(/^Call Alex Chen about the deck$/);
  });
  it("files an idea by prefix and keeps the body", () => {
    const c = capture("idea: a prank format built around retired QBs\n\nThey have time, egos, and nothing to lose.", NOW);
    expect(c.kind).toBe("idea");
    expect(c.title).toBe("A prank format built around retired QBs");
    expect(c.body).toContain("nothing to lose");
  });
  it("files a meal with a time as an event, and reads #card and @person", () => {
    const c = capture("lunch w/ Sam Rivers thu 1pm #open-water", NOW);
    expect(c.kind).toBe("event");
    expect(c.personName).toBe("Sam Rivers");
    expect(c.pipelineRef).toBe("open-water");
    expect(c.startsAt?.getDay()).toBe(4);
    expect(c.startsAt?.getHours()).toBe(13);
    const d = capture("email @Dana Whitfield next week re Grit City", NOW);
    expect(d.personName).toBe("Dana Whitfield");
    expect(d.kind).toBe("follow_up");
    expect(d.dueAt?.getDay()).toBe(1);
  });
  it("reads the common date phrases", () => {
    expect(readDate("do it friday", NOW)?.at.getDay()).toBe(5);
    expect(readDate("in 3 days", NOW)?.at.getDate()).toBe(11);
    expect(readDate("by sep 30", NOW)?.at.getMonth()).toBe(8);
    expect(readDate("on 10/2", NOW)?.at.getMonth()).toBe(9);
    expect(readDate("at 3", NOW)).toBeNull();
    expect(readDate("tonight", NOW)?.hasTime).toBe(true);
    expect(readDate("tomorrow at 10:30am", NOW)?.at.getHours()).toBe(10);
  });
  it("leaves a plain line as a task and explains itself", () => {
    const c = capture("Send the sizzle to the Fox team", NOW);
    expect(c.kind).toBe("task");
    expect(c.dueAt).toBeUndefined();
    expect(Array.isArray(c.reading)).toBe(true);
  });
});

describe("what matters today", () => {
  it("ranks overdue follow-ups, today's prep, stale hot cards and cold inner circle", () => {
    const d = (days: number) => new Date(NOW.getTime() + days * 86_400_000);
    const brief = buildBrief({
      tasks: [
        { id: "t1", title: "Chase Dana", kind: "follow_up", priority: 2, dueAt: d(-3), relationshipName: "Dana" },
        { id: "t2", title: "Send deck", kind: "task", priority: 1, dueAt: d(0) },
        { id: "t3", title: "Someday", kind: "task", priority: 3, dueAt: null },
      ],
      events: [{ id: "e1", title: "Netflix pitch", startsAt: new Date("2026-09-08T14:00:00"), endsAt: null, allDay: false, pipelineTitle: "Grit City" }],
      pipelines: [
        { id: "p1", title: "Grit City", stage: "buyer_conversations", heat: 3, nextStep: "Send the sizzle", nextStepDue: d(-1), lastContactAt: d(-2), closedAt: null },
        { id: "p2", title: "Quiet one", stage: "developing", heat: 2, nextStep: null, nextStepDue: null, lastContactAt: d(-40), closedAt: null },
        { id: "p3", title: "Done", stage: "sold", heat: 3, nextStep: null, nextStepDue: null, lastContactAt: null, closedAt: null },
      ],
      relationships: [
        { id: "r1", name: "Alex", tier: "inner", lastContactAt: d(-20), nextTouchAt: null, cadenceDays: null },
        { id: "r2", name: "Sam", tier: "warm", lastContactAt: d(-20), nextTouchAt: null, cadenceDays: null },
      ],
      ideas: [{ id: "i1", title: "Old spark", kind: "idea", status: "spark", rating: 3, lastTouchedAt: d(-90) }],
    }, NOW);
    expect(brief.overdue.map((t) => t.id)).toEqual(["t1"]);
    expect(brief.dueToday.map((t) => t.id)).toEqual(["t2"]);
    expect(brief.pipelineAttention.map((p) => p.item.id)).toEqual(["p1", "p2"]);
    expect(brief.pipelineAttention[0].why).toContain("next step was due");
    expect(brief.pipelineAttention[1].why).toContain("no next step");
    expect(brief.goingCold.map((g) => g.item.id)).toEqual(["r1"]);
    expect(brief.resurface.map((i) => i.id)).toEqual(["i1"]);
    expect(brief.focus[0].id).toBe("t1");
    expect(brief.focus.map((f) => f.kind)).toContain("event");
    expect(brief.counts.activeCards).toBe(2);
  });
});

describe("reading a question", () => {
  it("keeps the search words and notes the kind of answer wanted", () => {
    const q = readQuestion("What athletes have we discussed for prank formats?");
    expect(q.terms).toBe("prank");
    expect(q.hints).toEqual(expect.arrayContaining(["creator", "format"]));
    expect(readQuestion("Who were the filmmakers we liked for Point Guard?")).toMatchObject({ terms: "point guard", hints: ["person"] });
  });
});

describe("calendar files and Google mapping", () => {
  it("reads an .ics export with folded lines, all-day and timed events", () => {
    const ics = [
      "BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:abc@x", "DTSTART;TZID=America/Los_Angeles:20260910T130000", "DTEND;TZID=America/Los_Angeles:20260910T140000",
      "SUMMARY:Lunch with Sam ", " Rivers", "LOCATION:Sunset Tower", "ATTENDEE;CN=\"Sam Rivers\":mailto:sam@example.com", "END:VEVENT",
      "BEGIN:VEVENT", "UID:def@x", "DTSTART;VALUE=DATE:20260912", "DTEND;VALUE=DATE:20260913", "SUMMARY:Travel day", "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    const ev = parseIcs(ics);
    expect(ev).toHaveLength(2);
    expect(ev[0]).toMatchObject({ uid: "abc@x", title: "Lunch with Sam Rivers", allDay: false, location: "Sunset Tower", attendees: ["Sam Rivers <sam@example.com>"] });
    expect(ev[0].startsAt.getHours()).toBe(13);
    expect(ev[1]).toMatchObject({ title: "Travel day", allDay: true });
  });
  it("maps a Google event and drops cancelled ones", () => {
    expect(mapGoogleEvent({ id: "g1", status: "cancelled" })).toBeNull();
    const m = mapGoogleEvent({ id: "g2", summary: "Pitch", start: { dateTime: "2026-09-10T10:00:00-07:00" }, end: { dateTime: "2026-09-10T11:00:00-07:00" }, attendees: [{ email: "me@x.com", self: true }, { email: "dana@n.com", displayName: "Dana" }] });
    expect(m).toMatchObject({ externalId: "g2", title: "Pitch", allDay: false, attendees: ["Dana <dana@n.com>"] });
    expect(mapGoogleEvent({ id: "g3", summary: "Off", start: { date: "2026-09-12" } })?.allDay).toBe(true);
  });
  it("matches mail to a person by any address on it, ignoring your own", () => {
    const byEmail = new Map([["dana@n.com", "rel-dana"]]);
    const hit = matchMessage({ from: "Jack <jack@44forty.com>", to: "Dana Whitfield <dana@n.com>", subject: "Grit City deck", date: "Tue, 8 Sep 2026 10:00:00 -0700" }, byEmail, "jack@44forty.com");
    expect(hit).toMatchObject({ relationshipId: "rel-dana", summary: "Sent: Grit City deck" });
    expect(matchMessage({ from: "noreply@shop.com", to: "jack@44forty.com", subject: "Sale" }, byEmail, "jack@44forty.com")).toBeNull();
  });
});

describe("seeding and searching the brain", () => {
  it("seeds cards and people from the Repo, only once, and search answers with talent attached", async () => {
    const creator = await db.creator.create({ data: { name: `${P} Star`, slug: slugify(`${P} star`), status: "active" } });
    const person = await db.industryPerson.create({ data: { name: `${P} Agent`, slug: slugify(`${P} agent`), roleType: "agent", email: "agent@example.test" } });
    const format = await db.format.create({ data: { title: `${P} Prank Kings`, slug: slugify(`${P} prank kings`), status: "pitched", formatType: "docuseries", logline: "Retired quarterbacks run pranks on rookies.", ownerId: OWNER, creators: { create: { creatorId: creator.id, isPrimary: true } } } });
    await refreshDigest("format", format.id);
    await refreshDigest("creator", creator.id);

    const first = await seedFromRepo(OWNER);
    expect(first.pipelines).toBeGreaterThanOrEqual(1);
    expect(first.relationships).toBeGreaterThanOrEqual(2);
    const card = await db.hqPipeline.findFirst({ where: { ownerId: OWNER, targetType: "format", targetId: format.id }, include: { contacts: { include: { relationship: true } } } });
    expect(card).toMatchObject({ stage: "buyer_conversations", heat: 3, whyItMatters: format.logline, source: "seed" });
    expect(card!.contacts.map((c) => [c.relationship.name, c.role])).toEqual([[`${P} Star`, "talent"]]);
    const agent = await db.hqRelationship.findFirst({ where: { ownerId: OWNER, personType: "person", personId: person.id } });
    expect(agent).toMatchObject({ email: "agent@example.test", tier: "warm", source: "seed" });

    // Second seed adds nothing and changes nothing the owner wrote.
    await db.hqPipeline.update({ where: { id: card!.id }, data: { nextStep: "Send the sizzle" } });
    const again = await seedFromRepo(OWNER);
    expect(again.pipelines).toBe(0);
    expect((await db.hqPipeline.findUnique({ where: { id: card!.id } }))?.nextStep).toBe("Send the sizzle");

    // A private note plus the Repo, searched as a question.
    await db.hqNote.create({ data: { ownerId: OWNER, title: `${P} Buyer notes`, body: "Everyone at the upfront asked for prank-adjacent formats with athletes.", kind: "meeting" } });
    const r = await searchBrain(OWNER, "What athletes have we discussed for prank formats?");
    expect(r.terms).toBe("prank");
    expect(r.hits.some((h) => h.source === "repo" && h.title === format.title)).toBe(true);
    expect(r.hits.some((h) => h.source === "note")).toBe(true);
    const talentBlock = r.answer.find((b) => b.heading.startsWith("Talent attached"));
    expect(talentBlock?.items.map((i) => i.name)).toContain(`${P} Star`);
  });

  it("imports a brain bundle and resolves names against the Repo", async () => {
    const bundle = parseBrainBundle(JSON.stringify({
      kind: "44forty-brain",
      ideas: [{ title: `${P} Golf prank show`, kind: "format_mechanic", rating: 4, tags: ["golf"] }],
      relationships: [{ name: `${P} Agent`, tier: "active", interests: ["golf"], notes: "Loves a long lunch." }, { name: "Nobody Known", tier: "inner" }],
      interactions: [{ name: `${P} Agent`, kind: "call", summary: "Talked through the slate.", at: "2026-09-01" }],
      tasks: [{ title: "Send Agent the deck", person: `${P} Agent`, dueAt: "2026-09-10" }],
    }))!;
    const out = await importBrainBundle(OWNER, bundle);
    expect(out).toMatchObject({ ideas: 1, relationships: 1, interactions: 1, tasks: 1, unresolved: ["Nobody Known"] });
    const agent = await db.hqRelationship.findFirst({ where: { ownerId: OWNER, name: `${P} Agent` }, include: { interactions: true, tasks: true } });
    expect(agent).toMatchObject({ tier: "active", interests: ["golf"] });
    expect(agent!.interactions).toHaveLength(1);
    expect(agent!.tasks[0]).toMatchObject({ kind: "follow_up" });
  });

  it("keeps HQ out of the shared backup while the table list stays complete", async () => {
    for (const t of PRIVATE_TABLES) expect(TABLE_ORDER as readonly string[]).toContain(t);
    const backup = await buildBackup();
    for (const t of PRIVATE_TABLES) expect(backup.tables[t]).toBeUndefined();
  });
});
