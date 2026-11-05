import { registerCapability, type CapabilityInput } from "./index.js";
import sharp, { type Metadata } from "sharp";
import { safeFetch } from "../lib/safe-fetch.js";
import {
  IMAGE_FORMATS,
  FIT_MODES,
  MAX_DECODED_IMAGE_BYTES,
  MAX_INPUT_PIXELS,
  asPixelLimitRefusal,
  assertEnum,
  assertQuality,
  assertEffectiveGeometryWithinLimit,
  assertInputPixelsWithinLimit,
  assertOutputGeometryWithinLimit,
  checkedBase64,
  effectiveOutputGeometry,
  readBodyWithLimit,
} from "../lib/resource-limits.js";

registerCapability("image-resize", async (input: CapabilityInput) => {
  const imageUrl = (input.image_url as string) ?? (input.url as string) ?? undefined;
  const base64Input = (input.base64 as string) ?? undefined;

  if (!imageUrl && !base64Input) {
    throw new Error("'image_url' or 'base64' is required.");
  }

  const targetWidth = (input.target_width as number) ?? (input.width as number) ?? undefined;
  const targetHeight = (input.target_height as number) ?? (input.height as number) ?? undefined;

  // VALIDATED, not cast.
  //
  // `format` used to be `as "png" | "jpeg" | "webp"` — a cast, which asserts a
  // type without checking one. Anything that was not "jpeg" or "webp" fell
  // through to the PNG branch, so `format: "gif"` returned PNG bytes with
  // `content_type: "image/png"` and `format: "gif"`: a 200 whose own fields
  // contradict each other, and whose declared format is not what the bytes
  // are. A caller trusting `output.format` to pick a file extension or a
  // decoder gets it wrong, and nothing anywhere reports an error.
  //
  // `fit` and `quality` carried the identical pattern on the adjacent lines.
  // They do not produce a contradictory success — sharp rejects them — but it
  // rejects them with its own internal text ("Expected valid fit for fit but
  // received bogus of type string"), which reaches the caller as a capability
  // failure rather than as a validation refusal, and only after the decoder
  // has been constructed.
  const format = assertEnum(input.format, IMAGE_FORMATS, "format", "png");
  const fit = assertEnum(input.fit, FIT_MODES, "fit", "cover");
  const quality = assertQuality(input.quality);

  if (!targetWidth && !targetHeight) {
    throw new Error("'target_width' or 'target_height' is required.");
  }

  // Geometry first, before a single byte is fetched or decoded. This is the
  // cheap-request/expensive-work case: a 235-byte source with
  // target_width=100000 produced a 131 MB output over 96 seconds of CPU. The
  // rail body cap cannot see that — the request is tiny — so the check has to
  // sit next to the parameter that does the amplifying. See lib/resource-limits.ts.
  assertOutputGeometryWithinLimit(targetWidth, targetHeight);

  // Get image buffer
  let imageBuffer: Buffer;
  if (base64Input) {
    // #412 review: migrated to the sealed helper — normalised, measured, and
    // refused-if-oversized in one step, and the RETURNED string is the one
    // that was measured, so it is safe to hand to Buffer.from. The history of
    // hand-composing these primitives (whitespace, padding, and data-URI bugs,
    // all reviewer-found) is narrated in resource-limits.ts.
    const data = checkedBase64(base64Input, MAX_DECODED_IMAGE_BYTES);
    imageBuffer = Buffer.from(data, "base64");
  } else {
    // F-0-006: safeFetch validates + refuses DNS-rebinding / private-IP redirects.
    const response = await safeFetch(imageUrl!, {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "Strale/1.0 (image processor; admin@strale.io)" },
    });
    if (!response.ok) throw new Error(`Failed to fetch image: HTTP ${response.status}`);
    // Streamed with a cap rather than arrayBuffer(). Without this the URL path
    // is the cheaper way in: it is not covered by the rail body limit at all,
    // so it would set the real ceiling and the base64 cap above would be
    // decorative.
    // #426: maxBytes is now required — the old bare call leaned on the 4 MiB
    // default that also caused the #412 fallback bug. Same value, now stated.
    imageBuffer = await readBodyWithLimit(
      response,
      MAX_DECODED_IMAGE_BYTES,
      input.image_url ? "image_url" : "url",
    );
  }

  // The source's own pixel count, from its header, before anything decodes it.
  // The byte cap above does not bound this (a solid 9,000 x 9,000 PNG is about
  // 100 KB) and sharp's built-in limit is 268 MP. `metadata()` parses the
  // header only, so it is built without the limit and the refusal below is the
  // repo's own. The decoding pipeline carries the same `limitInputPixels`, but
  // that REPEATS the header check as a backstop (it reads the same header, so
  // it does not catch a header that lies) and turns sharp's error into ours.
  // Pages: this takes the first frame only. Opening with `animated: true`
  // would decode `pages` frames, so the bound would have to be width x height
  // x pages.
  const sourceField = base64Input ? "base64" : input.image_url ? "image_url" : "url";
  let sourceMeta: Metadata;
  try {
    sourceMeta = await sharp(imageBuffer, { limitInputPixels: false }).metadata();
  } catch (err) {
    throw asPixelLimitRefusal(err, sourceField);
  }
  assertInputPixelsWithinLimit(sourceMeta.width, sourceMeta.height, sourceField);

  // Process with Sharp
  let pipeline = sharp(imageBuffer, { limitInputPixels: MAX_INPUT_PIXELS });

  // The requested geometry was bounded before any bytes were fetched. That is
  // not sufficient on its own: with one dimension omitted sharp derives the
  // other from the source aspect ratio, and `fit: "outside"` can exceed BOTH
  // requested edges. Both routes reopen the amplification this capability is
  // being hardened against, so the cap is applied again to the geometry sharp
  // will actually produce. Reviewer-found.
  //
  // The header was already parsed above (a header parse, not a decode), so
  // this reuses it rather than reading the dimensions twice.
  const source = sourceMeta;
  const resolved = effectiveOutputGeometry(
    source.width ?? 0,
    source.height ?? 0,
    targetWidth || undefined,
    targetHeight || undefined,
    fit,
  );
  assertEffectiveGeometryWithinLimit(resolved.width, resolved.height);

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

  let outputBuffer: Buffer;
  try {
    outputBuffer = await pipeline.toBuffer();
  } catch (err) {
    throw asPixelLimitRefusal(err, sourceField);
  }
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
