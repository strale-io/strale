import { MODELS } from "../lib/models.js";
import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

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
  const parsed = await extractJsonWithLlm({
    client,
    model: MODELS.capability_default.id,
    maxTokens: 4000,
    prompt: `${REDACTION_PROMPT}\n\n--- TEXT TO REDACT ---\n${truncated}\n--- END TEXT ---`,
    truncationGuidance: "Provide a shorter text excerpt per call.",
    parseFailureError: (responseText) =>
      new Error(`Failed to parse redaction result as JSON. Raw: ${responseText.slice(0, 300)}`),
  });

  // Guard on redacted_text specifically, not isEmptyExtraction: the prompt
  // asks for entity_counts with all nine keys present, zeroed. Zero is
  // information, so the generic "nothing anywhere" check would pass a
  // response whose redacted_text came back blank — the one shape that must
  // never be returned as a success, because the caller would treat empty
  // output as clean output and lose their input.
  const redactedText = parsed.redacted_text;
  if (typeof redactedText !== "string" || !redactedText.trim()) {
    throw new Error(
      `Redaction returned no text. The input was not redacted — do not treat this as ` +
        `clean output. Retry, or fall back to manual review.`,
    );
  }

  return {
    output: parsed,
    provenance: {
      source: "pii-redact:claude-haiku",
      fetched_at: new Date().toISOString(),
    },
  };
});
