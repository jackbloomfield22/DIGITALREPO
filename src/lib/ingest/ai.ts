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
  /** Let the model use Anthropic's server-side web search to fill gaps. */
  webSearch?: boolean;
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

  const tools: Anthropic.ToolUnion[] = [
    {
      name: req.toolName,
      description: req.toolDescription,
      input_schema: req.toolSchema as Anthropic.Tool.InputSchema,
    },
  ];
  if (req.webSearch) {
    // Server-side web search — runs on Anthropic's infrastructure inside the
    // same request; results arrive as content blocks. Capped to keep cost and
    // latency bounded per call.
    tools.push({ type: "web_search_20260209", name: "web_search", max_uses: 3 } as unknown as Anthropic.ToolUnion);
  }

  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: req.model,
    max_tokens: req.maxTokens,
    system,
    tools,
    // Thinking-capable models reject forced tool choice; instruct + retry
    // instead. (Web search also requires auto tool choice.)
    tool_choice: req.forceTool && !req.webSearch ? { type: "tool", name: req.toolName } : { type: "auto" },
    messages: [{ role: "user", content: req.userContent }],
  };

  const usage: ModelUsage = { model: req.model, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
  const addUsage = (r: Anthropic.Message) => {
    usage.inputTokens += r.usage.input_tokens;
    usage.outputTokens += r.usage.output_tokens;
    usage.cacheReadTokens += r.usage.cache_read_input_tokens ?? 0;
  };

  // Server tools can pause the turn mid-way (e.g. between web searches);
  // resume by appending the assistant content and continuing.
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: req.userContent }];
  let response = await client.messages.create({ ...params, messages });
  addUsage(response);
  for (let i = 0; i < 6 && response.stop_reason === "pause_turn"; i++) {
    messages.push({ role: "assistant", content: response.content });
    response = await client.messages.create({ ...params, messages });
    addUsage(response);
  }
  let output = extractToolInput(response, req.toolName);

  if (output === null && params.tool_choice?.type === "auto") {
    // One retry with an explicit reminder — no free-text fallback parsing.
    const retry = await client.messages.create({
      ...params,
      messages: [
        ...messages,
        { role: "assistant", content: response.content },
        { role: "user", content: `You must respond by calling the ${req.toolName} tool with the structured result. Call it now.` },
      ],
    });
    output = extractToolInput(retry, req.toolName);
    addUsage(retry);
    response = retry;
  }

  if (output === null) {
    throw new Error(`Model did not produce a ${req.toolName} tool call.`);
  }
  return { output, usage };
};
