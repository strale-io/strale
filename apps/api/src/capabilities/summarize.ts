import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

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
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `Summarize the following text. Return ONLY valid JSON.

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
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Summarization failed.");

  const output = JSON.parse(jsonMatch[0]);

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
