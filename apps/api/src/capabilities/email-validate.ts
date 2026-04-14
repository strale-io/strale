import { registerCapability, type CapabilityInput } from "./index.js";
import { promisify } from "node:util";
import { resolve as dnsResolve } from "node:dns";

const resolveMx = promisify(dnsResolve).bind(null) as unknown as (
  hostname: string,
  rrtype: "MX",
) => Promise<Array<{ exchange: string; priority: number }>>;

// Comprehensive email regex (RFC 5322 simplified)
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

import { DISPOSABLE_DOMAINS } from "../lib/disposable-domains.js";

// Common role-based prefixes
const ROLE_PREFIXES = new Set([
  "admin", "administrator", "hostmaster", "info", "noc", "noreply",
  "no-reply", "postmaster", "support", "webmaster", "abuse", "sales",
  "contact", "help", "office", "billing", "security", "feedback",
  "marketing", "hr", "legal", "compliance", "operations", "team",
  "hello", "enquiries", "enquiry", "jobs", "careers", "press",
  "media", "newsletter", "alerts", "notifications", "system",
  "mailer-daemon", "root", "devops",
]);

// Common email providers for typo detection
const KNOWN_PROVIDERS = [
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
  "icloud.com", "mail.com", "protonmail.com", "proton.me", "zoho.com",
  "gmx.com", "gmx.de", "live.com", "msn.com", "yandex.com",
  "fastmail.com", "tutanota.com", "pm.me", "hey.com", "me.com",
  "mac.com", "comcast.net", "verizon.net", "att.net", "sbcglobal.net",
  "cox.net", "charter.net", "earthlink.net", "optonline.net",
  "yahoo.co.uk", "hotmail.co.uk", "outlook.co.uk",
];

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[m][n];
}

function suggestDomain(domain: string): string | null {
  if (KNOWN_PROVIDERS.includes(domain)) return null;
  let bestMatch: string | null = null;
  let bestDistance = Infinity;
  for (const provider of KNOWN_PROVIDERS) {
    const dist = levenshtein(domain, provider);
    if (dist > 0 && dist <= 2 && dist < bestDistance) {
      bestDistance = dist;
      bestMatch = provider;
    }
  }
  return bestMatch;
}

async function checkMx(domain: string): Promise<{ has_mx: boolean; mx_records: string[] }> {
  try {
    const { resolve: dnsResolveFn } = await import("node:dns");
    const { promisify: promisifyFn } = await import("node:util");
    const resolveMxFn = promisifyFn(dnsResolveFn.bind(null, domain, "MX") as any) as any;

    // Use dns.promises instead
    const dns = await import("node:dns/promises");
    const records = await dns.resolveMx(domain);
    const exchanges = records
      .sort((a, b) => a.priority - b.priority)
      .map((r) => r.exchange);
    return { has_mx: exchanges.length > 0, mx_records: exchanges.slice(0, 5) };
  } catch {
    return { has_mx: false, mx_records: [] };
  }
}

registerCapability("email-validate", async (input: CapabilityInput) => {
  const raw = (input.email as string) ?? (input.email_address as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'email' is required. Provide an email address to validate.");
  }

  const email = raw.trim().toLowerCase();

  // Format check
  const formatValid = EMAIL_RE.test(email) && email.length <= 254;

  if (!formatValid) {
    return {
      output: {
        valid: false,
        email,
        format_valid: false,
        reason: "Invalid email format.",
      },
      provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
    };
  }

  const [localPart, domain] = email.split("@");

  // Check disposable
  const isDisposable = DISPOSABLE_DOMAINS.has(domain);

  // Check role-based
  const isRole = ROLE_PREFIXES.has(localPart.split("+")[0]);

  // Check free provider
  const freeProviders = new Set(["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "mail.com", "protonmail.com", "proton.me", "zoho.com"]);
  const isFree = freeProviders.has(domain);

  // MX record check
  const mx = await checkMx(domain);

  // Typo suggestion for common provider misspellings
  const suggestion = !mx.has_mx ? suggestDomain(domain) : null;

  return {
    output: {
      valid: formatValid && mx.has_mx && !isDisposable,
      email,
      format_valid: formatValid,
      domain,
      has_mx_records: mx.has_mx,
      mx_records: mx.mx_records,
      is_disposable: isDisposable,
      is_role_address: isRole,
      is_free_provider: isFree,
      ...(suggestion ? { did_you_mean: `${localPart}@${suggestion}` } : {}),
    },
    provenance: {
      source: "algorithmic+dns",
      fetched_at: new Date().toISOString(),
    },
  };
});
