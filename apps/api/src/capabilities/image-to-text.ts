import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

// F-0-006 Bucket D: the image URL is passed to Anthropic's vision API
// as a 'type: url' source. Anthropic fetches it from their network, not
// ours. We do not have a way to constrain that — accept the residual
// risk (Anthropic has their own policies).

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
    // Detect media type from base64 header or default to png
    let mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp" = "image/png";
    let data = base64Input;

    if (base64Input.startsWith("data:")) {
      const match = base64Input.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match) {
        mediaType = match[1] as typeof mediaType;
        data = match[2];
      }
    }

    imageContent = {
      type: "image",
      source: { type: "base64", media_type: mediaType, data },
    };
  } else {
    imageContent = {
      type: "image",
      source: { type: "url", url: imageUrl! },
    };
  }

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
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

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("OCR extraction failed.");

  const output = JSON.parse(jsonMatch[0]);

  return {
    output,
    provenance: { source: "claude-vision", fetched_at: new Date().toISOString() },
  };
});
