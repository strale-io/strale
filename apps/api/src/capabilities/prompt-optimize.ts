import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

// Output-token ceiling for a single optimization pass. Kept conservatively below
// the model's maximum output so we never request more than it can return.
const MAX_OUTPUT_TOKENS = 8000;

// Largest prompt we'll accept. The model echoes the full improved prompt back
// inside a JSON envelope, so output ≈ input — beyond a certain size the response
// can't fit in MAX_OUTPUT_TOKENS and the JSON truncates mid-string. This limit is
// derived from the ceiling so that accepting a prompt implies we can actually
// optimize it in one pass: ~18000 chars ≈ 4500 input tokens, and the maxTokens
// formula below then yields ceil(4500*1.6)+800 = 8000 = the ceiling. Reject larger
// inputs upfront (before the paid API call) with an actionable message.
const MAX_PROMPT_CHARS = 18000;

registerCapability("prompt-optimize", async (input: CapabilityInput) => {
  const currentPrompt = ((input.current_prompt as string) ?? (input.prompt as string) ?? (input.task as string) ?? "").trim();
  if (!currentPrompt) throw new Error("'current_prompt' is required.");
  if (currentPrompt.length > MAX_PROMPT_CHARS) {
    throw new Error(
      `'current_prompt' is too large to optimize (${currentPrompt.length} chars, max ${MAX_PROMPT_CHARS}). ` +
        `Trim it to the prompt template itself — strip embedded context, data dumps, or transcripts — and retry.`,
    );
  }

  const taskDescription = ((input.task_description as string) ?? "").trim();
  const goodExamples = (input.good_examples as string[]) ?? [];
  const badExamples = (input.bad_examples as string[]) ?? [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  let examplesSection = "";
  if (goodExamples.length > 0) {
    examplesSection += `\nGood output examples:\n${goodExamples.map((e, i) => `${i + 1}. ${e}`).join("\n")}`;
  }
  if (badExamples.length > 0) {
    examplesSection += `\nBad output examples (avoid these):\n${badExamples.map((e, i) => `${i + 1}. ${e}`).join("\n")}`;
  }

  // The response must contain the entire improved prompt (≈ the input size) plus the
  // analysis envelope. Scale the output budget to the input so large prompts don't
  // truncate, with a floor for short prompts and a ceiling the model supports.
  const estimatedInputTokens = Math.ceil(currentPrompt.length / 4);
  // ×1.6: improved prompt can exceed the original; +800: fixed JSON envelope
  // (changes_made, scores, issues, techniques). Floor 1500 = old default for
  // short prompts; ceiling = MAX_OUTPUT_TOKENS (see above).
  const maxTokens = Math.min(MAX_OUTPUT_TOKENS, Math.max(1500, Math.ceil(estimatedInputTokens * 1.6) + 800));

  const client = new Anthropic({ apiKey });
  // If the model hit the output ceiling the JSON is truncated mid-string and
  // unparseable. extractJsonWithLlm's stop_reason check catches this before
  // parsing is attempted and throws a CapabilityRefusalError (caller_input)
  // rather than the plain Error this used to throw — the plain Error
  // classified as `internal` under transaction-failure-taxonomy.ts, the
  // same misclassification PR #314 fixed on web-extract.
  const output = await extractJsonWithLlm({
    client,
    model: MODELS.capability_default.id,
    maxTokens: maxTokens,
    prompt: `You are a prompt engineering expert. Analyze and improve this prompt. Return ONLY valid JSON.

Current prompt:
"""
${currentPrompt}
"""
${taskDescription ? `\nTask this prompt should accomplish: ${taskDescription}` : ""}${examplesSection}

Return JSON:
{
  "improved_prompt": "the full improved prompt text",
  "changes_made": [
    { "change": "description of change", "reasoning": "why this improves it" }
  ],
  "original_token_estimate": <approximate tokens in original>,
  "improved_token_estimate": <approximate tokens in improved>,
  "clarity_score": { "original": <1-10>, "improved": <1-10> },
  "issues_found": ["issues with the original prompt"],
  "techniques_applied": ["prompt engineering techniques used"]
}`,
    truncationGuidance: "Shorten the prompt and retry.",
    parseFailureError: () => new Error("Failed to optimize prompt: the optimizer returned malformed output. Please retry."),
  });

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
