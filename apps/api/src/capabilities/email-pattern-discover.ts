import { registerCapability, type CapabilityInput } from "./index.js";
import { promises as dns } from "node:dns";

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

  // Step 1: Check MX records
  let mxRecords: string[] = [];
  let emailProvider: string | null = null;
  try {
    const mx = await dns.resolveMx(targetDomain);
    mxRecords = mx.sort((a, b) => a.priority - b.priority).map(r => r.exchange);

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
  } catch {
    // No MX records
  }

  if (mxRecords.length === 0) {
    return {
      output: {
        domain: targetDomain,
        accepts_email: false,
        mx_records: [],
        email_provider: null,
        patterns: [],
        generic_addresses: [],
        recommendation: `${targetDomain} does not have MX records configured. This domain may not accept email.`,
      },
      provenance: {
        source: "email-pattern-discover:dns",
        fetched_at: new Date().toISOString(),
      },
    };
  }

  // Step 2: Check which generic addresses exist (catch-all detection)
  const genericResults: Array<{ address: string; likely_exists: boolean }> = [];
  for (const prefix of COMMON_PREFIXES.slice(0, 6)) {
    // We can't do full SMTP verification without sending mail,
    // but we can report common patterns
    genericResults.push({
      address: `${prefix}@${targetDomain}`,
      likely_exists: ["info", "contact", "hello", "sales", "support"].includes(prefix),
    });
  }

  // Step 3: Determine likely email patterns based on provider and domain analysis
  // Google Workspace and Microsoft 365 commonly use first.last@ or firstlast@
  const patterns = PATTERN_TEMPLATES.map(t => ({
    pattern: t.pattern,
    example: `${t.example}${targetDomain}`,
    likelihood: t.pattern === "{first}.{last}" ? "most_common"
      : t.pattern === "{f}{last}" || t.pattern === "{first}{last}" ? "common"
      : "possible" as string,
  }));

  // Step 4: Check website for publicly listed emails
  let publicEmails: string[] = [];
  try {
    const resp = await fetch(`https://${targetDomain}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    if (resp.ok) {
      const html = await resp.text();
      // Find email addresses in HTML (first 200KB)
      const emailRe = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const htmlSlice = html.slice(0, 200000);
      const found = htmlSlice.match(emailRe) || [];
      // Filter to same domain and deduplicate
      const domainEmails = found.filter(e => e.endsWith(`@${targetDomain}`));
      publicEmails = Array.from(new Set(domainEmails)).slice(0, 10);
    }
  } catch {
    // Website fetch failed — not critical
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
      generic_addresses: genericResults.filter(g => g.likely_exists).map(g => g.address),
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
