import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

registerCapability("prompt-compress", async (input: CapabilityInput) => {
  const promptText = ((input.prompt_text as string) ?? (input.prompt as string) ?? (input.task as string) ?? "").trim();
  if (!promptText) throw new Error("'prompt_text' is required.");

  const targetReduction = Math.min(Math.max((input.target_reduction_percent as number) ?? 30, 10), 70);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const originalTokens = Math.ceil(promptText.length / 4);

  const client = new Anthropic({ apiKey });
  // extractJsonWithLlm's stop_reason check now catches the truncation case
  // the old try/catch's "response may have been truncated" message was
  // guessing at — a genuine max_tokens cutoff is refused distinctly, before
  // parsing is attempted at all.
  const output = await extractJsonWithLlm({
    client,
    model: MODELS.capability_default.id,
    maxTokens: 4000,
    prompt: `Compress the following prompt to be ~${targetReduction}% shorter while preserving ALL semantic meaning and instructions. Return ONLY valid JSON.

Original prompt:
${promptText.slice(0, 8000)}

Return JSON:
{
  "compressed_prompt": "the shortened prompt preserving all meaning",
  "removed_content": ["list of specific content/phrases removed or condensed"],
  "preserved_instructions": ["list of key instructions that were preserved"]
}`,
    truncationGuidance: "Provide a shorter prompt_text per call.",
    parseFailureError: (responseText) =>
      new Error(
        `Failed to compress prompt. Raw: ${responseText.slice(0, 200)}`,
      ),
  });
  const compressedTokens = Math.ceil((output.compressed_prompt as string).length / 4);

  output.original_tokens = originalTokens;
  output.compressed_tokens = compressedTokens;
  output.actual_reduction_percent = Math.round(((originalTokens - compressedTokens) / originalTokens) * 100);

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
