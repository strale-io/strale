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

/**
 * Dotted-quad IPv4, with each octet validated to 0-255.
 *
 * The validation is what stops it eating four-part version strings and the
 * like; `1.2.3.999` is left alone because it is not an address. Ports are not
 * matched, and do not need to be — a bare port identifies nothing.
 */
const IPV4_PATTERN =
  /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g;

/**
 * IPv6, deliberately requiring at least four hex groups.
 *
 * Three groups would also match a clock time — `10:30:00` is hex-shaped — and
 * turning timestamps in error messages into `[service]` would be a worse bug
 * than the one this closes. The cost of the conservative bound is that the
 * loopback shorthands (`::1`) are not matched, which identifies nothing.
 */
const IPV6_PATTERN = /\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b/gi;

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
 * Keys inside an audit body whose value is a failure message.
 *
 * `audit_trail` is free-form JSONB written by four different builders, so
 * there is no type to lean on. Naming the keys explicitly is the honest
 * option: a builder that invents a fifth name is not covered, and
 * `sanitize.audit.test.ts` fails when a builder emits an error-bearing key
 * this set does not contain — so the gap is caught at build time rather than
 * discovered in a response.
 */
const AUDIT_ERROR_KEYS = new Set(["error_message", "error"]);

/**
 * Sanitise the failure messages inside a stored audit body, at the boundary.
 *
 * ## Why this exists at all, given the builders now sanitise
 *
 * `buildFailureAudit` sanitises when it writes, and that is the authority.
 * This is for the rows written before it did: 51 production rows carry a raw
 * `error_message`, and they cannot be rewritten, because `audit_trail` is
 * inside the integrity-chain payload and editing it would invalidate the
 * row's hash. Serving is the only place left to fix them.
 *
 * It is the same function, applied again, not a second sanitiser — and
 * `sanitizeFailureReason` is idempotent, so for anything written from now on
 * this is a no-op.
 *
 * Walks nested structures because solution audits carry `steps[].error`.
 * Leaves non-string values alone: a null error must stay null rather than
 * becoming the string "Unknown error", which is what sanitising a null would
 * produce and would be a fabricated failure on a row that had none.
 */
export function redactAuditTrail(auditTrail: unknown): unknown {
  if (Array.isArray(auditTrail)) return auditTrail.map(redactAuditTrail);
  if (!auditTrail || typeof auditTrail !== "object") return auditTrail;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(auditTrail as Record<string, unknown>)) {
    if (AUDIT_ERROR_KEYS.has(key) && typeof value === "string" && value !== "") {
      out[key] = sanitizeFailureReason(value);
    } else {
      out[key] = redactAuditTrail(value);
    }
  }
  return out;
}

/** The key set, exported so a test can prove it covers what the builders emit. */
export const AUDIT_ERROR_KEY_NAMES: readonly string[] = [...AUDIT_ERROR_KEYS];

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

  // Strip bare IP literals.
  //
  // The hostname pattern requires a dot-plus-letters TLD, so an address like
  // `connect 10.0.3.14:5432 - ECONNREFUSED` went through untouched - naming
  // internal infrastructure just as precisely as the hostnames next to it.
  // Pre-existing and unrelated to the canned-branch fix in #383.
  msg = msg.replace(IPV4_PATTERN, "[service]");
  msg = msg.replace(IPV6_PATTERN, "[service]");

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

  // Truncate on a WORD BOUNDARY.
  //
  // Cutting mid-token made the function non-idempotent, and in a way that
  // destroyed information rather than merely moving it. Hostname replacement
  // has already run by this point, so the only hostname-shaped tokens still
  // present are ALLOWLISTED ones - `reviews.io`, `patents.google.com` and the
  // rest. Split one of those across the cut and the remnant no longer matches
  // the allowlist, so a second application replaces it with `[service]`.
  //
  // That bounds the fix precisely: the longest allowlist entry is 18
  // characters, so backing the cut up to the nearest preceding space within a
  // 32-character window cannot leave a partial one. If there is no space in
  // that window the token is longer than any allowlist entry, so cutting it is
  // safe.
  //
  // Pre-existing, and unreachable in production today - no message has an
  // allowlisted token straddling offset 497 - but it is the same class as the
  // leak this PR fixes: latent is not the same as absent.
  if (msg.length > 500) {
    const hardCut = 497;
    const lastSpace = msg.lastIndexOf(" ", hardCut);
    const cut = lastSpace >= hardCut - 32 ? lastSpace : hardCut;
    msg = msg.slice(0, cut).trimEnd() + "...";
  }

  return msg || "Unknown error";
}
