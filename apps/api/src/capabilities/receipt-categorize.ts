import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { safeFetch } from "../lib/safe-fetch.js";

registerCapability("receipt-categorize", async (input: CapabilityInput) => {
  const imageUrl = (input.image_url as string)?.trim() ?? (input.url as string)?.trim();
  const base64 = (input.base64 as string)?.trim();
  const text = (input.text as string)?.trim();

  if (!imageUrl && !base64 && !text) {
    throw new Error("'image_url', 'base64', or 'text' is required.");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [];

  if (base64) {
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
    const buf = Buffer.from(await res.arrayBuffer());
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
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1000,
    messages,
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse receipt.");

  return {
    output: JSON.parse(jsonMatch[0]),
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
