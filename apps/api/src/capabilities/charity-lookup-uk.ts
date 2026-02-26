import { registerCapability, type CapabilityInput } from "./index.js";

// Charity Commission for England and Wales — free, no API key required
const API = "https://api.charitycommission.gov.uk/register/api";

registerCapability("charity-lookup-uk", async (input: CapabilityInput) => {
  const raw = ((input.charity_number as string) ?? (input.name as string) ?? (input.task as string) ?? "").trim();
  if (!raw) throw new Error("'charity_number' or 'name' is required.");

  const isNumber = /^\d{5,8}$/.test(raw);

  if (isNumber) {
    // Direct lookup by registration number
    const url = `${API}/allcharitydetails/${raw}/0`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      // Fallback: try the search endpoint
      return searchCharity(raw);
    }

    const data = (await response.json()) as any;
    return formatCharity(data);
  }

  return searchCharity(raw);
});

async function searchCharity(term: string) {
  // Use the search/filter charity API
  const url = `${API}/SearchCharities?searchText=${encodeURIComponent(term)}&pageNumber=1&pageSize=5`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    // Fallback: try alternate endpoint format
    const altUrl = `https://register-of-charities.charitycommission.gov.uk/api/charities?query=${encodeURIComponent(term)}&pageNumber=1&pageSize=5`;
    const altResponse = await fetch(altUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!altResponse.ok) throw new Error(`Charity Commission API returned HTTP ${altResponse.status}. Search: "${term}"`);
    const altData = (await altResponse.json()) as any;
    const items = Array.isArray(altData) ? altData : altData?.items ?? altData?.charities ?? [];
    if (items.length === 0) throw new Error(`No charity found matching "${term}".`);

    return {
      output: {
        search_term: term,
        results_count: items.length,
        charities: items.slice(0, 5),
      },
      provenance: { source: "charitycommission.gov.uk", fetched_at: new Date().toISOString() },
    };
  }

  const data = (await response.json()) as any;
  const items = Array.isArray(data) ? data : data?.items ?? data?.charities ?? [];
  if (items.length === 0) throw new Error(`No charity found matching "${term}".`);

  if (items.length === 1) return formatCharity(items[0]);

  return {
    output: {
      search_term: term,
      results_count: items.length,
      charities: items.slice(0, 5).map((c: any) => ({
        name: c.charity_name ?? c.CharityName ?? c.name,
        number: c.registered_charity_number ?? c.RegisteredCharityNumber ?? c.charity_number,
        status: c.charity_registration_status ?? c.RegistrationStatus ?? c.status,
      })),
    },
    provenance: { source: "charitycommission.gov.uk", fetched_at: new Date().toISOString() },
  };
}

function formatCharity(data: any) {
  return {
    output: {
      charity_name: data.charity_name ?? data.CharityName ?? data.name ?? null,
      charity_number: data.registered_charity_number ?? data.RegisteredCharityNumber ?? data.charity_number ?? null,
      status: data.charity_registration_status ?? data.RegistrationStatus ?? data.status ?? null,
      date_of_registration: data.date_of_registration ?? data.RegistrationDate ?? null,
      date_of_removal: data.date_of_removal ?? data.RemovalDate ?? null,
      activities: data.charity_activities ?? data.Activities ?? null,
      income: data.latest_income ?? data.LatestIncome ?? null,
      expenditure: data.latest_expenditure ?? data.LatestExpenditure ?? null,
      address: data.charity_contact_address ?? data.Address ?? null,
      phone: data.charity_contact_phone ?? data.Phone ?? null,
      email: data.charity_contact_email ?? data.Email ?? null,
      website: data.charity_contact_web ?? data.Website ?? null,
    },
    provenance: { source: "charitycommission.gov.uk", fetched_at: new Date().toISOString() },
  };
}
