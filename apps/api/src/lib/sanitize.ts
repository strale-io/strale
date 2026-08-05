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

export function sanitizeFailureReason(raw: string | null): string {
  if (!raw) return "Unknown error";

  let msg = raw;

  // Strip stack traces
  msg = msg.replace(STACK_TRACE_PATTERN, "");

  // Replace network-level errors
  if (NETWORK_ERROR_PATTERN.test(msg)) {
    // Keep the capability name prefix if present (e.g. "Header Security Check — ...")
    const dashIdx = msg.indexOf(" — ");
    const prefix = dashIdx >= 0 ? msg.slice(0, dashIdx) + " — " : "";
    return `${prefix}Service temporarily unreachable`;
  }

  // "fetch failed" → friendly message
  if (/fetch failed/i.test(msg)) {
    const dashIdx = msg.indexOf(" — ");
    const prefix = dashIdx >= 0 ? msg.slice(0, dashIdx) + " — " : "";
    return `${prefix}External service temporarily unavailable`;
  }

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

  // Collapse multiple spaces and trim
  msg = msg.replace(/\s+/g, " ").trim();

  // Truncate
  if (msg.length > 500) msg = msg.slice(0, 497) + "...";

  return msg || "Unknown error";
}
