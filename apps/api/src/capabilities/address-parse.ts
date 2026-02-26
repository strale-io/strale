import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("address-parse", async (input: CapabilityInput) => {
  const address = ((input.address as string) ?? (input.text as string) ?? (input.task as string) ?? "").trim();
  if (!address) {
    throw new Error("'address' is required. Provide an address string to parse.");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `Parse this address into structured components. Return ONLY valid JSON.

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
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Address parsing failed.");

  const output = JSON.parse(jsonMatch[0]);

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
