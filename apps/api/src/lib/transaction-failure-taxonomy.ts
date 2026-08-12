/**
 * Transaction-failure taxonomy — autonomy ladder L1 (Readiness P3,
 * DEC-20260812-A).
 *
 * Classifies a failed CUSTOMER TRANSACTION's error text so the quality floor
 * (and the platform-doctor report) can decompose failure rates into named
 * causes — and, critically, so failures CAUSED BY THE CALLER never count
 * against a capability's completion rate.
 *
 * Distinct from lib/failure-classifier.ts, which classifies TEST-RESULT
 * failures for the test-intelligence system (7 verdicts, test-suite inputs).
 * This module is for production transactions: different inputs, different
 * consumers, deliberately separate.
 *
 * Pure string classification. Ordering matters: earlier, more specific
 * classes win. Patterns lean on the platform's own stable error phrasings —
 * when one changes, its test here fails loudly.
 */
import { isUserInputError } from "./circuit-breaker.js";
import { TOS_REFUSAL_MARKER } from "./tos-blocklist.js";

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
// generic "is required" that the caller-input pattern list matches, so
// config MUST be checked first with a shape only our env errors have.
const CONFIG_RE = /\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)*_(?:KEY|TOKEN|SECRET|GUID|URL|PASSWORD)\b|not configured|rejected the (?:api )?key|missing credential/;
// Route-level validation phrasings that the circuit-breaker's pattern list
// (built for executor-thrown errors) does not carry.
const ROUTE_INPUT_RE = /missing required (?:input )?fields?|provide one of:|looks like you (?:passed|placed)/i;
const TIMEOUT_RE = /timed? ?out|timeout|deadline|aborted due to timeout|operation was aborted/i;
const UPSTREAM_RE = /HTTP 5\d\d|upstream|unavailable|rate.?limit|too many requests|429|quota|service.*(?:down|error)|ECONNRESET|ECONNREFUSED|ENOTFOUND|socket hang up|anti-bot challenge/i;

export function classifyTransactionFailure(error: string | null | undefined): TransactionFailureClass {
  const msg = (error ?? "").trim();
  if (!msg) return "internal";
  if (msg.includes(TOS_REFUSAL_MARKER)) return "tos_policy";
  if (CONFIG_RE.test(msg)) return "config";
  if (ROUTE_INPUT_RE.test(msg) || isUserInputError(msg)) return "caller_input";
  if (TIMEOUT_RE.test(msg)) return "timeout";
  if (UPSTREAM_RE.test(msg)) return "upstream";
  return "internal";
}
