import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("prompt-compress", async (input: CapabilityInput) => {
  const promptText = ((input.prompt_text as string) ?? (input.prompt as string) ?? (input.task as string) ?? "").trim();
  if (!promptText) throw new Error("'prompt_text' is required.");

  const targetReduction = Math.min(Math.max((input.target_reduction_percent as number) ?? 30, 10), 70);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const originalTokens = Math.ceil(promptText.length / 4);

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `Compress the following prompt to be ~${targetReduction}% shorter while preserving ALL semantic meaning and instructions. Return ONLY valid JSON.

Original prompt:
${promptText.slice(0, 8000)}

Return JSON:
{
  "compressed_prompt": "the shortened prompt preserving all meaning",
  "removed_content": ["list of specific content/phrases removed or condensed"],
  "preserved_instructions": ["list of key instructions that were preserved"]
}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to compress prompt.");

  let output: Record<string, unknown>;
  try {
    output = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error(`Claude response parse failed (response may have been truncated). Raw: ${jsonMatch[0].slice(0, 200)}`);
  }
  const compressedTokens = Math.ceil((output.compressed_prompt as string).length / 4);

  output.original_tokens = originalTokens;
  output.compressed_tokens = compressedTokens;
  output.actual_reduction_percent = Math.round(((originalTokens - compressedTokens) / originalTokens) * 100);

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
