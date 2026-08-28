import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";
import { safeFetch } from "../lib/safe-fetch.js";
import { extractJsonObject, isEmptyExtraction } from "./lib/llm-json.js";
import {
  MAX_DECODED_DOCUMENT_BYTES,
  checkedBase64,
  readBodyWithLimit,
} from "./lib/image-limits.js";

const EXTRACTION_PROMPT = `You are an expert invoice data extraction system specializing in European invoices.

Extract the following fields from this invoice. Return valid JSON only, no other text.

Required output format:
{
  "vendor_name": "string or null",
  "vendor_vat": "string or null (EU VAT number including country prefix)",
  "invoice_number": "string or null",
  "invoice_date": "string or null (ISO 8601 date)",
  "due_date": "string or null (ISO 8601 date)",
  "currency": "string or null (ISO 4217 code)",
  "total_amount": "number or null (including VAT)",
  "vat_amount": "number or null",
  "vat_rate": "number or null (percentage, e.g. 25)",
  "subtotal": "number or null (excluding VAT)",
  "line_items": [
    {
      "description": "string",
      "quantity": "number or null",
      "unit_price": "number or null",
      "amount": "number or null",
      "vat_rate": "number or null"
    }
  ],
  "iban": "string or null",
  "payment_reference": "string or null (OCR, Bankgiro, Plusgiro, or reference number)",
  "buyer_name": "string or null",
  "buyer_vat": "string or null",
  "confidence": {
    "vendor_name": "high|medium|low",
    "total_amount": "high|medium|low",
    "line_items": "high|medium|low",
    "vat_amount": "high|medium|low"
  }
}

Rules:
- All monetary amounts should be numbers (not strings)
- Dates in ISO 8601 format (YYYY-MM-DD)
- VAT numbers include country prefix (e.g. SE556703748501)
- Look for Bankgiro, Plusgiro, OCR numbers common in Swedish/Nordic invoices
- If a field cannot be determined, use null
- line_items should be an empty array if none found
- Confidence: "high" = clearly readable, "medium" = partially readable/inferred, "low" = guessed`;

async function extractFromUrl(url: string): Promise<Anthropic.ImageBlockParam> {
  // F-0-006: safeFetch validates + refuses DNS-rebinding / private-IP redirects.
  const response = await safeFetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: {
      "User-Agent": "Strale/1.0 invoice-extract",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch invoice from URL: HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  // #412: streamed with a cap, not arrayBuffer() — a post-buffer length check
  // bounds nothing because the bytes are already resident.
  const buffer = await readBodyWithLimit(response, MAX_DECODED_DOCUMENT_BYTES, "url");
  const base64 = buffer.toString("base64");

  let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) {
    mediaType = "image/jpeg";
  } else if (contentType.includes("webp")) {
    mediaType = "image/webp";
  } else if (contentType.includes("gif")) {
    mediaType = "image/gif";
  } else if (contentType.includes("pdf")) {
    // Claude can handle PDFs via the document type, but for the image block
    // we'll need to handle this differently
    return {
      type: "image",
      source: { type: "base64", media_type: "image/png", data: base64 },
    };
  }

  return {
    type: "image",
    source: { type: "base64", media_type: mediaType, data: base64 },
  };
}

function detectMediaType(
  base64: string,
): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  // Check magic bytes from base64 prefix
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("iVBOR")) return "image/png";
  if (base64.startsWith("R0lG")) return "image/gif";
  if (base64.startsWith("UklG")) return "image/webp";
  return "image/png"; // default
}

registerCapability("invoice-extract", async (input: CapabilityInput) => {
  const url = input.url as string | undefined;
  const base64Input = input.base64 as string | undefined;
  const task = input.task as string | undefined;

  if (!url && !base64Input) {
    throw new Error(
      "'url' or 'base64' is required. Provide a URL to an invoice image/PDF or a base64-encoded file.",
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required for invoice extraction.");
  }

  // Build the image content block
  let imageBlock: Anthropic.ImageBlockParam;

  if (url) {
    imageBlock = await extractFromUrl(url);
  } else {
    // #412: normalised, measured, and refused-if-oversized in one step; the
    // returned string is the one that was measured — sniffed and sent as-is.
    const cleanBase64 = checkedBase64(base64Input!, MAX_DECODED_DOCUMENT_BYTES);
    const mediaType = detectMediaType(cleanBase64);
    imageBlock = {
      type: "image",
      source: { type: "base64", media_type: mediaType, data: cleanBase64 },
    };
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: [
          imageBlock,
          {
            type: "text",
            text: task
              ? `${EXTRACTION_PROMPT}\n\nAdditional context from the user: ${task}`
              : EXTRACTION_PROMPT,
          },
        ],
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const parsed = extractJsonObject(text);
  if (!parsed) {
    throw new Error(
      `Failed to parse extraction result as JSON. Raw response: ${text.slice(0, 300)}`,
    );
  }

  if (isEmptyExtraction(parsed)) {
    throw new Error(
      `No invoice data could be extracted. The document may not be an invoice, or may be ` +
        `too low-resolution to read.`,
    );
  }

  return {
    output: parsed,
    provenance: {
      source: url ? `invoice-extract:url:${new URL(url).hostname}` : "invoice-extract:base64",
      fetched_at: new Date().toISOString(),
    },
  };
});
