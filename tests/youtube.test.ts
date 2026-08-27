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

describe("finding the YouTube lane without being told", () => {
  it("offers the section as a triage output, so a document can route itself", async () => {
    const { triageToolSchema, triageOutputSchema } = await import("@/lib/ingest/ops");
    const schema = triageToolSchema() as {
      properties: { workspace?: { enum?: string[]; description?: string } };
    };
    expect(schema.properties.workspace?.enum).toEqual(["youtube", "general"]);
    // The description is what does the work; without it the field is noise.
    expect(schema.properties.workspace?.description).toMatch(/handles|subscriber/i);

    // A verdict that says nothing about the section is "general", never a crash.
    const parsed = triageOutputSchema.parse({ relevant: true, score: 0.8, reasons: [] });
    expect(parsed.workspace).toBe("general");
  });

  it("tells every document how to spot a channel, toggle or no toggle", async () => {
    const { describeOpVocabulary } = await import("@/lib/ingest/ops");
    // The vocabulary alone has to carry the channel type, since the always-on
    // rules reference it for documents with no switch set.
    expect(describeOpVocabulary()).toContain("channel");
  });
});

describe("what actually reaches the model", () => {
  const usage = { model: "test", inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 };

  /** Run an item through triage and propose with a stub, capturing both prompts. */
  async function prompts(extractedText: string, workspace: string | null) {
    const item = await db.ingestItem.create({
      data: { kind: "text", extractedText: `${P} ${extractedText}`, status: "parsed", workspace },
    });
    const { triageItemCore, proposeItemCore } = await import("@/lib/ingest/pipeline");
    let triage = "";
    await triageItemCore(item.id, async (req) => {
      triage = req.userContent;
      return {
        output: { relevant: true, score: 0.9, reasons: ["ok"], workspace: "general", candidateRecords: [], newRecordCandidates: [], sections: [] },
        usage,
      };
    });
    let propose = { system: "", user: "" };
    await proposeItemCore(item.id, async (req) => {
      propose = { system: req.systemStable ?? "", user: req.userContent };
      return { output: { changes: [] }, usage };
    });
    await db.ingestItem.delete({ where: { id: item.id } });
    return { triage, propose };
  }

  it("teaches every document how to spot a channel, with the switch off", async () => {
    const { propose } = await prompts("Notes about a few things.", null);
    // The always-on rules are what make the switch optional rather than required.
    expect(propose.system).toContain("athlete YouTube channels business");
    expect(propose.system).toMatch(/subscriber or view counts/i);
    expect(propose.system).toMatch(/running channel versus a single title/i);
    // …and the document-level assertion is absent, because nobody made it.
    expect(propose.user).not.toContain("THIS WHOLE DOCUMENT");
  });

  it("adds the document-level assertion only when the switch is on", async () => {
    const { triage, propose } = await prompts("Channels we'd like to work on.", "youtube");
    expect(propose.user).toContain("THIS WHOLE DOCUMENT");
    // Triage needs it too, or a channels document can be judged irrelevant
    // before anything gets the chance to propose from it.
    expect(triage).toContain("THIS WHOLE DOCUMENT");
  });

  it("keeps a lane triage worked out, and never overrules one that was set", async () => {
    const { triageItemCore } = await import("@/lib/ingest/pipeline");

    const guessed = await db.ingestItem.create({
      data: { kind: "text", extractedText: `${P} Tyrese channel ideas`, status: "parsed" },
    });
    await triageItemCore(guessed.id, async () => ({
      output: { relevant: true, score: 0.9, reasons: [], workspace: "youtube", candidateRecords: [], newRecordCandidates: [], sections: [] },
      usage,
    }));
    const after = await db.ingestItem.findUnique({ where: { id: guessed.id } });
    expect(after?.workspace).toBe("youtube");
    expect((after?.relevance as { workspaceInferred?: boolean }).workspaceInferred).toBe(true);

    // Someone switched this to YouTube by hand. A read of the text saying
    // otherwise does not get to undo that, or the switch stops meaning
    // anything the moment the model disagrees with it.
    const stated = await db.ingestItem.create({
      data: { kind: "text", extractedText: `${P} a page about a documentary`, status: "parsed", workspace: "youtube" },
    });
    await triageItemCore(stated.id, async () => ({
      output: { relevant: true, score: 0.9, reasons: [], workspace: "general", candidateRecords: [], newRecordCandidates: [], sections: [] },
      usage,
    }));
    const stayed = await db.ingestItem.findUnique({ where: { id: stated.id } });
    expect(stayed?.workspace).toBe("youtube");
    expect((stayed?.relevance as { workspaceInferred?: boolean }).workspaceInferred).toBe(false);

    await db.ingestItem.deleteMany({ where: { id: { in: [guessed.id, stated.id] } } });
  });
});
