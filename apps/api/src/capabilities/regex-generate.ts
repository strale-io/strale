import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("regex-generate", async (input: CapabilityInput) => {
  const description = ((input.description as string) ?? (input.task as string) ?? "").trim();
  if (!description) throw new Error("'description' is required. Describe what you want to match.");

  const testStrings = (input.test_strings as string[]) ?? [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const testSection = testStrings.length > 0
    ? `\nTest against these strings and report results:\n${testStrings.map((s, i) => `${i + 1}. "${s}"`).join("\n")}`
    : "";

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content: `Generate a regular expression for this requirement. Return ONLY valid JSON.

Requirement: "${description}"${testSection}

{
  "regex": "the regex pattern (without delimiters)",
  "flags": "regex flags if needed (e.g. 'gi')",
  "explanation": "brief explanation of each part of the regex",
  "test_results": [
    {"input": "string", "matches": true/false, "match": "matched text or null"}
  ]
}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Regex generation failed.");

  const output = JSON.parse(jsonMatch[0]);

  // Verify regex is valid
  try {
    new RegExp(output.regex, output.flags ?? "");
  } catch (e) {
    throw new Error(`Generated regex is invalid: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Run test strings if provided and not already tested
  if (testStrings.length > 0 && (!output.test_results || output.test_results.length === 0)) {
    const re = new RegExp(output.regex, output.flags ?? "");
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
