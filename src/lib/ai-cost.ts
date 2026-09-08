// Rough money for token counts. Rates are cents per million tokens from the
// Anthropic price sheet; cache reads are a tenth of input. An unknown model
// is priced like Opus so an estimate errs high, never low. Override with
// AI_COST_RATES as JSON {"model-id":[inputCents,outputCents]} if prices move.

type Rate = [input: number, output: number];

const DEFAULT_RATES: Record<string, Rate> = {
  "claude-opus-5": [500, 2500],
  "claude-opus-4-8": [500, 2500],
  "claude-opus-4-7": [500, 2500],
  "claude-opus-4-6": [500, 2500],
  "claude-sonnet-5": [200, 1000],
  "claude-sonnet-4-6": [300, 1500],
  "claude-haiku-4-5": [100, 500],
};

function rates(): Record<string, Rate> {
  try {
    const extra = process.env.AI_COST_RATES ? (JSON.parse(process.env.AI_COST_RATES) as Record<string, Rate>) : {};
    return { ...DEFAULT_RATES, ...extra };
  } catch {
    return DEFAULT_RATES;
  }
}

export function rateFor(model: string): Rate {
  const table = rates();
  const key = Object.keys(table).find((k) => model === k || model.startsWith(k));
  return key ? table[key] : table["claude-opus-5"];
}

export function estimateCents(model: string, usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number }): number {
  const [inRate, outRate] = rateFor(model);
  const cached = usage.cacheReadTokens ?? 0;
  const fresh = Math.max(0, usage.inputTokens - cached);
  return (fresh * inRate + cached * inRate * 0.1 + usage.outputTokens * outRate) / 1_000_000;
}

/** The total for an ingest item's per-stage usage record. */
export function usageCents(tokenUsage: unknown): { cents: number; calls: number } {
  const stages = (tokenUsage ?? {}) as Record<string, { model: string; inputTokens: number; outputTokens: number; cacheReadTokens?: number; calls?: number }>;
  let cents = 0, calls = 0;
  for (const u of Object.values(stages)) {
    if (!u || typeof u !== "object") continue;
    cents += estimateCents(u.model ?? "", u);
    calls += u.calls ?? 1;
  }
  return { cents, calls };
}

export function formatCents(cents: number): string {
  if (cents < 0.5) return "<1¢";
  if (cents < 100) return `${Math.round(cents)}¢`;
  return `$${(cents / 100).toFixed(2)}`;
}
