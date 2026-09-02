import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

registerCapability("jsdoc-generate", async (input: CapabilityInput) => {
  const code = ((input.code as string) ?? (input.source as string) ?? (input.task as string) ?? "").trim();
  if (!code) throw new Error("'code' (JavaScript/TypeScript code to document) is required.");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: MODELS.capability_default.id,
    maxTokens: 2000,
    prompt: `Add JSDoc comments to all functions/classes/methods in this code. Return ONLY valid JSON.

Code:
${code.slice(0, 5000)}

Return JSON:
{
  "documented_code": "the code with JSDoc comments added",
  "functions_documented": 0,
  "tags_used": ["@param", "@returns", "@throws", "@example"],
  "type_annotations_added": 0
}`,
    truncationGuidance: "Provide a shorter code snippet per call.",
    parseFailureError: () => new Error("Failed to generate JSDoc."),
  });

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
