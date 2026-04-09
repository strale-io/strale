import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * German Company Data — northdata.com JSON-LD extraction
 *
 * Strategy: northdata.com embeds schema.org JSON-LD on company profile pages
 * with company name, address, founding date, directors, and registration info.
 * No Browserless or LLM extraction needed — just HTTP fetch + JSON parse.
 *
 * Search: Use path-style URL /Company+Name which returns search results
 * with direct links. The ?q= search endpoint returns broken results for
 * multi-word German company names.
 *
 * Direct: If HRB number is provided, construct the direct URL pattern.
 */

const HRB_RE = /^(HRA|HRB|GnR|PR|VR)\s?\d+\s?[A-Z]?$/i;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function findHrb(input: string): string | null {
  const match = input.match(/(HRA|HRB|GnR|PR|VR)\s?\d+\s?[A-Z]?/i);
  return match ? match[0].trim() : null;
}

interface NorthdataCompany {
  company_name: string | null;
  registration_number: string | null;
  business_type: string | null;
  address: string | null;
  registration_date: string | null;
  status: string;
  industry: string | null;
  directors: string | null;
}

/** Extract JSON-LD company data from a northdata.com page */
function extractJsonLd(html: string): NorthdataCompany {
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

  // Extract all JSON-LD blocks
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

        // Extract directors from members
        if (Array.isArray(data.member) && data.member.length > 0) {
          const directors = data.member
            .filter((m: Record<string, unknown>) => m.jobTitle)
            .map((m: Record<string, unknown>) => `${m.name} (${m.jobTitle})`)
            .slice(0, 10);
          result.directors = directors.length > 0 ? directors.join("; ") : null;
        }
      }
    } catch {
      // Skip invalid JSON-LD blocks
    }
  }

  // Extract registration number from meta description or URL
  const hrbMatch = html.match(/(?:Amtsgericht|District Court)[^<]*?(HRB?\s*\d+)/i)
    || html.match(/(HRB?\s*\d+)/);
  if (hrbMatch) result.registration_number = hrbMatch[1].trim();

  // Extract business type from the company name
  if (result.company_name) {
    const typeMatch = result.company_name.match(/(GmbH|AG|SE|KG|OHG|eG|e\.V\.|KGaA|GmbH & Co\. KG|UG)/i);
    result.business_type = typeMatch ? typeMatch[1] : null;
  }

  // If we found a company name, mark as active (northdata shows dissolved companies differently)
  if (result.company_name) {
    result.status = html.includes("dissolved") || html.includes("aufgelöst") || html.includes("gelöscht") ? "dissolved" : "active";
  }

  // Extract industry from breadcrumb JSON-LD
  for (const block of blocks) {
    try {
      const jsonStr = block.replace(/<script type="application\/ld\+json">/, "").replace(/<\/script>/, "");
      const data = JSON.parse(jsonStr);
      if (data["@type"] === "BreadcrumbList" && Array.isArray(data.itemListElement)) {
        const industry = data.itemListElement.find(
          (item: Record<string, unknown>) =>
            typeof item === "object" && (item as Record<string, unknown>).position === 2,
        );
        if (industry?.item?.name) {
          result.industry = industry.item.name;
        }
      }
    } catch {}
  }

  return result;
}

/** Search northdata.com for a German company and return the profile URL */
async function searchCompany(query: string): Promise<string | null> {
  // Path-style search (not ?q= which returns broken results for German names)
  const searchUrl = `https://www.northdata.com/${encodeURIComponent(query)}`;
  const resp = await fetch(searchUrl, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    signal: AbortSignal.timeout(10000),
    redirect: "follow",
  });

  if (!resp.ok) return null;
  const html = await resp.text();

  // If this page IS a company page (not a search page), return it directly
  if (html.includes('"@type" : "LocalBusiness"') || html.includes('"@type":"LocalBusiness"')) {
    return html as unknown as string; // Return HTML directly for extraction
  }

  // Parse search results — find the first German company
  const results = html.matchAll(/class="title" href="([^"]+)">([^<]+)</g);
  for (const match of results) {
    const [, href, title] = match;
    if (title.includes("Germany") || title.includes("Deutschland")) {
      return href; // Return the relative URL to follow
    }
  }

  // If no German result, return the first result
  const firstResult = html.match(/class="title" href="([^"]+)">/);
  return firstResult ? firstResult[1] : null;
}

/** Fetch a northdata.com company profile page and extract data */
async function fetchCompanyPage(url: string): Promise<string> {
  const fullUrl = url.startsWith("http") ? url : `https://www.northdata.com${url}`;
  const resp = await fetch(fullUrl, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    signal: AbortSignal.timeout(10000),
    redirect: "follow",
  });

  if (!resp.ok) throw new Error(`northdata.com returned HTTP ${resp.status}`);
  return resp.text();
}

registerCapability("german-company-data", async (input: CapabilityInput) => {
  const raw = (input.hrb_number as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'hrb_number' or 'company_name' is required. Provide a Handelsregister number (e.g. HRB 86891) or company name.");
  }

  const trimmed = raw.trim();
  const hrb = findHrb(trimmed);
  let html: string;

  if (hrb) {
    // Try direct search with HRB number
    const searchResult = await searchCompany(hrb);
    if (!searchResult) {
      throw new Error(`No German company found for registration number "${hrb}".`);
    }
    // searchCompany may return HTML directly (if it landed on a company page)
    // or a URL path to follow
    if (searchResult.includes("<!DOCTYPE") || searchResult.includes("<html")) {
      html = searchResult;
    } else {
      html = await fetchCompanyPage(searchResult);
    }
  } else {
    // Name-based search
    const searchResult = await searchCompany(trimmed);
    if (!searchResult) {
      throw new Error(`No German company found matching "${trimmed}".`);
    }
    if (searchResult.includes("<!DOCTYPE") || searchResult.includes("<html")) {
      html = searchResult;
    } else {
      html = await fetchCompanyPage(searchResult);
    }
  }

  const output = extractJsonLd(html) as unknown as Record<string, unknown>;

  if (!output.company_name) {
    throw new Error(`Could not extract company data for "${trimmed}" from northdata.com. The company may not be in the register, or the page structure may have changed.`);
  }

  return {
    output,
    provenance: {
      source: "northdata.com",
      fetched_at: new Date().toISOString(),
    },
  };
});
