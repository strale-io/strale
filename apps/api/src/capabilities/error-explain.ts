import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("error-explain", async (input: CapabilityInput) => {
  const error = ((input.error as string) ?? (input.error_message as string) ?? (input.task as string) ?? "").trim();
  if (!error) throw new Error("'error' (error message or stack trace) is required.");

  const language = ((input.language as string) ?? "").trim();
  const context = ((input.context as string) ?? "").trim();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Explain this error and suggest fixes. Return ONLY valid JSON.

Error:
${error.slice(0, 3000)}${language ? `\nLanguage/Framework: ${language}` : ""}${context ? `\nContext: ${context}` : ""}

Return JSON:
{
  "error_type": "the type/category of error",
  "plain_explanation": "what this error means in plain English",
  "root_cause": "most likely root cause",
  "fixes": [{"description": "fix description", "code_example": "code snippet or null"}],
  "prevention": "how to prevent this error in the future",
  "related_errors": ["similar errors to be aware of"],
  "search_terms": ["useful search terms for this error"]
}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to explain error.");

  return {
    output: JSON.parse(jsonMatch[0]),
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
