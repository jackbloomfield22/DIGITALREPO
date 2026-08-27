// The YouTube lane. Two things here decide whether the toggle is worth having:
// that the rules actually reach the model, and that a list of ideas becomes a
// queue of records rather than four copies of one.

import { describe, it, expect, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { LINK_SPECS, RECORD_REGISTRY } from "@/lib/ingest/registry";
import { statusOptionsFor } from "@/lib/row-status";
import { TABLE_ORDER } from "@/lib/backup";

const db = new PrismaClient();
const P = "ZZYouTube";

afterAll(async () => {
  await db.channel.deleteMany({ where: { name: { startsWith: P } } });
  await db.$disconnect();
});

describe("channels as a record type", () => {
  it("is registered, so ingest and the note box can reach it", () => {
    const spec = RECORD_REGISTRY.channel;
    expect(spec.prismaModel).toBe("channel");
    expect(spec.path("tyrese-maxey")).toBe("/youtube/tyrese-maxey");
    expect(spec.fields.some((f) => f.name === "status")).toBe(true);
  });

  it("exposes an ideas field, which is the whole point of the toggle", () => {
    // Without this the model has nowhere to put "doc series, podcast, Maxey
    // drill" except a paragraph of notes.
    expect(RECORD_REGISTRY.channel.fields.some((f) => f.name === "ideas")).toBe(true);
  });

  it("can be connected to the companies and people around it", () => {
    expect(LINK_SPECS.channel_org.a.targetType).toBe("channel");
    expect(LINK_SPECS.channel_org.b.targetType).toBe("organization");
    expect(LINK_SPECS.channel_person.b.targetType).toBe("person");
    // Both reachable by ingest, or the toggle can name a partner and not record it.
    expect(LINK_SPECS.channel_org.ingest).toBe(true);
    expect(LINK_SPECS.channel_person.ingest).toBe(true);
  });

  it("offers a pipeline in the row control, without 'archived' in it", () => {
    const options = statusOptionsFor("channel").map((s) => s.value);
    expect(options).toContain("prospect");
    expect(options).toContain("live");
    expect(options).not.toContain("archived");
  });

  it("is backed up, along with its ideas and its links", () => {
    for (const table of ["channel", "channelIdea", "channelOrganization", "channelPerson"]) {
      expect(TABLE_ORDER as readonly string[]).toContain(table);
    }
    // Parents before children, or a restore fails on the foreign keys.
    const order = TABLE_ORDER as readonly string[];
    expect(order.indexOf("channel")).toBeLessThan(order.indexOf("channelIdea"));
    expect(order.indexOf("channel")).toBeLessThan(order.indexOf("channelOrganization"));
  });
});

describe("ideas arriving from an ingest", () => {
  it("splits a list into records, and does not duplicate on a second pass", async () => {
    const channel = await db.channel.create({
      data: { slug: `${P.toLowerCase()}-maxey`, name: `${P} Maxey` },
    });
    const { applyChannelIdeas } = await import("@/lib/ingest/apply");

    await applyChannelIdeas(channel.id, "Doc series\nPodcast\n- Maxey drill\n• Content with the dogs");
    const first = await db.channelIdea.findMany({ where: { channelId: channel.id }, orderBy: { sortOrder: "asc" } });
    expect(first.map((i) => i.title)).toEqual(["Doc series", "Podcast", "Maxey drill", "Content with the dogs"]);

    // Re-ingesting the same page of the slate is the normal case, not the
    // exception — it must not produce a second copy of everything.
    await applyChannelIdeas(channel.id, "Doc series\nPodcast\nA new one");
    const second = await db.channelIdea.findMany({ where: { channelId: channel.id }, orderBy: { sortOrder: "asc" } });
    expect(second.map((i) => i.title)).toEqual([
      "Doc series", "Podcast", "Maxey drill", "Content with the dogs", "A new one",
    ]);
  });

  it("ignores empty lines and bullet characters left behind by a PDF", async () => {
    const channel = await db.channel.create({
      data: { slug: `${P.toLowerCase()}-empty`, name: `${P} Empty` },
    });
    const { applyChannelIdeas } = await import("@/lib/ingest/apply");
    await applyChannelIdeas(channel.id, "\n\n•\n-\n  \nReal idea\n");
    const ideas = await db.channelIdea.findMany({ where: { channelId: channel.id } });
    expect(ideas.map((i) => i.title)).toEqual(["Real idea"]);
  });
});
