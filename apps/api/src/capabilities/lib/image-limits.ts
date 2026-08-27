/**
 * Resource limits for capabilities that hand caller-supplied bytes to a native
 * image decoder.
 *
 * ## Why these exist
 *
 * VERIFY-DEP / WP13 follow-up, 2026-08-25. The `/x402/*` rail had no body cap,
 * which is fixed at the rail in `app.ts`. But a rail cap only bounds the wire:
 * it says nothing about how much work a *small* request can buy, and measuring
 * that turned up a far cheaper attack than an oversized body.
 *
 * Measured against sharp 0.35.3 / libvips 8.18.3, from a **235-byte** source
 * image, varying only the requested output dimensions:
 *
 *     target          result                       cost
 *     2,000x2,000     60 KB                        88 ms
 *     10,000x10,000   1.3 MB                       2.1 s
 *     30,000x30,000   11.9 MB                      5.8 s
 *     100,000x100,000 131 MB                       95.8 s
 *
 * A few hundred bytes on the wire buys 96 seconds of CPU and a 131 MB
 * allocation. No body limit can catch that, because the request is tiny. The
 * amplification is in the *parameters*, so the limit has to be there too.
 *
 * sharp's own `limitInputPixels` default (268,402,689) guards decode INPUT.
 * There is no corresponding default for output geometry.
 */

import { logError } from "../../lib/log.js";

/**
 * Largest decoded image the platform accepts.
 *
 * 4 MiB, matching `image-to-text`'s existing `MAX_IMAGE_BYTES` rather than
 * inventing a second number. Note that image-to-text applies it only on its
 * URL path — its base64 path is unchecked — so this is the platform's stated
 * figure, not a uniformly enforced one. Enforcing the same value here keeps
 * the number singular while that asymmetry is closed separately.
 */
export const MAX_DECODED_IMAGE_BYTES = 4 * 1024 * 1024;

/** No single output edge beyond this. 10,000 px is well past any real display or print need. */
export const MAX_OUTPUT_DIMENSION = 10_000;

/**
 * Total output pixels. 25 MP comfortably exceeds a 6000x4000 full-frame frame
 * (24 MP), so it does not constrain a real resize; it stops the 100,000-square
 * case above, which is four hundred times larger.
 */
export const MAX_OUTPUT_PIXELS = 25_000_000;


/** Thrown for a refusal that is the caller's fault, so it maps to a 4xx rather than a 500. */
export class ImageLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageLimitError";
  }
}

const mib = (n: number) => `${(n / 1024 / 1024).toFixed(1)}MB`;

/**
 * Decoded size of a base64 payload, WITHOUT allocating it.
 *
 * Deliberately computed from the string length: `Buffer.from(s, "base64")`
 * would allocate the very thing being checked, so a check performed after
 * decoding is not a limit, it is a post-mortem.
 */
export function stripDataUriPrefix(b64: string): string {
  return b64.startsWith("data:") ? b64.slice(b64.indexOf(",") + 1) : b64;
}

/**
 * The ONE representation that is both measured and decoded.
 *
 * Reviewer-found, twice over, and both cases broke the "measured before it is
 * allocated" invariant:
 *
 *   - **Whitespace.** The measurer stripped it; the caller handed the
 *     unstripped string to `Buffer.from`. Node ignores whitespace when
 *     DECODING but sizes the backing store from the input length, so six MiB
 *     of spaces followed by `AAAA` measured as three bytes and allocated
 *     ~4.7 MB. The allocation is what the cap exists to bound, so measuring
 *     the post-strip string while decoding the pre-strip one measured the
 *     wrong thing.
 *   - **Padding.** `"A".repeat(5_592_407) + "=="` measured as exactly the
 *     4 MiB limit and decoded to one byte more, so it passed.
 *
 * Stripping here rather than in two places is the same fix as the data-URI
 * one: there is a single normalised string, and everything downstream uses it.
 */
export function normalizeBase64(input: string): string {
  return stripDataUriPrefix(input).replace(/\s/g, "");
}

/**
 * MEASURE THE STRING THAT WILL ACTUALLY BE DECODED.
 *
 * Reviewer-found, and it made the pre-decoder invariant false. This helper
 * used to strip `data:` prefixes itself, at the first comma, while the caller
 * stripped only the narrower `data:image/\w+;base64,` form. For a payload the
 * caller does not recognise — `data:image/svg+xml;base64,…`, or a made-up
 * `data:AAAA…,…` — the two disagreed: this measured the short suffix while
 * `Buffer.from()` went on to decode the whole string, prefix included, because
 * the prefix characters are themselves in the base64 alphabet. A long enough
 * prefix was estimated at one byte and allocated ~75% of the string.
 *
 * The fix is not a better estimate. It is to stop having two opinions: the
 * caller strips once with `stripDataUriPrefix`, and hands the SAME string to
 * this function and to `Buffer.from`.
 */
