import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("sql-generate", async (input: CapabilityInput) => {
  const query = ((input.natural_language_query as string) ?? (input.query as string) ?? (input.task as string) ?? "").trim();
  if (!query) throw new Error("'natural_language_query' is required.");

  const tableSchema = ((input.table_schema as string) ?? "").trim();
  const dialect = ((input.dialect as string) ?? "postgres").trim().toLowerCase();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const schemaSection = tableSchema ? `\nTable schema:\n${tableSchema.slice(0, 6000)}` : "";

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Generate a SQL query from this natural language description. Dialect: ${dialect}. Return ONLY valid JSON.

Query: "${query}"${schemaSection}

Return JSON:
{
  "sql": "the SQL query",
  "explanation": "plain language explanation of what the query does",
  "tables_referenced": ["list of tables used"],
  "joins_used": ["list of join types used, e.g. 'INNER JOIN users ON...'"],
  "estimated_complexity": "simple/moderate/complex"
}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to generate SQL.");

  const output = JSON.parse(jsonMatch[0]);
  output.dialect = dialect;

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
