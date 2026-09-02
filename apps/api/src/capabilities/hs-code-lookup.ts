import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

registerCapability("hs-code-lookup", async (input: CapabilityInput) => {
  const query = ((input.product as string) ?? (input.description as string) ?? (input.task as string) ?? "").trim();
  if (!query) {
    throw new Error("'product' or 'description' is required. Describe the product to classify.");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: MODELS.capability_default.id,
    maxTokens: 800,
    prompt: `You are an expert in the Harmonized System (HS) commodity classification. Classify the following product/description and return the most likely HS codes.

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
    truncationGuidance: "Provide a shorter product description.",
    parseFailureError: () => new Error("Failed to classify product."),
  });

  return {
    output,
    provenance: { source: "llm-classification", fetched_at: new Date().toISOString() },
  };
});
