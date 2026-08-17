import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

registerCapability("email-draft", async (input: CapabilityInput) => {
  const context = ((input.context as string) ?? (input.task as string) ?? "").trim();
  if (!context) throw new Error("'context' is required. Describe what the email should communicate.");

  const intent = ((input.intent as string) ?? "general").trim();
  const tone = ((input.tone as string) ?? "professional").trim();
  const recipientContext = ((input.recipient_context as string) ?? "").trim();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const recipientLine = recipientContext ? `\nRecipient context: ${recipientContext}` : "";

  const client = new Anthropic({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: "claude-haiku-4-5-20251001",
    maxTokens: 1000,
    prompt: `Draft a professional email. Return ONLY valid JSON.

Context: "${context}"
Intent: ${intent} (cold_outreach/follow_up/apology/request/announcement/thank_you/general)
Tone: ${tone} (formal/casual/urgent)${recipientLine}

Return JSON:
{
  "subject_line_options": ["3 subject line options"],
  "body": "the email body (use \\n for line breaks)",
  "key_phrases_used": ["important phrases in the email"],
  "word_count": <number>,
  "tone_applied": "${tone}",
  "intent_applied": "${intent}"
}`,
    truncationGuidance: "Provide a shorter context description.",
    parseFailureError: () => new Error("Failed to draft email."),
  });

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
