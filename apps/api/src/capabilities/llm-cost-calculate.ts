import { registerCapability, type CapabilityInput } from "./index.js";

// Pricing per 1K tokens (USD) — updated Feb 2025
const PRICING: Record<string, { inputPer1K: number; outputPer1K: number; context: number }> = {
  "gpt-4o": { inputPer1K: 0.0025, outputPer1K: 0.01, context: 128000 },
  "gpt-4o-mini": { inputPer1K: 0.00015, outputPer1K: 0.0006, context: 128000 },
  "gpt-4-turbo": { inputPer1K: 0.01, outputPer1K: 0.03, context: 128000 },
  "gpt-4": { inputPer1K: 0.03, outputPer1K: 0.06, context: 8192 },
  "gpt-3.5-turbo": { inputPer1K: 0.0005, outputPer1K: 0.0015, context: 16385 },
  "claude-3-opus": { inputPer1K: 0.015, outputPer1K: 0.075, context: 200000 },
  "claude-3-sonnet": { inputPer1K: 0.003, outputPer1K: 0.015, context: 200000 },
  "claude-3-haiku": { inputPer1K: 0.00025, outputPer1K: 0.00125, context: 200000 },
  "claude-3.5-sonnet": { inputPer1K: 0.003, outputPer1K: 0.015, context: 200000 },
  "claude-3.5-haiku": { inputPer1K: 0.0008, outputPer1K: 0.004, context: 200000 },
  "gemini-1.5-pro": { inputPer1K: 0.00125, outputPer1K: 0.005, context: 2000000 },
  "gemini-1.5-flash": { inputPer1K: 0.000075, outputPer1K: 0.0003, context: 1000000 },
  "mistral-large": { inputPer1K: 0.002, outputPer1K: 0.006, context: 128000 },
  "llama-3-70b": { inputPer1K: 0.00059, outputPer1K: 0.00079, context: 8192 },
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

registerCapability("llm-cost-calculate", async (input: CapabilityInput) => {
  const model = ((input.model as string) ?? "gpt-4o").trim().toLowerCase();
  const pricing = PRICING[model];
  if (!pricing) throw new Error(`Unknown model '${model}'. Supported: ${Object.keys(PRICING).join(", ")}`);

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
