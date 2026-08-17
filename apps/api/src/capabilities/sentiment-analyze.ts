import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

registerCapability("sentiment-analyze", async (input: CapabilityInput) => {
  const text = ((input.text as string) ?? (input.task as string) ?? "").trim();
  if (!text) {
    throw new Error("'text' is required. Provide text to analyze sentiment.");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: "claude-haiku-4-5-20251001",
    maxTokens: 600,
    prompt: `Analyze the sentiment of the following text. Return ONLY valid JSON.

{
  "sentiment": "positive" | "negative" | "neutral" | "mixed",
  "confidence": 0.0-1.0,
  "scores": {
    "positive": 0.0-1.0,
    "negative": 0.0-1.0,
    "neutral": 0.0-1.0
  },
  "aspects": [
    {
      "aspect": "what the sentiment is about",
      "sentiment": "positive/negative/neutral",
      "text_span": "relevant quote"
    }
  ],
  "detected_language": "language",
  "summary": "one sentence explanation"
}

Text:
"${text.slice(0, 10000)}"`,
    truncationGuidance: "Provide a shorter text excerpt per call.",
    parseFailureError: () => new Error("Sentiment analysis failed."),
  });

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
