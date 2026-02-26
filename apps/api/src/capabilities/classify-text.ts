import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("classify-text", async (input: CapabilityInput) => {
  const text = ((input.text as string) ?? (input.task as string) ?? "").trim();
  if (!text) {
    throw new Error("'text' is required. Provide text to classify.");
  }

  const categories = input.categories as string[] | undefined;
  const categoriesStr = categories?.length
    ? `Classify into one of these categories: ${categories.join(", ")}`
    : "Determine the most appropriate categories for this text";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    messages: [
      {
        role: "user",
        content: `${categoriesStr}. Return ONLY valid JSON.

{
  "primary_category": "most likely category",
  "confidence": 0.0-1.0,
  "all_categories": [
    {
      "category": "category name",
      "confidence": 0.0-1.0
    }
  ],
  "detected_language": "language",
  "topic_keywords": ["keyword1", "keyword2"],
  "summary": "one sentence description of the text content"
}

Text:
"${text.slice(0, 10000)}"`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Text classification failed.");

  const output = JSON.parse(jsonMatch[0]);

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