export function decodedLengthOfBase64(b64: string): number {
  // Measures EXACTLY the string it is given — it does not strip anything.
  //
  // It used to strip whitespace, and that hid a caller that did not.
  // Normalising in two places is how the data-URI bug happened and how the
  // whitespace bug happened; the difference between "measured the same string
  // the decoder gets" and "measured a string like it" is the entire guarantee.
  // Normalisation belongs to `normalizeBase64`, once, and this measures the
  // result. A caller that forgets now OVER-estimates and refuses, which is the
  // safe direction and is observable — the earlier version silently
  // under-measured instead.
  const clean = b64;
  if (clean.length === 0) return 0;
  // Deliberately an UPPER BOUND, not the exact decoded length. Subtracting the
  // `=` padding produced an estimate one byte under what Node actually
  // allocated for a malformed-padding payload, which then passed the cap. A
  // guard may over-estimate by two bytes; it may never under-estimate by one.
  return Math.ceil((clean.length * 3) / 4);
}

/**
 * Messages here open with a quoted field name and use "must be".
 *
 * That is this codebase's house style for caller-facing validation, and
 * `transaction-failure-taxonomy.ts` keys on it: those phrasings classify as
 * `caller_input`, while free-form prose lands in `unclassified`. Neither
 * counts against the capability under the armed quality floor — `unclassified`
 * is in UNATTRIBUTED — so this is precision rather than a rescue. It also
 * happens to be the better message, because it names the field at fault.
 *
 * Checked, not assumed: the phrasings below were run through
 * `classifyTransactionFailure` before being written this way.
 */
export function assertDecodedSizeWithinLimit(
  bytes: number,
  field = "base64",
): void {
  if (bytes > MAX_DECODED_IMAGE_BYTES) {
    throw new ImageLimitError(
      `'${field}' must be ${mib(MAX_DECODED_IMAGE_BYTES)} or less once decoded (received ${mib(bytes)}).`,
    );
  }
}

/**
 * Refuse output geometry that would cost far more than the request paid for.
 *
 * Also rejects non-finite, negative and non-integer values: `resize(NaN)` and
 * `resize(-1)` are not meaningful, and letting them reach the decoder makes
 * the failure a 500 that reads like a platform fault.
 */
export function assertOutputGeometryWithinLimit(
  width: number | undefined,
  height: number | undefined,
): void {
  for (const [name, value] of [
    ["target_width", width],
    ["target_height", height],
  ] as const) {
    if (value === undefined) continue;
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
      throw new ImageLimitError(`'${name}' must be a positive whole number of pixels.`);
    }
    if (value > MAX_OUTPUT_DIMENSION) {
      throw new ImageLimitError(
        `'${name}' must be ${MAX_OUTPUT_DIMENSION}px or less (received ${value}px).`,
      );
    }
  }

  // Both sides present: bound the area too. Each side can be under its own cap
  // while the product is not — 10,000 x 10,000 is 100 MP, four times the cap.
  if (width !== undefined && height !== undefined) {
    const pixels = width * height;
    if (pixels > MAX_OUTPUT_PIXELS) {
      throw new ImageLimitError(
        `'target_width' x 'target_height' must be ${MAX_OUTPUT_PIXELS / 1_000_000} megapixels or less ` +
          `(received ${width}x${height}, ${(pixels / 1_000_000).toFixed(1)} megapixels).`,
      );
    }
  }
}

export type FitMode = "cover" | "contain" | "fill" | "inside" | "outside";

/**
 * The geometry sharp will ACTUALLY produce, which is not the geometry asked for.
 *
 * Reviewer-found, and it left the whole amplification attack open. Checking
 * only the REQUESTED dimensions misses two routes to a huge output:
 *
 *   - **One dimension omitted.** `target_width` alone is explicitly supported;
 *     sharp derives the other side from the source aspect ratio. A 100 x 20000
 *     source with `target_width: 10000` yields a height of 2,000,000 — every
 *     requested value inside its cap, the result 20 gigapixels.
 *   - **`fit: "outside"`.** It covers the requested box, so BOTH output edges
 *     can exceed BOTH requested edges. The existing behaviour test already
 *     shows 100x60 requested becoming 100x75.
 *
 * So the cap has to be applied to the computed result. Mirrors sharp's own
 * rules; `cover`, `fill` and `contain` all land exactly on the requested box.
 */
