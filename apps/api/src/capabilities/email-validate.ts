import { registerCapability, type CapabilityInput } from "./index.js";
import { promisify } from "node:util";
import { resolve as dnsResolve } from "node:dns";

const resolveMx = promisify(dnsResolve).bind(null) as unknown as (
  hostname: string,
  rrtype: "MX",
) => Promise<Array<{ exchange: string; priority: number }>>;

// Comprehensive email regex (RFC 5322 simplified)
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// Common disposable email domains
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.de", "grr.la",
  "guerrillamail.net", "guerrillamail.org", "sharklasers.com", "guerrilla.ml",
  "tempmail.com", "throwaway.email", "temp-mail.org", "yopmail.com",
  "yopmail.fr", "cool.fr.nf", "jetable.fr.nf", "nospam.ze.tc",
  "trashmail.com", "trashmail.me", "trashmail.net", "maildrop.cc",
  "dispostable.com", "mailnesia.com", "mintemail.com", "tempail.com",
  "tempr.email", "10minutemail.com", "mohmal.com", "burnermail.io",
  "guerrillamailblock.com",
]);

// Common role-based prefixes
const ROLE_PREFIXES = new Set([
  "admin", "administrator", "hostmaster", "info", "noc", "noreply",
  "no-reply", "postmaster", "support", "webmaster", "abuse", "sales",
  "contact", "help", "office", "billing", "security", "feedback",
]);

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
  // Guard: if the value looks like a capability slug, the caller likely
  // sent input in the wrong field (e.g. "input" instead of "inputs")
  if (raw.includes("-") && !raw.includes("@")) {
    throw new Error(
      `'email' value '${raw}' does not look like an email address. ` +
      `Check that you are sending { "inputs": { "email": "..." } } not { "input": { "email": "..." } }.`,
    );
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
    },
    provenance: {
      source: "algorithmic+dns",
      fetched_at: new Date().toISOString(),
    },
  };
});
