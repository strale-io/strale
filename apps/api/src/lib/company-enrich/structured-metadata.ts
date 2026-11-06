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
const HEAD_LIMIT = 512 * 1024;
const JSON_LD_LIMIT = 256 * 1024;
const JSON_LD_COUNT_LIMIT = 20;
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
  const pageDomain = getDomain(pageHost);
  const emailDomain = getDomain(emailHost);
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

/** Selects the small, metadata-bearing portions that jsdom is allowed to parse. */
export function buildBoundedMetadataHtml(html: string): string {
  const lower = html.toLowerCase();
  const pieces: string[] = [];
  const headStart = lower.indexOf("<head");
  let headEnd = -1;
  if (headStart >= 0) {
    const headClose = lower.indexOf("</head>", headStart);
    headEnd = headClose >= 0 ? headClose + 7 : Math.min(html.length, headStart + HEAD_LIMIT);
    pieces.push(html.slice(headStart, Math.min(headEnd, headStart + HEAD_LIMIT)));
  } else {
    // HTML fragments are common in tests and malformed publisher responses;
    // treat their leading bytes as the implicit head without widening the cap.
    pieces.push(html.slice(0, HEAD_LIMIT));
  }

  let cursor = 0;
  let scriptCount = 0;
  while (scriptCount < JSON_LD_COUNT_LIMIT) {
    const start = lower.indexOf("<script", cursor);
    if (start < 0) break;
    const openEnd = lower.indexOf(">", start);
    if (openEnd < 0) break;
    const close = lower.indexOf("</script>", openEnd + 1);
    cursor = close < 0 ? openEnd + 1 : close + 9;
    const opening = lower.slice(start, openEnd + 1);
    if (!opening.includes("application/ld+json")) continue;
    const contentEnd = Math.min(close < 0 ? html.length : close, openEnd + 1 + JSON_LD_LIMIT);
    pieces.push(`${html.slice(start, openEnd + 1)}${html.slice(openEnd + 1, contentEnd)}</script>`);
    scriptCount += 1;
  }

  cursor = 0;
  while (true) {
    const start = lower.indexOf("<link", cursor);
    if (start < 0) break;
    const end = lower.indexOf(">", start);
    if (end < 0) break;
    cursor = end + 1;
    if (headStart >= 0 && start >= headStart && start < headEnd) continue;
    const tag = lower.slice(start, end + 1);
    if (tag.includes("icon")) pieces.push(html.slice(start, end + 1));
  }
  return `<!doctype html><html>${pieces.join("\n")}</html>`;
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
