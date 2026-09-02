import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

registerCapability("openapi-generate", async (input: CapabilityInput) => {
  const description = ((input.description as string) ?? (input.task as string) ?? "").trim();
  if (!description) throw new Error("'description' (natural language API description or endpoint list) is required.");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: MODELS.capability_default.id,
    maxTokens: 4000,
    prompt: `Generate a complete OpenAPI 3.1 specification from this API description. Return ONLY valid JSON.

Description:
${description.slice(0, 6000)}

Return JSON:
{
  "spec": "the complete OpenAPI 3.1 spec as a YAML string",
  "endpoints": [{"method": "GET/POST/etc", "path": "/path", "summary": "description"}],
  "schemas": ["list of schema names defined"],
  "total_paths": <number>
}`,
    truncationGuidance: "Describe fewer endpoints per call.",
    parseFailureError: () => new Error("Failed to generate OpenAPI spec."),
  });

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
