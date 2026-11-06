import { JSDOM } from "jsdom";
import { getDomain } from "tldts";

export interface CompanyAddress {
  street: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
}

export interface StructuredCompanyMetadata {
  company_name: string | null;
  description: string | null;
  seo_description: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  email: string | null;
  address: CompanyAddress;
  specialties: string[];
  social_links: { linkedin: string | null; twitter: string | null; github: string | null };
  title_hints: string[];
}

const TEXT_LIMIT = 2_000;
const SPECIALTY_LIMIT = 50;
const SPECIALTY_TEXT_LIMIT = 100;
const SPECIALTIES_TOTAL_LIMIT = 2_000;
const JSON_LD_LIMIT = 256 * 1024;
const JSON_LD_COUNT_LIMIT = 20;
const ICON_COUNT_LIMIT = 8;
const ICON_TAG_LIMIT = 4 * 1024;
export const METADATA_HTML_LIMIT = 1_500 * 1024;
/** How far into the page the head is searched before it is stripped and capped. */
const HEAD_SCAN_LIMIT = 2 * 1024 * 1024;

/**
 * Lowercases for tag matching while keeping every position aligned with the
 * input. On V8 the only characters whose lowercase changes length is "İ"
 * (U+0130), and the only non-ASCII characters that lowercase to ASCII are
 * "İ" (to "i") and the Kelvin sign U+212A (to "k"); either could make a
 * scan see "</script>" where the page has none. Both are swapped for U+FFFD,
 * one code unit that lowercases to itself, before the native lowercase.
 */
export function asciiLowerCase(text: string): string {
  // split/join, not a global regex replace: millions of matches made the
  // replace cost about a second on a 16 MB page.
  const safe = text.includes("\u0130") || text.includes("\u212A")
    ? text.split("\u0130").join("\uFFFD").split("\u212A").join("\uFFFD")
    : text;
  const lowered = safe.toLowerCase();
  if (lowered.length === text.length) return lowered;
  // Not reached on V8 today; kept so a runtime with other casing data still
  // gets aligned positions rather than a silent misread.
  return text.replace(/[A-Z]+/g, (run) => run.toLowerCase());
}

/**
 * Drops HTML comments in one linear pass, as a browser would: a comment ends
 * at "-->" or "--!>" ("<!-->" and "<!--->" are empty comments), an unclosed
 * one ends the document, and a "<!--" inside <script> or <style> text is not
 * a comment, so those blocks are copied through untouched. Each search
 * position is cached until the cursor passes it, so the pass stays linear.
 */
export function stripHtmlComments(source: string): string {
  const lower = asciiLowerCase(source);
  const pieces: string[] = [];
  let cursor = 0;
  let nextComment = -2;
  let nextScript = -2;
  let nextStyle = -2;
  let nextClose = -2;
  let nextBangClose = -2;
  const refresh = (cached: number, needle: string, from: number) =>
    cached !== -1 && cached < from ? lower.indexOf(needle, from) : cached;
  while (cursor < source.length) {
    nextComment = refresh(nextComment, "<!--", cursor);
    nextScript = refresh(nextScript, "<script", cursor);
    nextStyle = refresh(nextStyle, "<style", cursor);
    const candidates = [nextComment, nextScript, nextStyle].filter((p) => p >= 0);
    if (candidates.length === 0) {
      pieces.push(source.slice(cursor));
      break;
    }
    const start = Math.min(...candidates);
    if (start === nextComment) {
      pieces.push(source.slice(cursor, start));
      if (lower.startsWith("<!-->", start)) {
        cursor = start + 5;
        continue;
      }
      if (lower.startsWith("<!--->", start)) {
        cursor = start + 6;
        continue;
      }
      nextClose = refresh(nextClose, "-->", start + 4);
      nextBangClose = refresh(nextBangClose, "--!>", start + 4);
      const ends = [nextClose >= 0 ? nextClose + 3 : -1, nextBangClose >= 0 ? nextBangClose + 4 : -1].filter((p) => p >= 0);
      if (ends.length === 0) break;
      cursor = Math.min(...ends);
      continue;
    }
    // A script or style block: its text may hold "<!--"; copy it through.
    const closeTag = start === nextScript ? "</script" : "</style";
    const close = lower.indexOf(closeTag, start + 1);
    const closeEnd = close < 0 ? -1 : lower.indexOf(">", close);
    if (closeEnd < 0) {
      pieces.push(source.slice(cursor));
      break;
    }
    pieces.push(source.slice(cursor, closeEnd + 1));
    cursor = closeEnd + 1;
  }
  return pieces.join("");
}

