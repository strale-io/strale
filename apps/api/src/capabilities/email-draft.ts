import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

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
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `Draft a professional email. Return ONLY valid JSON.

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
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to draft email.");

  return {
    output: JSON.parse(jsonMatch[0]),
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
