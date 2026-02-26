import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";

const REDACTION_PROMPT = `You are a PII (Personally Identifiable Information) redaction system.

Analyze the text and identify ALL PII, then return a JSON response with:
1. The redacted text (replace each PII instance with [REDACTED_TYPE])
2. A list of detected entities

PII types to detect and redact:
- PERSON_NAME: Full names, first names, last names
- EMAIL: Email addresses
- PHONE: Phone numbers (any format)
- SSN: Swedish personnummer (YYYYMMDD-XXXX or YYMMDD-XXXX), Finnish henkilötunnus (DDMMYY-XXXX), Norwegian fødselsnummer
- ADDRESS: Physical/postal addresses
- IBAN: Bank account numbers / IBANs
- CREDIT_CARD: Credit/debit card numbers
- PASSPORT: Passport numbers
- ID_NUMBER: National ID numbers not covered above

Return ONLY valid JSON in this exact format:
{
  "redacted_text": "string with PII replaced by [REDACTED_TYPE]",
  "entities": [
    {
      "type": "PERSON_NAME|EMAIL|PHONE|SSN|ADDRESS|IBAN|CREDIT_CARD|PASSPORT|ID_NUMBER",
      "start": 0,
      "end": 10,
      "redacted_as": "[REDACTED_PERSON_NAME]"
    }
  ],
  "entity_counts": {
    "PERSON_NAME": 0,
    "EMAIL": 0,
    "PHONE": 0,
    "SSN": 0,
    "ADDRESS": 0,
    "IBAN": 0,
    "CREDIT_CARD": 0,
    "PASSPORT": 0,
    "ID_NUMBER": 0
  }
}`;

registerCapability("pii-redact", async (input: CapabilityInput) => {
  const text = (input.text as string) ?? (input.task as string) ?? "";
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("'text' is required. Provide the text to redact PII from.");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required for pii-redact.");

  // Truncate to prevent abuse (100k chars)
  const truncated = text.length > 100000 ? text.slice(0, 100000) : text;

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `${REDACTION_PROMPT}\n\n--- TEXT TO REDACT ---\n${truncated}\n--- END TEXT ---`,
      },
    ],
  });

  const responseText =
    response.content[0].type === "text" ? response.content[0].text : "";

  const jsonStr = responseText
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse redaction result as JSON. Raw: ${responseText.slice(0, 300)}`);
  }

  return {
    output: parsed,
    provenance: {
      source: "pii-redact:claude-haiku",
      fetched_at: new Date().toISOString(),
    },
  };
});
