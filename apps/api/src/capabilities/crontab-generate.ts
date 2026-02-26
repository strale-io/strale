import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("crontab-generate", async (input: CapabilityInput) => {
  const description = ((input.description as string) ?? (input.schedule as string) ?? (input.task as string) ?? "").trim();
  if (!description) throw new Error("'description' (natural language schedule or cron expression) is required.");

  // If input looks like a cron expression, explain it algorithmically
  const cronRegex = /^[*\d/,\-]+\s+[*\d/,\-]+\s+[*\d/,\-]+\s+[*\d/,\-]+\s+[*\d/,\-]+$/;
  if (cronRegex.test(description.trim())) {
    return explainCron(description.trim());
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content: `Convert this schedule description to a cron expression. Return ONLY valid JSON.

Description: ${description}

Return JSON:
{
  "cron_expression": "the 5-field cron expression",
  "human_readable": "plain English description of when it runs",
  "next_5_runs": ["ISO timestamps of next 5 execution times starting from now"],
  "timezone_note": "note about timezone considerations"
}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to generate cron expression.");

  const output = JSON.parse(jsonMatch[0]);
  output.input_description = description;

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});

function explainCron(expr: string) {
  const parts = expr.split(/\s+/);
  const fieldNames = ["minute", "hour", "day_of_month", "month", "day_of_week"];
  const fields = parts.map((p, i) => ({ field: fieldNames[i], value: p }));

  function describeField(val: string, name: string): string {
    if (val === "*") return `every ${name}`;
    if (val.includes("/")) return `every ${val.split("/")[1]} ${name}(s)`;
    if (val.includes(",")) return `${name} ${val}`;
    if (val.includes("-")) return `${name} ${val.split("-")[0]} through ${val.split("-")[1]}`;
    return `${name} ${val}`;
  }

  const descriptions = parts.map((p, i) => describeField(p, fieldNames[i]));

  return {
    output: {
      cron_expression: expr,
      fields,
      human_readable: descriptions.join(", "),
      is_valid: parts.length === 5,
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
}
