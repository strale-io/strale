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
}

const TEXT_LIMIT = 2_000;
const SPECIALTY_LIMIT = 50;
const ORGANIZATION_TYPES = new Set(["organization", "localbusiness"]);

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
        const types = Array.isArray((item as Record<string, unknown>)["@type"])
          ? (item as Record<string, unknown>)["@type"] as unknown[]
          : [(item as Record<string, unknown>)["@type"]];
        if (types.some((type) => typeof type === "string" && ORGANIZATION_TYPES.has(type.toLowerCase()))) {
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
  return [...new Set(values.map(cleanText).filter((item): item is string => Boolean(item)))].slice(0, SPECIALTY_LIMIT);
}

/**
 * Extracts only statements embedded in the fetched homepage. JSON-LD is the
 * most explicit source and wins over Open Graph, then Twitter cards, ordinary
 * metadata and document-title/icon fallbacks.
 */
export function extractStructuredCompanyMetadata(html: string, pageUrl: string): StructuredCompanyMetadata {
  const document = new JSDOM(html).window.document;
  const organization = jsonLdNodes(document)[0] ?? {};
  const address = organization.address && typeof organization.address === "object"
    ? organization.address as Record<string, unknown>
    : {};
  const sameAs = Array.isArray(organization.sameAs) ? organization.sameAs : [];
  const social = (host: string) => sameAs.find((value) => {
    const url = absoluteHttpUrl(value, pageUrl);
    return url ? new URL(url).hostname.toLowerCase().includes(host) : false;
  });
  const icon = document.querySelector('link[rel~="icon"], link[rel="apple-touch-icon"]')?.getAttribute("href");

  const ogDescription = meta(document, "og:description");
  const twitterDescription = meta(document, "twitter:description");
  const seoDescription = meta(document, "description");

  return {
    company_name: firstText(organization.name, meta(document, "og:site_name"), meta(document, "og:title"), meta(document, "twitter:title"), document.title),
    description: firstText(organization.description, ogDescription, twitterDescription, seoDescription),
    seo_description: firstText(seoDescription, ogDescription, twitterDescription, organization.description),
    logo_url: absoluteHttpUrl(organization.logo, pageUrl) ?? absoluteHttpUrl(icon, pageUrl),
    cover_image_url: absoluteHttpUrl(meta(document, "og:image"), pageUrl) ?? absoluteHttpUrl(meta(document, "twitter:image"), pageUrl),
    email: ownDomainEmail(organization.email, pageUrl),
    address: {
      street: cleanText(address.streetAddress),
      city: cleanText(address.addressLocality),
      region: cleanText(address.addressRegion),
      postal_code: cleanText(address.postalCode),
      country: cleanText(address.addressCountry),
    },
    specialties: list(organization.knowsAbout),
    social_links: {
      linkedin: absoluteHttpUrl(social("linkedin."), pageUrl),
      twitter: absoluteHttpUrl(social("twitter.") ?? social("x.com"), pageUrl),
      github: absoluteHttpUrl(social("github."), pageUrl),
    },
  };
}

export function hasStructuredMetadata(metadata: StructuredCompanyMetadata): boolean {
  return Boolean(
    metadata.company_name || metadata.description || metadata.seo_description || metadata.logo_url ||
    metadata.cover_image_url || metadata.email || metadata.specialties.length ||
    Object.values(metadata.address).some(Boolean) || Object.values(metadata.social_links).some(Boolean)
  );
}
