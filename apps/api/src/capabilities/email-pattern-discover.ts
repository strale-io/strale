import { STRALE_USER_AGENT, SiteAccessRefusedError, SourceBlockedError, isBlockStatus } from "../lib/site-access.js";
import { assertRobotsAllowed } from "../lib/robots-txt.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import dns from "node:dns/promises";
import { dnsOrEmpty } from "../lib/upstream-result.js";
import { discardBody, safeFetch } from "../lib/safe-fetch.js";
import { ResourceLimitError, readPageHtml } from "../lib/resource-limits.js";

/**
 * Email Pattern Discovery — detect email format for a domain.
 *
 * Checks MX records to verify the domain handles email, then tests
 * common email patterns against the domain. Returns the likely email
 * format pattern used by the company.
 *
 * No external API needed — DNS lookups + SMTP pattern analysis.
 * Zero external cost.
 */

const COMMON_PREFIXES = [
  "info", "hello", "contact", "sales", "support", "admin",
  "hr", "jobs", "press", "media", "marketing",
];

const PATTERN_TEMPLATES = [
  { pattern: "{first}.{last}", example: "john.doe@" },
  { pattern: "{first}{last}", example: "johndoe@" },
  { pattern: "{f}{last}", example: "jdoe@" },
  { pattern: "{first}_{last}", example: "john_doe@" },
  { pattern: "{first}", example: "john@" },
  { pattern: "{last}.{first}", example: "doe.john@" },
  { pattern: "{f}.{last}", example: "j.doe@" },
];

