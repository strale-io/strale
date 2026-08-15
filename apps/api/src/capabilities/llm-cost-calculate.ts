import { registerCapability, type CapabilityInput } from "./index.js";

// ─── Model pricing ──────────────────────────────────────────────────────────
//
// USD per 1,000 tokens. Vendors publish per 1,000,000, so every figure here is
// theirs divided by 1000.
//
// The previous table was stamped "updated Feb 2025" and went eighteen months
// without a refresh. A real caller asked for `claude-sonnet-4-5` and was turned
// away by a catalogue that stopped at `claude-3.5-sonnet`. Nothing signalled
// the staleness, which is why PRICING_VERIFIED_ON exists and is asserted on in
// llm-cost-calculate.test.ts.
//
// Worth knowing for the next refresh: the old entries were not wrong. gpt-4o at
// $2.50/$10.00 per MTok is still current, as are gpt-4o-mini and gpt-3.5-turbo.
// The table had simply stopped growing, so the failure mode was missing models
// rather than bad numbers — which is exactly the kind of decay no test catches.
const PRICING_SOURCES = {
  openai: "https://developers.openai.com/api/docs/pricing",
  anthropic: "https://platform.claude.com/docs/en/about-claude/pricing",
  google: "https://ai.google.dev/gemini-api/docs/pricing",
} as const;

/** Last date every non-legacy row below was checked against its vendor page. */
const PRICING_VERIFIED_ON = "2026-08-15";

/** How long before the staleness test starts failing. */
const PRICING_MAX_AGE_DAYS = 180;

type Vendor = keyof typeof PRICING_SOURCES;

interface ModelPrice {
  inputPer1K: number;
  outputPer1K: number;
  /** Documented context window, or null where the vendor publishes none. */
  context: number | null;
  vendor: Vendor;
  /** Vendor lists it as retired; still priced so existing callers keep working. */
  retired?: true;
  /** Carried from the Feb 2025 table and NOT re-verified in this pass. */
  unverified?: true;
}

