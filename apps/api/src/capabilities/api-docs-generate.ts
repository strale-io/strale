import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

registerCapability("api-docs-generate", async (input: CapabilityInput) => {
  const openapiSpec = (input.openapi_spec as string)?.trim();
  const endpointDesc = (input.endpoint_description as string)?.trim();

  if (!openapiSpec && !endpointDesc) {
    throw new Error("'openapi_spec' (JSON/YAML string) or 'endpoint_description' (natural language) is required.");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const sourceText = openapiSpec
    ? `OpenAPI/Swagger spec:\n${openapiSpec.slice(0, 10000)}`
    : `Endpoint description:\n${endpointDesc!.slice(0, 5000)}`;

  const client = new Anthropic({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: MODELS.capability_default.id,
    maxTokens: 2000,
    prompt: `Generate API documentation from this specification. Return ONLY valid JSON.

${sourceText}

Return JSON:
{
  "markdown": "full markdown documentation with: ## Description, ## Authentication, ## Endpoints (with ### for each endpoint), ### Parameters table, ### Request Example, ### Response Example, ### Error Codes",
  "endpoints_documented": [
    {
      "method": "GET/POST/PUT/DELETE",
      "path": "/api/path",
      "summary": "one line description",
      "parameters_count": <number>,
      "requires_auth": <true/false>
    }
  ],
  "total_endpoints": <number>,
  "authentication_type": "bearer/api-key/basic/oauth2/none"
}`,
    truncationGuidance: "Provide a smaller spec or split it into fewer endpoints per call.",
    parseFailureError: () => new Error("Failed to generate API docs."),
  });
  output.source_type = openapiSpec ? "openapi" : "natural_language";

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
