import { createAnthropicClient } from "../lib/anthropic-client.js";
import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import { extractJsonObject } from "./lib/llm-json.js";
import type Anthropic from "@anthropic-ai/sdk";
import { safeFetch } from "../lib/safe-fetch.js";
import {
  MAX_DECODED_IMAGE_BYTES,
  checkedBase64,
  readBodyWithLimit,
} from "../lib/resource-limits.js";
import { messageText } from "../lib/llm-response.js";
import { inputRefusal } from "../lib/capability-refusal.js";

// URL inputs are fetched by US via safeFetch and sent to Anthropic as base64.
// Two reasons (P1, 2026-08-12): (a) Anthropic's own URL fetcher fails on
// hosts that gate unknown UAs (observed: upload.wikimedia.org → "Unable to
// download the file"), which made results depend on a third party's fetch
// policy; (b) the previous 'type: url' source meant Anthropic fetched from
// their network, outside our SSRF controls — the old F-0-006 Bucket D
// residual risk, now closed instead of accepted.

// 4 MiB image cap now comes from the shared MAX_DECODED_IMAGE_BYTES (the value
// this capability originally declared; Claude's base64 limit is ~5MB, margin).
const ALLOWED_MEDIA = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
type ImageMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

/** Identify an Anthropic-supported image from its signature, never its label. */
export function sniffImageMediaType(bytes: Uint8Array): ImageMediaType | null {
  const startsWith = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);

  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (
    startsWith(0x47, 0x49, 0x46, 0x38, 0x37, 0x61) ||
    startsWith(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)
  ) return "image/gif";
  if (
    startsWith(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return "image/webp";
  return null;
}

function hasValidBase64Syntax(data: string): boolean {
  if (!data || data.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) return false;
  const paddingAt = data.indexOf("=");
  if (paddingAt < 0) return true;
  return data.length % 4 === 0 && paddingAt >= data.length - 2;
}

registerCapability("image-to-text", async (input: CapabilityInput) => {
  const imageUrl = (input.image_url as string) ?? (input.url as string) ?? undefined;
  const base64Input = (input.base64 as string) ?? undefined;

  if (!imageUrl && !base64Input) {
    throw new Error("'image_url' or 'base64' is required.");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  // Build image content block
  let imageContent: Anthropic.ImageBlockParam;

  if (base64Input) {
    // #412: this path used to be entirely unchecked — the 4 MiB cap applied
    // only to the URL branch, and only after the bytes were buffered.
    // Normalised, measured, and refused-if-oversized in one step; the returned
    // string is the one that was measured.
    const data = checkedBase64(base64Input, MAX_DECODED_IMAGE_BYTES);
    // Validate the complete encoding, but decode only enough leading bytes to
    // inspect the signature. The full payload is decoded later by Anthropic.
    const mediaType = hasValidBase64Syntax(data)
      ? sniffImageMediaType(Buffer.from(data.slice(0, 24), "base64").subarray(0, 16))
      : null;
    if (!mediaType) {
      throw inputRefusal(
        "'base64' must be a PNG, JPEG, GIF or WebP image.",
        "base64",
        "Send the image as PNG, JPEG, GIF or WebP, base64-encoded, with or without a data: header.",
      );
    }

    imageContent = {
      type: "image",
      source: { type: "base64", media_type: mediaType, data },
    };
  } else {
    const resp = await safeFetch(imageUrl!, {
      headers: { Accept: "image/*" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) {
      throw new Error(`Could not fetch image: HTTP ${resp.status} from the provided image_url.`);
    }
    const rawType = (resp.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_MEDIA.has(rawType)) {
      throw new Error(
        `image_url returned '${rawType || "unknown"}', not a supported image type (png/jpeg/gif/webp).`,
      );
    }
    // #412: streamed with a cap, not arrayBuffer() — the old check here ran
    // AFTER the full response was buffered, so it reported the limit without
    // enforcing it.
    const buf = await readBodyWithLimit(
      resp,
      MAX_DECODED_IMAGE_BYTES,
      input.image_url ? "image_url" : "url",
    );
    const mediaType = sniffImageMediaType(buf.subarray(0, 16));
    if (!mediaType) {
      throw inputRefusal(
        "'image_url' must be a PNG, JPEG, GIF or WebP image.",
        "image_url",
        "Send 'image_url' as the URL of a PNG, JPEG, GIF or WebP image.",
      );
    }
    imageContent = {
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType,
        data: buf.toString("base64"),
      },
    };
  }

  const client = createAnthropicClient({ apiKey });
  const r = await client.messages.create({
    model: MODELS.capability_default.id,
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: [
          imageContent,
          {
            type: "text",
            text: `Extract ALL text from this image. This is an OCR task.

Return ONLY valid JSON:
{
  "text": "the full extracted text, preserving layout where possible",
  "confidence": "high/medium/low",
  "language_detected": "primary language of the text",
  "text_type": "printed/handwritten/mixed/screenshot"
}

If no text is found, return {"text": "", "confidence": "high", "language_detected": null, "text_type": null}.`,
          },
        ],
      },
    ],
  });

  const responseText = messageText(r).trim();
  const output = extractJsonObject(responseText);
  if (!output) throw new Error("OCR extraction failed.");

  return {
    output,
    provenance: { source: "claude-vision", fetched_at: new Date().toISOString() },
  };
});
