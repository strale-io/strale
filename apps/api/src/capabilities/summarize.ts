import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

registerCapability("summarize", async (input: CapabilityInput) => {
  const text = ((input.text as string) ?? (input.task as string) ?? "").trim();
  if (!text) {
    throw new Error("'text' is required. Provide text to summarize.");
  }

  const maxLength = (input.max_length as number) ?? 200;
  const style = ((input.style as string) ?? "paragraph").trim(); // paragraph, bullets, one_sentence

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: MODELS.capability_default.id,
    maxTokens: 1000,
    prompt: `Summarize the following text. Return ONLY valid JSON.

Style: ${style} (${style === "bullets" ? "bullet point list" : style === "one_sentence" ? "single sentence" : "paragraph"})
Maximum length: approximately ${maxLength} words

{
  "summary": "the summary text",
  "style": "${style}",
  "word_count": number,
  "key_points": ["main point 1", "main point 2", "..."],
  "detected_language": "language of the input text"
}

Text:
"${text.slice(0, 15000)}"`,
    truncationGuidance: "Provide a shorter text excerpt per call.",
    parseFailureError: () => new Error("Summarization failed."),
  });

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
