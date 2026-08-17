import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

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
  const output = await extractJsonWithLlm({
    client,
    model: "claude-haiku-4-5-20251001",
    maxTokens: 2000,
    prompt: `Translate the following text to ${targetLang}.${sourceLang ? ` The source language is ${sourceLang}.` : " Auto-detect the source language."}

Return ONLY valid JSON:
{
  "translated_text": "the translation",
  "source_language": "detected or specified source language",
  "target_language": "${targetLang}",
  "confidence": "high/medium/low"
}

Text to translate:
"${text}"`,
    truncationGuidance: "Provide a shorter text excerpt per call.",
    parseFailureError: () => new Error("Translation failed."),
  });

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
