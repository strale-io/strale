import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("api-mock-response", async (input: CapabilityInput) => {
  const method = ((input.method as string) ?? "GET").trim().toUpperCase();
  const url = ((input.url as string) ?? (input.endpoint as string) ?? "").trim();
  const responseSchema = input.response_schema;
  const statusCode = (input.status_code as number) ?? 200;

  if (!url) throw new Error("'url' (API endpoint path) is required.");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const schemaSection = responseSchema
    ? `Response schema:\n${JSON.stringify(responseSchema, null, 2).slice(0, 3000)}`
    : "No schema provided — generate a plausible response based on the URL pattern.";

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Generate a realistic mock API response. Return ONLY valid JSON.

Method: ${method}
URL: ${url}
Status code: ${statusCode}
${schemaSection}

Return JSON:
{
  "status_code": ${statusCode},
  "headers": {"Content-Type": "application/json", "X-Request-Id": "<uuid>", "X-RateLimit-Remaining": "<number>", ...other realistic headers},
  "body": <realistic response body matching the schema or URL pattern>,
  "content_type": "application/json"
}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to generate mock response.");

  const output = JSON.parse(jsonMatch[0]);
  output.method = method;
  output.url = url;

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
