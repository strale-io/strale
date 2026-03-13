import { registerCapability, type CapabilityInput } from "./index.js";

// Charity Commission for England and Wales
// Direct lookup by number: findthatcharity.uk (free, no key required)
// Name search: not available via free APIs — returns helpful guidance

registerCapability("charity-lookup-uk", async (input: CapabilityInput) => {
  const raw = ((input.charity_number as string) ?? (input.name as string) ?? (input.task as string) ?? "").trim();
  if (!raw) throw new Error("'charity_number' or 'name' is required.");

  const isNumber = /^\d{5,8}$/.test(raw.replace(/\s/g, ""));

  if (isNumber) {
    return lookupByNumber(raw.replace(/\s/g, ""));
  }

  // Try to look up well-known charity names via findthatcharity.uk search
  return searchByName(raw);
});

async function lookupByNumber(charityNumber: string) {
  // findthatcharity.uk — free, no key, covers England & Wales charities
  const url = `https://findthatcharity.uk/orgid/GB-CHC-${charityNumber}.json`;
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Strale/1.0" },
    signal: AbortSignal.timeout(10000),
  });

  if (response.status === 404) {
    // Try Scottish charities
    const scUrl = `https://findthatcharity.uk/orgid/GB-SC-SC${charityNumber}.json`;
    const scResponse = await fetch(scUrl, {
      headers: { Accept: "application/json", "User-Agent": "Strale/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (scResponse.ok) {
      return formatCharity(await scResponse.json() as Record<string, unknown>);
    }
    throw new Error(`Charity not found with number ${charityNumber}. Verify the charity registration number.`);
  }

  if (!response.ok) {
    throw new Error(`Charity lookup failed. HTTP ${response.status}. Try verifying the charity number at www.gov.uk/find-charity-information`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  return formatCharity(data);
}

async function searchByName(name: string) {
  // Try findthatcharity.uk elasticsearch-backed search
  const url = `https://findthatcharity.uk/api/v1/organisations/?q=${encodeURIComponent(name)}&limit=5`;
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Strale/1.0" },
    signal: AbortSignal.timeout(10000),
  });

  if (response.ok) {
    const data = (await response.json()) as any;
    const results = data?.results ?? data?.hits ?? data?.charities ?? [];
    if (Array.isArray(results) && results.length > 0) {
      return {
        output: {
          search_term: name,
          results_count: results.length,
          charities: results.slice(0, 5).map((c: any) => ({
            name: c.name ?? c.charity_name,
            charity_number: (c.charityNumber ?? c.charity_number ?? c.id ?? "").toString().replace("GB-CHC-", ""),
            status: c.active === false ? "removed" : "registered",
          })),
        },
        provenance: { source: "findthatcharity.uk", fetched_at: new Date().toISOString() },
      };
    }
  }

  // Fallback: The Charity Commission API now requires a subscription key for name search.
  // Return helpful error with guidance.
  throw new Error(
    `Name search is not available via free APIs. To look up a charity by name, visit https://register-of-charities.charitycommission.gov.uk/register/search-results and provide the 'charity_number' for direct lookup.`
  );
}

function formatCharity(data: Record<string, unknown>) {
  const d = data as any;
  return {
    output: {
      charity_name: d.name ?? null,
      charity_number: (d.charityNumber ?? d.id ?? "").toString().replace("GB-CHC-", ""),
      company_number: d.companyNumber ?? null,
      status: d.active === false ? "removed" : "registered",
      date_of_registration: d.dateRegistered ?? null,
      date_of_removal: d.dateRemoved ?? null,
      description: d.description ?? null,
      website: d.url ?? null,
      latest_income: d.latestIncome ?? null,
      latest_spending: d.latestSpending ?? null,
      latest_employees: d.latestEmployees ?? null,
      latest_volunteers: d.latestVolunteers ?? null,
      latest_financial_year_end: d.latestFinancialYearEnd ?? null,
      trustee_count: d.trusteeCount ?? null,
    },
    provenance: { source: "findthatcharity.uk", fetched_at: new Date().toISOString() },
  };
}
