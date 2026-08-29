import { registerCapability, type CapabilityInput } from "./index.js";
import { safeFetch } from "../lib/safe-fetch.js";
import { MAX_SCRAPED_CONTACT_BYTES, readTextTruncated } from "../lib/resource-limits.js";
import { assertTargetAllowed } from "./lib/tos-blocklist.js";
import { ROLE_PREFIXES } from "./email-validate.js";

/**
 * Domain Contact Extract — organisation-level public contact channels.
 *
 * Given a company domain, fetches that company's own public homepage
 * (and, if found, ONE linked contact page — 2 HTTP requests max, no
 * crawling) and extracts generic/role email addresses, phone numbers,
 * a postal address if detectable, the contact-page URL, and social
 * profile links.
 *
 * SCOPE BOUNDARY (do not weaken without a Decision — see the closely
 * related, currently-suspended email-pattern-discover precedent):
 *   - Input is a domain, never a person's name.
 *   - No candidate personal email addresses are generated, guessed, or
 *     permuted. Only addresses literally present in the fetched HTML
 *     are ever returned.
 *   - No employee enumeration is attempted.
 *   - Personal-looking addresses (firstname.lastname@) that the company
 *     itself published are reported ONLY in `published_personal_addresses`,
 *     never ranked, expanded, or used to infer a pattern.
 *
 * Zero external API cost — plain HTTP fetch + regex/JSON-LD parsing, no
 * vendor, no LLM. Every fetch goes through `safeFetch` (F-0-006 SSRF guard)
 * since `domain` is user-supplied.
 */

const USER_AGENT =
  "StraleBot/1.0 (+https://strale.dev/capabilities/domain-contact-extract; organisation contact lookup)";
const FETCH_TIMEOUT_MS = 10_000;

// ReDoS-safe. The previous form was
//   /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
// whose domain class `[a-zA-Z0-9.-]+` CONTAINS the `.` that the following
// `\.` also has to match. That overlap makes the match ambiguous, so on a
// long dot-free run the engine gives back one character at a time hunting
// for a dot — and the /g scan restarts that walk at every offset in the
// local-part. Cost is quadratic in body length: measured 28ms at 2KB,
// 479ms at 8KB, 1.9s at 16KB, 7.9s at 32KB — and this capability parses up
// to ~600KB (homepage + contact page, each capped at MAX_SCRAPED_CONTACT_BYTES).
//
// That is a remote DoS, not a slow path: the regex is synchronous, Node is
// single-threaded, and the executeWithHardTimeout guard in routes/do.ts is a
// Promise.race + setTimeout whose timer cannot fire while the event loop is
// blocked. A 5-cent x402 call against an attacker-controlled homepage of
// "a"*150000 + "@" + "b"*150000 would stall every other in-flight request,
// the health endpoint, and the scheduler.
//
// The fix removes the ambiguity: labels exclude `.`, so each `\.` is
// unambiguous and there is nothing to backtrack over. Same matches on real
// content (verified), 14ms at 32KB. Bounds follow RFC 5321 (64-char local
// part, 63-char labels).
export const EMAIL_RE = /[a-zA-Z0-9._%+-]{1,64}@(?:[a-zA-Z0-9-]{1,63}\.){1,8}[a-zA-Z]{2,24}/g;
const CONTACT_LINK_RE = /contact-us|get-in-touch|contact|kontakt/i;
// firstname.lastname / firstname_lastname / firstname-lastname style local part.
const PERSONAL_NAME_LOCAL_PART_RE = /^[a-z]{2,}[._-][a-z]{2,}$/i;

