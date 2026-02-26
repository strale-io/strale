import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("docstring-generate", async (input: CapabilityInput) => {
  const code = ((input.code as string) ?? (input.source as string) ?? (input.task as string) ?? "").trim();
  if (!code) throw new Error("'code' (Python code to document) is required.");

  const style = ((input.style as string) ?? "google").trim().toLowerCase();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Add Python docstrings to all functions/classes/methods in this code. Use ${style} style. Return ONLY valid JSON.

Code:
${code.slice(0, 5000)}

Return JSON:
{
  "documented_code": "the code with docstrings added",
  "style": "${style}",
  "functions_documented": 0,
  "classes_documented": 0
}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to generate docstrings.");

  return {
    output: JSON.parse(jsonMatch[0]),
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
