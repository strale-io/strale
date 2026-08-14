/**
 * Targets Strale will not fetch, because the site's Terms of Service forbid
 * automated access.
 *
 * ## Why this exists
 *
 * The platform already decided, site by site, that these hosts are off-limits
 * — but it enforced those decisions by deactivating the *named* capability
 * that targeted each one (`trustpilot-score`, `salary-benchmark`,
 * `employer-review-summary`, `linkedin-url-validate`, `patent-search`; see the
 * DEACTIVATED map in `../auto-register.ts`, and the trimmed PLATFORMS list in
 * `../social-profile-check.ts`).
 *
 * That is not sufficient. Capabilities which accept an *arbitrary* URL and run
 * it through Browserless or a direct fetch reach exactly the same targets, so
 * deactivating the named capability closes the front door and leaves the side
 * door open. Production bore this out: over 2026-07-20 → 2026-08-05, callers
 * sent `product-reviews-extract` 28 Trustpilot review URLs (all 403-ed) and
 * `tech-stack-detect` 19 linkedin.com domains (all *succeeded*) — i.e. the
 * platform was serving, for money, the precise automated access that
 * `linkedin-url-validate` had been deactivated for performing.
 *
 * Per DEC-20260428-A Tier 1 ("Strale itself never operates scrapers" — stated
 * as absolute) and DEC-20260420-H (direct connections, full ToS compliance),
 * the check belongs on the fetch path, not on the capability name. This module
 * is that single source of truth.
 *
 * ## What it is not
 *
 * It is not a security control and not an SSRF guard — that is
 * `lib/url-validator.ts` / `lib/safe-fetch.ts`, which still run. This is a
 * compliance policy gate, and it is deliberately conservative: it blocks only
 * hosts the platform has already ruled on. Adding a host here is a policy
 * decision and needs a corresponding DEC entry.
 */

export interface ProhibitedTarget {
  /** Registrable host. Matches this host exactly and any subdomain of it. */
  host: string;
  /**
   * When set, only URLs whose path starts with this prefix are prohibited.
   * Used where the ruling covers one product rather than a whole domain —
   * google.com/search is ToS-prohibited for scraping, google.com is not.
   */
  pathPrefix?: string;
  /**
   * When set, matches the hostname by regex instead of exact/subdomain
   * equality — for rulings covering a domain FAMILY (google ccTLDs). `host`
   * then serves only as the display placeholder. Matches ALL subdomains —
   * hostname variation is the evasion this rule class exists to close.
   */
  hostRe?: RegExp;
  /** Concrete example hostname for hostRe rules — used by the integrity tests. */
  testHost?: string;
  /** Human-readable site name, used in the caller-facing message. */
  site: string;
  /** Governing decision. Internal provenance — never sent to callers. */
  decision: string;
  /** Caller-facing sentence naming compliant alternatives. */
  alternatives: string;
}

