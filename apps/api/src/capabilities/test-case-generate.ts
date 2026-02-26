import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("test-case-generate", async (input: CapabilityInput) => {
  const description = ((input.function_description as string) ?? (input.description as string) ?? (input.task as string) ?? "").trim();
  if (!description) throw new Error("'function_description' (natural language or function signature) is required.");

  const language = ((input.language as string) ?? "").trim();
  const includeEdgeCases = (input.include_edge_cases as boolean) ?? true;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const langNote = language ? `Target language: ${language}` : "Infer the programming language from the function signature";

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Generate test cases for this function. Return ONLY valid JSON.

Function:
${description.slice(0, 4000)}

${langNote}
Include edge cases: ${includeEdgeCases}

Return JSON:
{
  "test_cases": [
    {
      "name": "descriptive test name",
      "input": <input value(s) as JSON>,
      "expected_output": <expected result as JSON>,
      "description": "what this test verifies",
      "category": "happy_path/edge_case/boundary/error_case"
    }
  ],
  "total_cases": <number>,
  "coverage_notes": "what aspects are covered and any gaps",
  "language_detected": "the programming language"
}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to generate test cases.");

  const output = JSON.parse(jsonMatch[0]);

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
