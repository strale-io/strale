import { registerCapability, type CapabilityInput } from "./index.js";
import { safeFetch } from "../lib/safe-fetch.js";
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
const MAX_BODY_BYTES = 300_000; // cap parsed HTML per request to 300KB

// ReDoS-safe. The previous form was
//   /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
// whose domain class `[a-zA-Z0-9.-]+` CONTAINS the `.` that the following
// `\.` also has to match. That overlap makes the match ambiguous, so on a
// long dot-free run the engine gives back one character at a time hunting
// for a dot — and the /g scan restarts that walk at every offset in the
// local-part. Cost is quadratic in body length: measured 28ms at 2KB,
// 479ms at 8KB, 1.9s at 16KB, 7.9s at 32KB — and this capability parses up
// to ~600KB (homepage + contact page, each capped at MAX_BODY_BYTES).
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
 * Read a fetch Response body capped at `maxBytes`, streaming so an
 * oversized response never gets fully buffered in memory first.
 */
async function readCapped(resp: Response, maxBytes = MAX_BODY_BYTES): Promise<string> {
  if (!resp.body) {
    const text = await resp.text();
    return text.slice(0, maxBytes);
  }
  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (received < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
    }
  }
  try {
    await reader.cancel();
  } catch {
    // Best-effort cancel — response is already consumed enough for our needs.
  }
  const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return buffer.subarray(0, maxBytes).toString("utf8");
}

/**
 * `readCapped` truncates the response body at MAX_BODY_BYTES, and that cut
 * can land mid-block — e.g. inside an `<svg>...</svg>` icon sprite, leaving
 * an opening tag with no matching close anywhere in the truncated string.
 * The close-tag-based strip below can't remove a block it never finds the
 * end of, so the dangling fragment (dense SVG path-coordinate digits, in
 * practice) leaks through as if it were visible text. Drop everything from
 * the last unclosed script/style/svg open tag onward before stripping —
 * we can't safely parse past a truncation boundary anyway.
 */
function dropTrailingUnclosedBlock(html: string, tag: string): string {
  const openRe = new RegExp(`<${tag}[\\s>]`, "gi");
  let lastOpenIdx = -1;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(html))) lastOpenIdx = m.index;
  if (lastOpenIdx === -1) return html;
  const closeRe = new RegExp(`</${tag}>`, "i");
  const hasCloseAfter = closeRe.test(html.slice(lastOpenIdx));
  return hasCloseAfter ? html : html.slice(0, lastOpenIdx);
}

/**
 * Strip script/style/svg blocks, comments, and all remaining tags to get a
 * plain-text view of the page. Inline SVG `<path d="M59.6 14.2 ...">` data
 * is the dominant false-positive source for a raw-HTML phone regex — it is
 * dense with digit/space/dash/dot sequences that pass any digit-count
 * heuristic. Restricting the text-fallback regex to visible text (never
 * attribute values) eliminates that class of noise entirely.
 */
function stripToVisibleText(html: string): string {
  let cleaned = html;
  for (const tag of ["script", "style", "svg"]) {
    cleaned = dropTrailingUnclosedBlock(cleaned, tag);
  }
  return stripTags(
    cleaned
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, " "),
  );
}

/**
 * Strip HTML tags in a single linear pass.
 *
 * This deliberately is NOT a regex. The previous implementation was
 *   /<(?:[^>"']|"[^"]*"|'[^']*')*>/g
 * which handled the real requirement correctly — a naive `<[^>]+>` breaks on
 * tags whose attribute VALUE contains a literal "<" or ">" (e.g. a data-URI
 * SVG inside a `style` attribute), leaking raw SVG path digits into what
 * should be visible text, which is what made phone extraction hallucinate
 * numbers. But it was catastrophically backtracking: `[^>"']` can itself
 * match "<", so on a run of unclosed "<" the engine re-explores the
 * alternation from every offset. Measured on a run of "<" characters:
 *   16K → 0.39s, 64K → 10.9s, 300K → 243s.
 * MAX_BODY_BYTES is 300_000 and we parse up to two pages, so an attacker
 * serving a page of "<"*300000 from their own domain could block the Node
 * event loop for minutes on a single 5-cent call. The hard-timeout guard in
 * routes/do.ts cannot save us — its setTimeout can't fire while the loop is
 * blocked.
 *
 * A hand-written scanner has no backtracking at all: one pass, O(n), with
 * the same quote-awareness the regex provided. Measured at 300KB of the
 * pathological input: sub-millisecond.
 */
export function stripTags(html: string): string {
  let out = "";
  let i = 0;
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    // Walk to the matching ">", treating quoted attribute values as opaque
    // so an embedded ">" inside them doesn't close the tag early.
    let j = lt + 1;
    let quote: string | null = null;
    while (j < n) {
      const ch = html[j];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ">") {
        break;
      }
      j++;
    }
    if (j >= n) {
      // No closing ">" anywhere — this "<" is not a tag at all, it is literal
      // text (e.g. prose containing "5 < 10, call 555-1234"). Emit the
      // remainder verbatim and stop. This matches the old regex, which simply
      // failed to match here and left the text in place; dropping it instead
      // would silently lose any contact details appearing after a stray "<".
      out += html.slice(lt);
      break;
    }
    out += " ";
    i = j + 1;
  }
  return out;
}

/**
 * Phone-number extraction. Prefers `tel:` links (unambiguous — the page
 * author marked it as a phone number). Falls back to a text heuristic only
 * when no tel: links exist, scoped to visible text only (see
 * stripToVisibleText), and requires real phone-like structure (a leading
 * "+" or at least two separator characters) to avoid matching decimal-
 * looking numbers, prices, and tracking IDs that happen to fall in the
 * 7-15 digit range.
 */
function extractPhones(html: string): string[] {
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
  if (results.length > 0) return results.slice(0, 10);

  const visibleText = stripToVisibleText(html);
  // "." deliberately excluded from the allowed character class: decimal
  // numbers, prices, and version strings vastly outnumber dot-formatted
  // phone numbers on real pages and were the single biggest false-positive
  // source observed during onboarding (e.g. "41056.391").
  const candidates = visibleText.match(/\+?[\d][\d\s()-]{6,18}\d/g) || [];
  for (const raw of candidates) {
    const trimmed = raw.trim().replace(/\s+/g, " ");
    const digits = trimmed.replace(/[^\d]/g, "");
    // Real phone numbers are 7-15 digits (ITU-T E.164 max).
    if (digits.length < 7 || digits.length > 15) continue;
    const startsWithPlus = trimmed.startsWith("+");
    const separatorCount = (trimmed.match(/[\s()-]/g) || []).length;
    // Bare digit blobs are the other dominant false-positive shape —
    // require a leading "+" or >=2 separators.
    if (!startsWithPlus && separatorCount < 2) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    results.push(trimmed);
  }
  return results.slice(0, 10);
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
    homepageHtml = await readCapped(resp);
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
        contactHtml = await readCapped(resp);
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
