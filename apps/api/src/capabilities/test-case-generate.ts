import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

registerCapability("test-case-generate", async (input: CapabilityInput) => {
  const description = ((input.function_description as string) ?? (input.description as string) ?? (input.task as string) ?? "").trim();
  if (!description) throw new Error("'function_description' (natural language or function signature) is required.");

  const language = ((input.language as string) ?? "").trim();
  const includeEdgeCases = (input.include_edge_cases as boolean) ?? true;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const langNote = language ? `Target language: ${language}` : "Infer the programming language from the function signature";

  const client = new Anthropic({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: "claude-haiku-4-5-20251001",
    maxTokens: 2000,
    prompt: `Generate test cases for this function. Return ONLY valid JSON.

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
    truncationGuidance: "Request fewer test cases per call, or set include_edge_cases to false.",
    parseFailureError: () => new Error("Failed to generate test cases."),
  });

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
