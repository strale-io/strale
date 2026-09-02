import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

registerCapability("docstring-generate", async (input: CapabilityInput) => {
  const code = ((input.code as string) ?? (input.source as string) ?? (input.task as string) ?? "").trim();
  if (!code) throw new Error("'code' (Python code to document) is required.");

  const style = ((input.style as string) ?? "google").trim().toLowerCase();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: MODELS.capability_default.id,
    maxTokens: 2000,
    prompt: `Add Python docstrings to all functions/classes/methods in this code. Use ${style} style. Return ONLY valid JSON.

Code:
${code.slice(0, 5000)}

Return JSON:
{
  "documented_code": "the code with docstrings added",
  "style": "${style}",
  "functions_documented": 0,
  "classes_documented": 0
}`,
    truncationGuidance: "Provide a shorter code snippet per call.",
    parseFailureError: () => new Error("Failed to generate docstrings."),
  });

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
