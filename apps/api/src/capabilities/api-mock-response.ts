import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

// F-0-006 Bucket D: user URL is passed to Claude as prose for mock
// generation. Claude does not fetch the URL. No network egress from our
// side — validateUrl not required.
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
  const output = await extractJsonWithLlm({
    client,
    model: "claude-haiku-4-5-20251001",
    maxTokens: 1500,
    prompt: `Generate a realistic mock API response. Return ONLY valid JSON.

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
    truncationGuidance: "Provide a smaller response_schema.",
    parseFailureError: () => new Error("Failed to generate mock response."),
  });
  output.method = method;
  output.url = url;

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
