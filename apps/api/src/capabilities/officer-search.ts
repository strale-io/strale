import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * Officer Search — find company directors and officers from public registries.
 *
 * Sources:
 * - UK: Companies House officers API (free, requires API key)
 * - US: SEC EDGAR submissions (free, no auth)
 *
 * The northdata.com EU fallback was removed under DEC-20260427-I (commercial
 * KYB-aggregator scraping ban). EU coverage will be reinstated when a licensed
 * source for officer data lands.
 *
 * Returns officer names, roles, appointment dates from official public records.
 */

const UA = "Strale/1.0 hello@strale.io";

interface Officer {
  name: string;
  role: string;
  appointed?: string | null;
  resigned?: string | null;
  nationality?: string | null;
}

async function searchUkOfficers(companyNumber: string): Promise<{ company: string; officers: Officer[] } | null> {
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  if (!apiKey) return null;

  const resp = await fetch(
    `https://api.company-information.service.gov.uk/company/${companyNumber}/officers?items_per_page=20`,
    {
      headers: { Authorization: `Basic ${Buffer.from(apiKey + ":").toString("base64")}` },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!resp.ok) return null;

  const data = await resp.json() as any;
  const officers: Officer[] = (data.items || []).map((o: any) => ({
    name: o.name || "",
    role: o.officer_role || "",
    appointed: o.appointed_on || null,
    resigned: o.resigned_on || null,
    nationality: o.nationality || null,
  }));

  // Get company name
  const profileResp = await fetch(
    `https://api.company-information.service.gov.uk/company/${companyNumber}`,
    {
      headers: { Authorization: `Basic ${Buffer.from(apiKey + ":").toString("base64")}` },
      signal: AbortSignal.timeout(10000),
    },
  );
  const profile = profileResp.ok ? await profileResp.json() as any : null;

  return { company: profile?.company_name || companyNumber, officers };
}

async function searchUsOfficers(query: string): Promise<{ company: string; officers: Officer[] } | null> {
  // Load tickers list to resolve company name to CIK
  const tickersResp = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(10000),
  });
  if (!tickersResp.ok) return null;
  const tickers = await tickersResp.json() as Record<string, { cik_str: string; ticker: string; title: string }>;

  const queryLower = query.toLowerCase();
  let match: { cik_str: string; title: string } | null = null;
  for (const v of Object.values(tickers)) {
    if (v.ticker.toLowerCase() === queryLower || v.title.toLowerCase().includes(queryLower)) {
      match = v;
      break;
    }
  }
  if (!match) return null;

  const cik = String(match.cik_str).padStart(10, "0");
  const subResp = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(10000),
  });
  if (!subResp.ok) return null;
  const subData = await subResp.json() as any;

  // SEC doesn't have a direct officers endpoint, but filings contain officer info
  // The company entity data has some officer names
  const officers: Officer[] = [];

  // Check for officer names in recent 8-K filings (item 5.02 = officer changes)
  const recent = subData.filings?.recent || {};
  const forms = recent.form || [];
  const items = recent.items || [];
  const dates = recent.filingDate || [];

  for (let i = 0; i < forms.length && officers.length < 10; i++) {
    if (forms[i] === "8-K" && String(items[i]).includes("5.02")) {
      officers.push({
        name: "(see filing for details)",
        role: "Officer change reported",
        appointed: dates[i] || null,
      });
    }
  }

  return { company: subData.name || match.title, officers };
}

async function searchCompanyHouseByName(name: string): Promise<string | null> {
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  if (!apiKey) return null;
  const resp = await fetch(
    `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(name)}&items_per_page=1`,
    {
      headers: { Authorization: `Basic ${Buffer.from(apiKey + ":").toString("base64")}` },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!resp.ok) return null;
  const data = await resp.json() as any;
  return data?.items?.[0]?.company_number || null;
}

registerCapability("officer-search", async (input: CapabilityInput) => {
  const companyName = (input.company_name as string)?.trim() ?? "";
  const country = (input.country as string)?.trim().toUpperCase() ?? "";
  const companyNumber = (input.company_number as string)?.trim() ?? "";
  const task = (input.task as string)?.trim() ?? "";

  const query = companyName || companyNumber || task;
  if (!query || query.length < 2) {
    throw new Error("Provide 'company_name' and optionally 'country' (ISO 2-letter code) to search for company officers.");
  }

  let result: { company: string; officers: Officer[] } | null = null;
  let source = "";

  // Route by country
  if (country === "GB" || country === "UK" || (!country && companyNumber)) {
    const number = companyNumber || await searchCompanyHouseByName(query);
    if (number) {
      result = await searchUkOfficers(number);
      source = "UK Companies House";
    }
  }

  if (!result && (country === "US" || !country)) {
    result = await searchUsOfficers(query);
    if (result) source = "SEC EDGAR";
  }

  if (!result || result.officers.length === 0) {
    throw new Error(
      `No officers found for "${query}"${country ? ` in ${country}` : ""}. ` +
        "officer-search currently covers UK (Companies House) and US (SEC EDGAR) only. " +
        "EU coverage was removed under DEC-20260427-I and will be reinstated when a licensed source lands.",
    );
  }

  const activeOfficers = result.officers.filter(o => !o.resigned);
  const formerOfficers = result.officers.filter(o => o.resigned);

  return {
    output: {
      company_name: result.company,
      country: country || null,
      source,
      total_officers: result.officers.length,
      active_officers: activeOfficers.length,
      officers: activeOfficers,
      former_officers: formerOfficers.slice(0, 5),
    },
    provenance: {
      source: `officer-search:${source}`,
      fetched_at: new Date().toISOString(),
    },
  };
});
