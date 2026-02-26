import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("hs-code-lookup", async (input: CapabilityInput) => {
  const query = ((input.product as string) ?? (input.description as string) ?? (input.task as string) ?? "").trim();
  if (!query) {
    throw new Error("'product' or 'description' is required. Describe the product to classify.");
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
        content: `You are an expert in the Harmonized System (HS) commodity classification. Classify the following product/description and return the most likely HS codes.

Product: "${query}"

Return ONLY valid JSON:
{
  "query": "${query}",
  "primary_hs_code": "XXXX.XX (6-digit HS code)",
  "primary_description": "Official HS heading description",
  "chapter": "XX",
  "chapter_description": "Chapter description",
  "section": "Section number and description",
  "alternative_codes": [
    {
      "hs_code": "XXXX.XX",
      "description": "Why this could also apply",
      "confidence": "high/medium/low"
    }
  ],
  "notes": "Any classification notes or caveats",
  "confidence": "high/medium/low"
}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to classify product.");

  const output = JSON.parse(jsonMatch[0]);

  return {
    output,
    provenance: { source: "llm-classification", fetched_at: new Date().toISOString() },
  };
});
