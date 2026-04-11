import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("prompt-optimize", async (input: CapabilityInput) => {
  const currentPrompt = ((input.current_prompt as string) ?? (input.prompt as string) ?? (input.task as string) ?? "").trim();
  if (!currentPrompt) throw new Error("'current_prompt' is required.");

  const taskDescription = ((input.task_description as string) ?? "").trim();
  const goodExamples = (input.good_examples as string[]) ?? [];
  const badExamples = (input.bad_examples as string[]) ?? [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  let examplesSection = "";
  if (goodExamples.length > 0) {
    examplesSection += `\nGood output examples:\n${goodExamples.map((e, i) => `${i + 1}. ${e}`).join("\n")}`;
  }
  if (badExamples.length > 0) {
    examplesSection += `\nBad output examples (avoid these):\n${badExamples.map((e, i) => `${i + 1}. ${e}`).join("\n")}`;
  }

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `You are a prompt engineering expert. Analyze and improve this prompt. Return ONLY valid JSON.

Current prompt:
"""
${currentPrompt}
"""
${taskDescription ? `\nTask this prompt should accomplish: ${taskDescription}` : ""}${examplesSection}

Return JSON:
{
  "improved_prompt": "the full improved prompt text",
  "changes_made": [
    { "change": "description of change", "reasoning": "why this improves it" }
  ],
  "original_token_estimate": <approximate tokens in original>,
  "improved_token_estimate": <approximate tokens in improved>,
  "clarity_score": { "original": <1-10>, "improved": <1-10> },
  "issues_found": ["issues with the original prompt"],
  "techniques_applied": ["prompt engineering techniques used"]
}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to optimize prompt.");

  return {
    output: JSON.parse(jsonMatch[0]),
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
