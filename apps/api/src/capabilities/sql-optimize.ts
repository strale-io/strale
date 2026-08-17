import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

registerCapability("sql-optimize", async (input: CapabilityInput) => {
  const sql = ((input.sql as string) ?? (input.query as string) ?? (input.task as string) ?? "").trim();
  if (!sql) throw new Error("'sql' is required.");

  const tableSchema = ((input.table_schema as string) ?? "").trim();
  const dialect = ((input.dialect as string) ?? "postgres").trim().toLowerCase();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const schemaSection = tableSchema ? `\nTable schema:\n${tableSchema.slice(0, 4000)}` : "";

  const client = new Anthropic({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: "claude-haiku-4-5-20251001",
    maxTokens: 2000,
    prompt: `Optimize this SQL query for performance. Dialect: ${dialect}. Return ONLY valid JSON.

Original SQL:
${sql.slice(0, 5000)}${schemaSection}

Return JSON:
{
  "optimized_sql": "the rewritten SQL query",
  "changes_made": ["list of specific changes"],
  "estimated_improvement": "description of expected performance improvement",
  "index_recommendations": ["CREATE INDEX recommendations"],
  "explanation": "why these changes improve performance"
}`,
    truncationGuidance: "Provide a smaller SQL query or table_schema per call.",
    parseFailureError: () => new Error("Failed to optimize SQL."),
  });
  output.dialect = dialect;
  output.original_sql = sql;

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
