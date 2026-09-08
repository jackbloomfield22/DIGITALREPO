import "server-only";

// The one place HQ spends money on a model, and why it is worth it: "Ask"
// reads the live brain and the live Repo — notes, people, the pipeline,
// today's brief — which a chat outside the site cannot. Off by default,
// behind a switch on Settings, with a daily cap the owner sets and a meter
// that shows what it has cost. Drafting shares the same gate.

import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { searchBrain } from "@/lib/hq/search";
import { hqLabel, STAGES, TIERS } from "@/lib/hq/vocab";

const MODEL = process.env.AI_MODEL_ASK ?? "claude-sonnet-5";
import { estimateCents } from "@/lib/ai-cost";

export function askAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function spendToday(ownerId: string): Promise<number> {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const agg = await db.hqAiUsage.aggregate({ where: { ownerId, createdAt: { gte: start } }, _sum: { costCents: true } });
  return agg._sum.costCents ?? 0;
}

export async function spendThisMonth(ownerId: string): Promise<number> {
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
  const agg = await db.hqAiUsage.aggregate({ where: { ownerId, createdAt: { gte: start } }, _sum: { costCents: true } });
  return agg._sum.costCents ?? 0;
}

/** The gate every model call passes: key present, switched on, under today's cap. */
export async function aiGate(ownerId: string): Promise<{ ok: true; capCents: number; spentCents: number } | { ok: false; reason: string }> {
  if (!askAvailable()) return { ok: false, reason: "No ANTHROPIC_API_KEY is configured on the site." };
  const settings = await db.hqSettings.findUnique({ where: { ownerId } });
  if (!settings?.aiEnabled) return { ok: false, reason: "AI is switched off in HQ Settings." };
  const spent = await spendToday(ownerId);
  if (settings.aiDailyCapCents > 0 && spent >= settings.aiDailyCapCents) {
    return { ok: false, reason: `Today's cap of $${(settings.aiDailyCapCents / 100).toFixed(2)} is used up.` };
  }
  return { ok: true, capCents: settings.aiDailyCapCents, spentCents: spent };
}

function costCents(inputTokens: number, outputTokens: number): number {
  return Math.round(estimateCents(MODEL, { inputTokens, outputTokens }));
}

async function record(ownerId: string, feature: string, usage: { input_tokens: number; output_tokens: number }): Promise<number> {
  const cents = costCents(usage.input_tokens, usage.output_tokens);
  await db.hqAiUsage.create({ data: { ownerId, feature, model: MODEL, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, costCents: cents } });
  return cents;
}

// ---------------------------------------------------------------------------
// Tools the model can call. Each returns compact text; hrefs let the answer link.
// ---------------------------------------------------------------------------

