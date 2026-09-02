import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

registerCapability("webhook-test-payload", async (input: CapabilityInput) => {
  const service = ((input.service as string) ?? "").trim().toLowerCase();
  const eventType = ((input.event_type as string) ?? (input.event as string) ?? "").trim();

  if (!service) throw new Error("'service' (stripe/github/slack/twilio/sendgrid/shopify) is required.");
  if (!eventType) throw new Error("'event_type' is required.");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: MODELS.capability_default.id,
    maxTokens: 2000,
    prompt: `Generate a realistic test webhook payload for ${service} with event type "${eventType}". The payload should match the actual ${service} webhook schema as closely as possible. Return ONLY valid JSON.

Return JSON:
{
  "payload": <the webhook payload object matching ${service}'s actual format>,
  "headers": {"Content-Type": "application/json", <include service-specific headers like Stripe-Signature, X-GitHub-Event, etc with placeholder values>},
  "event_type": "${eventType}",
  "documentation_url": "URL to the ${service} webhook documentation for this event"
}`,
    truncationGuidance: "This event type's payload produced more content than fits in one call.",
    parseFailureError: () => new Error("Failed to generate webhook payload."),
  });
  output.service = service;

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
