import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("sql-optimize", async (input: CapabilityInput) => {
  const sql = ((input.sql as string) ?? (input.query as string) ?? (input.task as string) ?? "").trim();
  if (!sql) throw new Error("'sql' is required.");

  const tableSchema = ((input.table_schema as string) ?? "").trim();
  const dialect = ((input.dialect as string) ?? "postgres").trim().toLowerCase();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const schemaSection = tableSchema ? `\nTable schema:\n${tableSchema.slice(0, 4000)}` : "";

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Optimize this SQL query for performance. Dialect: ${dialect}. Return ONLY valid JSON.

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
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to optimize SQL.");

  const output = JSON.parse(jsonMatch[0]);
  output.dialect = dialect;
  output.original_sql = sql;

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
