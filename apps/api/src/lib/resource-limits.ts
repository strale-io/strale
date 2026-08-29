/**
 * The platform's single authority for byte limits on data it did not author:
 * caller-supplied payloads, remote responses fetched on a caller's behalf, and
 * renders produced from caller input.
 *
 * ## Why it lives here, under this name (#432)
 *
 * It began as `capabilities/lib/image-limits.ts` and grew past both halves of
 * that name. It now holds image, document, render, HTML, sitemap, robots,
 * API-response, error-body and transfer caps plus the shared streaming readers
 * — and `lib/metered-vendor-fetch.ts` imports it, which inverted the usual
 * `capabilities -> lib` direction. Moving it to `lib/` restores that direction
 * and stops the name from lying about the contents; `ImageLimitError` became
 * `ResourceLimitError` for the same reason, since it is thrown for sitemaps and
 * HTML pages that contain no image at all.
 *
 * ## Why the limits exist
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

import { logError, logWarn } from "./log.js";

/**
 * Largest decoded image the platform accepts.
 *
 * 4 MiB, matching `image-to-text`'s original `MAX_IMAGE_BYTES` rather than
 * inventing a second number. Since #412 this is enforced uniformly — URL and
 * base64 paths alike — on every image-input capability (`image-resize`,
 * `image-to-text`, `receipt-categorize`).
 */
export const MAX_DECODED_IMAGE_BYTES = 4 * 1024 * 1024;

/**
 * Largest decoded document (PDF or document-as-image) the platform accepts.
 *
 * 8 MiB, matching the `/x402/*` rail body cap. Note the two are aligned, not
 * equal in effect: base64 wire overhead means an x402 request body can carry
 * at most ~6 MiB decoded under the 8 MiB rail cap, while the URL path can use
 * the full 8 MiB — the URL path is deliberately the not-stricter one, so no
 * document that fits on the wire is refused here. Applies to `pdf-extract`,
 * `invoice-extract`, `contract-extract`, `resume-parse` (#412).
 *
 * Lives in this module because it is the single authority for caller-input
 * byte caps, and a second module holding a second 8 MiB constant is how six
 * magic numbers happen.
 */
export const MAX_DECODED_DOCUMENT_BYTES = 8 * 1024 * 1024;

/**
 * Largest Browserless-rendered screenshot the platform will buffer (#426).
 *
 * The response comes from OUR vendor, not the caller — but its size is still
 * caller-shaped: `screenshot-url` defaults to full_page with caller-chosen
 * viewport, so a long page renders a very large PNG. Evidence for 32 MiB:
 * across 1,203 production test runs the largest screenshot ever produced was
 * ~1.3 MiB decoded (p95 ≈ 20 KiB), and a pathological-but-legitimate
 * full-page render of a very long page lands in the tens of MiB, not
 * hundreds. 32 MiB is ~25x the largest observed real render, so it cannot
 * refuse working traffic; its job is to turn "unbounded" into "bounded".
 */
export const MAX_RENDERED_SCREENSHOT_BYTES = 32 * 1024 * 1024;

/**
 * Largest Browserless-rendered PDF the platform will buffer (#426).
 *
 * Named separately from the screenshot cap because /pdf and /screenshot are
 * different products whose ceilings could legitimately diverge; today both
 * are 32 MiB on the same evidence class (typical page PDFs are 0.05–5 MiB,
 * image-heavy long pages reach the tens of MiB, largest observed real output
 * is ~28 KB).
 */
export const MAX_RENDERED_PDF_BYTES = 32 * 1024 * 1024;

/**
 * Largest media file `c2pa-inspect` fetches for provenance parsing (#426
 * review — moved here from a local constant so the authority module holds
 * every byte cap and the no-local-caps structural test needs no exemption).
 *
 * 15 MB, the capability's own product declaration since launch: C2PA media is
 * commonly TIFF/DNG camera output, which legitimately dwarfs the 4 MiB
 * decoded-image cap that governs images we SEND to a vision model — here the
 * bytes go to a local metadata parser, not an LLM.
 */