/**
 * Drops every <script> and <style> block from a slice of HTML, in one linear
 * pass: the next position of each opening tag is searched for once and reused
 * until the cursor passes it, so a page full of one kind cannot make every
 * step re-scan to the end looking for the other. An unclosed block ends the
 * slice, as it would for a browser.
 */
export function stripScriptAndStyleBlocks(source: string, diagnostics?: { searches: number }): string {
  const lower = asciiLowerCase(source);
  const pieces: string[] = [];
  let cursor = 0;
  let nextScript = -2;
  let nextStyle = -2;
  const find = (needle: string, from: number) => {
    if (diagnostics) diagnostics.searches += 1;
    return lower.indexOf(needle, from);
  };
  while (cursor < source.length) {
    if (nextScript !== -1 && nextScript < cursor) nextScript = find("<script", cursor);
    if (nextStyle !== -1 && nextStyle < cursor) nextStyle = find("<style", cursor);
    const start = nextScript < 0 ? nextStyle : nextStyle < 0 ? nextScript : Math.min(nextScript, nextStyle);
    if (start < 0) {
      pieces.push(source.slice(cursor));
      break;
    }
    pieces.push(source.slice(cursor, start));
    const closeTag = start === nextScript ? "</script" : "</style";
    const close = find(closeTag, start + 1);
    if (close < 0) break;
    const closeEnd = find(">", close);
    if (closeEnd < 0) break;
    cursor = closeEnd + 1;
  }
  return pieces.join("");
}
const ORGANIZATION_TYPES = new Set([
  "organization", "corporation", "localbusiness", "store",
  // Common direct and nested LocalBusiness descendants. Schema.org does not
  // embed its type hierarchy in publisher JSON-LD, so recognize the concrete
  // types sites actually emit rather than accepting every schema type.
  "animalShelter", "automotiveBusiness", "childCare", "dentist", "dryCleaningOrLaundry",
  "emergencyService", "employmentAgency", "entertainmentBusiness", "financialService",
  "foodEstablishment", "governmentOffice", "healthAndBeautyBusiness", "homeAndConstructionBusiness",
  "hotel", "internetCafe", "legalService", "library", "lodgingBusiness", "medicalBusiness",
  "professionalService", "radioStation", "realEstateAgent", "recyclingCenter", "restaurant",
  "selfStorage", "shoppingCenter", "sportsActivityLocation", "televisionStation",
  "touristInformationCenter", "travelAgency",
].map((type) => type.toLowerCase()));

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, TEXT_LIMIT) : null;
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    const cleaned = cleanText(value);
    if (cleaned) return cleaned;
  }
  return null;
}

function absoluteHttpUrl(value: unknown, pageUrl: string): string | null {
  const candidate = cleanText(typeof value === "object" && value !== null && "url" in value
    ? (value as { url?: unknown }).url
    : value);
  if (!candidate) return null;
  try {
    const resolved = new URL(candidate, pageUrl);
    return resolved.protocol === "http:" || resolved.protocol === "https:" ? resolved.href : null;
  } catch {
    return null;
  }
}

function ownDomainEmail(value: unknown, pageUrl: string): string | null {
  const email = cleanText(value)?.replace(/^mailto:/i, "").toLowerCase() ?? null;
  if (!email || !/^[^\s@]+@[^\s@]+$/.test(email)) return null;
  const emailHost = email.split("@")[1];
  const pageHost = new URL(pageUrl).hostname.toLowerCase().replace(/^www\./, "");
  const pageDomain = getDomain(pageHost, { allowPrivateDomains: true });
  const emailDomain = getDomain(emailHost, { allowPrivateDomains: true });
  return pageDomain && emailDomain && pageDomain === emailDomain ? email : null;
}

