/**
 * Refusals: the capability worked, the request was unanswerable as asked.
 *
 * A registry name search that returns nine equally-good "Total" matches has
 * not failed. It reached the upstream, got an answer, and understood it well
 * enough to know the answer is ambiguous. Handing back an arbitrary one of the
 * nine would be the failure — that is the wrong-company class documented in
 * `company-name-match.ts`, and refusing is the fix for it.
 *
 * The health machinery could not tell the difference. Reproduced in production
 * on 2026-08-14, minutes after the refusal behaviour shipped: three identical
 * `/v1/do` calls to `french-company-data` with `{"company_name":"Total"}` each
 * returned the intended refusal, and the third opened the circuit breaker
 * (`state=open, consecutive_failures=3`) against a capability with 25 prior
 * successes. Every caller then got `capability_unavailable`.
 *
 * Two separate accounting paths treat a refusal as evidence of ill health, and
 * both are wired to this module:
 *
 *   1. `circuit-breaker.ts` — three consecutive trips the breaker and suspends
 *      the capability for everyone. Threshold 3, so three agents each asking
 *      for a generic name is enough.
 *   2. `jobs/quality-floor.ts` — the quarantine/deactivate engine, which reads
 *      `transactions.error` directly and classifies it through
 *      `transaction-failure-taxonomy.ts`. Its `CALLER_ATTRIBUTABLE` set exists
 *      for exactly this, and half the refusals were already meant to be in it,
 *      but the tie-refusal pattern never matched the message it was written
 *      for. Below 70% completion quarantines, below 30% proposes deactivation
 *      (DEC-20260812-A) — slower than the breaker and much harder to undo.
 *   3. `quality-capture.ts` → `quality-aggregation.ts` — the trust and quality
 *      surfaces, where a refusal was categorised `internal_error` and counted
 *      against success rate. Not the floor: an earlier version of this comment
 *      claimed it was, which is what hid (2) until the wiring was traced.
 *
 * Nothing here changes what the caller sees. A refusal is still an error, still
 * names the disambiguator, and is still unbilled per DEC-14. Only the health
 * accounting changes.
 */

/**
 * Thrown by a capability when the request cannot be answered as asked and the
 * caller has to change something — an ambiguous company name, a name matching
 * nothing, input that names no entity at all.
 *
 * Not for upstream faults. A 503, a timeout or a parse failure is a real
 * failure and must keep tripping the breaker.
 */
export class CapabilityRefusalError extends Error {
  /** Discriminator that survives structured cloning and `instanceof` across
   *  module-instance boundaries, which the async execution paths can cross. */
  readonly isCapabilityRefusal = true;

  constructor(message: string) {
    super(message);
    this.name = "CapabilityRefusalError";
  }
}

/**
 * Message fragments that identify a refusal when only a string survives.
 *
 * `/v1/do` records failures through `recordFailure(slug, errorMessage)` and
 * `recordQuality({ error })`, and on the async and x402 paths the original
 * error object is long gone by then — only its message is persisted. So the
 * type alone cannot carry this; the message has to be recognisable too.
 *
 * These are exact prefixes of the messages the refusal sites already emit, so
 * no caller-facing text changed to accommodate the machine. `assertRefusalsAreRecognised`
 * in `capability-refusal.test.ts` builds real errors from the real primitives
 * and fails if a wording change ever drifts out of this list — the same
 * arrangement `tos-blocklist.test.ts` uses for the ToS refusal marker.
 */
export const REFUSAL_MESSAGE_PATTERNS = [
  // Resource-limit refusals from lib/resource-limits.ts (#412, #426,
  // #428). The capability fetched, measured, and declined to hold an input
  // larger than its declared ceiling — the ask has to change, nothing is
  // unhealthy. Verified against the real predicates during the #428 review:
  // before these entries `isUserInputError` returned false for every one of
  // them, so three oversized pages in a row would have opened the breaker on a
  // path 37 capabilities share. Fragments are the tail of the message rather
  // than "must be ", which over-matches internal assertions (see the
  // transaction-failure-taxonomy note on that exact trap).
  "MB or less", // byte caps: image, document, render, HTML, media
  "px or less", // image-resize output edge
  "megapixels or less", // image-resize output area
  "Ambiguous ", // pickByName: several equally-good registry matches
  "No confident ", // pickByName / assertSingleResultMatch: nothing matched well enough
  "Could not identify a specific ", // extractCompanyName: input names no company
  // web-extract / product-reviews-extract: the LLM extraction call hit its
  // per-call output-token budget before finishing. The page rendered fine
  // and the model understood the request well enough to start answering it —
  // the request just needs to be narrower or split, which is the same "the
  // capability worked, the ask has to change" shape as the entries above.
  // 2026-08-17: this exact failure (undetected truncation -> unbalanced-brace
  // parse failure -> classified `internal` by INTERNAL_RE's "failed to parse"
  // match) quarantined web-extract in production after six paid x402 calls
  // hit it in 5 minutes. Registering the phrase here — rather than only in
  // transaction-failure-taxonomy.ts's CALLER_INPUT_RE — additionally keeps
  // the circuit breaker (circuit-breaker.ts spreads REFUSAL_MESSAGE_PATTERNS
  // into USER_INPUT_ERROR_PATTERNS) and quality-capture.ts's categorizeError
  // (via isCapabilityRefusal) aligned with the taxonomy, the same three-consumer
  // guarantee this list already gives the registry-refusal patterns above.
  "Extraction result too large for one call",
] as const;

/** Does this error — object or bare message — represent a refusal? */
export function isCapabilityRefusal(err: unknown): boolean {
  if (err instanceof CapabilityRefusalError) return true;
  if (typeof err === "object" && err !== null && "isCapabilityRefusal" in err) {
    return (err as { isCapabilityRefusal?: unknown }).isCapabilityRefusal === true;
  }
  const message = typeof err === "string" ? err : err instanceof Error ? err.message : "";
  return isRefusalMessage(message);
}

/**
 * Message-only form, for the paths that never see the error object.
 *
 * Anchored at the start rather than matched anywhere in the string. Every
 * refusal site opens with one of these phrases, and several unrelated errors in
 * the same capabilities quote the caller's query back verbatim — `No French
 * company found matching "${query}"`. A company name beginning "Ambiguous" is
 * contrived but not impossible, and would otherwise file an ordinary not-found
 * as a refusal. Both outcomes happen to be caller-attributable, so nothing
 * breaks either way; anchoring just keeps the bucket meaning what it says.
 */
export function isRefusalMessage(message: string): boolean {
  return REFUSAL_MESSAGE_PATTERNS.some((p) => message.startsWith(p));
}
