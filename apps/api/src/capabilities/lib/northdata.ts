/**
 * Shared northdata.com JSON-LD extraction for European company registries.
 *
 * northdata.com covers 25+ European countries with structured JSON-LD data
 * on company profile pages. This module handles:
 * - Path-style search (/Company+Name) — returns search results or direct page
 * - JSON-LD extraction from company profile pages
 * - Country-specific registration number patterns
 * - Search result disambiguation by country
 *
 * Used by: german, dutch, portuguese, lithuanian, and potentially
 * other European company data capabilities.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export interface NorthdataCompany {
  company_name: string | null;
  registration_number: string | null;
  business_type: string | null;
  address: string | null;
  registration_date: string | null;
  status: string;
  industry: string | null;
  directors: string | null;
}

/** European business type suffixes for extraction */
const BUSINESS_TYPES = /(GmbH|AG|SE|KG|OHG|eG|e\.V\.|KGaA|UG|BV|NV|SA|SRL|Srl|SAS|SARL|SpA|Lda|AB|AS|Oy|Oyj|ApS|Ltd|PLC|UAB|SIA|OÜ|d\.o\.o|s\.r\.o|a\.s|GmbH & Co\. KG)/i;

/** Extract JSON-LD company data from a northdata.com page */
export function extractJsonLd(html: string): NorthdataCompany {
  const result: NorthdataCompany = {
    company_name: null,
    registration_number: null,
    business_type: null,
    address: null,
    registration_date: null,
    status: "unknown",
    industry: null,
    directors: null,
  };

  const blocks = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
  for (const block of blocks) {
    try {
      const jsonStr = block.replace(/<script type="application\/ld\+json">/, "").replace(/<\/script>/, "");
      const data = JSON.parse(jsonStr);

      if (data["@type"] === "LocalBusiness" || data["@type"] === "Organization") {
        result.company_name = data.name || null;
        result.registration_date = data.foundingDate || null;

        if (data.address) {
          const addr = data.address;
          const parts = [addr.streetAddress, addr.postalCode, addr.addressLocality, addr.addressCountry].filter(Boolean);
          result.address = parts.join(", ") || null;
        }

        if (Array.isArray(data.member) && data.member.length > 0) {
          const directors = data.member
            .filter((m: Record<string, unknown>) => m.jobTitle)
            .map((m: Record<string, unknown>) => `${m.name} (${m.jobTitle})`)
            .slice(0, 10);
          result.directors = directors.length > 0 ? directors.join("; ") : null;
        }
      }

      if (data["@type"] === "BreadcrumbList" && Array.isArray(data.itemListElement)) {
        const industry = data.itemListElement.find(
          (item: Record<string, unknown>) =>
            typeof item === "object" && (item as Record<string, unknown>).position === 2,
        );
        if (industry?.item?.name) {
          result.industry = industry.item.name;
        }
      }
    } catch {
      // Skip invalid JSON-LD blocks
    }
  }

  // Extract registration number from common patterns in the HTML
  const regMatch = html.match(/(?:Amtsgericht|District Court|KVK|KBO|CRO|NIPC|Company Code|Įmonės kodas|CHE-|UID)[^<]*?([A-Z0-9][\w\s\-.]{3,25})/i);
  if (regMatch) result.registration_number = regMatch[1].trim();

  if (result.company_name) {
    const typeMatch = result.company_name.match(BUSINESS_TYPES);
    result.business_type = typeMatch ? typeMatch[1] : null;
    result.status = html.includes("dissolved") || html.includes("aufgelöst") || html.includes("gelöscht") || html.includes("liquidated") || html.includes("(liq)") ? "dissolved" : "active";
  }

  return result;
}

/**
 * Search northdata.com for a company and extract structured data.
 *
 * @param query - Company name or registration ID to search
 * @param countryFilter - ISO 3166-1 country name to prefer (e.g., "Germany", "Netherlands")
 * @returns Extracted company data or throws if not found
 */
export async function searchNorthdata(
  query: string,
  countryFilter?: string,
): Promise<NorthdataCompany> {
  // Path-style search (not ?q= which returns broken results)
  const searchUrl = `https://www.northdata.com/${encodeURIComponent(query)}`;
  const resp = await fetch(searchUrl, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    signal: AbortSignal.timeout(10000),
    redirect: "follow",
  });

  if (!resp.ok) throw new Error(`northdata.com returned HTTP ${resp.status}`);
  const html = await resp.text();

  // Check if this is already a company page
  if (html.includes('"@type" : "LocalBusiness"') || html.includes('"@type":"LocalBusiness"')) {
    const data = extractJsonLd(html);
    if (data.company_name) return data;
  }

  // Parse search results — find the best match
  const results = [...html.matchAll(/class="title" href="([^"]+)">([^<]+)</g)];
  if (results.length === 0) {
    throw new Error(`No company found matching "${query}" on northdata.com.`);
  }

  // Prefer country-specific result
  let bestMatch = results[0];
  if (countryFilter) {
    const countryMatch = results.find(([, , title]) => title.includes(countryFilter));
    if (countryMatch) bestMatch = countryMatch;
  }

  // Follow through to the company page
  const pageUrl = `https://www.northdata.com${bestMatch[1]}`;
  const pageResp = await fetch(pageUrl, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    signal: AbortSignal.timeout(10000),
    redirect: "follow",
  });

  if (!pageResp.ok) throw new Error(`northdata.com company page returned HTTP ${pageResp.status}`);
  const pageHtml = await pageResp.text();
  const data = extractJsonLd(pageHtml);

  if (!data.company_name) {
    throw new Error(`Could not extract company data for "${query}" from northdata.com.`);
  }

  return data;
}