const SOCIAL_PATTERNS: Record<string, RegExp> = {
  linkedin: /https?:\/\/(?:www\.)?linkedin\.com\/[^\s"'<>)]+/i,
  twitter: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^\s"'<>)]+/i,
  facebook: /https?:\/\/(?:www\.)?facebook\.com\/[^\s"'<>)]+/i,
  instagram: /https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>)]+/i,
  youtube: /https?:\/\/(?:www\.)?youtube\.com\/[^\s"'<>)]+/i,
};

/**
 * Decode JSON `\uXXXX` escape sequences into the characters they represent.
 *
 * Modern sites embed markup inside JSON payloads (Next.js flight data, inlined
 * state, script-tag JSON). In that form a `>` is not a `>` — it is the six
 * literal characters backslash, u, 0, 0, 3, e. That escaped text sits in the
 * HTML we parse, and none of our extractors understand it.
 *
 * The concrete failure: a production call for stripe.com returned
 * `role_emails: ["u003esales@stripe.com"]`. The page contained the escaped
 * form immediately before the address. EMAIL_RE's local-part class accepts
 * letters and digits but not backslashes, so the match began at the `u` of the
 * escape and swallowed `u003e` into the local part.
 *
 * This is region-dependent and was invisible locally: Railway (US East) is
 * served the escaped variant, while the same URL fetched from Sweden returns a
 * literal `>`. Decoding here — once, at the single point where fetched bytes
 * enter the capability — means every downstream extractor sees the same text
 * the browser would, regardless of which variant the origin served.
 *
 * Linear, no backtracking. Surrogate pairs decode correctly because each half
 * is converted independently and concatenated.
 */
export function decodeJsonUnicodeEscapes(s: string): string {
  if (!s.includes("\\u")) return s;
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (whole, hex: string) => {
    const code = parseInt(hex, 16);
    // Leave C0 controls encoded — decoding them would inject raw control
    // characters into text we hand back to callers, and nothing we extract
    // needs them.
    return code < 0x20 ? whole : String.fromCharCode(code);
  });
}

/**
 * Phone-number extraction from AUTHORITATIVE MARKUP ONLY.
 *
 * Two sources, both of which are the page author explicitly declaring "this
 * string is a phone number": `tel:` links, and schema.org `telephone` in
 * JSON-LD or microdata. There is no free-text fallback — see the long note
 * inside the function for why one cannot work here.
 */
export function extractPhones(html: string): string[] {
  const results: string[] = [];
  const seen = new Set<string>();

  for (const m of html.matchAll(/href=["']tel:([^"']+)["']/gi)) {
    const num = decodeURIComponent(m[1]).trim();
    const digits = num.replace(/[^\d]/g, "");
    if (digits.length < 7 || digits.length > 15) continue;
    if (seen.has(num)) continue;
    seen.add(num);
    results.push(num);
  }
  // Second authoritative source: schema.org `telephone`, in JSON-LD or
  // microdata. Like a tel: link, this is the site author explicitly declaring
  // "this string is a phone number" — not us inferring it from shape.
  for (const num of extractSchemaTelephones(html)) {
    const digits = num.replace(/[^\d]/g, "");
    if (digits.length < 7 || digits.length > 15) continue;
    if (seen.has(num)) continue;
    seen.add(num);
    results.push(num);
  }

  // DELIBERATELY NO FREE-TEXT FALLBACK.
  //
  // There used to be one: it scanned visible text for digit runs that looked
  // phone-shaped (7-15 digits, plus a leading "+" or >=2 separators). It was
  // tightened twice during onboarding — first to exclude "." so decimals and
  // version strings stopped matching, then to require real separator
  // structure — and it still shipped false positives to production on its
  // first real call. Against stripe.com it returned "72-9098-2766" and
  // "24155-3298-4"; neither digit sequence appears anywhere on the page.
  //
  // The mechanism: under our bot User-Agent the site serves different markup
  // than a browser, the read truncates at MAX_SCRAPED_CONTACT_BYTES mid-document,
  // and the heuristic reads the resulting fragment as numbers. No amount of
  // additional shape-tightening fixes that, because the input itself is
  // garbage — the heuristic is being asked to distinguish a phone number from
  // arbitrary truncated markup using only digit grouping, which is not
  // decidable.
  //
  // Returning invented contact details is strictly worse than returning none:
  // an empty `phones` array is honest and the caller can act on it, whereas a
  // plausible-looking wrong number is acted on and fails silently. On a
  // platform selling verified data, that trade is not close. If a site
  // publishes a phone number without tel: markup or schema.org, we report
  // nothing and say so in the manifest limitations.
  return results.slice(0, 10);
}

/**
 * Pull `telephone` values out of schema.org markup — JSON-LD blocks first,
 * then microdata attributes. Mirrors extractPostalAddress's approach.
 */
