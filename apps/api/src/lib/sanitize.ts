/**
 * Sanitize failure reasons before returning them to API consumers.
 * Strips provider names, hostnames, raw error codes, and internal jargon.
 */

const NETWORK_ERROR_PATTERN =
  /\b(getaddrinfo|ENOTFOUND|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EPIPE|EAI_AGAIN)\b/i;

const URL_PATTERN =
  /https?:\/\/[^\s,)]+/gi;

const HOSTNAME_PATTERN =
  /\b[a-z0-9][-a-z0-9]*\.[a-z]{2,}(?:\.[a-z]{2,})?\b/gi;

const STACK_TRACE_PATTERN =
  /\s+at\s+[\w$.]+\s*\(.*?\)/g;

const PROVIDER_NAMES = [
  /\bBrowserless\b/gi,
  /\bSerper\b/gi,
  /\bAviationStack\b/gi,
  /\bCoinGecko\b/gi,
  /\bVoyage\s*AI\b/gi,
  /\bOpen-Meteo\b/gi,
  /\bip-api\.com\b/gi,
];

/**
 * Hostname-shaped strings that must survive sanitization.
 *
 * The stripper exists to stop internal infrastructure hostnames leaking into
 * customer-facing errors, but it cannot tell those from a vendor name we
 * deliberately wrote into guidance. It ate one: the ToS refusal in
 * capabilities/lib/tos-blocklist.ts points callers at compliant review
 * platforms, and "Reviews.io" reached production as "[service]" — advice that
 * names nothing. Entries here are public product names appearing in authored
 * copy, never infrastructure.
 *
 * Matched case-insensitively as substrings of a hostname-shaped token.
 */
const HOSTNAME_ALLOWLIST = [
  "error.message",
  "error.code",
  "schema.org",
  // Compliant alternatives named by the ToS blocklist refusal messages.
  "reviews.io",
  "trustpilot.com",
  "glassdoor.com",
  "linkedin.com",
  "patents.google.com",
];

/**
 * Everything that has to be removed before a message can face a customer.
 *
 * Extracted so it can run on EVERY path out of `sanitizeFailureReason`. It
 * used to be inline, after two early returns that skipped it entirely.
 */
function redact(input: string): string {
  let msg = input;

  // Replace provider names
  for (const pattern of PROVIDER_NAMES) {
    msg = msg.replace(pattern, "External web service");
  }

  // Replace "upstream" in user-facing text
  msg = msg.replace(/\bupstream\s+issue/gi, "external service issue");
  msg = msg.replace(/\bupstream\b/gi, "external service");

  // Strip URLs
  msg = msg.replace(URL_PATTERN, "[service]");

  // Strip raw hostnames (but preserve common words that match the pattern)
  // Only strip if it looks like a real hostname (has dots, not just "error.message")
  msg = msg.replace(HOSTNAME_PATTERN, (match) => {
    if (HOSTNAME_ALLOWLIST.some((p) => match.toLowerCase().includes(p))) return match;
    return "[service]";
  });

  return msg;
}

/**
 * The capability-name prefix a canned message keeps, if there is one.
 *
 * `"Header Security Check — getaddrinfo ENOTFOUND ..."` keeps
 * `"Header Security Check — "` so the caller still knows which capability
 * failed. Everything before the first em-dash separator, which is an authored
 * prefix by convention and arbitrary upstream text in fact — which is exactly
 * why it has to be redacted like anything else.
 */
function namePrefix(msg: string): string {
  const dashIdx = msg.indexOf(" — ");
  return dashIdx >= 0 ? msg.slice(0, dashIdx) + " — " : "";
}

/**
 * ## Why the shape is "choose the message, then redact it"
 *
 * The two canned branches below used to `return` directly, carrying a prefix
 * captured BEFORE any stripping ran. That prefix is "everything before the
 * first ` — `" — by convention a capability name, but in fact whatever the
 * upstream error happened to start with. So
 *
 *     GET https://internal.example.com/x — getaddrinfo ENOTFOUND upstream
 *
 * came back as
 *
 *     GET https://internal.example.com/x — Service temporarily unreachable
 *
 * with the internal URL intact — the precise leak this function exists to
 * prevent, escaping through the branch that fires when an error is at its most
 * infrastructural.
 *
 * It also made the function **non-idempotent** in two independent ways: the
 * escaped prefix is stripped on a second application, and the early returns
 * skipped the collapse/truncate tail, so a prefix over 500 characters comes
 * back whole once and truncated the next time. That now matters beyond
 * tidiness: `lib/receipt/settle.ts` sanitises when building an execution
 * receipt, and a digest that depended on how many times this ran would not be
 * a commitment to anything.
 *
 * The fix is structural rather than a patch on each branch. The branches now
 * choose the *message*; redaction and normalisation run on whatever they
 * chose. A third canned branch added later cannot reintroduce this, because
 * there is no longer a path out of here that skips `redact`.
 *
 * Detection still runs on the pre-redaction text, so which branch fires is
 * unchanged — only what survives it.
 */
export function sanitizeFailureReason(raw: string | null): string {
  if (!raw) return "Unknown error";

  // Strip stack traces first: they can contain both hostnames and the network
  // tokens the branches test for, and none of it should influence either.
  let msg = raw.replace(STACK_TRACE_PATTERN, "");

  if (NETWORK_ERROR_PATTERN.test(msg)) {
    msg = `${namePrefix(msg)}Service temporarily unreachable`;
  } else if (/fetch failed/i.test(msg)) {
    msg = `${namePrefix(msg)}External service temporarily unavailable`;
  }

  msg = redact(msg);

  // Collapse multiple spaces and trim
  msg = msg.replace(/\s+/g, " ").trim();

  // Truncate
  if (msg.length > 500) msg = msg.slice(0, 497) + "...";

  return msg || "Unknown error";
}
