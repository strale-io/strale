import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("webhook-test-payload", async (input: CapabilityInput) => {
  const service = ((input.service as string) ?? "").trim().toLowerCase();
  const eventType = ((input.event_type as string) ?? (input.event as string) ?? "").trim();

  if (!service) throw new Error("'service' (stripe/github/slack/twilio/sendgrid/shopify) is required.");
  if (!eventType) throw new Error("'event_type' is required.");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Generate a realistic test webhook payload for ${service} with event type "${eventType}". The payload should match the actual ${service} webhook schema as closely as possible. Return ONLY valid JSON.

Return JSON:
{
  "payload": <the webhook payload object matching ${service}'s actual format>,
  "headers": {"Content-Type": "application/json", <include service-specific headers like Stripe-Signature, X-GitHub-Event, etc with placeholder values>},
  "event_type": "${eventType}",
  "documentation_url": "URL to the ${service} webhook documentation for this event"
}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to generate webhook payload.");

  const output = JSON.parse(jsonMatch[0]);
  output.service = service;

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
