import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("blog-post-outline", async (input: CapabilityInput) => {
  const topic = ((input.topic as string) ?? (input.task as string) ?? "").trim();
  if (!topic) throw new Error("'topic' is required.");

  const targetAudience = ((input.target_audience as string) ?? "general developers").trim();
  const tone = ((input.tone as string) ?? "professional").trim();
  const keywords = (input.keywords as string[]) ?? [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const keywordSection = keywords.length > 0 ? `\nTarget SEO keywords: ${keywords.join(", ")}` : "";

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1200,
    messages: [
      {
        role: "user",
        content: `Generate a detailed blog post outline. Return ONLY valid JSON, no prose.

Topic: "${topic}"
Target audience: ${targetAudience}
Tone: ${tone}${keywordSection}

Return JSON:
{
  "title_options": ["3 compelling title options"],
  "sections": [
    {
      "heading": "section heading",
      "subsections": ["subsection topics"],
      "key_points": ["main points to cover"],
      "estimated_words": <number>
    }
  ],
  "estimated_total_words": <number>,
  "seo_keywords": ["recommended keywords"],
  "meta_description": "suggested meta description (150 chars)",
  "hook_ideas": ["2-3 opening hook ideas"]
}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to generate outline.");

  const output = JSON.parse(jsonMatch[0]);
  output.topic = topic;
  output.target_audience = targetAudience;
  output.tone = tone;

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
