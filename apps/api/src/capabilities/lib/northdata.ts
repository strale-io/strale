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
 * Used by: german, dutch, portuguese, lithuanian, swiss, and potentially
 * other European company data capabilities.
 */

import { validateCompanyResult, type ValidationBlock } from "../../lib/entity-validation.js";

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
  jurisdiction: string | null;
  validation: ValidationBlock | null;
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
    jurisdiction: null,
    validation: null,
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
          if (addr.addressCountry) {
            result.jurisdiction = addr.addressCountry.toUpperCase();
          }
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
  // Try specific patterns first (most reliable), then generic
  const hrbMatch = html.match(/(?:HRB|HRA|GnR|PR|VR)\s*\d+/i);
  const kvkMatch = html.match(/KVK\s*(\d{8})/i);
  const cheMatch = html.match(/(CHE-[\d.]+)/i);
  const sirenMatch = html.match(/Siren\s*(\d{9,14})/i);
  const kboMatch = html.match(/KBO\s*([\d.]+)/i);

  if (hrbMatch) result.registration_number = hrbMatch[0].trim();
  else if (kvkMatch) result.registration_number = kvkMatch[0].trim();
  else if (cheMatch) result.registration_number = cheMatch[1].trim();
  else if (sirenMatch) result.registration_number = sirenMatch[0].trim();
  else if (kboMatch) result.registration_number = kboMatch[0].trim();

  if (result.company_name) {
    const typeMatch = result.company_name.match(BUSINESS_TYPES);
    result.business_type = typeMatch ? typeMatch[1] : null;
    result.status = html.includes("dissolved") || html.includes("aufgelöst") || html.includes("gelöscht") || html.includes("liquidated") || html.includes("(liq)") ? "dissolved" : "active";
  }

  return result;
}

/** Country name → ISO code mapping for jurisdiction */
const COUNTRY_TO_ISO: Record<string, string> = {
  "Germany": "DE", "Netherlands": "NL", "Portugal": "PT",
  "Switzerland": "CH", "Lithuania": "LT", "Belgium": "BE",
  "France": "FR", "Spain": "ES", "Italy": "IT", "Austria": "AT",
  "Poland": "PL", "Ireland": "IE", "Estonia": "EE", "Latvia": "LV",
  "Denmark": "DK", "Sweden": "SE", "Norway": "NO", "Finland": "FI",
  "United Kingdom": "GB",
};

/**
 * Search northdata.com for a company and extract structured data.
 *
 * @param query - Company name or registration ID to search
 * @param countryFilter - Country name to prefer (e.g., "Germany", "Netherlands")
 * @param userInput - Optional user input for cross-validation
 * @returns Extracted company data with validation block
 */
export async function searchNorthdata(
  query: string,
  countryFilter?: string,
  userInput?: { company_name?: string | null; registration_number?: string | null },
  courtFilter?: string,
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

  // Prefer court-specific result (German HRB disambiguation), then country
  let bestMatch = results[0];
  if (courtFilter) {
    // Extract city from court name: "Amtsgericht München" → "München"
    const courtCity = courtFilter.replace(/^Amtsgericht\s+/i, "").trim();
    // Check both the result title and URL for court/city match
    const courtMatch = results.find(([, url, title]) =>
      title.includes(courtCity) || url.includes(encodeURIComponent(courtCity)) ||
      url.toLowerCase().includes(courtFilter.toLowerCase().replace(/\s+/g, "%20")),
    );
    if (courtMatch) bestMatch = courtMatch;
  } else if (countryFilter) {
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

  // Run validation if user input is available
  const expectedJurisdiction = countryFilter ? (COUNTRY_TO_ISO[countryFilter] ?? "") : (data.jurisdiction ?? "");
  if (userInput || expectedJurisdiction) {
    data.validation = validateCompanyResult(
      {
        company_name: data.company_name,
        registration_number: data.registration_number,
        address: data.address,
      },
      {
        company_name: userInput?.company_name ?? query,
        registration_number: userInput?.registration_number ?? null,
      },
      expectedJurisdiction,
    );

    // Hard fail on code mismatch (user provided a specific code and it doesn't match)
    if (data.validation.failures.length > 0 && userInput?.registration_number) {
      const codeFailure = data.validation.failures.find((f) => f.includes("code mismatch"));
      if (codeFailure) {
        throw new Error(`Entity validation failed: ${codeFailure}`);
      }
    }
  }

  return data;
}
