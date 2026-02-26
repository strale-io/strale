import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("openapi-generate", async (input: CapabilityInput) => {
  const description = ((input.description as string) ?? (input.task as string) ?? "").trim();
  if (!description) throw new Error("'description' (natural language API description or endpoint list) is required.");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `Generate a complete OpenAPI 3.1 specification from this API description. Return ONLY valid JSON.

Description:
${description.slice(0, 6000)}

Return JSON:
{
  "spec": "the complete OpenAPI 3.1 spec as a YAML string",
  "endpoints": [{"method": "GET/POST/etc", "path": "/path", "summary": "description"}],
  "schemas": ["list of schema names defined"],
  "total_paths": <number>
}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to generate OpenAPI spec.");

  const output = JSON.parse(jsonMatch[0]);

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
