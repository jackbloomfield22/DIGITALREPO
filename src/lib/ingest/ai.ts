// Model runner for the ingest pipeline. One narrow interface so tests inject
// a fake; the real implementation uses the Anthropic SDK with structured
// output via tool use and prompt caching on the stable system prefix.

import Anthropic from "@anthropic-ai/sdk";

export type ModelUsage = { model: string; inputTokens: number; outputTokens: number; cacheReadTokens: number };

export type StructuredRequest = {
  model: string;
  maxTokens: number;
  /** Stable system prefix (cached) then volatile system text. */
  systemStable: string;
  systemVolatile?: string;
  userContent: string;
  toolName: string;
  toolDescription: string;
  toolSchema: Record<string, unknown>;
  /** Force the tool call (only safe on models without thinking, e.g. Haiku). */
  forceTool?: boolean;
};

export type StructuredResult = { output: unknown; usage: ModelUsage };

export type ModelRunner = (req: StructuredRequest) => Promise<StructuredResult>;

export const TRIAGE_MODEL = process.env.AI_MODEL_TRIAGE ?? "claude-haiku-4-5";
export const PROPOSE_MODEL = process.env.AI_MODEL ?? "claude-opus-5";

export function ingestAiAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

function extractToolInput(response: Anthropic.Message, toolName: string): unknown | null {
  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === toolName) return block.input;
  }
  return null;
}

export const anthropicRunner: ModelRunner = async (req) => {
  const client = new Anthropic();
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: req.systemStable, cache_control: { type: "ephemeral" } },
  ];
  if (req.systemVolatile) system.push({ type: "text", text: req.systemVolatile });

  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: req.model,
    max_tokens: req.maxTokens,
    system,
    tools: [
      {
        name: req.toolName,
        description: req.toolDescription,
        input_schema: req.toolSchema as Anthropic.Tool.InputSchema,
      },
    ],
    // Thinking-capable models reject forced tool choice; instruct + retry instead.
    tool_choice: req.forceTool ? { type: "tool", name: req.toolName } : { type: "auto" },
    messages: [{ role: "user", content: req.userContent }],
  };

  let response = await client.messages.create(params);
  let output = extractToolInput(response, req.toolName);
  let usage: ModelUsage = {
    model: req.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
  };

  if (output === null && !req.forceTool) {
    // One retry with an explicit reminder — no free-text fallback parsing.
    const retry = await client.messages.create({
      ...params,
      messages: [
        { role: "user", content: req.userContent },
        { role: "assistant", content: response.content },
        { role: "user", content: `You must respond by calling the ${req.toolName} tool with the structured result. Call it now.` },
      ],
    });
    output = extractToolInput(retry, req.toolName);
    usage = {
      ...usage,
      inputTokens: usage.inputTokens + retry.usage.input_tokens,
      outputTokens: usage.outputTokens + retry.usage.output_tokens,
      cacheReadTokens: usage.cacheReadTokens + (retry.usage.cache_read_input_tokens ?? 0),
    };
    response = retry;
  }

  if (output === null) {
    throw new Error(`Model did not produce a ${req.toolName} tool call.`);
  }
  return { output, usage };
};
