import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

registerCapability("address-parse", async (input: CapabilityInput) => {
  const address = ((input.address as string) ?? (input.text as string) ?? (input.task as string) ?? "").trim();
  if (!address) {
    throw new Error("'address' is required. Provide an address string to parse.");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: "claude-haiku-4-5-20251001",
    maxTokens: 500,
    prompt: `Parse this address into structured components. Return ONLY valid JSON.

{
  "raw_address": "${address}",
  "street": "street name and number",
  "street_number": "just the number",
  "street_name": "just the street name",
  "apartment": "apartment/unit/suite number or null",
  "postal_code": "zip/postal code",
  "city": "city/town",
  "state_province": "state, province, or region",
  "country": "full country name",
  "country_code": "ISO 3166-1 alpha-2 code",
  "formatted": "standardized formatted address",
  "confidence": "high/medium/low"
}

Address: "${address}"`,
    truncationGuidance: "Provide a shorter or simpler address string.",
    parseFailureError: () => new Error("Address parsing failed."),
  });

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
