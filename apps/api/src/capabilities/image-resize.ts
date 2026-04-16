import { registerCapability, type CapabilityInput } from "./index.js";
import sharp from "sharp";
import { safeFetch } from "../lib/safe-fetch.js";

registerCapability("image-resize", async (input: CapabilityInput) => {
  const imageUrl = (input.image_url as string) ?? (input.url as string) ?? undefined;
  const base64Input = (input.base64 as string) ?? undefined;

  if (!imageUrl && !base64Input) {
    throw new Error("'image_url' or 'base64' is required.");
  }

  const targetWidth = (input.target_width as number) ?? (input.width as number) ?? undefined;
  const targetHeight = (input.target_height as number) ?? (input.height as number) ?? undefined;
  const format = ((input.format as string) ?? "png").toLowerCase() as "png" | "jpeg" | "webp";
  const quality = (input.quality as number) ?? 80;
  const fit = ((input.fit as string) ?? "cover") as "cover" | "contain" | "fill" | "inside" | "outside";

  if (!targetWidth && !targetHeight) {
    throw new Error("'target_width' or 'target_height' is required.");
  }

  // Get image buffer
  let imageBuffer: Buffer;
  if (base64Input) {
    const data = base64Input.startsWith("data:")
      ? base64Input.replace(/^data:image\/\w+;base64,/, "")
      : base64Input;
    imageBuffer = Buffer.from(data, "base64");
  } else {
    // F-0-006: safeFetch validates + refuses DNS-rebinding / private-IP redirects.
    const response = await safeFetch(imageUrl!, {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "Strale/1.0 (image processor; admin@strale.io)" },
    });
    if (!response.ok) throw new Error(`Failed to fetch image: HTTP ${response.status}`);
    imageBuffer = Buffer.from(await response.arrayBuffer());
  }

  // Process with Sharp
  let pipeline = sharp(imageBuffer);

  // Resize
  pipeline = pipeline.resize(targetWidth || undefined, targetHeight || undefined, { fit });

  // Output format
  if (format === "jpeg") {
    pipeline = pipeline.jpeg({ quality });
  } else if (format === "webp") {
    pipeline = pipeline.webp({ quality });
  } else {
    pipeline = pipeline.png();
  }

  const outputBuffer = await pipeline.toBuffer();
  const metadata = await sharp(outputBuffer).metadata();

  const mimeType = format === "jpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";

  return {
    output: {
      base64: outputBuffer.toString("base64"),
      content_type: mimeType,
      width: metadata.width,
      height: metadata.height,
      size_bytes: outputBuffer.length,
      format,
    },
    provenance: { source: "sharp", fetched_at: new Date().toISOString() },
  };
});
