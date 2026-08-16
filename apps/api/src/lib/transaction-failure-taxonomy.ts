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

/**
 * Our own failures, claimed BEFORE the caller patterns, because they quote raw
 * third-party text that can contain literally any phrase. An LLM-truncation
 * error carrying a `Raw:` payload that happens to contain "not found" would
 * otherwise be excused as the caller's fault — the classifier would be reading
 * the model's prose, not our diagnosis. Matching our own signature first makes
 * that impossible.
 *
 * Deliberately NOT extended to cover screenshot-url's
 * `"waitForSelector" is not allowed` (Browserless rejecting a parameter we
 * send, and currently landing in `timeout` because the rejection JSON embeds a
 * `context` block containing that word). Both classes count against the
 * capability, so the misfiling costs the floor nothing and only mislabels a
 * report — and encoding one specific bug's string into a money-path classifier
 * to fix a label is a worse trade than fixing the bug. Tracked separately.
 */
const INTERNAL_RE = /\bin JSON at position\b|\bunterminated string\b|response parse failed|failed to parse\b/i;

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

    // ── Added 2026-08-16 after a census of every distinct external failure
    // string in 90 days (188 strings, 491 calls). The list above encoded the
    // *intent* — the type says caller_input covers "bad/missing input, wrong
    // identifier, unresolvable name" — but only implemented the phrasings that
    // happened to be written when it was authored. 106 distinct strings were
    // landing in `internal` ("OUR bug until proven otherwise"), and because
    // QUALITY_FLOOR_ENFORCE is armed, that delisted capabilities for refusing
    // correctly. `us-company-data` was quarantined at "64% completion on 11
    // calls": 7 successes, 1 genuine SEC 500, and the rest caller input.
    //
    // The line drawn here, and it is the one to keep applying: a failure is
    // the caller's when the capability DID its job and the answer is "your
    // input is malformed" or "your input matches nothing". It is ours whenever
    // we could not complete the operation, whatever the cause. Every pattern
    // below is anchored to a string this census actually observed.

    // Malformed input. "Invalid URL format.", "Invalid IP address format.",
    // "Invalid JWT format.", "Invalid ABN format:", "Invalid label …".
    //
    // The subject is ENUMERATED rather than matched as `invalid \w+ format`,
    // and the match is anchored to the start of the message. The general form
    // also claims "Invalid response format" — a vendor payload we could not
    // read, which is ours. We know which inputs we validate; guessing from
    // shape buys nothing and costs the floor its sight.
    "^invalid (?:url|uri|ip address|ip|jwt|abn|vat|iban|email|domain|date|label|value|parameter|identifier|json)\\b",
    // "'from' and 'to' must be valid 3-letter ISO 4217 currency codes.",
    // "'purpose' must be 'work', 'study', or 'visit'."
    //
    // Anchored to a message that OPENS with a quoted field name, which is the
    // house style for caller-facing validation. A bare "must be " was tried
    // first and is far too broad — it excused "Response validation failed:
    // output must be an object", "Internal assertion failed: result must be
    // non-null" and "Config value must be set before use", every one of which
    // is our own defect. Found by probing the patterns against invented
    // internal-error shapes rather than only against the strings they were
    // written from; the tests did not catch it.
    "^'[^']{1,40}'.{0,40}must be ",
    // NOT matched: "CSV must have at least a header row and one data row."
    // (schema-infer, 5 calls). There is no shape separating it from "Result
    // must have at least one row", which would be ours, so it stays counted.
    // If that refusal should be excused, the message needs to lead with its
    // quoted field the way the rest of the house style does — a cheaper fix
    // there than a looser rule here.
    // "Provide 'url' (e.g. …) or 'domain' (e.g. …) to detect the technology
    // stack." — a required-field message that never says "is required".
    "^provide ['\"]",
    // "Could not parse spec as JSON or YAML. Please provide valid OpenAPI spec."
    "as json or yaml",

    // Refusals: we looked, and the caller's identifier matches nothing. These
    // are the capability working, not failing — the same rule the circuit
    // breaker already applies. "No Estonian company found matching …",
    // "No Swiss company found for …", "No US company found matching …".
    "found (?:matching|for) ",
    // Scope refusals: the caller asked for something outside declared
    // coverage. "Country 'ZM' is not supported.", "Tax data not available for
    // 'ZM'.", '"us" is not supported — no licensed price source exists for it
    // yet.'
    //
    // A QUOTED SUBJECT is required, because that subject is the caller's
    // value. Bare `is not supported` also claims "Digest method is not
    // supported" and bare `not available (?:for|via)` also claims "Service is
    // temporarily not available via API" — an implementation regression and an
    // outage respectively, both of which must keep counting. Cost of the
    // stricter rule: charity-lookup-uk's "Name search is not available via
    // free APIs." (1 call) is no longer excused. Accepted — on this path,
    // over-counting is recoverable and under-counting is blindness.
    "['\"][^'\"]{1,40}['\"] is not supported",
    "not available (?:for|via) ['\"]",
    // "Unknown model 'claude-sonnet-4-5'. Supported: …",
    // "Cannot convert from 'usd' to 'eur'."
    "unknown (?:model|chain|country|currency|format|type)",
    "cannot convert from",

    // The caller's own resource is missing or blocked. 403 and 404 ONLY, and
    // only in a phrasing that names a fetch — a bare vendor 400 is frequently
    // a request WE malformed, and a 5xx is upstream (review H-2). Consistent
    // with "url returned http 4" and "blocks automated access" above, which
    // already treat the caller's target site as the caller's problem.
    // "Could not fetch X (HTTP 403)", "HTTP 404 fetching sitemap from X",
    // "Failed to fetch PDF: HTTP 404", "HTTP 403 from X".
    // The tell has to be that the fetched thing is the CALLER's, not merely
    // that a fetch 40x'd. A generic "(could not|failed to) fetch … HTTP 40[34]"
    // was tried first and excused "Could not fetch internal config (HTTP 404)"
    // and "Failed to fetch model list: HTTP 403" — our own outbound calls,
    // which is exactly how a systematically broken capability would look.
    //
    // "Could not fetch example.com (HTTP 403). Check the URL is correct and
    // publicly accessible." — the second sentence is the house phrasing for
    // "this was your address", and is unambiguous on its own.
    "check the url is correct",
    // "HTTP 404 fetching sitemap from …" — names the thing fetched.
    "http 40[34] fetching ",
    // "HTTP 403 from …", "HTTP 404 from …". The subject must look like a host
    // or a redacted service marker: "HTTP 403 from Companies House API" is a
    // vendor WE chose, and a credential expiring there would otherwise excuse
    // every call the capability makes.
    "http 40[34] from (?:https?://|\\[service\\]|[a-z0-9-]+\\.[a-z]{2,})",
    // "Failed to fetch invoice from URL: HTTP 404"
    "fetch \\w+ from url",
    // "Could not access repo X. It may be private."
    "may be private",
    // "Could not access website at X Verify the domain is correct."
    "verify the domain is correct",
    // Our SSRF guard refusing a caller-supplied address. The guard working is
    // the opposite of a defect, and counting it as one is the clearest case of
    // the rule this whole block exists to enforce.
    "targets a restricted address",

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
  // Before timeout/upstream/caller: these messages quote raw third-party text
  // that can contain any phrase, so they must be claimed by their own
  // signature rather than matched on their payload.
  if (INTERNAL_RE.test(msg)) return "internal";
  if (TIMEOUT_RE.test(msg)) return "timeout";
  if (UPSTREAM_RE.test(msg)) return "upstream";
  if (CALLER_INPUT_RE.test(msg)) return "caller_input";
  return "internal";
}
