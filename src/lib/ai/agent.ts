import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AI_TOOLS, ResultRegistry, toolByName, type ResultCard } from "@/lib/ai/tools";

const MODEL = process.env.AI_MODEL ?? "claude-opus-5";
const MAX_ITERATIONS = 12;

export function aiAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

const SYSTEM_PROMPT = `You are the research assistant inside the 4.4.FORTY Repo — 4.4.Forty Media's internal one-stop information repository. You answer questions using ONLY the database, via the read-only tools provided.

Terminology: the people in the roster are called "talent" in the product (creators, athletes, musicians, hosts, entrepreneurs...). The underlying tools use "creator" in their names and fields — treat "talent" and "creator" as the same records, and say "talent" in your answers.

Rules:
- The database is the single source of truth about what the Repo knows. Never supplement answers with outside knowledge about real people or companies.
- If something is not in the database, say so plainly (e.g. "Tennis is not currently listed as an interest for anyone in the Repo."). Never invent records, relationships, follower counts, or facts.
- If you make an inference beyond recorded facts, label it explicitly as an inference.
- Prefer structured lookups: resolve canonical entity names with search_entities before filtering, use roles (host, executive_producer, ...) and relationship data rather than guessing from bios.
- "Formats" are internal 4.4.Forty concepts in development; "Projects" are real existing productions. Keep the distinction clear.
- Answer concisely in plain prose (no markdown headers or tables). Refer to talent, projects, organizations, and formats by their exact database names so they can be linked.
- When listing matches, briefly say why each one matches.
- For follow-up questions, use the conversation context to narrow or extend previous results.`;

export type AiTurnResult = {
  text: string;
  cards: ResultCard[];
};

export async function runAiSearch(
  history: { role: "user" | "assistant"; content: string }[],
): Promise<AiTurnResult> {
  const client = new Anthropic();
  const registry = new ResultRegistry();

  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const tools: Anthropic.Tool[] = AI_TOOLS.map((t) => t.schema);

  let iterations = 0;
  let finalText = "";

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      finalText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      break;
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const def = toolByName(use.name);
      let output: unknown;
      let isError = false;
      if (!def) {
        output = { error: `Unknown tool ${use.name}` };
        isError = true;
      } else {
        try {
          const parsed = def.input.parse(use.input);
          output = await def.run(parsed as never, registry);
        } catch (e) {
          output = { error: e instanceof Error ? e.message : "Tool failed" };
          isError = true;
        }
      }
      results.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: JSON.stringify(output ?? null).slice(0, 60_000),
        is_error: isError,
      });
    }
    messages.push({ role: "user", content: results });
  }

  if (!finalText) {
    finalText =
      "I wasn't able to finish answering that within the allowed number of lookups. Try narrowing the question.";
  }

  return { text: finalText, cards: registry.mentioned(finalText).slice(0, 12) };
}
