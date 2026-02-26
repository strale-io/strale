import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("translate", async (input: CapabilityInput) => {
  const text = ((input.text as string) ?? (input.task as string) ?? "").trim();
  if (!text) {
    throw new Error("'text' is required. Provide text to translate.");
  }

  const targetLang = ((input.target_language as string) ?? (input.to as string) ?? "English").trim();
  const sourceLang = ((input.source_language as string) ?? (input.from as string) ?? "").trim();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Translate the following text to ${targetLang}.${sourceLang ? ` The source language is ${sourceLang}.` : " Auto-detect the source language."}

Return ONLY valid JSON:
{
  "translated_text": "the translation",
  "source_language": "detected or specified source language",
  "target_language": "${targetLang}",
  "confidence": "high/medium/low"
}

Text to translate:
"${text}"`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Translation failed.");

  const output = JSON.parse(jsonMatch[0]);

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
