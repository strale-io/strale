import { registerCapability, type CapabilityInput } from "./index.js";

// Model context windows and pricing (per 1K tokens)
const MODEL_INFO: Record<string, { context: number; inputPer1K: number; outputPer1K: number }> = {
  "gpt-4o": { context: 128000, inputPer1K: 0.0025, outputPer1K: 0.01 },
  "gpt-4o-mini": { context: 128000, inputPer1K: 0.00015, outputPer1K: 0.0006 },
  "gpt-4-turbo": { context: 128000, inputPer1K: 0.01, outputPer1K: 0.03 },
  "gpt-4": { context: 8192, inputPer1K: 0.03, outputPer1K: 0.06 },
  "gpt-3.5-turbo": { context: 16385, inputPer1K: 0.0005, outputPer1K: 0.0015 },
  "claude-3-opus": { context: 200000, inputPer1K: 0.015, outputPer1K: 0.075 },
  "claude-3-sonnet": { context: 200000, inputPer1K: 0.003, outputPer1K: 0.015 },
  "claude-3-haiku": { context: 200000, inputPer1K: 0.00025, outputPer1K: 0.00125 },
  "claude-3.5-sonnet": { context: 200000, inputPer1K: 0.003, outputPer1K: 0.015 },
  "claude-3.5-haiku": { context: 200000, inputPer1K: 0.0008, outputPer1K: 0.004 },
  "gemini-1.5-pro": { context: 2000000, inputPer1K: 0.00125, outputPer1K: 0.005 },
  "gemini-1.5-flash": { context: 1000000, inputPer1K: 0.000075, outputPer1K: 0.0003 },
  "mistral-large": { context: 128000, inputPer1K: 0.002, outputPer1K: 0.006 },
  "llama-3-70b": { context: 8192, inputPer1K: 0.00059, outputPer1K: 0.00079 },
};

// Rough tokenization: OpenAI models use ~4 chars/token, Anthropic ~3.5-4
function estimateTokens(text: string, model: string): number {
  const isOpenAI = model.startsWith("gpt");
  const charsPerToken = isOpenAI ? 4 : 3.8;
  return Math.ceil(text.length / charsPerToken);
}

registerCapability("token-count", async (input: CapabilityInput) => {
  const text = ((input.text as string) ?? (input.task as string) ?? "").trim();
  if (!text) throw new Error("'text' is required.");

  const model = ((input.model as string) ?? "gpt-4o").trim().toLowerCase();
  const info = MODEL_INFO[model];

  const tokenCount = estimateTokens(text, model);
  const contextWindow = info?.context ?? 128000;
  const costPer1K = info?.inputPer1K ?? 0.003;
  const estimatedCost = (tokenCount / 1000) * costPer1K;

  return {
    output: {
      token_count: tokenCount,
      estimated_cost_usd: Math.round(estimatedCost * 1000000) / 1000000,
      fits_context_window: tokenCount <= contextWindow,
      max_context_for_model: contextWindow,
      cost_per_1k_tokens: costPer1K,
      model,
      model_recognized: !!info,
      text_length: text.length,
      chars_per_token_used: model.startsWith("gpt") ? 4 : 3.8,
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});
