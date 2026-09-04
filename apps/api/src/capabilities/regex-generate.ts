import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";
import { readStringArray } from "../lib/capability-input.js";

registerCapability("regex-generate", async (input: CapabilityInput) => {
  const description = ((input.description as string) ?? (input.task as string) ?? "").trim();
  if (!description) throw new Error("'description' is required. Describe what you want to match.");

  const testStrings = readStringArray(input.test_strings, "test_strings");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const testSection = testStrings.length > 0
    ? `\nTest against these strings and report results:\n${testStrings.map((s, i) => `${i + 1}. "${s}"`).join("\n")}`
    : "";

  const client = new Anthropic({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: MODELS.capability_default.id,
    maxTokens: 800,
    prompt: `Generate a regular expression for this requirement. Return ONLY valid JSON.

Requirement: "${description}"${testSection}

{
  "regex": "the regex pattern (without delimiters)",
  "flags": "regex flags if needed (e.g. 'gi')",
  "explanation": "brief explanation of each part of the regex",
  "test_results": [
    {"input": "string", "matches": true/false, "match": "matched text or null"}
  ]
}`,
    truncationGuidance: "Provide fewer test_strings per call.",
    parseFailureError: () => new Error("Regex generation failed."),
  });

  const regexPattern = output.regex as string;
  const regexFlags = (output.flags as string | undefined) ?? "";

  // Verify regex is valid
  try {
    new RegExp(regexPattern, regexFlags);
  } catch (e) {
    throw new Error(`Generated regex is invalid: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Run test strings if provided and not already tested
  const existingResults = output.test_results as unknown[] | undefined;
  if (testStrings.length > 0 && (!existingResults || existingResults.length === 0)) {
    const re = new RegExp(regexPattern, regexFlags);
    output.test_results = testStrings.map((s) => {
      const m = s.match(re);
      return { input: s, matches: !!m, match: m ? m[0] : null };
    });
  }

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
