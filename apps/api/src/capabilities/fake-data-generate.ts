import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("fake-data-generate", async (input: CapabilityInput) => {
  const schema = input.schema;
  const fields = input.fields as Array<{ name: string; type: string; constraints?: string }> | undefined;
  const count = Math.min(Math.max((input.count as number) ?? 10, 1), 1000);
  const locale = ((input.locale as string) ?? "en").trim();

  if (!schema && !fields) throw new Error("'schema' (JSON Schema) or 'fields' (array of {name, type}) is required.");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const schemaDesc = schema
    ? `JSON Schema:\n${JSON.stringify(schema, null, 2).slice(0, 3000)}`
    : `Fields:\n${(fields ?? []).map((f) => `- ${f.name}: ${f.type}${f.constraints ? ` (${f.constraints})` : ""}`).join("\n")}`;

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `Generate ${count} records of realistic fake data. Locale: ${locale}. Return ONLY valid JSON.

${schemaDesc}

Requirements:
- Data must look realistic (real-looking names, valid email formats, plausible addresses for the locale)
- For locale "${locale}": use culturally appropriate names, addresses, phone formats
- Vary the data — don't repeat patterns
- Numbers should be in reasonable ranges
- Dates should be recent (2020-2026)

Return JSON:
{
  "data": [<array of ${count} objects matching the schema>]
}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to generate fake data.");

  const output = JSON.parse(jsonMatch[0]);
  output.schema_used = schema ? "json_schema" : "field_list";
  output.locale = locale;
  output.record_count = Array.isArray(output.data) ? output.data.length : 0;

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
