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
 *   2. `quality-capture.ts` → `quality-aggregation.ts` → `jobs/quality-floor.ts`
 *      — a refusal was categorised `internal_error`, and success rate counts
 *      any non-null `error_type` against the capability. Below 70% quarantines
 *      it and below 30% deactivates it (DEC-20260812-A). That one is slower
 *      than the breaker and considerably harder to undo.
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
  "Ambiguous ", // pickByName: several equally-good registry matches
  "No confident ", // pickByName / assertSingleResultMatch: nothing matched well enough
  "Could not identify a specific ", // extractCompanyName: input names no company
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

/** Message-only form, for the paths that never see the error object. */
export function isRefusalMessage(message: string): boolean {
  return REFUSAL_MESSAGE_PATTERNS.some((p) => message.includes(p));
}
