import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

registerCapability("sql-explain", async (input: CapabilityInput) => {
  const sql = ((input.sql as string) ?? (input.query as string) ?? (input.task as string) ?? "").trim();
  if (!sql) throw new Error("'sql' is required.");

  const dialect = ((input.dialect as string) ?? "postgres").trim().toLowerCase();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: MODELS.capability_default.id,
    maxTokens: 1500,
    prompt: `Explain this SQL query in plain language. Dialect: ${dialect}. Return ONLY valid JSON.

SQL:
${sql.slice(0, 5000)}

Return JSON:
{
  "explanation": "plain language explanation of what the query does",
  "steps": ["step-by-step breakdown of the query execution"],
  "tables_referenced": ["tables used"],
  "potential_issues": ["N+1 queries", "missing index hints", "full table scans", etc],
  "optimization_suggestions": ["specific optimization recommendations"]
}`,
    truncationGuidance: "Provide a shorter SQL query per call.",
    parseFailureError: () => new Error("Failed to explain SQL."),
  });
  output.dialect = dialect;
  output.sql_length = sql.length;

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