function schemaType(value: string): string {
  return value.toLowerCase().replace(/^https?:\/\/schema\.org\//, "").replace(/^schema:/, "");
}

function jsonLdNodes(document: Document): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed: unknown = JSON.parse(script.textContent ?? "");
      const queue = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of queue) {
        if (!item || typeof item !== "object") continue;
        const graph = (item as Record<string, unknown>)["@graph"];
        if (Array.isArray(graph)) queue.push(...graph);
        const publisher = (item as Record<string, unknown>).publisher;
        if (publisher && typeof publisher === "object") queue.push(publisher);
        const types = Array.isArray((item as Record<string, unknown>)["@type"])
          ? (item as Record<string, unknown>)["@type"] as unknown[]
          : [(item as Record<string, unknown>)["@type"]];
        if (types.some((type) => typeof type === "string" && ORGANIZATION_TYPES.has(schemaType(type)))) {
          nodes.push(item as Record<string, unknown>);
        }
      }
    } catch {
      // Invalid publisher-supplied JSON-LD is simply unavailable metadata.
    }
  }
  return nodes;
}

function meta(document: Document, key: string): string | null {
  return cleanText(document.querySelector(`meta[property="${key}"], meta[name="${key}"]`)?.getAttribute("content"));
}

function list(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const result: string[] = [];
  let joinedLength = 0;
  for (const item of [...new Set(values.map(cleanText).filter((entry): entry is string => Boolean(entry)))]) {
    const bounded = item.slice(0, SPECIALTY_TEXT_LIMIT);
    const separatorLength = result.length ? 2 : 0;
    if (joinedLength + separatorLength + bounded.length > SPECIALTIES_TOTAL_LIMIT) {
      const remaining = SPECIALTIES_TOTAL_LIMIT - joinedLength - separatorLength;
      if (remaining > 0) result.push(bounded.slice(0, remaining));
      break;
    }
    result.push(bounded);
    joinedLength += separatorLength + bounded.length;
    if (result.length === SPECIALTY_LIMIT) break;
  }
  return result;
}

function quotesBalanced(tag: string): boolean {
  let open: string | null = null;
  for (let i = 0; i < tag.length; i++) {
    const c = tag[i];
    if (open) {
      if (c === open) open = null;
    } else if (c === '"' || c === "'") {
      open = c;
    }
  }
  return open === null;
}

