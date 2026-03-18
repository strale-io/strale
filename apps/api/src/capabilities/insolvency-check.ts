import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("insolvency-check", async (input: CapabilityInput) => {
  const companyName = ((input.company_name as string) ?? (input.name as string) ?? (input.task as string) ?? "").trim();
  const countryCode = ((input.country_code as string) ?? (input.country as string) ?? "").trim().toUpperCase();
  const companyNumber = ((input.company_number as string) ?? "").trim() || undefined;

  if (!companyName && !companyNumber) {
    throw new Error("'company_name' or 'company_number' is required.");
  }
  if (!countryCode || countryCode.length !== 2) {
    throw new Error("'country_code' is required (ISO 2-letter code).");
  }

  // UK — Companies House insolvency endpoint
  if (countryCode === "GB" || countryCode === "UK") {
    const chKey = process.env.COMPANIES_HOUSE_API_KEY;
    if (!chKey) {
      throw new Error("COMPANIES_HOUSE_API_KEY is required for UK insolvency checks.");
    }

    // If no company number, search for the company first
    let number = companyNumber;
    if (!number && companyName) {
      const searchUrl = `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(companyName)}&items_per_page=1`;
      const searchRes = await fetch(searchUrl, {
        headers: {
          Authorization: `Basic ${Buffer.from(chKey + ":").toString("base64")}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (searchRes.ok) {
        const searchData = (await searchRes.json()) as any;
        number = searchData.items?.[0]?.company_number;
      }
    }

    if (!number) {
      return {
        output: {
          query: companyName || companyNumber,
          country_code: "GB",
          supported_country: true,
          has_insolvency_proceedings: null,
          proceedings: [],
          error: "Company not found in Companies House.",
          data_source: "companies-house-uk",
        },
        provenance: { source: "companies-house-uk", fetched_at: new Date().toISOString() },
      };
    }

    const url = `https://api.company-information.service.gov.uk/company/${encodeURIComponent(number)}/insolvency`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(chKey + ":").toString("base64")}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 404) {
      return {
        output: {
          query: companyName || companyNumber,
          company_number: number,
          country_code: "GB",
          supported_country: true,
          has_insolvency_proceedings: false,
          proceedings: [],
          data_source: "companies-house-uk",
        },
        provenance: { source: "companies-house-uk", fetched_at: new Date().toISOString() },
      };
    }

    if (!res.ok) {
      throw new Error(`Companies House error: HTTP ${res.status}`);
    }

    const data = (await res.json()) as any;
    const cases = data.cases ?? [];

    return {
      output: {
        query: companyName || companyNumber,
        company_number: number,
        country_code: "GB",
        supported_country: true,
        has_insolvency_proceedings: cases.length > 0,
        proceedings: cases.map((c: any) => ({
          type: c.type ?? null,
          date_started: c.dates?.[0]?.date ?? null,
          date_ended: null,
          status: c.status ?? (c.dates?.length > 0 ? "active" : "unknown"),
          practitioners: (c.practitioners ?? []).map((p: any) => ({
            name: p.name ?? null,
            role: p.role ?? null,
            appointed_on: p.appointed_on ?? null,
          })),
        })),
        data_source: "companies-house-uk",
      },
      provenance: { source: "companies-house-uk", fetched_at: new Date().toISOString() },
    };
  }

  // Unsupported countries
  return {
    output: {
      query: companyName || companyNumber,
      country_code: countryCode,
      supported_country: false,
      has_insolvency_proceedings: null,
      proceedings: [],
      message: `Insolvency checks are not yet available for '${countryCode}'. Currently supported: GB (UK via Companies House).`,
      data_source: null,
    },
    provenance: { source: "strale-insolvency-engine", fetched_at: new Date().toISOString() },
  };
});
