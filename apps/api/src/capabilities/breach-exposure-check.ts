import { registerCapability, type CapabilityInput } from "./index.js";
import { readJsonWithLimit } from "../lib/resource-limits.js";

// Have I Been Pwned — the keyless `/breaches` endpoint, which describes
// breaches by the domain the *breached service* ran on. It takes no personal
// data and needs no subscription.
//
// Deliberately NOT covered here: the per-account endpoint
// (/breachedaccount/{email}) and the Pwned Passwords range API. The account
// endpoint needs a paid key, and both take a secret or a personal identifier
// as input — which `transactions.input` persists verbatim for 90 days, with
// no write-time redaction anywhere in the platform. Neither belongs on this
// rail until that mechanism exists.
// Verified live 2026-09-05 (adobe.com -> 1 breach, 152,445,165 accounts;
// linkedin.com -> 3; a clean domain and an unregistered one both -> []).
const API = "https://haveibeenpwned.com/api/v3/breaches";
const USER_AGENT = "Strale/1.0 (support@strale.io)";

// F-0-006 Bucket D: the caller's domain is embedded in the query string of a
// hardcoded third-party API (haveibeenpwned.com). The connection target is
// never user-controlled, and normalizeDomain rejects anything that is not a
// bare hostname before the request is built — no SSRF surface, so validateUrl
// is not required.

interface Breach {
  Name?: string;
  Title?: string;
  Domain?: string;
  BreachDate?: string;
  AddedDate?: string;
  ModifiedDate?: string;
  PwnCount?: number;
  Description?: string;
  DataClasses?: string[];
  DisclosureUrl?: string;
  IsVerified?: boolean;
  IsFabricated?: boolean;
  IsSensitive?: boolean;
  IsRetired?: boolean;
  IsSpamList?: boolean;
  IsMalware?: boolean;
  IsStealerLog?: boolean;
}

const DOMAIN_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;

/** Accept a bare hostname, or pull one out of a URL or an email address. */
export function normalizeDomain(raw: string): string | null {
  let v = raw.trim().toLowerCase();
  if (v.length === 0) return null;
  if (v.includes("://")) {
    try { v = new URL(v).hostname; } catch { return null; }
  } else if (v.includes("@")) {
    v = v.slice(v.lastIndexOf("@") + 1);
  }
  v = v.replace(/^www\./, "").replace(/\.$/, "").replace(/:\d+$/, "");
  return DOMAIN_RE.test(v) ? v : null;
}

/** HIBP descriptions are HTML fragments with anchors; flatten to plain text. */
export function stripHtml(html?: string): string | null {
  if (!html) return null;
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 0 ? text : null;
}

// Data classes that mean an authentication secret was in the dump. These
// drive `credential_breach_count`, the field a risk workflow actually keys on.
const CREDENTIAL_CLASSES = new Set([
  "passwords",
  "password hints",
  "security questions and answers",
  "auth tokens",
  "partial credit card data",
  "credit cards",
  "bank account numbers",
]);

/** True when a breach exposed something usable to authenticate or defraud. */
export function exposedCredentials(dataClasses: string[]): boolean {
  return dataClasses.some((c) => CREDENTIAL_CLASSES.has(c.trim().toLowerCase()));
}

registerCapability("breach-exposure-check", async (input: CapabilityInput) => {
  // Guard the two shapes a caller may reach for by analogy with other breach
  // tools, so the refusal explains itself rather than returning an empty list.
  for (const field of ["email", "password", "account"]) {
    if (input[field] !== undefined && input[field] !== null && input[field] !== "") {
      throw new Error(
        `'${field}' must be omitted — this capability reports breaches of a company's own domain and takes no personal data or secrets. Pass 'domain' instead.`,
      );
    }
  }

  const raw = typeof input.domain === "string" ? input.domain : "";
  const domain = normalizeDomain(raw);
  if (!domain) {
    throw new Error("'domain' is required and must be a hostname such as adobe.com (a URL is also accepted).");
  }

  // The caller's domain is regex-validated by normalizeDomain and reaches only
  // an encoded query parameter, never the host.
  // unguarded-fetch-ok: fixed haveibeenpwned.com host
  const res = await fetch(`${API}?Domain=${encodeURIComponent(domain)}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 429) {
    throw new Error("Have I Been Pwned is rate-limiting requests right now. Retry shortly.");
  }
  if (!res.ok) throw new Error(`Have I Been Pwned returned HTTP ${res.status}.`);

  const rows = await readJsonWithLimit<Breach[]>(res);
  if (!Array.isArray(rows)) {
    throw new Error("Have I Been Pwned returned an unexpected response shape.");
  }

  const breaches = rows.map((b) => {
    const dataClasses = Array.isArray(b.DataClasses) ? b.DataClasses : [];
    return {
      name: b.Name ?? null,
      title: b.Title ?? null,
      domain: b.Domain || null,
      breach_date: b.BreachDate ?? null,
      added_date: b.AddedDate ?? null,
      accounts_exposed: typeof b.PwnCount === "number" ? b.PwnCount : null,
      data_classes: dataClasses,
      exposed_credentials: exposedCredentials(dataClasses),
      description: stripHtml(b.Description),
      disclosure_url: b.DisclosureUrl ?? null,
      // HIBP's own qualifiers. `is_verified: false` means HIBP could not
      // confirm the dump's provenance, so the row is weaker evidence.
      is_verified: b.IsVerified === true,
      is_fabricated: b.IsFabricated === true,
      is_sensitive: b.IsSensitive === true,
      is_retired: b.IsRetired === true,
      is_spam_list: b.IsSpamList === true,
      is_malware: b.IsMalware === true,
      is_stealer_log: b.IsStealerLog === true,
    };
  });

  breaches.sort((a, b) => String(b.breach_date ?? "").localeCompare(String(a.breach_date ?? "")));

  const totalExposed = breaches.reduce((sum, b) => sum + (b.accounts_exposed ?? 0), 0);
  const credentialBreaches = breaches.filter((b) => b.exposed_credentials);

  return {
    output: {
      domain,
      breached: breaches.length > 0,
      breach_count: breaches.length,
      credential_breach_count: credentialBreaches.length,
      // Sum across breaches, so an account breached twice is counted twice.
      total_accounts_exposed: totalExposed,
      most_recent_breach_date: breaches[0]?.breach_date ?? null,
      breaches,
    },
    provenance: {
      source: "Have I Been Pwned breach database (keyless /breaches endpoint)",
      fetched_at: new Date().toISOString(),
    },
  };
});
