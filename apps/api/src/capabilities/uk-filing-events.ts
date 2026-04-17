import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * UK Filing Events — company filings from Companies House.
 *
 * Returns recent filing history for a UK company: accounts, annual returns,
 * officer changes, charges, confirmation statements, etc.
 *
 * Free API, requires API key (free registration).
 * Data source: Companies House Public Data API (developer.company-information.service.gov.uk)
 */

const CH_API = "https://api.company-information.service.gov.uk";

const FILING_CATEGORIES: Record<string, string> = {
  accounts: "Annual accounts filing",
  "annual-return": "Annual return / confirmation statement",
  "confirmation-statement": "Confirmation statement",
  "capital": "Capital-related filing",
  "change-of-name": "Company name change",
  "incorporation": "Incorporation document",
  "liquidation": "Liquidation-related filing",
  "miscellaneous": "Miscellaneous filing",
  "mortgage": "Charge/mortgage filing",
  officers: "Officer appointment or resignation",
  resolution: "Company resolution",
  "persons-with-significant-control": "PSC (beneficial ownership) change",
};

async function searchCompany(query: string, apiKey: string): Promise<{ number: string; name: string } | null> {
  const url = `${CH_API}/search/companies?q=${encodeURIComponent(query)}&items_per_page=1`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(apiKey + ":").toString("base64")}`,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) return null;
  const data = await resp.json() as any;
  const item = data?.items?.[0];
  return item ? { number: item.company_number, name: item.title } : null;
}

registerCapability("uk-filing-events", async (input: CapabilityInput) => {
  const companyNumber = (input.company_number as string)?.trim() ?? "";
  const companyName = (input.company_name as string)?.trim() ?? "";
  const maxEvents = Math.min(Number(input.max_events) || 15, 30);

  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  if (!apiKey) {
    throw new Error("COMPANIES_HOUSE_API_KEY is required. Register for free at https://developer.company-information.service.gov.uk/");
  }

  const query = companyNumber || companyName;
  if (!query || query.length < 2) {
    throw new Error("Provide 'company_number' (e.g. 00445790) or 'company_name' (e.g. Rolls-Royce) to look up UK filing events.");
  }

  // Resolve company name to number if needed
  let resolvedNumber = companyNumber;
  let resolvedName = companyName;

  if (!resolvedNumber) {
    const found = await searchCompany(companyName, apiKey);
    if (!found) {
      throw new Error(`No UK company found matching "${companyName}". Try a more specific name or provide the Companies House number directly.`);
    }
    resolvedNumber = found.number;
    resolvedName = found.name;
  }

  // Fetch filing history
  const filingsUrl = `${CH_API}/company/${resolvedNumber}/filing-history?items_per_page=${maxEvents}`;
  const filingsResp = await fetch(filingsUrl, {
    headers: {
      Authorization: `Basic ${Buffer.from(apiKey + ":").toString("base64")}`,
    },
    signal: AbortSignal.timeout(10000),
  });

  if (filingsResp.status === 404) {
    throw new Error(`UK company ${resolvedNumber} not found in Companies House.`);
  }
  if (filingsResp.status === 401 || filingsResp.status === 403) {
    throw new Error(`Companies House API denied the request (HTTP ${filingsResp.status}). The COMPANIES_HOUSE_API_KEY may be invalid or rate-limited.`);
  }
  if (filingsResp.status === 429) {
    throw new Error(`Companies House API is rate-limiting requests (HTTP 429). Please try again in a few minutes.`);
  }
  if (filingsResp.status >= 500) {
    throw new Error(`Companies House API returned a server error (HTTP ${filingsResp.status}). This is usually transient — please try again in a few minutes.`);
  }
  if (!filingsResp.ok) {
    throw new Error(`Companies House API returned an unexpected response (HTTP ${filingsResp.status}).`);
  }

  const filingsData = await filingsResp.json() as any;

  // Also fetch company profile for context
  const profileResp = await fetch(`${CH_API}/company/${resolvedNumber}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(apiKey + ":").toString("base64")}`,
    },
    signal: AbortSignal.timeout(10000),
  });
  const profile = profileResp.ok ? await profileResp.json() as any : null;

  const filings = (filingsData.items || []).map((item: any) => ({
    date: item.date || null,
    type: item.type || null,
    category: item.category || null,
    category_description: FILING_CATEGORIES[item.category] || item.category || null,
    description: item.description || null,
    description_values: item.description_values || null,
    paper_filed: item.paper_filed || false,
    filing_url: item.links?.document_metadata
      ? `https://find-and-update.company-information.service.gov.uk${item.links.document_metadata}`
      : null,
  }));

  return {
    output: {
      company_name: profile?.company_name || resolvedName,
      company_number: resolvedNumber,
      company_status: profile?.company_status || null,
      company_type: profile?.type || null,
      incorporated: profile?.date_of_creation || null,
      sic_codes: profile?.sic_codes || null,
      registered_address: profile?.registered_office_address
        ? [
            profile.registered_office_address.address_line_1,
            profile.registered_office_address.address_line_2,
            profile.registered_office_address.locality,
            profile.registered_office_address.postal_code,
          ].filter(Boolean).join(", ")
        : null,
      total_filings: filingsData.total_count || null,
      events_returned: filings.length,
      filings,
    },
    provenance: {
      source: "UK Companies House (developer.company-information.service.gov.uk)",
      fetched_at: new Date().toISOString(),
    },
  };
});
