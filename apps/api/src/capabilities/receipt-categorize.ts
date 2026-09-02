import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import { extractJsonObject } from "./lib/llm-json.js";
import Anthropic from "@anthropic-ai/sdk";
import { safeFetch } from "../lib/safe-fetch.js";
import {
  MAX_DECODED_IMAGE_BYTES,
  checkedBase64,
  readBodyWithLimit,
} from "../lib/resource-limits.js";

registerCapability("receipt-categorize", async (input: CapabilityInput) => {
  const imageUrl = (input.image_url as string)?.trim() ?? (input.url as string)?.trim();
  const rawBase64 = (input.base64 as string)?.trim();
  const text = (input.text as string)?.trim();

  if (!imageUrl && !rawBase64 && !text) {
    throw new Error("'image_url', 'base64', or 'text' is required.");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [];

  if (rawBase64) {
    // #412: normalised, measured, and refused-if-oversized in one step; the
    // returned string is the one that was measured — sniffed and sent as-is.
    const base64 = checkedBase64(rawBase64, MAX_DECODED_IMAGE_BYTES);
    const mediaType = base64.startsWith("/9j") ? "image/jpeg" : "image/png";
    messages.push({
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
        { type: "text", text: EXTRACT_PROMPT },
      ],
    });
  } else if (imageUrl) {
    // F-0-006: safeFetch guards SSRF when fetching a user-supplied image URL.
    const res = await safeFetch(imageUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Failed to fetch image: HTTP ${res.status}`);
    // #412: streamed with a cap, not arrayBuffer() — a post-buffer length
    // check bounds nothing because the bytes are already resident. The refusal
    // names the field the caller actually used.
    const buf = await readBodyWithLimit(
      res,
      MAX_DECODED_IMAGE_BYTES,
      input.image_url ? "image_url" : "url",
    );
    const contentType = res.headers.get("content-type") ?? "";
    const mediaType = contentType.includes("jpeg") || contentType.includes("jpg") ? "image/jpeg" : "image/png";
    messages.push({
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: buf.toString("base64") } },
        { type: "text", text: EXTRACT_PROMPT },
      ],
    });
  } else {
    messages.push({ role: "user", content: `${EXTRACT_PROMPT}\n\nReceipt text:\n${text!.slice(0, 5000)}` });
  }

  const r = await client.messages.create({
    model: MODELS.capability_default.id,
    max_tokens: 1000,
    messages,
  });

  const responseText = r.content[0]?.type === "text" ? r.content[0].text.trim() : "";
  const parsedOutput = extractJsonObject(responseText);
  if (!parsedOutput) throw new Error("Failed to parse receipt.");

  return {
    output: parsedOutput,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});

const EXTRACT_PROMPT = `Extract structured data from this receipt. Return ONLY valid JSON.

{
  "vendor_name": "store/vendor name",
  "date": "transaction date (ISO format if possible)",
  "total_amount": <number>,
  "subtotal": <number or null>,
  "tax_amount": <number or null>,
  "tip_amount": <number or null>,
  "currency": "USD/EUR/SEK/etc",
  "category": "meals/transport/office/software/accommodation/entertainment/groceries/utilities/other",
  "payment_method": "cash/card/digital or null",
  "card_last_four": "last 4 digits or null",
  "line_items": [
    {"description": "item", "quantity": <number or null>, "unit_price": <number or null>, "amount": <number>}
  ],
  "expense_report_fields": {
    "vendor": "vendor name",
    "date": "date",
    "amount": <total>,
    "currency": "currency",
    "category": "expense category",
    "description": "brief description for expense report"
  }
}`;