const PRICING: Record<string, ModelPrice> = {
  // ── OpenAI ──
  "gpt-5.6-sol": { inputPer1K: 0.005, outputPer1K: 0.03, context: null, vendor: "openai" },
  "gpt-5.6-terra": { inputPer1K: 0.002, outputPer1K: 0.012, context: null, vendor: "openai" },
  "gpt-5.6-luna": { inputPer1K: 0.0002, outputPer1K: 0.0012, context: null, vendor: "openai" },
  "gpt-5.5": { inputPer1K: 0.005, outputPer1K: 0.03, context: 272000, vendor: "openai" },
  "gpt-5.5-pro": { inputPer1K: 0.03, outputPer1K: 0.18, context: 272000, vendor: "openai" },
  "gpt-5.4": { inputPer1K: 0.0025, outputPer1K: 0.015, context: 272000, vendor: "openai" },
  "gpt-5.4-pro": { inputPer1K: 0.03, outputPer1K: 0.18, context: 272000, vendor: "openai" },
  "gpt-5.4-mini": { inputPer1K: 0.00075, outputPer1K: 0.0045, context: null, vendor: "openai" },
  "gpt-5.4-nano": { inputPer1K: 0.0002, outputPer1K: 0.00125, context: null, vendor: "openai" },
  "gpt-5.2": { inputPer1K: 0.00175, outputPer1K: 0.014, context: null, vendor: "openai" },
  "gpt-5.1": { inputPer1K: 0.00125, outputPer1K: 0.01, context: null, vendor: "openai" },
  "gpt-5": { inputPer1K: 0.00125, outputPer1K: 0.01, context: null, vendor: "openai" },
  "gpt-5-mini": { inputPer1K: 0.00025, outputPer1K: 0.002, context: null, vendor: "openai" },
  "gpt-5-nano": { inputPer1K: 0.00005, outputPer1K: 0.0004, context: null, vendor: "openai" },
  "o3": { inputPer1K: 0.002, outputPer1K: 0.008, context: null, vendor: "openai" },
  "o3-pro": { inputPer1K: 0.02, outputPer1K: 0.08, context: null, vendor: "openai" },
  "o1": { inputPer1K: 0.015, outputPer1K: 0.06, context: null, vendor: "openai" },
  "o1-pro": { inputPer1K: 0.15, outputPer1K: 0.6, context: null, vendor: "openai" },
  "gpt-4o": { inputPer1K: 0.0025, outputPer1K: 0.01, context: 128000, vendor: "openai" },
  "gpt-4o-mini": { inputPer1K: 0.00015, outputPer1K: 0.0006, context: 128000, vendor: "openai" },
  "gpt-3.5-turbo": { inputPer1K: 0.0005, outputPer1K: 0.0015, context: 16385, vendor: "openai" },

  // ── Anthropic ── (API model names; dotted spellings aliased below)
  "claude-fable-5": { inputPer1K: 0.01, outputPer1K: 0.05, context: 1000000, vendor: "anthropic" },
  "claude-opus-5": { inputPer1K: 0.005, outputPer1K: 0.025, context: 1000000, vendor: "anthropic" },
  "claude-opus-4-8": { inputPer1K: 0.005, outputPer1K: 0.025, context: 1000000, vendor: "anthropic" },
  "claude-opus-4-7": { inputPer1K: 0.005, outputPer1K: 0.025, context: 1000000, vendor: "anthropic" },
  "claude-opus-4-6": { inputPer1K: 0.005, outputPer1K: 0.025, context: 1000000, vendor: "anthropic" },
  "claude-opus-4-5": { inputPer1K: 0.005, outputPer1K: 0.025, context: 200000, vendor: "anthropic" },
  "claude-sonnet-5": { inputPer1K: 0.002, outputPer1K: 0.01, context: 1000000, vendor: "anthropic" },
  "claude-sonnet-4-6": { inputPer1K: 0.003, outputPer1K: 0.015, context: 1000000, vendor: "anthropic" },
  "claude-sonnet-4-5": { inputPer1K: 0.003, outputPer1K: 0.015, context: 200000, vendor: "anthropic" },
  "claude-haiku-4-5": { inputPer1K: 0.001, outputPer1K: 0.005, context: 200000, vendor: "anthropic" },
  "claude-opus-4-1": { inputPer1K: 0.015, outputPer1K: 0.075, context: 200000, vendor: "anthropic", retired: true },
  "claude-sonnet-4": { inputPer1K: 0.003, outputPer1K: 0.015, context: 200000, vendor: "anthropic", retired: true },
  "claude-haiku-3-5": { inputPer1K: 0.0008, outputPer1K: 0.004, context: 200000, vendor: "anthropic", retired: true },

  // ── Google ──
  "gemini-3.7-flash": { inputPer1K: 0.00075, outputPer1K: 0.00375, context: null, vendor: "google" },
  "gemini-3.6-flash": { inputPer1K: 0.00075, outputPer1K: 0.00375, context: null, vendor: "google" },
  "gemini-3.5-flash": { inputPer1K: 0.0015, outputPer1K: 0.009, context: null, vendor: "google" },
  "gemini-3.5-flash-lite": { inputPer1K: 0.0003, outputPer1K: 0.0025, context: null, vendor: "google" },
  "gemini-3.1-flash-lite": { inputPer1K: 0.00025, outputPer1K: 0.0015, context: null, vendor: "google" },
  "gemini-3.1-pro-preview": { inputPer1K: 0.002, outputPer1K: 0.012, context: null, vendor: "google" },
  "gemini-2.5-pro": { inputPer1K: 0.00125, outputPer1K: 0.01, context: null, vendor: "google" },
  "gemini-2.5-flash": { inputPer1K: 0.0003, outputPer1K: 0.0025, context: 1000000, vendor: "google" },
  "gemini-2.5-flash-lite": { inputPer1K: 0.0001, outputPer1K: 0.0004, context: null, vendor: "google" },

  // ── Carried over, NOT re-verified on 2026-08-15 ──
  // Kept so existing callers keep working, but their vendors' current pages
  // were not consulted in this pass. Marked rather than silently presented as
  // current — an unverified price that looks authoritative is the failure this
  // whole refresh exists to correct.
  "claude-3-opus": { inputPer1K: 0.015, outputPer1K: 0.075, context: 200000, vendor: "anthropic", unverified: true },
  "claude-3-sonnet": { inputPer1K: 0.003, outputPer1K: 0.015, context: 200000, vendor: "anthropic", unverified: true },
  "claude-3-haiku": { inputPer1K: 0.00025, outputPer1K: 0.00125, context: 200000, vendor: "anthropic", unverified: true },
  "gpt-4-turbo": { inputPer1K: 0.01, outputPer1K: 0.03, context: 128000, vendor: "openai", unverified: true },
  "gpt-4": { inputPer1K: 0.03, outputPer1K: 0.06, context: 8192, vendor: "openai", unverified: true },
  "gemini-1.5-pro": { inputPer1K: 0.00125, outputPer1K: 0.005, context: 2000000, vendor: "google", unverified: true },
  "gemini-1.5-flash": { inputPer1K: 0.000075, outputPer1K: 0.0003, context: 1000000, vendor: "google", unverified: true },
  "mistral-large": { inputPer1K: 0.002, outputPer1K: 0.006, context: 128000, vendor: "openai", unverified: true },
  "llama-3-70b": { inputPer1K: 0.00059, outputPer1K: 0.00079, context: 8192, vendor: "openai", unverified: true },
};

