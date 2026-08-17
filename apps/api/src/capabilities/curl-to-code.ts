import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

registerCapability("curl-to-code", async (input: CapabilityInput) => {
  const curlCommand = ((input.curl_command as string) ?? (input.curl as string) ?? (input.task as string) ?? "").trim();
  if (!curlCommand) throw new Error("'curl_command' is required.");

  const targetLanguage = ((input.target_language as string) ?? (input.language as string) ?? "typescript").trim().toLowerCase();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: "claude-haiku-4-5-20251001",
    maxTokens: 1500,
    prompt: `Convert this curl command to ${targetLanguage} code. Return ONLY valid JSON.

curl command:
${curlCommand.slice(0, 3000)}

Return JSON:
{
  "code": "the equivalent code in ${targetLanguage}",
  "language": "${targetLanguage}",
  "dependencies_needed": ["list of packages/libraries needed"],
  "notes": ["any conversion notes or caveats"]
}`,
    truncationGuidance: "Provide a shorter curl command.",
    parseFailureError: () => new Error("Failed to convert curl."),
  });

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
