import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

registerCapability("regex-explain", async (input: CapabilityInput) => {
  const pattern = ((input.regex as string) ?? (input.pattern as string) ?? (input.task as string) ?? "").trim();
  if (!pattern) throw new Error("'regex' (regular expression pattern) is required.");

  const testStrings = (input.test_strings as string[]) ?? [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: MODELS.capability_default.id,
    maxTokens: 1500,
    prompt: `Explain this regular expression in detail. Return ONLY valid JSON.

Regex: ${pattern}${testStrings.length > 0 ? `\nTest strings: ${JSON.stringify(testStrings)}` : ""}

Return JSON:
{
  "plain_english": "one-sentence summary of what this regex matches",
  "breakdown": [{"token": "regex token", "explanation": "what it does"}],
  "flags_detected": {"g": false, "i": false, "m": false},
  "capture_groups": <number>,
  "common_matches": ["example strings that would match"],
  "common_non_matches": ["example strings that would NOT match"]${testStrings.length > 0 ? ',\n  "test_results": [{"input": "string", "matches": true, "matched_text": "match or null"}]' : ""}
}`,
    truncationGuidance: "Provide fewer test_strings per call.",
    parseFailureError: () => new Error("Failed to explain regex."),
  });
  output.original_regex = pattern;

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
