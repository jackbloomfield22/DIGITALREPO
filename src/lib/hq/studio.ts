import "server-only";

// The Studio's brief builder: everything a writer needs to draft in the
// owner's voice, as one block of text. Pasted into a chat with Claude it
// costs nothing; sent to the on-site model it is the whole prompt.

import { db } from "@/lib/db";
import { STAGES, hqLabel } from "@/lib/hq/vocab";

export const OUTPUTS = [
  { value: "logline", label: "Logline", ask: "Write three logline options, each one sentence, in the style guide's voice. Then say which is strongest and why in one line." },
  { value: "one_sheet", label: "One-sheet", ask: "Write a one-page sell: title, logline, the format in four sentences, why now, why this talent, what the audience does with it, comps. Tight, no hedging." },
  { value: "deck_outline", label: "Deck outline", ask: "Write a slide-by-slide outline for the pitch deck: slide title, the one idea on it, and the visual, for 10–14 slides. Follow the deck structure in the style guide and examples." },
  { value: "talent_summary", label: "Talent summary", ask: "Write the talent summary paragraph the way the examples do: who they are, why they matter to this audience, the numbers that prove it, the one detail that makes them undeniable." },
  { value: "exec_email", label: "Executive email", ask: "Write the email to the executive named in the brief: subject line, four to six sentences, one clear ask, in the voice of the example emails. No pleasantries beyond one line." },
  { value: "follow_up_email", label: "Follow-up email", ask: "Write a short follow-up email that references the last conversation, adds one new reason to care, and makes one ask." },
] as const;

export const DEFAULT_STYLE_GUIDE = `# How I write

## Loglines
- One sentence. Who, what's at stake, why it's a show and not a story.
- Lead with the hook, not the setup.

## Talent summaries
- Name, why they matter to this audience, the number that proves it, the detail nobody else has.
- Never "influencer". Say what they actually do.

## Executive emails
- Subject line says the thing.
- Four to six sentences. One ask. No "hope this finds you well".
- End with what happens next, not a question.

## Decks
- Title → logline → why now → the format (mechanic in one slide) → talent → the world → episodes → why us → comps → ask.
- One idea per slide. The visual carries it; the copy is a caption.

## Words I avoid
- "unique", "compelling", "content", "leverage", "synergy".

(Edit this freely. Add examples in the library below and the brief builder quotes them.)`;

export async function buildBrief(ownerId: string, input: { output: string; pipelineId?: string | null; relationshipId?: string | null; extra?: string }): Promise<string> {
  const out = OUTPUTS.find((o) => o.value === input.output) ?? OUTPUTS[0];
  const [settings, examples, card, person] = await Promise.all([
    db.hqSettings.findUnique({ where: { ownerId } }),
    db.hqStyleExample.findMany({ where: { ownerId }, orderBy: { createdAt: "desc" } }),
    input.pipelineId ? db.hqPipeline.findFirst({ where: { id: input.pipelineId, ownerId }, include: { contacts: { include: { relationship: true } }, notes_: { orderBy: { updatedAt: "desc" }, take: 4 } } }) : null,
    input.relationshipId ? db.hqRelationship.findFirst({ where: { id: input.relationshipId, ownerId }, include: { interactions: { orderBy: { at: "desc" }, take: 6 } } }) : null,
  ]);
  const wantKinds: Record<string, string[]> = {
    logline: ["logline", "one_sheet"], one_sheet: ["one_sheet", "deck"], deck_outline: ["deck", "one_sheet"],
    talent_summary: ["talent_summary", "one_sheet"], exec_email: ["exec_email"], follow_up_email: ["exec_email"],
  };
  const chosen = examples.filter((e) => (wantKinds[out.value] ?? []).includes(e.kind)).slice(0, 3);
  const fallback = chosen.length ? [] : examples.slice(0, 2);

  // The Repo record behind the card, when there is one, for the facts.
  let facts: string[] = [];
  if (card?.targetType && card.targetId) {
    const model: Record<string, string> = { format: "format", project: "project", channel: "channel", opportunity: "opportunity" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = model[card.targetType] ? await (db as any)[model[card.targetType]].findUnique({ where: { id: card.targetId } }) : null;
    if (rec) facts = ["logline", "premise", "description", "status", "formatType", "projectType", "targetPlatform", "episodeLength", "episodeStructure", "sponsorFit", "notes", "internalNotes", "cadence", "revenueModel"]
      .filter((k) => rec[k]).map((k) => `${k}: ${String(rec[k]).slice(0, 1200)}`);
  }

  const parts: string[] = [];
  parts.push(`TASK\n${out.ask}${input.extra ? `\n\nExtra direction from me: ${input.extra.trim()}` : ""}`);
  parts.push(`STYLE GUIDE\n${(settings?.styleGuide?.trim() || DEFAULT_STYLE_GUIDE)}`);
  for (const e of [...chosen, ...fallback]) parts.push(`EXAMPLE — ${e.kind.replace(/_/g, " ").toUpperCase()}: ${e.title}\n${e.body.slice(0, 6000)}${e.notes ? `\n(Why this one works: ${e.notes})` : ""}`);
  if (card) {
    parts.push([
      `THE PROJECT: ${card.title}`,
      `Stage: ${hqLabel(STAGES, card.stage)} · heat ${card.heat}/3`,
      card.whyItMatters ? `Why it matters: ${card.whyItMatters}` : "",
      card.nextStep ? `Next step: ${card.nextStep}` : "",
      card.contacts.length ? `People: ${card.contacts.map((c) => `${c.relationship.name} (${c.role.replace(/_/g, " ")})`).join(", ")}` : "",
      ...facts,
      card.notes ? `Card notes: ${card.notes.slice(0, 3000)}` : "",
      ...card.notes_.map((n) => `Note — ${n.title}: ${n.body.slice(0, 2000)}`),
    ].filter(Boolean).join("\n"));
  }
  if (person) {
    parts.push([
      `THE PERSON: ${person.name} (${person.tier} circle)`,
      person.howWeMet ? `How we met: ${person.howWeMet}` : "",
      person.interests.length ? `Interests: ${person.interests.join(", ")}` : "",
      person.opportunities ? `Opportunities: ${person.opportunities}` : "",
      person.notes ? `Notes: ${person.notes.slice(0, 2000)}` : "",
      person.interactions.length ? `Recent conversations:\n${person.interactions.map((i) => `- ${i.at.toDateString()} ${i.kind}: ${i.summary.slice(0, 300)}`).join("\n")}` : "",
    ].filter(Boolean).join("\n"));
  }
  parts.push("OUTPUT\nOnly the material asked for. No preamble, no options unless the task asks for them, no notes to me.");
  return parts.join("\n\n———\n\n");
}