export const MAX_C2PA_MEDIA_BYTES = 15 * 1024 * 1024;

/**
 * Hard stop for byte-COUNTING reads (#426), where the body is measured and
 * discarded rather than kept (`website-carbon-estimate`). Counting is O(1)
 * memory, so this is not a residency bound — it is a work bound that stops a
 * deliberately endless stream inside the request timeout. 100 MiB is far past
 * any real page weight (median ~2.3 MiB; the heaviest pages are tens of MiB),
 * and a page bigger than this gets a refusal naming the cap rather than a
 * measurement.
 */
export const MAX_MEASURED_TRANSFER_BYTES = 100 * 1024 * 1024;

/**
 * Largest HTML document the shared web-provider layer will fetch, on any of
 * its three tiers (#428).
 *
 * Measured, not assumed. Real HTML *documents* (not total page weight) fetched
 * with a plain GET, 2026-08-28:
 *
 *     Hacker News front page                    34.6 KB
 *     BBC News homepage                        401   KB
 *     Wikipedia "S&P 500 list"                 568   KB
 *     Wikipedia "List of Japanese films 2019"    1.08 MB
 *     Wikipedia "Sweden"                         1.66 MB
 *     Wikipedia "List of Latin phrases (full)"   1.80 MB
 *     Wikipedia "COVID-19 pandemic"              3.18 MB
 *     WHATWG HTML spec, single page             15.58 MB
 *
 * 16 MiB is 5.3x the heaviest ordinary content page in that sample, so no
 * realistic extraction target is refused — and it still clears the single-page
 * HTML spec, the canonical largest legitimate HTML document and a plausible
 * `url-to-markdown` input. 8 MiB was considered and rejected: it refuses that
 * document and sits only ~2.5x above a normal encyclopedia article.
 *
 * ONE number for all three tiers. The evidence does not show raw HTML, Jina's
 * reformat, and Browserless's rendered DOM needing materially different
 * ceilings, and three constants would be three things to drift.
 */
export const MAX_FETCHED_HTML_BYTES = 16 * 1024 * 1024;

/**
 * Largest robots.txt the platform will parse (#432).
 *
 * TRUNCATED, not refused — and that is the whole reason this is its own
 * constant rather than a small number borrowed from somewhere else. RFC 9309
 * §2.5 says a crawler "MAY impose a parse limit ... [which] MUST be at least
 * 500 kibibytes", and Googlebot enforces exactly 500 KiB, ignoring everything
 * past it. `robots-txt-parse` exists to answer "what do crawlers see here?",
 * so parsing the first 500 KiB and dropping the rest IS the correct answer;
 * refusing the file would make Strale disagree with the crawler it is
 * describing.
 *
 * Measured 2026-08-29, plain GET: github.com 2.2 KiB, bbc.co.uk 4.8 KiB,
 * google.com 6.5 KiB, amazon.com 7.7 KiB, nytimes.com 8.3 KiB,
 * en.wikipedia.org 27.6 KiB. The standardised limit is ~18x the largest of
 * those, so truncation is a theoretical path, not a routine one.
 */
export const MAX_FETCHED_ROBOTS_BYTES = 500 * 1024;

/**
 * Largest sitemap XML the platform will fetch (#432).
 *
 * The sitemaps.org protocol caps an uncompressed sitemap at 50 MB
 * (52,428,800 bytes) and 50,000 URLs — raised from 10 MB in 2016 precisely
 * because real sites exceeded the old figure. Taking the protocol's own
 * number means this limit refuses nothing a sitemap is allowed to be, and a
 * file above it is invalid by the spec rather than merely inconvenient for
 * us, so the refusal cites a standard instead of a Strale preference.
 *
 * Measured 2026-08-29, decoded bytes (these arrive brotli-compressed and are
 * counted after inflation, which is what the reader counts): apple.com
 * 72 KiB, theguardian.com news sitemap 470 KiB, gov.uk leaf sitemaps
 * 5.19–5.37 MiB each. Extrapolating the gov.uk shape to the protocol's
 * 50,000-URL maximum lands near 11 MiB, so the 50 MB ceiling sits roughly 4x
 * above the largest *legal* sitemap and ~9x above the largest measured one.
 *
 * Honest about the cost: a 50 MB XML string is bounded, not cheap. The
 * regex-based parse downstream materialises per-URL substrings on top of it,
 * so peak residency for a pathological-but-legal sitemap is a multiple of
 * this number. Bounding the *fetch* is what #432 set out to do; bounding the
 * parse is recorded as a follow-up rather than claimed here.
 */