registerCapability("email-pattern-discover", async (input: CapabilityInput) => {
  const domain = (input.domain as string)?.trim() ?? "";
  const url = (input.url as string)?.trim() ?? "";
  const task = (input.task as string)?.trim() ?? "";

  // Extract domain from URL if needed
  let targetDomain = domain;
  if (!targetDomain && url) {
    try {
      targetDomain = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    } catch {
      targetDomain = url;
    }
  }
  if (!targetDomain && task) {
    // Try to extract domain from task text
    const domainMatch = task.match(/[\w.-]+\.[a-z]{2,}/i);
    if (domainMatch) targetDomain = domainMatch[0];
  }

  if (!targetDomain || targetDomain.length < 3) {
    throw new Error("Provide 'domain' (e.g. stripe.com) or 'url' (e.g. https://stripe.com) to discover email patterns.");
  }

  // Remove www prefix
  targetDomain = targetDomain.replace(/^www\./, "");

  // Step 1: Check MX records. No MX record reads as "does not accept email";
  // a resolver that could not answer throws instead (unbilled, retried).
  let emailProvider: string | null = null;
  const mxRecords: string[] = (await dnsOrEmpty(() => dns.resolveMx(targetDomain), "DNS MX query"))
    .sort((a, b) => a.priority - b.priority)
    .map(r => r.exchange);

  // Detect email provider from MX
  const mxJoined = mxRecords.join(" ").toLowerCase();
  if (mxJoined.includes("google") || mxJoined.includes("gmail")) {
    emailProvider = "Google Workspace";
  } else if (mxJoined.includes("outlook") || mxJoined.includes("microsoft")) {
    emailProvider = "Microsoft 365";
  } else if (mxJoined.includes("protonmail") || mxJoined.includes("proton")) {
    emailProvider = "ProtonMail";
  } else if (mxJoined.includes("zoho")) {
    emailProvider = "Zoho Mail";
  } else if (mxJoined.includes("mimecast")) {
    emailProvider = "Mimecast";
  } else if (mxJoined.includes("barracuda")) {
    emailProvider = "Barracuda";
  } else if (mxJoined.includes("pphosted") || mxJoined.includes("proofpoint")) {
    emailProvider = "Proofpoint";
  }

  if (mxRecords.length === 0) {
    return {
      output: {
        domain: targetDomain,
        accepts_email: false,
        mx_records: [],
        email_provider: null,
        patterns: [],
        common_pattern_addresses: [],
        recommendation: `${targetDomain} does not have MX records configured. This domain may not accept email.`,
      },
      provenance: {
        source: "email-pattern-discover:dns",
        fetched_at: new Date().toISOString(),
      },
    };
  }

  // Step 2: Construct candidate generic addresses from common prefixes.
  // These are heuristic prefix matches, NOT verified deliverable addresses
  // (DEC-20260428-B). The previous `likely_exists` filter was a hardcoded
  // prefix-membership check masquerading as deliverability evidence; it has
  // been dropped. Use email-validate downstream for actual verification.
  const commonPatternAddresses: string[] = COMMON_PREFIXES.slice(0, 6).map(
    (prefix) => `${prefix}@${targetDomain}`,
  );

  // Step 3: Determine likely email patterns based on provider and domain analysis
  // Google Workspace and Microsoft 365 commonly use first.last@ or firstlast@
  const patterns = PATTERN_TEMPLATES.map(t => ({
    pattern: t.pattern,
    example: `${t.example}${targetDomain}`,
    likelihood: t.pattern === "{first}.{last}" ? "most_common"
      : t.pattern === "{f}{last}" || t.pattern === "{first}{last}" ? "common"
      : "possible" as string,
  }));

  // Step 4: Check website for publicly listed emails.
  //
  // This leg is best-effort: a homepage that cannot be read never fails the
  // call. Before promise-audit T1 follow-up 45 every failure was swallowed
  // silently, so `public_emails_found: []` looked the same whether the page
  // was read and had no addresses or was never read at all. The outcome is
  // now reported in `website_checked` and, when false, `website_note`.
  let publicEmails: string[] = [];
  let websiteChecked = false;
  let websiteNote: string | null = null;
  try {
    // DEC-20261023-A: robots.txt first; a disallow skips this best-effort
    // step (the catch below), as any failed fetch does.
    await assertRobotsAllowed(`https://${targetDomain}`);
    // F-0-006: user-supplied domain → safeFetch guards SSRF.
    const resp = await safeFetch(`https://${targetDomain}`, {
      // DEC-20261023-A: honest identification (was a spoofed browser UA).
      headers: { "User-Agent": STRALE_USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });
    if (resp.ok) {
      const html = await readPageHtml(resp);
      // Find email addresses in HTML (first 200KB)
      const emailRe = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const htmlSlice = html.slice(0, 200000);
      const found = htmlSlice.match(emailRe) || [];
      // Filter to same domain and deduplicate
      const domainEmails = found.filter(e => e.endsWith(`@${targetDomain}`));
      publicEmails = Array.from(new Set(domainEmails)).slice(0, 10);
      websiteChecked = true;
    } else {
      // Body unread on the non-2xx path (#434) — cancel it.
      await discardBody(resp, "email-pattern-discover: non-2xx");
      websiteNote = isBlockStatus(resp.status)
        ? `The homepage refused automated access (HTTP ${resp.status}), so it was not searched for published addresses.`
        : `The homepage answered HTTP ${resp.status}, so it was not searched for published addresses.`;
    }
  } catch (err) {
    // degraded-ok: the homepage is an optional enrichment; any failure (a size refusal included, #432) is reported in website_checked:false with a website_note reason, and the call answers on its DNS result.
    websiteNote = describeWebsiteFailure(err);
  }

  // Infer pattern from public emails if found
  let inferredPattern: string | null = null;
  if (publicEmails.length > 0) {
    const localParts = publicEmails.map(e => e.split("@")[0]);
    if (localParts.some(l => l.includes("."))) {
      inferredPattern = "Likely {first}.{last} (dots found in public emails)";
    } else if (localParts.some(l => l.includes("_"))) {
      inferredPattern = "Likely {first}_{last} (underscores found in public emails)";
    }
  }

  return {
    output: {
      domain: targetDomain,
      accepts_email: true,
      email_provider: emailProvider,
      mx_records: mxRecords.slice(0, 5),
      inferred_pattern: inferredPattern,
      patterns,
      public_emails_found: publicEmails,
      website_checked: websiteChecked,
      website_note: websiteNote,
      common_pattern_addresses: commonPatternAddresses,
      recommendation: emailProvider
        ? `${targetDomain} uses ${emailProvider}. Most common pattern is first.last@${targetDomain}. Verify individual addresses with email-validate before sending.`
        : `${targetDomain} accepts email. Try first.last@${targetDomain} as the most common pattern. Verify with email-validate before sending.`,
    },
    provenance: {
      source: "email-pattern-discover:dns+http",
      fetched_at: new Date().toISOString(),
    },
  };
});

/** Why the homepage leg read nothing, in words the caller can act on. */
function describeWebsiteFailure(err: unknown): string {
  if (err instanceof SiteAccessRefusedError || err instanceof SourceBlockedError) {
    switch (err.block.kind) {
      case "robots_disallow":
        return "The site's robots.txt does not allow the homepage to be read, so it was not searched for published addresses.";
      case "robots_unavailable":
        return "The site's robots.txt could not be read, so the homepage was not fetched or searched for published addresses.";
      default:
        return "The homepage refused automated access, so it was not searched for published addresses.";
    }
  }
  if (err instanceof ResourceLimitError) {
    return "The homepage was too large to read, so it was not searched for published addresses.";
  }
  return "The homepage could not be reached, so it was not searched for published addresses.";
}