function extractSchemaTelephones(html: string): string[] {
  const found: string[] = [];

  const jsonLdBlocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of jsonLdBlocks) {
    try {
      collectTelephoneNodes(JSON.parse(block[1]), found);
    } catch {
      // Malformed JSON-LD on the page — skip, not our job to fix their markup.
    }
  }

  for (const m of html.matchAll(/itemprop=["']telephone["'][^>]*>([^<]+)</gi)) {
    const v = m[1]?.trim();
    if (v) found.push(v);
  }
  // Also the attribute form: <meta itemprop="telephone" content="...">
  for (const m of html.matchAll(
    /itemprop=["']telephone["'][^>]*content=["']([^"']+)["']/gi,
  )) {
    const v = m[1]?.trim();
    if (v) found.push(v);
  }

  return found;
}

/** Recursively collect schema.org `telephone` string values. */
function collectTelephoneNodes(node: unknown, out: string[], depth = 0): void {
  if (depth > 4 || node == null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectTelephoneNodes(item, out, depth + 1);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (typeof obj.telephone === "string" && obj.telephone.trim()) {
    out.push(obj.telephone.trim());
  }
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === "object") collectTelephoneNodes(val, out, depth + 1);
  }
}

/** Recursively search parsed JSON-LD for a schema.org PostalAddress node. */
function findPostalAddressNode(node: unknown, depth = 0): string | null {
  if (depth > 4 || node == null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findPostalAddressNode(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  const isPostalAddress =
    obj["@type"] === "PostalAddress" || (typeof obj.streetAddress === "string" && typeof obj.addressLocality === "string");
  if (isPostalAddress) {
    const parts = [obj.streetAddress, obj.addressLocality, obj.postalCode, obj.addressCountry].filter(
      (v): v is string => typeof v === "string" && v.trim().length > 0,
    );
    if (parts.length > 0) return parts.join(", ");
  }
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === "object") {
      const found = findPostalAddressNode(val, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** Best-effort postal address: JSON-LD PostalAddress first, then schema.org itemprop microdata. */
function extractPostalAddress(html: string): string | null {
  const jsonLdBlocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of jsonLdBlocks) {
    try {
      const parsed = JSON.parse(block[1]);
      const found = findPostalAddressNode(parsed);
      if (found) return found;
    } catch {
      // Malformed JSON-LD on the page — skip, not our job to fix their markup.
    }
  }

  const street = html.match(/itemprop=["']streetAddress["'][^>]*>([^<]+)</i)?.[1]?.trim();
  const locality = html.match(/itemprop=["']addressLocality["'][^>]*>([^<]+)</i)?.[1]?.trim();
  const postal = html.match(/itemprop=["']postalCode["'][^>]*>([^<]+)</i)?.[1]?.trim();
  const country = html.match(/itemprop=["']addressCountry["'][^>]*>([^<]+)</i)?.[1]?.trim();
  const microdataParts = [street, locality, postal, country].filter((v): v is string => !!v && v.length > 0);
  if (microdataParts.length > 0) return microdataParts.join(", ");

  return null;
}

registerCapability("domain-contact-extract", async (input: CapabilityInput) => {
  const raw =
    (input.domain as string) ??
    (input.url as string) ??
    (input.website as string) ??
    (input.site as string) ??
    "";
  const trimmed = typeof raw === "string" ? raw.trim() : "";

  if (!trimmed || trimmed.length < 3) {
    throw new Error(
      "'domain' is required (e.g. stripe.com). domain-contact-extract accepts a company domain only — " +
        "not a person's name; it returns organisation-level contact channels, not personnel data.",
    );
  }

  let hostname: string;
  try {
    hostname = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    hostname = trimmed;
  }
  hostname = hostname.replace(/^www\./i, "").toLowerCase();

  if (hostname.length < 3 || !hostname.includes(".")) {
    throw new Error(`'${trimmed}' does not look like a valid domain (e.g. stripe.com).`);
  }

  const fetchedUrls: string[] = [];
  const homepageUrl = `https://${hostname}/`;
  let homepageHtml = "";

  // DEC-20260427-H / commit 87b84db: refuse ToS-prohibited targets BEFORE
  // fetching. That commit closed the "front door" on capabilities with a
  // fixed target list and explicitly named the remaining gap — "a capability
  // that accepts an arbitrary URL reaches the same hosts, so that closed the
  // front door and left the side door open." This capability takes an
  // arbitrary caller-supplied domain and fetches it with a bot User-Agent, so
  // it is exactly that side door. Throwing here also carries the refusal
  // marker, which keeps circuit-breaker.ts from counting a policy refusal as
  // a capability fault.
  assertTargetAllowed(homepageUrl);

  try {
    // F-0-006: user-supplied domain → safeFetch guards SSRF (validates URL,
    // re-checks resolved IP at connect time, re-validates every redirect hop).
    const resp = await safeFetch(homepageUrl, {
      headers: { "User-Agent": USER_AGENT },
      timeoutMs: FETCH_TIMEOUT_MS,
    });
    if (!resp.ok) {
      throw new Error(`domain-contact-extract: ${hostname} returned HTTP ${resp.status}`);
    }
    // Decode at the boundary so every extractor below sees one canonical
    // form, whichever variant the origin served this region.
    homepageHtml = decodeJsonUnicodeEscapes(await readTextTruncated(resp, MAX_SCRAPED_CONTACT_BYTES));
    fetchedUrls.push(homepageUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not fetch ${hostname}: ${message}`);
  }

  // Locate at most one contact-page link and follow it (cap: 2 requests total).
  let contactPageUrl: string | null = null;
  let contactHtml = "";
  const linkMatches = homepageHtml.matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi);
  for (const m of linkMatches) {
    const href = m[1];
    const linkText = (m[2] ?? "").replace(/<[^>]+>/g, "");
    if (!CONTACT_LINK_RE.test(href) && !CONTACT_LINK_RE.test(linkText)) continue;
    try {
      const resolved = new URL(href, homepageUrl);
      if (resolved.hostname.replace(/^www\./i, "").toLowerCase() !== hostname) continue; // same-host only
      contactPageUrl = resolved.toString();
      break;
    } catch {
      // Malformed href — skip.
    }
  }

  if (contactPageUrl) {
    try {
      const resp = await safeFetch(contactPageUrl, {
        headers: { "User-Agent": USER_AGENT },
        timeoutMs: FETCH_TIMEOUT_MS,
      });
      if (resp.ok) {
        contactHtml = decodeJsonUnicodeEscapes(await readTextTruncated(resp, MAX_SCRAPED_CONTACT_BYTES));
        fetchedUrls.push(contactPageUrl);
      }
    } catch {
      // Contact-page fetch is best-effort; homepage data still returned.
    }
  }

  const combinedHtml = `${homepageHtml}\n${contactHtml}`;

  // ─── Emails: classify, never generate ─────────────────────────────────────
  const foundEmails = Array.from(
    new Set(
      (combinedHtml.match(EMAIL_RE) || [])
        .map((e) => e.toLowerCase())
        .filter((e) => e.split("@")[1] === hostname),
    ),
  );

  const roleEmails: string[] = [];
  const publishedPersonalAddresses: string[] = [];
  for (const email of foundEmails) {
    const localPart = email.split("@")[0];
    const basePrefix = localPart.split("+")[0];
    if (ROLE_PREFIXES.has(basePrefix)) {
      roleEmails.push(email);
    } else if (PERSONAL_NAME_LOCAL_PART_RE.test(localPart)) {
      // Published by the site owner, reported as-is. Never ranked, expanded,
      // or used to infer a pattern — see SCOPE BOUNDARY above.
      publishedPersonalAddresses.push(email);
    } else {
      // Not a recognised role prefix and not a name-shaped local part
      // (e.g. a department alias like "orders@" or "press-team@") — treat
      // as an organisational address rather than a personal one.
      roleEmails.push(email);
    }
  }

  const phones = extractPhones(combinedHtml);

  const socialLinks: Record<string, string> = {};
  for (const [platform, re] of Object.entries(SOCIAL_PATTERNS)) {
    const match = combinedHtml.match(re);
    if (match) socialLinks[platform] = match[0].replace(/["'<>)]+$/, "");
  }

  const postalAddress = extractPostalAddress(combinedHtml);

  return {
    output: {
      domain: hostname,
      fetched_urls: fetchedUrls,
      role_emails: roleEmails.slice(0, 20),
      published_personal_addresses: publishedPersonalAddresses.slice(0, 20),
      phones,
      social_links: socialLinks,
      contact_page_url: contactPageUrl,
      postal_address: postalAddress,
      has_contact_page: contactPageUrl !== null,
    },
    provenance: {
      source: "domain-contact-extract:http",
      fetched_at: new Date().toISOString(),
    },
  };
});
