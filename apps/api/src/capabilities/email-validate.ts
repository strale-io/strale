import { registerCapability, type CapabilityInput } from "./index.js";
import { resolveMx } from "node:dns/promises";

// Comprehensive email regex (RFC 5322 simplified)
// Exported so email-validate-bulk can pre-extract domains for MX caching
// using the exact same format rule — no forked/duplicated validation logic.
export const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

import { DISPOSABLE_DOMAINS } from "../lib/disposable-domains.js";

// Common role-based prefixes
// Exported for reuse by domain-contact-extract.ts, which classifies
// organisation-published addresses against this same list rather than
// maintaining a second copy.
export const ROLE_PREFIXES = new Set([
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

export async function checkMx(domain: string): Promise<{ has_mx: boolean; mx_records: string[] }> {
  try {
    const records = await resolveMx(domain);
    const exchanges = records
      .sort((a, b) => a.priority - b.priority)
      .map((r) => r.exchange);
    return { has_mx: exchanges.length > 0, mx_records: exchanges.slice(0, 5) };
  } catch {
    return { has_mx: false, mx_records: [] };
  }
}

const FREE_PROVIDERS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
  "icloud.com", "mail.com", "protonmail.com", "proton.me", "zoho.com",
]);

export interface EmailValidationResult {
  valid: boolean;
  email: string;
  format_valid: boolean;
  reason?: string;
  domain?: string;
  has_mx_records?: boolean;
  mx_records?: string[];
  is_disposable?: boolean;
  is_role_address?: boolean;
  is_free_provider?: boolean;
  did_you_mean?: string;
}

/**
 * Shared single-email validation logic. Used directly by email-validate and
 * per-address by email-validate-bulk. Callers own MX-result caching if they
 * want to dedupe DNS lookups across a batch that shares domains — this
 * function always performs (or awaits) the MX lookup itself unless a
 * pre-fetched `mxOverride` is supplied.
 */
export async function validateOneEmail(
  rawEmail: string,
  mxOverride?: { has_mx: boolean; mx_records: string[] },
): Promise<EmailValidationResult> {
  const email = rawEmail.trim().toLowerCase();

  // Format check
  const formatValid = EMAIL_RE.test(email) && email.length <= 254;

  if (!formatValid) {
    return {
      valid: false,
      email,
      format_valid: false,
      reason: "Invalid email format.",
    };
  }

  const [localPart, domain] = email.split("@");

  // Check disposable
  const isDisposable = DISPOSABLE_DOMAINS.has(domain);

  // Check role-based
  const isRole = ROLE_PREFIXES.has(localPart.split("+")[0]);

  // Check free provider
  const isFree = FREE_PROVIDERS.has(domain);

  // MX record check (or reuse a caller-supplied result for the domain)
  const mx = mxOverride ?? (await checkMx(domain));

  // Typo suggestion for common provider misspellings
  const suggestion = !mx.has_mx ? suggestDomain(domain) : null;

  return {
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
  };
}

registerCapability("email-validate", async (input: CapabilityInput) => {
  const raw = (input.email as string) ?? (input.email_address as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'email' is required. Provide an email address to validate.");
  }

  const result = await validateOneEmail(raw);

  return {
    output: result as unknown as Record<string, unknown>,
    provenance: {
      source: result.format_valid ? "algorithmic+dns" : "algorithmic",
      fetched_at: new Date().toISOString(),
    },
  };
});