export function effectiveOutputGeometry(
  srcWidth: number,
  srcHeight: number,
  reqWidth: number | undefined,
  reqHeight: number | undefined,
  fit: FitMode,
): { width: number; height: number } {
  if (!Number.isFinite(srcWidth) || !Number.isFinite(srcHeight) || srcWidth <= 0 || srcHeight <= 0) {
    // Reviewer-found: this used to fall back to the REQUESTED dimensions,
    // which fails open. With no source dimensions the derived side cannot be
    // computed at all, so the one thing that must not happen is proceeding as
    // though it had been checked. A guard that cannot evaluate its condition
    // refuses.
    throw new ImageLimitError(
      "'image_url'/'base64' must be an image whose dimensions can be read.",
    );
  }

  if (reqWidth !== undefined && reqHeight === undefined) {
    return { width: reqWidth, height: Math.round((srcHeight * reqWidth) / srcWidth) };
  }
  if (reqHeight !== undefined && reqWidth === undefined) {
    return { width: Math.round((srcWidth * reqHeight) / srcHeight), height: reqHeight };
  }
  if (reqWidth === undefined || reqHeight === undefined) {
    return { width: srcWidth, height: srcHeight };
  }

  if (fit === "inside" || fit === "outside") {
    const sx = reqWidth / srcWidth;
    const sy = reqHeight / srcHeight;
    const scale = fit === "inside" ? Math.min(sx, sy) : Math.max(sx, sy);
    // ceil, not round. Reviewer-found with a reproduced counterexample: a
    // 1295x560 source asked for 1x3288 at fit=outside resolved to 7603x3288
    // here and 7604x3288 in sharp, so a request one column over the pixel cap
    // passed. Rounding up can only over-estimate, which is the safe direction
    // for a cap.
    return {
      width: Math.ceil(srcWidth * scale),
      height: Math.ceil(srcHeight * scale),
    };
  }

  // cover / fill / contain all produce exactly the requested box.
  return { width: reqWidth, height: reqHeight };
}

/**
 * Apply the caps to a geometry that has already been resolved against the
 * source. Separate from `assertOutputGeometryWithinLimit`, which validates
 * what the CALLER asked for before anything is fetched or decoded; this one
 * validates what sharp would actually allocate.
 */
export function assertEffectiveGeometryWithinLimit(
  width: number,
  height: number,
): void {
  for (const [name, value] of [
    ["width", width],
    ["height", height],
  ] as const) {
    if (!Number.isFinite(value) || value < 1) {
      throw new ImageLimitError(
        `Resolved output ${name} is not a usable pixel count (${value}).`,
      );
    }
    if (value > MAX_OUTPUT_DIMENSION) {
      throw new ImageLimitError(
        `'target_width'/'target_height' must be ${MAX_OUTPUT_DIMENSION}px or less per side once ` +
          `applied to this image's aspect ratio (resolved ${name} ${value}px).`,
      );
    }
  }
  const pixels = width * height;
  if (pixels > MAX_OUTPUT_PIXELS) {
    throw new ImageLimitError(
      `'target_width' x 'target_height' must be ${MAX_OUTPUT_PIXELS / 1_000_000} megapixels or less ` +
        `once applied to this image's aspect ratio (resolved ${width}x${height}, ` +
        `${(pixels / 1_000_000).toFixed(1)} megapixels).`,
    );
  }
}

/**
 * Read a fetched response body, aborting once the cap is crossed.
 *
 * `await response.arrayBuffer()` cannot enforce a limit: by the time it
 * resolves the bytes are already resident, so checking the length afterwards
 * bounds nothing. A caller passing `image_url` pointing at a 1 GB file would
 * otherwise walk straight past every base64 limit above — the size cap and the
 * URL path have to agree, or the cheaper path decides the real limit.
 *
 * Falls back to buffering only when the response exposes no readable stream.
 */
export async function readBodyWithLimit(
  response: Response,
  maxBytes: number = MAX_DECODED_IMAGE_BYTES,
  field = "image_url",
): Promise<Buffer> {
  // Trust a declared length enough to refuse early, never enough to accept.
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ImageLimitError(
      `'${field}' must be ${mib(maxBytes)} or less (it declared ${mib(declared)}).`,
    );
  }

  if (!response.body) {
    const buf = Buffer.from(await response.arrayBuffer());
    assertDecodedSizeWithinLimit(buf.byteLength, field);
    return buf;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        // Stop pulling. The bytes already read are bounded by maxBytes plus
        // one chunk, which is the point.
        //
        // cancel() can reject if the peer already tore the connection down.
        // That is expected here and must not mask the refusal below — but it
        // is logged rather than swallowed, per F-0-009: a bare
        // `.catch(() => {})` is exactly how a real transport fault becomes
        // invisible.
        await reader
          .cancel()
          .catch((err) => logError("image-limit-reader-cancel", err, { maxBytes }));
        throw new ImageLimitError(
          `'${field}' must be ${mib(maxBytes)} or less.`,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks, total);
}
