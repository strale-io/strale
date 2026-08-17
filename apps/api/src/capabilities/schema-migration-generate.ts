import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

registerCapability("schema-migration-generate", async (input: CapabilityInput) => {
  const currentSchema = ((input.current_schema as string) ?? "").trim();
  const desiredSchema = ((input.desired_schema as string) ?? "").trim();
  const orm = ((input.orm as string) ?? "raw").trim().toLowerCase();

  if (!currentSchema || !desiredSchema) {
    throw new Error("'current_schema' and 'desired_schema' (CREATE TABLE statements) are required.");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: "claude-haiku-4-5-20251001",
    maxTokens: 2000,
    prompt: `Generate a database migration from current schema to desired schema. ORM: ${orm}. Return ONLY valid JSON.

Current schema:
${currentSchema.slice(0, 4000)}

Desired schema:
${desiredSchema.slice(0, 4000)}

Return JSON:
{
  "migration": "the migration code (SQL or ORM format based on '${orm}')",
  "up_sql": "raw SQL for the forward migration",
  "down_sql": "raw SQL to reverse the migration",
  "breaking_changes": ["list of changes that could break existing code"],
  "warnings": ["data loss risks, column type changes, etc"]
}`,
    truncationGuidance: "Provide a smaller schema per call.",
    parseFailureError: () => new Error("Failed to generate migration."),
  });
  output.orm = orm;

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
