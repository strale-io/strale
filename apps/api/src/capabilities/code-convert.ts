import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

registerCapability("code-convert", async (input: CapabilityInput) => {
  const code = ((input.code as string) ?? (input.source_code as string) ?? (input.task as string) ?? "").trim();
  if (!code) throw new Error("'code' (source code to convert) is required.");

  const fromLang = ((input.from_language as string) ?? (input.source_language as string) ?? "").trim().toLowerCase();
  const toLang = ((input.to_language as string) ?? (input.target_language as string) ?? "").trim().toLowerCase();
  if (!toLang) throw new Error("'to_language' (target programming language) is required.");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: "claude-haiku-4-5-20251001",
    maxTokens: 3000,
    prompt: `Convert this code${fromLang ? ` from ${fromLang}` : ""} to ${toLang}. Use idiomatic ${toLang} patterns. Return ONLY valid JSON.

Source code:
${code.slice(0, 5000)}

Return JSON:
{
  "converted_code": "the converted code in ${toLang}",
  "source_language": "${fromLang || "auto-detected"}",
  "target_language": "${toLang}",
  "dependencies_needed": ["packages/imports needed"],
  "conversion_notes": ["caveats or behavior differences"],
  "confidence": "high/medium/low"
}`,
    truncationGuidance: "Provide a shorter code snippet per call.",
    parseFailureError: () => new Error("Failed to convert code."),
  });

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
