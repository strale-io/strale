import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("company-industry-classify", async (input: CapabilityInput) => {
  const companyName = ((input.company_name as string) ?? (input.name as string) ?? "").trim();
  const description = ((input.description as string) ?? (input.task as string) ?? "").trim();

  if (!companyName && !description) {
    throw new Error("'company_name' or 'description' is required.");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });

  const prompt = `Classify this company into standard industry codes. Return ONLY valid JSON.

Company: ${companyName || "Unknown"}
${description ? `Description: ${description}` : ""}

Return:
{
  "primary_industry": "short industry name",
  "sector": "broad sector (e.g., Technology, Healthcare, Manufacturing, Finance, Retail)",
  "classifications": [
    {
      "system": "SIC",
      "code": "4-digit SIC code",
      "description": "SIC description"
    },
    {
      "system": "NAICS",
      "code": "6-digit NAICS code",
      "description": "NAICS description"
    },
    {
      "system": "NACE",
      "code": "NACE Rev.2 code (e.g., C29.1)",
      "description": "NACE description"
    }
  ],
  "confidence": "high|medium|low"
}`;

  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });

  const text = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Classification failed — could not parse response.");

  const classified = JSON.parse(jsonMatch[0]);

  return {
    output: {
      company_name: companyName || null,
      description: description || null,
      primary_industry: classified.primary_industry,
      sector: classified.sector ?? null,
      classifications: classified.classifications ?? [],
      confidence: classified.confidence ?? "medium",
    },
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