export const MAX_FETCHED_SITEMAP_BYTES = 52_428_800;

/**
 * Largest structured API response the platform will buffer and parse (#432).
 *
 * Covers JSON legs (Serper, Corporations Canada, CommonCrawl's index,
 * YouTube's oembed, an arbitrary endpoint under `api-health-check`) and the
 * small XML documents API endpoints return alongside them (YouTube's
 * timedtext caption track).
 *
 * Deliberately SMALLER than the 16 MiB HTML cap, for a parser reason rather
 * than a transport one: HTML is scanned with linear regexes and stays one
 * string, while JSON is materialised into an object graph that typically
 * costs 2–6x the source bytes in V8. 4 MiB of JSON is therefore already in
 * the same residency class as a 16 MiB page.
 *
 * Measured 2026-08-29: YouTube oembed 0.8 KiB, Corporations Canada 0.07 KiB
 * (not-found shape), api.github.com repo 5.8 KiB, CommonCrawl index at the
 * capability's own `limit=50` 20.0 KiB. 4 MiB is over 200x the largest of
 * those — it exists to make an unbounded read bounded, not to police a size
 * anyone is near.
 */
export const MAX_FETCHED_API_RESPONSE_BYTES = 4 * 1024 * 1024;

/**
 * How much of a page `email-finder` and `domain-contact-extract` scan (#432).
 *
 * Their pre-existing product behaviour, hoisted out of two identical local
 * constants and two identical hand-rolled readers. TRUNCATE, because that is
 * what those capabilities already did: they scan the first 300 KB of a
 * homepage or contact page for `tel:`/`mailto:`/schema.org markup, which
 * lives in the head and the first screenfuls. Refusing a long page instead of
 * scanning its opening would turn a working answer into an error.
 */
export const MAX_SCRAPED_CONTACT_BYTES = 300_000;

/**
 * Cap for reading a vendor's ERROR body for diagnostics (#428).
 *
 * Deliberately paired with truncation rather than refusal: an error body is
 * read to classify and log a failure that has already happened, so refusing it
 * would discard the diagnostic instead of bounding it. 64 KiB is far past any
 * real Browserless/vendor error payload (they are short JSON or plain text),
 * and every consumer of these bodies already reads a prefix — regex-matching
 * `net::ERR_*` markers or slicing the first 200 chars.
 */
export const MAX_ERROR_BODY_BYTES = 64 * 1024;

/** No single output edge beyond this. 10,000 px is well past any real display or print need. */
export const MAX_OUTPUT_DIMENSION = 10_000;

/**
 * Total output pixels. 25 MP comfortably exceeds a 6000x4000 full-frame frame
 * (24 MP), so it does not constrain a real resize; it stops the 100,000-square
 * case above, which is four hundred times larger.
 */
export const MAX_OUTPUT_PIXELS = 25_000_000;


/** The output encodings this capability actually produces. */
export const IMAGE_FORMATS = ["png", "jpeg", "webp"] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];

/** The resize strategies sharp supports, and the only ones this capability accepts. */
export const FIT_MODES = ["cover", "contain", "fill", "inside", "outside"] as const;