// The lookbehind anchors a name to the start of a token: an unanchored
// `[a-zA-Z-]+` retried from every position of a long letter run, which made a
// 4 KB tag cost milliseconds and a page of them tens of seconds.
const LINK_ATTRIBUTE = /(?<=[\s"'\/])([^\s"'>\/=]+)\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/g;
/** Icon-looking tags examined per page, whether or not they yield an icon. */
const ICON_CANDIDATE_LIMIT = 64;

/**
 * The value is raw source text, so its entities ("&amp;") are left for the
 * parser to decode. The re-emitted attribute is always double-quoted, so a
 * double quote is the only character that needs escaping.
 */
function escapeAttribute(value: string): string {
  return value.replace(/"/g, "&quot;");
}

/**
 * Re-emits an icon <link> from its parsed rel and href only, quoted and
 * escaped, so nothing in a malformed publisher tag (a stray quote in an
 * unquoted value, say) can leave the parser input open and swallow the
 * JSON-LD after it. The tag is at most ICON_TAG_LIMIT long.
 */
function rebuildIconLink(tag: string): string | null {
  let rel: string | null = null;
  let href: string | null = null;
  for (const match of tag.matchAll(LINK_ATTRIBUTE)) {
    const name = match[1]!.toLowerCase();
    const raw = match[2]!;
    const value = raw.startsWith('"') || raw.startsWith("'") ? raw.slice(1, -1) : raw;
    if (name === "rel" && rel === null) rel = value;
    if (name === "href" && href === null) href = value;
  }
  if (!rel || !href || !/icon/i.test(rel)) return null;
  return `<link rel="${escapeAttribute(rel)}" href="${escapeAttribute(href)}">`;
}

/** Selects the small, metadata-bearing portions that jsdom is allowed to parse. */
/** The meta keys the extractor reads; nothing else is passed to the parser. */
const META_KEYS = new Set([
  "og:site_name", "og:title", "og:description", "og:image",
  "twitter:title", "twitter:description", "twitter:image", "description",
]);
/** Meta-looking tags examined per page, and kept, and the length of one value. */
const META_CANDIDATE_LIMIT = 256;
const META_KEPT_LIMIT = 32;
const META_VALUE_LIMIT = 4 * 1024;
const TITLE_LIMIT = 2 * 1024;

/**
 * Finds the ">" that ends a tag, skipping ones inside quoted values, within
 * `limit` characters. Callers cap how many tags they examine, so the total
 * work is bounded by that cap times `limit`.
 */
function tagEnd(text: string, start: number, limit: number): number {
  // A small slice of the HTML tokenizer: a quote opens a value only right
  // after "=" (whitespace allowed), and an unquoted value runs to whitespace,
  // so neither content=O'Brien nor content=x=" opens a quoted span.
  let quote: string | null = null;
  let afterEquals = false;
  let unquoted = false;
  const stop = Math.min(text.length, start + limit);
  for (let i = start + 1; i < stop; i++) {
    const c = text[i]!;
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === ">") return i;
    const space = c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f";
    if (unquoted) {
      if (space) unquoted = false;
      continue;
    }
    if (afterEquals) {
      if (space) continue;
      afterEquals = false;
      if (c === '"' || c === "'") quote = c;
      else unquoted = true;
      continue;
    }
    if (c === "=") afterEquals = true;
  }
  return -1;
}

function tagAttributes(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of tag.matchAll(LINK_ATTRIBUTE)) {
    const name = match[1]!.toLowerCase();
    const raw = match[2]!;
    if (!attributes.has(name)) {
      attributes.set(name, raw.startsWith('"') || raw.startsWith("'") ? raw.slice(1, -1) : raw);
    }
  }
  return attributes;
}

/**
 * Builds the only input jsdom ever parses: tags constructed here from values
 * read out of the page, never the page's own markup. Publisher markup (deep
 * nesting, attribute floods, a JSON-LD script closed early with
 * "</script x>") makes the HTML parser superlinear, and a cap on the input's
 * length does not cap its parse time. What reaches the parser is flat:
 *  - up to 32 <meta> tags whose key the extractor reads, values quoted;
 *  - one <title> with "<" escaped;
 *  - up to 8 icon <link> tags, rebuilt from rel and href;
 *  - JSON-LD blocks in a fixed opening tag, each cut at its first "</script"
 *    so nothing inside can end it early, trimmed first when the budget runs out.
 */
export function buildBoundedMetadataHtml(
  html: string,
  diagnostics?: { scriptOpeningsVisited: number; iconCandidates?: number; metaCandidates?: number },
): string {
  // Everything below reads the page as a browser would see it: commented-out
  // tags (a theme's placeholder og:site_name, a rebrand's old JSON-LD) are
  // not statements the site makes.
  html = stripHtmlComments(html);
  const lower = asciiLowerCase(html);
  // "<head" alone would also match "<header", and HTML5 lets a page omit the
  // <head> tag, so require the tag name to end there.
  const headMatch = /<head[\s>]/.exec(lower);
  const headStart = headMatch ? headMatch.index : -1;
  let headRegionStart = 0;
  let headRegionEnd: number;
  if (headStart >= 0) {
    const headClose = lower.indexOf("</head>", headStart);
    const headEnd = headClose >= 0 ? headClose + 7 : Math.min(html.length, headStart + HEAD_SCAN_LIMIT);
    headRegionStart = headStart;
    headRegionEnd = Math.min(headEnd, headStart + HEAD_SCAN_LIMIT);
  } else {
    // HTML fragments are common in tests and malformed publisher responses;
    // treat their leading bytes as the implicit head.
    headRegionEnd = Math.min(html.length, HEAD_SCAN_LIMIT);
  }
  // Inline scripts and styles carry no metadata (JSON-LD is collected below on
  // its own), so meta tags are read from the head with them removed.
  const head = stripScriptAndStyleBlocks(html.slice(headRegionStart, headRegionEnd));
  const headLower = asciiLowerCase(head);

  const metas: string[] = [];
  let metaCandidates = 0;
  let cursor = 0;
  while (metas.length < META_KEPT_LIMIT) {
    const start = headLower.indexOf("<meta", cursor);
    if (start < 0) break;
    if (++metaCandidates > META_CANDIDATE_LIMIT) break;
    if (diagnostics) diagnostics.metaCandidates = metaCandidates;
    const end = tagEnd(headLower, start, ICON_TAG_LIMIT + META_VALUE_LIMIT);
    if (end < 0) {
      cursor = start + 5;
      continue;
    }
    cursor = end + 1;
    const attributes = tagAttributes(head.slice(start, end + 1));
    const content = attributes.get("content");
    if (content === undefined) continue;
    // A tag may carry both: property="og:description" name="description".
    const keys = new Set([attributes.get("property"), attributes.get("name")]
      .filter((key): key is string => Boolean(key))
      .map((key) => key.toLowerCase())
      .filter((key) => META_KEYS.has(key)));
    for (const key of keys) {
      if (metas.length >= META_KEPT_LIMIT) break;
      metas.push(`<meta property="${escapeAttribute(key)}" content="${escapeAttribute(content.slice(0, META_VALUE_LIMIT))}">`);
    }
  }

  let title = "";
  const titleStart = headLower.indexOf("<title");
  if (titleStart >= 0) {
    const titleOpenEnd = tagEnd(headLower, titleStart, ICON_TAG_LIMIT);
    const titleClose = titleOpenEnd < 0 ? -1 : headLower.indexOf("</title", titleOpenEnd + 1);
    if (titleClose >= 0) {
      const text = head.slice(titleOpenEnd + 1, Math.min(titleClose, titleOpenEnd + 1 + TITLE_LIMIT));
      title = `<title>${text.replace(/</g, "&lt;")}</title>`;
    }
  }

  const jsonLd: string[] = [];
  cursor = 0;
  while (jsonLd.length < JSON_LD_COUNT_LIMIT) {
    const start = lower.indexOf("<script", cursor);
    if (start < 0) break;
    if (diagnostics) diagnostics.scriptOpeningsVisited += 1;
    const openEnd = lower.indexOf(">", start);
    if (openEnd < 0) break;
    // A browser ends a script at "</script" followed by space, "/" or ">", so
    // the content is cut at the first "</script" whatever follows it.
    const close = lower.indexOf("</script", openEnd + 1);
    if (lower.slice(start, openEnd + 1).includes("application/ld+json")) {
      const contentEnd = Math.min(close < 0 ? html.length : close, openEnd + 1 + JSON_LD_LIMIT);
      // "<" is valid JSON only inside a string, where "\\u003c" means the
      // same; escaping it keeps "<!--<script>" in a value from switching the
      // tokenizer into the escaped-script state that swallows later blocks.
      const content = html.slice(openEnd + 1, contentEnd).split("<").join("\\u003c");
      jsonLd.push(`<script type="application/ld+json">${content}</script>`);
    }
    // With no close, every later apparent opening is content of this script.
    // Stopping here keeps the scan linear and matches browser parsing.
    if (close < 0) break;
    const closeEnd = lower.indexOf(">", close);
    if (closeEnd < 0) break;
    cursor = closeEnd + 1;
  }

  const icons: string[] = [];
  cursor = 0;
  let iconCandidates = 0;
  while (icons.length < ICON_COUNT_LIMIT) {
    const start = lower.indexOf("<link", cursor);
    if (start < 0) break;
    const end = lower.indexOf(">", start);
    if (end < 0) break;
    cursor = end + 1;
    const tagLength = end + 1 - start;
    if (tagLength > ICON_TAG_LIMIT) continue;
    const tag = lower.slice(start, end + 1);
    // Ending at the first ">" cuts a tag whose quoted attribute holds one (a
    // data-URI SVG favicon); such a fragment is not a whole tag.
    if (!tag.includes("icon")) continue;
    if (++iconCandidates > ICON_CANDIDATE_LIMIT) break;
    if (diagnostics) diagnostics.iconCandidates = iconCandidates;
    if (tag.includes("<", 1) || !quotesBalanced(tag)) continue;
    const rebuilt = rebuildIconLink(html.slice(start, end + 1));
    if (rebuilt) icons.push(rebuilt);
  }

  const prefix = "<!doctype html><html>";
  const suffix = "</html>";
  const fixed = [...metas, title, ...icons].filter(Boolean);
  // Lengths are summed rather than re-joined per block (one "\n" per piece).
  let length = prefix.length + suffix.length + fixed.reduce((sum, piece) => sum + piece.length + 1, 0);
  const keptJsonLd: string[] = [];
  for (const block of jsonLd) {
    // An oversized block is skipped, not the end: a later one may be the
    // Organization and still fit.
    if (length + block.length + 1 > METADATA_HTML_LIMIT) continue;
    keptJsonLd.push(block);
    length += block.length + 1;
  }
  return `${prefix}${[...fixed, ...keptJsonLd].join("\n")}${suffix}`.slice(0, METADATA_HTML_LIMIT);
}

/**
 * Extracts only statements embedded in the fetched homepage. JSON-LD is the
 * most explicit source and wins over Open Graph, then Twitter cards, ordinary
 * metadata and document-title/icon fallbacks.
 */
export function extractStructuredCompanyMetadata(
  html: string,
  pageUrl: string,
  createDom: (boundedHtml: string) => JSDOM = (boundedHtml) => new JSDOM(boundedHtml),
): StructuredCompanyMetadata {
  const dom = createDom(buildBoundedMetadataHtml(html));
  try {
    const document = dom.window.document;
  const pageHost = new URL(pageUrl).hostname.toLowerCase().replace(/^www\./, "");
  const organizations = jsonLdNodes(document);
  const organization = organizations.find((node) => [node.url, node["@id"]].some((value) => {
    const url = absoluteHttpUrl(value, pageUrl);
    return url ? new URL(url).hostname.toLowerCase().replace(/^www\./, "") === pageHost : false;
  })) ?? organizations[0] ?? {};
  const rawAddress = Array.isArray(organization.address) ? organization.address[0] : organization.address;
  const address = rawAddress && typeof rawAddress === "object" ? rawAddress as Record<string, unknown> : {};
  const sameAs = Array.isArray(organization.sameAs) ? organization.sameAs : [];
  const social = (host: string) => sameAs.find((value) => {
    const url = absoluteHttpUrl(value, pageUrl);
    if (!url) return false;
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === host || hostname.endsWith(`.${host}`);
  });
  const icon = document.querySelector('link[rel~="icon"], link[rel="apple-touch-icon"]')?.getAttribute("href");

  const ogDescription = meta(document, "og:description");
  const twitterDescription = meta(document, "twitter:description");
  const seoDescription = meta(document, "description");

    return {
    company_name: firstText(organization.name, meta(document, "og:site_name")),
    description: firstText(organization.description, ogDescription, twitterDescription, seoDescription),
    seo_description: firstText(seoDescription, ogDescription, twitterDescription, organization.description),
    logo_url: absoluteHttpUrl(organization.logo, pageUrl) ?? absoluteHttpUrl(icon, pageUrl),
    cover_image_url: absoluteHttpUrl(meta(document, "og:image"), pageUrl) ?? absoluteHttpUrl(meta(document, "twitter:image"), pageUrl),
    email: ownDomainEmail(organization.email, pageUrl),
    address: {
      street: cleanText(typeof rawAddress === "string" ? rawAddress : address.streetAddress),
      city: cleanText(address.addressLocality),
      region: cleanText(address.addressRegion),
      postal_code: cleanText(address.postalCode),
      country: cleanText(address.addressCountry && typeof address.addressCountry === "object" ? (address.addressCountry as { name?: unknown }).name : address.addressCountry),
    },
    specialties: list(organization.knowsAbout),
    social_links: {
      linkedin: absoluteHttpUrl(social("linkedin.com"), pageUrl),
      twitter: absoluteHttpUrl(social("twitter.com") ?? social("x.com"), pageUrl),
      github: absoluteHttpUrl(social("github.com"), pageUrl),
    },
      title_hints: [meta(document, "og:title"), meta(document, "twitter:title"), cleanText(document.title)]
        .filter((value): value is string => Boolean(value)),
    };
  } finally {
    dom.window.close();
  }
}

export function hasStructuredMetadata(metadata: StructuredCompanyMetadata): boolean {
  return Boolean(
    metadata.company_name || metadata.description || metadata.seo_description || metadata.logo_url ||
    metadata.cover_image_url || metadata.email || metadata.specialties.length ||
    Object.values(metadata.address).some(Boolean) || Object.values(metadata.social_links).some(Boolean)
  );
}