export const PROHIBITED_TARGETS: readonly ProhibitedTarget[] = [
  {
    host: "trustpilot.com",
    site: "Trustpilot",
    decision: "DEC-20260427-H-2",
    alternatives:
      "Supported review sources include Reviews.io, Feefo and Yotpo pages, and first-party product pages.",
  },
  {
    host: "glassdoor.com",
    site: "Glassdoor",
    decision: "DEC-20260427-H-3 / DEC-20260427-H-4",
    alternatives:
      "For salary data try the job-board-search or salary-related capabilities backed by licensed sources.",
  },
  {
    host: "linkedin.com",
    site: "LinkedIn",
    decision: "DEC-20260427-H-5",
    alternatives:
      "Use the company's own website for company data, or company-enrich for firmographics.",
  },
  {
    host: "patents.google.com",
    site: "Google Patents",
    decision: "DEC-20260427-H-1",
    alternatives: "Compliant patent sources are EPO OPS, USPTO PEDS and Lens.org.",
  },
  {
    host: "google.com",
    pathPrefix: "/search",
    site: "Google Search",
    decision: "DEC-20260427-H-4",
    alternatives: "Use the google-search capability, which runs on a licensed search API.",
  },
  {
    // Money-integrity 2026-08-12: the H-4 ruling covers Google Search, not
    // one hostname — google.se/.de/.co.uk /search were still executable
    // (product-search exploited exactly this). ccTLD family, same path rule.
    hostRe: /^(?:[a-z0-9-]+\.)*google\.[a-z]{2,3}(?:\.[a-z]{2})?$/,
    testHost: "www.google.se",
    host: "google.<ccTLD>",
    pathPrefix: "/search",
    site: "Google Search",
    decision: "DEC-20260427-H-4",
    alternatives: "Use the google-search capability, which runs on a licensed search API.",
  },
  // Removed from social-profile-check's PLATFORMS list under DEC-20260420-H:
  // these platforms forbid automated access including existence probes.
  {
    host: "facebook.com",
    site: "Facebook",
    decision: "DEC-20260420-H",
    alternatives: "Use the organisation's own website instead.",
  },
  {
    host: "instagram.com",
    site: "Instagram",
    decision: "DEC-20260420-H",
    alternatives: "Use the organisation's own website instead.",
  },
  {
    host: "twitter.com",
    site: "X (Twitter)",
    decision: "DEC-20260420-H",
    alternatives: "Use the organisation's own website instead.",
  },
  {
    host: "x.com",
    site: "X (Twitter)",
    decision: "DEC-20260420-H",
    alternatives: "Use the organisation's own website instead.",
  },
];

/**
 * Stable substring of every message {@link assertTargetAllowed} throws.
 *
 * `lib/circuit-breaker.ts` matches on this so a policy refusal does not count
 * as a capability failure — the executor worked correctly and declined a
 * target it must decline. Without it, a burst of Trustpilot calls would trip
 * the breaker and take the capability down for everyone.
 */
export const TOS_REFUSAL_MARKER = "Terms of Service prohibit automated access";

/** Normalize a possibly scheme-less input the way the executors do. */
function toUrl(rawUrl: string): URL | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    // Scheme match MUST be case-insensitive: `new URL()` and fetch()
    // normalize "HTTPS://" but a case-sensitive startsWith("http") would
    // prepend a second scheme, making the hostname parse as "https" and the
    // gate pass a prohibited host (P2 review H-1 — this one-character-class
    // defect bypassed every enforcement point).
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
}

/**
 * The prohibited-target rule matching this URL, or null if the target is
 * allowed. An unparseable URL returns null — malformed input is the caller's
 * own validation problem, not a policy hit.
 */
export function findProhibitedTarget(rawUrl: string): ProhibitedTarget | null {
  const parsed = toUrl(rawUrl);
  if (!parsed) return null;

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");

  for (const rule of PROHIBITED_TARGETS) {
    const hostMatches = rule.hostRe
      ? rule.hostRe.test(hostname)
      : hostname === rule.host || hostname.endsWith(`.${rule.host}`);
    if (!hostMatches) continue;
    if (rule.pathPrefix && !parsed.pathname.startsWith(rule.pathPrefix)) continue;
    return rule;
  }
  return null;
}

/**
 * Throw if the URL targets a site whose ToS forbids automated access.
 *
 * Call this BEFORE any network work so a prohibited target costs no
 * Browserless render, no LLM tokens, and no wall-clock — and so the caller
 * gets a straight answer instead of the target's 403 dressed up as our error.
 */
export function assertTargetAllowed(rawUrl: string): void {
  const rule = findProhibitedTarget(rawUrl);
  if (!rule) return;

  throw new Error(
    `${rule.site} is not a supported source: its ${TOS_REFUSAL_MARKER}, so Strale does not fetch it. ` +
      `This is a policy limit rather than a transient error — retrying the same URL will not succeed. ` +
      rule.alternatives,
  );
}