/**
 * Older spellings kept resolvable so nothing that worked before breaks. The
 * dotted forms predate this table adopting the vendors' real API naming — and
 * the caller who triggered this refresh used the API form, `claude-sonnet-4-5`.
 */
const MODEL_ALIASES: Record<string, string> = {
  "claude-3.5-sonnet": "claude-sonnet-4-5",
  "claude-3.5-haiku": "claude-haiku-3-5",
  "claude-sonnet-4.5": "claude-sonnet-4-5",
  "claude-sonnet-4.6": "claude-sonnet-4-6",
  "claude-opus-4.5": "claude-opus-4-5",
  "claude-opus-4.1": "claude-opus-4-1",
  "claude-haiku-4.5": "claude-haiku-4-5",
  "claude-haiku-3.5": "claude-haiku-3-5",
};

/** Exported for the staleness and coverage tests. */
export const __pricingMeta = {
  PRICING,
  MODEL_ALIASES,
  PRICING_SOURCES,
  PRICING_VERIFIED_ON,
  PRICING_MAX_AGE_DAYS,
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

registerCapability("llm-cost-calculate", async (input: CapabilityInput) => {
  const requested = ((input.model as string) ?? "gpt-4o").trim().toLowerCase();
  const model = MODEL_ALIASES[requested] ?? requested;
  const pricing = PRICING[model];
  if (!pricing) {
    throw new Error(
      `Unknown model '${requested}'. Supported: ${Object.keys(PRICING).join(", ")}`,
    );
  }

  // Accept either text or token count directly
  let inputTokens: number;
  let outputTokens: number;

  if (typeof input.prompt_tokens === "number") {
    inputTokens = input.prompt_tokens;
  } else if (typeof input.prompt_text === "string") {
    inputTokens = estimateTokens(input.prompt_text);
  } else {
    throw new Error("'prompt_text' (string) or 'prompt_tokens' (number) is required.");
  }

  if (typeof input.completion_tokens === "number") {
    outputTokens = input.completion_tokens;
  } else if (typeof input.completion_text === "string") {
    outputTokens = estimateTokens(input.completion_text);
  } else {
    outputTokens = 0;
  }

  const totalTokens = inputTokens + outputTokens;
  const costUsd = (inputTokens / 1000) * pricing.inputPer1K + (outputTokens / 1000) * pricing.outputPer1K;

  // Find cheaper alternatives
  const alternatives = Object.entries(PRICING)
    .filter(([m]) => m !== model)
    .map(([m, p]) => {
      const altCost = (inputTokens / 1000) * p.inputPer1K + (outputTokens / 1000) * p.outputPer1K;
      const savingsPercent = costUsd > 0 ? Math.round(((costUsd - altCost) / costUsd) * 100) : 0;
      return { model: m, cost_usd: Math.round(altCost * 1000000) / 1000000, savings_percent: savingsPercent, context_window: p.context };
    })
    .filter((a) => a.savings_percent > 0)
    .sort((a, b) => b.savings_percent - a.savings_percent);

  return {
    output: {
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      cost_usd: Math.round(costUsd * 1000000) / 1000000,
      model_pricing: { input_per_1k: pricing.inputPer1K, output_per_1k: pricing.outputPer1K },
      context_window: pricing.context,
      cheaper_alternatives: alternatives.slice(0, 5),
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});