const TOOLS: Anthropic.Tool[] = [
  { name: "search_brain", description: "Full-text search over the owner's private notes, ideas, people, pipeline and the shared Repo. Returns answer blocks (e.g. talent attached to matched formats) and ranked hits with links.", input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "get_person", description: "One person's relationship record: tier, interests, notes, opportunities, last contact, recent interactions, and which pipeline cards they are on.", input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  { name: "pipeline_board", description: "The development pipeline: every open card with stage, heat, next step, last contact and contacts.", input_schema: { type: "object", properties: { stage: { type: "string", description: "optional stage filter" } } } },
  { name: "recent_activity", description: "The last N interactions, tasks completed and notes written, newest first.", input_schema: { type: "object", properties: { days: { type: "number" } } } },
];

async function runTool(ownerId: string, name: string, input: Record<string, unknown>): Promise<string> {
  if (name === "search_brain") {
    const r = await searchBrain(ownerId, String(input.query ?? ""));
    const blocks = r.answer.map((b) => `${b.heading}:\n${b.items.map((i) => `- ${i.name} — ${i.detail}${i.href ? ` (${i.href})` : ""}`).join("\n")}`).join("\n\n");
    const hits = r.hits.slice(0, 15).map((h) => `- [${h.source}${h.source === "repo" ? `/${h.kind}` : ""}] ${h.title}: ${h.snippet.replace(/[«»]/g, "")} (${h.href})`).join("\n");
    return [blocks, "HITS:", hits || "(none)"].filter(Boolean).join("\n\n");
  }
  if (name === "get_person") {
    const rel = await db.hqRelationship.findFirst({
      where: { ownerId, name: { contains: String(input.name ?? ""), mode: "insensitive" } },
      include: { interactions: { orderBy: { at: "desc" }, take: 10 }, pipelines: { include: { pipeline: { select: { title: true, stage: true, id: true } } } } },
    });
    if (!rel) return "No relationship record with that name.";
    return [
      `${rel.name} (${hqLabel(TIERS, rel.tier)}) /hq/people/${rel.id}`,
      rel.interests.length ? `Interests: ${rel.interests.join(", ")}` : "",
      rel.howWeMet ? `How we met: ${rel.howWeMet}` : "",
      rel.notes ? `Notes: ${rel.notes.slice(0, 1500)}` : "",
      rel.opportunities ? `Opportunities: ${rel.opportunities.slice(0, 800)}` : "",
      `Last contact: ${rel.lastContactAt?.toDateString() ?? "none logged"}${rel.nextTouchAt ? `; next touch ${rel.nextTouchAt.toDateString()}` : ""}`,
      rel.pipelines.length ? `On cards: ${rel.pipelines.map((p) => `${p.pipeline.title} (${hqLabel(STAGES, p.pipeline.stage)}, as ${p.role})`).join("; ")}` : "",
      rel.interactions.length ? `Recent:\n${rel.interactions.map((i) => `- ${i.at.toDateString()} ${i.kind}: ${i.summary.slice(0, 200)}`).join("\n")}` : "No interactions logged.",
    ].filter(Boolean).join("\n");
  }
  if (name === "pipeline_board") {
    const cards = await db.hqPipeline.findMany({
      where: { ownerId, closedAt: null, ...(input.stage ? { stage: String(input.stage) } : {}) },
      orderBy: [{ heat: "desc" }, { updatedAt: "desc" }], take: 60,
      include: { contacts: { include: { relationship: { select: { name: true } } } } },
    });
    return cards.map((c) => `- ${c.title} [${hqLabel(STAGES, c.stage)}, heat ${c.heat}] next: ${c.nextStep ?? "—"}${c.nextStepDue ? ` by ${c.nextStepDue.toDateString()}` : ""}; last contact ${c.lastContactAt?.toDateString() ?? "—"}; people: ${c.contacts.map((x) => `${x.relationship.name} (${x.role})`).join(", ") || "—"}${c.whyItMatters ? `; why: ${c.whyItMatters.slice(0, 160)}` : ""} (/hq/pipeline/${c.id})`).join("\n") || "No open cards.";
  }
  if (name === "recent_activity") {
    const since = new Date(Date.now() - Number(input.days ?? 14) * 86_400_000);
    const [inter, tasks, notes] = await Promise.all([
      db.hqInteraction.findMany({ where: { ownerId, at: { gte: since } }, orderBy: { at: "desc" }, take: 30, include: { relationship: { select: { name: true } } } }),
      db.hqTask.findMany({ where: { ownerId, completedAt: { gte: since } }, orderBy: { completedAt: "desc" }, take: 30 }),
      db.hqNote.findMany({ where: { ownerId, updatedAt: { gte: since } }, orderBy: { updatedAt: "desc" }, take: 20 }),
    ]);
    return [
      ...inter.map((i) => `- ${i.at.toDateString()} ${i.kind} with ${i.relationship.name}: ${i.summary.slice(0, 160)}`),
      ...tasks.map((t) => `- ${t.completedAt?.toDateString()} done: ${t.title}`),
      ...notes.map((n) => `- ${n.updatedAt.toDateString()} note: ${n.title} (/hq/brain/${n.id})`),
    ].join("\n") || "Nothing in that window.";
  }
  return "Unknown tool.";
}

const SYSTEM = `You are the owner's private second brain inside the 4.4.Forty Repo. Answer from the tools, never from memory. Be direct and specific: names, dates, next steps. Link records with the paths the tools give you, as markdown links. Say plainly when the brain has nothing on a question. Keep answers under 250 words unless a list demands more. Bold record names on first mention.`;

export async function askBrain(ownerId: string, question: string, history: { role: "user" | "assistant"; content: string }[] = []): Promise<{ ok: true; text: string; costCents: number } | { ok: false; error: string }> {
  const gate = await aiGate(ownerId);
  if (!gate.ok) return { ok: false, error: gate.reason };
  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [...history.slice(-8).map((m) => ({ role: m.role, content: m.content })), { role: "user", content: question }];
  let text = "";
  let spent = 0;
  for (let i = 0; i < 6; i++) {
    const res = await client.messages.create({ model: MODEL, max_tokens: 1500, system: SYSTEM, tools: TOOLS, messages });
    spent += await record(ownerId, "ask", res.usage);
    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !uses.length) {
      text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
      break;
    }
    messages.push({ role: "assistant", content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const u of uses) {
      const out = await runTool(ownerId, u.name, (u.input ?? {}) as Record<string, unknown>).catch((e) => `Tool failed: ${e instanceof Error ? e.message : "error"}`);
      results.push({ type: "tool_result", tool_use_id: u.id, content: out.slice(0, 12_000) });
    }
    messages.push({ role: "user", content: results });
  }
  return { ok: true, text: text || "I could not put an answer together from the brain.", costCents: spent };
}

/** One drafting call in the owner's style. The brief is built by the Studio; the model only writes. */
export async function draftWithStyle(ownerId: string, brief: string): Promise<{ ok: true; text: string; costCents: number } | { ok: false; error: string }> {
  const gate = await aiGate(ownerId);
  if (!gate.ok) return { ok: false, error: gate.reason };
  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL, max_tokens: 2500,
    system: "You write development materials for a television and digital producer, in the producer's own voice as described in the style guide and shown in the examples. Follow the brief exactly. Output only the material asked for — no preamble, no options, no notes.",
    messages: [{ role: "user", content: brief }],
  });
  const cents = await record(ownerId, "draft", res.usage);
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
  return { ok: true, text, costCents: cents };
}
