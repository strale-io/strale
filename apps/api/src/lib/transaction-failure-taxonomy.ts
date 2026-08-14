/**
 * Transaction-failure taxonomy — autonomy ladder L1 (Readiness P3,
 * DEC-20260812-A).
 *
 * Classifies a failed CUSTOMER TRANSACTION's error text so the quality floor
 * (and the platform-doctor report) can decompose failure rates into named
 * causes — and, critically, so failures CAUSED BY THE CALLER never count
 * against a capability's completion rate.
 *
 * Distinct from lib/failure-classifier.ts (TEST-result verdicts) AND from
 * circuit-breaker.ts's user-input list. Review H-2 (2026-08-12) proved the
 * breaker list cannot be reused wholesale here: it answers "should this trip
 * the breaker?" and deliberately includes target-site 5xx ("URL returned
 * HTTP 5", "returned a server error") — correct for breakers (the TARGET
 * site's outage isn't the capability's fault either), but fatal for the
 * floor: counting a month-long upstream outage as caller fault would report
 * 100% completion while every customer call fails. This module carries its
 * own curated caller-attributable list; upstream/timeout checks run BEFORE
 * the generic caller patterns.
 *
 * Pure string classification, no imports beyond the ToS marker constant.
 * Ordering matters and is pinned by tests both directions.
 */
import { TOS_REFUSAL_MARKER } from "./tos-blocklist.js";
import { REFUSAL_MESSAGE_PATTERNS } from "./capability-refusal.js";

export type TransactionFailureClass =
  | "caller_input"   // bad/missing input, wrong identifier, unresolvable name
  | "tos_policy"     // per-source ToS refusal — a policy answer, not a defect
  | "config"         // missing key/credential/env on our side
  | "timeout"        // execution or upstream deadline exceeded
  | "upstream"       // vendor/upstream failure: 5xx, quota, unavailability
  | "internal";      // everything else — OUR bug until proven otherwise

/** Classes that must NOT count against a capability's completion rate. */
export const CALLER_ATTRIBUTABLE: ReadonlySet<TransactionFailureClass> = new Set([
  "caller_input",
  "tos_policy",
]);

// ENV-var-shaped names (OPENREGISTER_API_KEY, COURTLISTENER_API_TOKEN,
// BROWSERLESS_URL…) — tight on purpose: env-key errors also contain the
// generic "is required", so config MUST be checked before caller patterns
// with a shape only our env errors have. Case-sensitive env-var shape,
// case-insensitive phrasings.
const CONFIG_ENV_RE = /\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)*_(?:KEY|TOKEN|SECRET|GUID|URL|PASSWORD)\b/;
const CONFIG_PHRASE_RE = /not configured|rejected the (?:api )?(?:key|token)|missing credential/i;

const TIMEOUT_RE = /timed? ?out|timeout|deadline|aborted due to timeout|operation was aborted/i;

// Upstream/vendor failure. Checked BEFORE the caller-input patterns so
// target-site 5xx phrasings ("URL returned HTTP 503", "registry returned a
// server error (HTTP 503)") land here, not in caller_input (review H-2).
const UPSTREAM_RE = /HTTP 5\d\d|upstream|unavailable|rate.?limit(?:ed)?|too many requests|\b429\b|quota|service.*(?:down|error)|returned a server error|ECONNRESET|ECONNREFUSED|ENOTFOUND|socket hang up|anti-bot challenge/i;

// Curated caller-attributable patterns. Route-level validation phrasings plus
// the subset of the circuit-breaker's user-input list that is genuinely the
// caller's doing. Deliberately ABSENT (they classify upstream above):
// "URL returned HTTP 5", "returned a server error", "could not be loaded".
const CALLER_INPUT_RE = new RegExp(
  [
    "missing required (?:input )?fields?",
    "provide one of:",
    "looks like you (?:passed|placed)",
    "is required",
    "invalid input",
    "must provide",
    "no dns records found",
    "domain may not exist",
    "url returned http 4",           // 4xx from the caller's own target URL
    "this site exists but blocks",
    "blocks automated access",
    "not found",
    "this url returns json",
    "this url points to a pdf",
    "this url points to an image",
    "could not repair json",
    // Registry name-search refusals. Sourced from capability-refusal.ts so
    // this list, the circuit breaker's and the throw sites cannot drift apart
    // — they are three consumers of one definition.
    //
    // These were partly here already, but "distinct .* entities match" never
    // fired: the message reads "N distinct registered entities are exact
    // matches", so there is no literal "entities match" for it to hit. Every
    // ambiguity refusal was therefore classified `internal` — "OUR bug until
    // proven otherwise" — and counted against the capability's completion
    // rate, which is what the quality floor quarantines on. Verified against
    // the real strings, not the intent.
    ...REFUSAL_MESSAGE_PATTERNS.map((p) => p.trim()),
  ].join("|"),
  "i",
);

export function classifyTransactionFailure(error: string | null | undefined): TransactionFailureClass {
  const msg = (error ?? "").trim();
  if (!msg) return "internal";
  if (msg.includes(TOS_REFUSAL_MARKER)) return "tos_policy";
  if (CONFIG_ENV_RE.test(msg) || CONFIG_PHRASE_RE.test(msg)) return "config";
  if (TIMEOUT_RE.test(msg)) return "timeout";
  if (UPSTREAM_RE.test(msg)) return "upstream";
  if (CALLER_INPUT_RE.test(msg)) return "caller_input";
  return "internal";
}