/**
 * Thrown for a refusal that is the caller's fault, so it maps to a 4xx rather
 * than a 500.
 *
 * Carries `isCapabilityRefusal` (#428 six-lens review). A byte-limit refusal is
 * the capability working: it fetched, measured, and declined an input it is not
 * willing to hold. Three of those in a row must not suspend the capability for
 * everyone — which is exactly what happened before this marker existed, because
 * `circuit-breaker.ts` and `quality-capture.ts` both key off
 * `lib/capability-refusal.ts` and neither recognised this class. That is the
 * 2026-08-14 `french-company-data` incident's shape, documented in that module.
 * The marker survives structured cloning and module-instance boundaries, which
 * `instanceof` alone does not.
 */
export class ResourceLimitError extends Error {
  readonly isCapabilityRefusal = true;

  constructor(message: string) {
    super(message);
    this.name = "ResourceLimitError";
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
/**
 * Accept a caller value only if it is genuinely one of the allowed options.
 *
 * The failure this replaces: `as "png" | "jpeg" | "webp"` is a cast. It tells
 * the compiler what to believe and checks nothing, so an unsupported value
 * flowed through to a default branch and the response ended up describing
 * itself incorrectly. Casting caller input is the bug; the fix is to narrow by
 * testing, which is also what makes the type honest.
 *
 * Case-insensitive and whitespace-trimmed, because "PNG" is plainly the same
 * request as "png" and refusing it would be pedantry rather than safety.
 */
export function assertEnum<T extends readonly string[]>(
  raw: unknown,
  allowed: T,
  field: string,
  fallback: T[number],
): T[number] {
  if (raw === undefined || raw === null || raw === "") return fallback;
  if (typeof raw !== "string") {
    throw new ResourceLimitError(`'${field}' must be one of: ${allowed.join(", ")}.`);
  }
  const normalised = raw.trim().toLowerCase();
  if ((allowed as readonly string[]).includes(normalised)) return normalised as T[number];
  throw new ResourceLimitError(
    `'${field}' must be one of: ${allowed.join(", ")} (received ${JSON.stringify(raw)}).`,
  );
}

/**
 * Quality is 1-100 in sharp. Out of range it throws its own message after the
 * pipeline has been built; this refuses first, in the house style.
 */
export function assertQuality(raw: unknown, fallback = 80): number {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 100) {
    throw new ResourceLimitError(
      `'quality' must be a whole number between 1 and 100 (received ${JSON.stringify(raw)}).`,
    );
  }
  return n;
}

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
  // Whitespace FIRST, then the prefix (#426). The old order stripped the
  // prefix first, so a payload with leading whitespace — " data:image/png…" —
  // failed the `startsWith("data:")` test, kept its prefix, and was measured
  // and decoded whole. Harmless (over-measuring is the safe direction, and
  // the decode was garbage either way), but it silently turned a valid
  // data-URI into a refused or garbage payload. Whitespace-stripping first
  // means the prefix test sees the canonical string.
  return stripDataUriPrefix(input.replace(/\s/g, ""));
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
/**
 * The ONE way to accept a caller's base64 payload: normalise, measure the
 * normalised string, refuse if over `maxBytes`, and return THAT string for the
 * caller to send/decode.
 *
 * Composed here (#412 review) so the measure-the-string-you-use invariant is
 * unforgeable at call sites instead of being a three-call ritual upheld by
 * comments — the whitespace, padding and data-URI bugs narrated above all came
 * from callers composing the primitives divergently.
 */
export function checkedBase64(
  raw: string,
  maxBytes: number,
  field = "base64",
): string {
  const b64 = normalizeBase64(raw);
  assertDecodedSizeWithinLimit(decodedLengthOfBase64(b64), maxBytes, field);
  return b64;
}

/**
 * `maxBytes` is REQUIRED, second, and there is no default (#426 hardening).
 * The old trailing `maxBytes = MAX_DECODED_IMAGE_BYTES` default is the exact
 * mechanism behind the #412 fallback bug: a caller that forgot the argument
 * silently shrank its cap to 4 MiB. With two media-class caps plus render
 * caps there is no "obvious" default any more — omission should be a compile
 * error, and the parameter reorder makes any stale `(bytes, "field", MAX)`
 * call shape a type error rather than a silent misread.
 */
export function assertDecodedSizeWithinLimit(
  bytes: number,
  maxBytes: number,
  field = "base64",
): void {
  if (bytes > maxBytes) {
    throw new ResourceLimitError(
      `'${field}' must be ${mib(maxBytes)} or less once decoded (received ${mib(bytes)}).`,
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
      throw new ResourceLimitError(`'${name}' must be a positive whole number of pixels.`);
    }
    if (value > MAX_OUTPUT_DIMENSION) {
      throw new ResourceLimitError(
        `'${name}' must be ${MAX_OUTPUT_DIMENSION}px or less (received ${value}px).`,
      );
    }
  }

  // Both sides present: bound the area too. Each side can be under its own cap
  // while the product is not — 10,000 x 10,000 is 100 MP, four times the cap.
  if (width !== undefined && height !== undefined) {
    const pixels = width * height;
    if (pixels > MAX_OUTPUT_PIXELS) {
      throw new ResourceLimitError(
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
    throw new ResourceLimitError(
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
      throw new ResourceLimitError(
        `Resolved output ${name} is not a usable pixel count (${value}).`,
      );
    }
    if (value > MAX_OUTPUT_DIMENSION) {
      throw new ResourceLimitError(
        `'target_width'/'target_height' must be ${MAX_OUTPUT_DIMENSION}px or less per side once ` +
          `applied to this image's aspect ratio (resolved ${name} ${value}px).`,
      );
    }
  }
  const pixels = width * height;
  if (pixels > MAX_OUTPUT_PIXELS) {
    throw new ResourceLimitError(
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
 *
 * `maxBytes` is REQUIRED (#426 hardening) — the old 4 MiB default is the
 * mechanism behind the #412 fallback bug, and with image/document/render caps
 * in play there is no defensible implicit choice.
 *
 * `entity` optionally describes WHAT must be within the limit when it is not
 * the field's own bytes — a Browserless render of a caller URL passes
 * "a page whose screenshot renders to", producing "'url' must be a page whose
 * screenshot renders to 32.0MB or less" rather than implying the URL itself
 * is 32 MB. The helper writes both the `'field' must be ` prefix (so the
 * caller_input classification holds by construction) and the size figure (so
 * the quoted number cannot drift from the cap — callers never format it).
 */
export async function readBodyWithLimit(
  response: Response,
  maxBytes: number,
  field = "image_url",
  entity?: string,
): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const total = await consumeBody(response, maxBytes, field, entity, (c) => chunks.push(c));
  return Buffer.concat(chunks, total);
}

/**
 * Count a response body's bytes WITHOUT keeping them (#426).
 *
 * For consumers that need the size and nothing else (`website-carbon-estimate`
 * measures page weight), buffering is not just unbounded — it is unnecessary.
 * Chunks are counted and dropped, so memory is O(one chunk) regardless of body
 * size; `maxBytes` is a work bound (stop reading a deliberately endless
 * stream), not a residency bound.
 */
export async function countBodyBytes(
  response: Response,
  maxBytes: number,
  field = "url",
  entity?: string,
): Promise<number> {
  return consumeBody(response, maxBytes, field, entity);
}

/**
 * Read a response as TEXT, bounded (#428).
 *
 * The string sibling of `readBodyWithLimit`, for HTML/XML/plain-text bodies.
 * `await response.text()` has the same defect `arrayBuffer()` had: by the time
 * it resolves the whole body is resident, so a length check afterwards
 * describes rather than bounds. Bytes are capped while streaming and only then
 * decoded, so the decode never sees more than `maxBytes`.
 *
 * Decoding matches WHATWG `Response.text()` — UTF-8 with replacement
 * characters for invalid sequences — plus the BOM strip that `text()` performs
 * and `Buffer.toString("utf8")` does not. Without that strip, a BOM-prefixed
 * page would gain a leading U+FEFF it never used to have, which would break
 * markup checks that test the first character.
 */
export async function readTextWithLimit(
  response: Response,
  maxBytes: number,
  field = "url",
  entity?: string,
): Promise<string> {
  return decodeStreaming(response, maxBytes, field, entity, "refuse");
}

/**
 * The shared page-HTML read (#428).
 *
 * One cap, one field default, one phrase for every place the platform fetches
 * a page on a caller's behalf — the web-provider's three tiers and the four
 * capabilities that render through Browserless themselves. Five hand-written
 * variants of the same call was five spellings of one policy, which is the
 * drift hazard this module's own header warns about.
 */
export function readPageHtml(response: Response, field = "url"): Promise<string> {
  return readTextWithLimit(response, MAX_FETCHED_HTML_BYTES, field, "a page whose HTML is");
}

/**
 * The shared sitemap read (#432). Refuses above the protocol's own maximum.
 */
export function readSitemapXml(response: Response, field = "url"): Promise<string> {
  return readTextWithLimit(
    response,
    MAX_FETCHED_SITEMAP_BYTES,
    field,
    "a sitemap whose XML is",
  );
}

/**
 * Read a response as TEXT, keeping the bounded PREFIX instead of refusing
 * (#432).
 *
 * The counterpart to `readTextWithLimit`, for the two places where cutting is
 * the right answer rather than a compromise: a robots.txt past the crawler
 * parse limit (RFC 9309 §2.5 — real crawlers ignore the tail, so refusing
 * would answer a different question than the one asked), and the contact
 * scrapers, which have always scanned a page prefix.
 *
 * Refusal remains the default everywhere else. A truncated *content* read is
 * indistinguishable from a complete one at the API boundary, which is exactly
 * why #412 chose refusal; the two callers here are the cases where the
 * product semantics say otherwise, and both say so in their own constants.
 */
export function readTextTruncated(
  response: Response,
  maxBytes: number,
  field = "url",
): Promise<string> {
  return decodeStreaming(response, maxBytes, field, undefined, "truncate");
}

/**
 * The shared robots.txt read (#432). Truncates at the crawler parse limit.
 */
export function readRobotsTxt(response: Response, field = "url"): Promise<string> {
  return readTextTruncated(response, MAX_FETCHED_ROBOTS_BYTES, field);
}

/**
 * Read and parse a JSON API response, BOUNDED (#432).
 *
 * `await response.json()` cannot be capped: it buffers the whole body and then
 * parses it, so a length check afterwards describes two allocations that have
 * already happened. This reads bounded bytes, decodes them, and only then
 * parses — the same "measure before you allocate" shape as every other reader
 * in this module.
 *
 * `JSON.parse` throws the same `SyntaxError` class `response.json()` does, so
 * malformed-payload handling at call sites is unchanged.
 */
export async function readJsonWithLimit<T = unknown>(
  response: Response,
  maxBytes: number = MAX_FETCHED_API_RESPONSE_BYTES,
  field = "url",
): Promise<T> {
  const text = await readTextWithLimit(
    response,
    maxBytes,
    field,
    "an endpoint whose response is",
  );
  return JSON.parse(text) as T;
}

/**
 * Read a vendor's ERROR body for diagnostics, TRUNCATING at the cap (#428).
 *
 * Truncation, not refusal, is the correct semantic here: the body is being
 * read to explain a failure that already happened, so a refusal would throw
 * away the diagnostic instead of bounding it — and would replace an accurate
 * upstream error with a size error. Never throws: a transport fault mid-read
 * yields whatever prefix arrived, exactly like the `.catch(() => "")` this
 * replaces, but bounded.
 */
export async function readErrorTextTruncated(
  response: Response,
  maxBytes: number = MAX_ERROR_BODY_BYTES,
): Promise<string> {
  try {
    return await readTextTruncated(response, maxBytes, "error_body");
  } catch (err) {
    logWarn("error-body-read-failed", "could not read vendor error body", {
      err: err instanceof Error ? err.message : String(err),
    });
    return "";
  }
}

/**
 * Decode a bounded body to text WITHOUT ever holding a second full copy.
 *
 * Chunks feed a streaming `TextDecoder` and are dropped as they arrive, so the
 * peak is the decoded string rather than (chunks + concatenated Buffer +
 * string) — three copies of a 16 MiB page on a path 37 capabilities share.
 * Using WHATWG's decoder also removes a hand-rolled BOM strip: it is the same
 * UTF-8-with-replacement decoder `Response.text()` uses, and it drops a
 * leading BOM itself.
 */
async function decodeStreaming(
  response: Response,
  maxBytes: number,
  field: string,
  entity: string | undefined,
  limitMode: "refuse" | "truncate",
): Promise<string> {
  const decoder = new TextDecoder("utf-8");
  let out = "";
  await consumeBody(
    response,
    maxBytes,
    field,
    entity,
    (chunk) => {
      out += decoder.decode(chunk, { stream: true });
    },
    limitMode,
  );
  // Flush any trailing partial sequence (a multi-byte character split across
  // the final chunk boundary, or cut mid-character by the cap).
  return out + decoder.decode();
}

const limitPhrase = (entity: string | undefined, maxBytes: number) =>
  `${entity ? `${entity} ` : ""}${mib(maxBytes)} or less`;

/**
 * The ONE streaming-enforcement core (#426 review): declared content-length
 * refusal that never trusts a declaration to accept, actual-byte counting,
 * cancel-at-cap, reader cleanup. `readBodyWithLimit` retains chunks through
 * `onChunk`; `countBodyBytes` passes no sink. Two exports, one discipline —
 * a fix to either lands in both by construction.
 *
 * `limitMode` (#428) decides what crossing the cap MEANS. "refuse" is the
 * resource-safety default: the caller asked for something too big and gets a
 * refusal. "truncate" stops reading and keeps the bounded prefix — for bodies
 * read to diagnose a failure, where refusing would discard the diagnostic.
 * Both stop pulling at the same point; only the outcome differs.
 */
async function consumeBody(
  response: Response,
  maxBytes: number,
  field: string,
  entity: string | undefined,
  onChunk?: (chunk: Uint8Array) => void,
  limitMode: "refuse" | "truncate" = "refuse",
): Promise<number> {
  const phrase = limitPhrase(entity, maxBytes);
  // Trust a declared length enough to refuse early, never enough to accept.
  // In truncate mode a large declaration is not a refusal — the prefix is
  // still wanted — so the stream is read and cut at the cap below.
  const declared = Number(response.headers.get("content-length"));
  if (limitMode === "refuse" && Number.isFinite(declared) && declared > maxBytes) {
    // Cancel the unconsumed body before throwing — leaving it open pins the
    // keep-alive connection until GC (same class as safe-fetch's review L-1
    // fix for 3xx bodies; #412 review found it here).
    await response.body
      ?.cancel()
      .catch((err) => logError("image-limit-declared-cancel", err, { maxBytes, declared }));
    throw new ResourceLimitError(
      `'${field}' must be ${phrase} (it declared ${mib(declared)}).`,
    );
  }

  if (!response.body) {
    // Bodyless responses (204/205/304, HEAD, or a synthetic test Response) —
    // a real 200 with content always exposes a stream under undici, so this is
    // a belt, not the enforcement path. Folded into the core (#428 /simplify)
    // so there is ONE bodyless branch instead of one per export, which is
    // where the three copies had already begun to differ.
    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.byteLength > maxBytes) {
      if (limitMode === "refuse") {
        throw new ResourceLimitError(`'${field}' must be ${phrase}.`);
      }
      onChunk?.(buf.subarray(0, maxBytes));
      return maxBytes;
    }
    onChunk?.(buf);
    return buf.byteLength;
  }

  const reader = response.body.getReader();
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (total + value.byteLength > maxBytes) {
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
        if (limitMode === "refuse") {
          throw new ResourceLimitError(`'${field}' must be ${phrase}.`);
        }
        // Truncate: keep exactly the prefix that fits, then stop.
        const remaining = maxBytes - total;
        if (remaining > 0) onChunk?.(value.subarray(0, remaining));
        return maxBytes;
      }
      total += value.byteLength;
      onChunk?.(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  return total;
}
