import { registerCapability, type CapabilityInput } from "./index.js";

const CH_API = "https://api.company-information.service.gov.uk";

function getAuthHeader(apiKey: string): string {
  return "Basic " + Buffer.from(apiKey + ":").toString("base64");
}

function parseOwnershipLevel(natures: string[]): string {
  for (const n of natures) {
    if (n.includes("75-to-100")) return "75-100%";
    if (n.includes("50-to-75")) return "50-75%";
    if (n.includes("25-to-50")) return "25-50%";
  }
  if (natures.some((n) => n.includes("significant-influence") || n.includes("right-to-appoint"))) {
    return "significant-influence";
  }
  return "unknown";
}

function pscKindToType(kind: string): "individual" | "corporate" | "legal_person" {
  if (kind.startsWith("corporate-entity")) return "corporate";
  if (kind.startsWith("legal-person")) return "legal_person";
  return "individual";
}

registerCapability("beneficial-ownership-lookup", async (input: CapabilityInput) => {
  const companyName = ((input.company_name as string) ?? (input.name as string) ?? "").trim();
  const companyNumber = ((input.company_number as string) ?? "").trim() || undefined;
  const jurisdiction = ((input.jurisdiction as string) ?? "gb").trim().toLowerCase();

  if (!companyName && !companyNumber) {
    throw new Error("At least one of 'company_name' or 'company_number' is required.");
  }

  if (jurisdiction !== "gb" && jurisdiction !== "uk") {
    return {
      output: {
        company_name: companyName || null,
        company_number: companyNumber ?? null,
        jurisdiction,
        beneficial_owners: [],
        total_beneficial_owners: 0,
        has_psc_data: false,
        error: "Beneficial ownership lookup is currently available for UK companies only. More jurisdictions coming soon.",
        supported_jurisdictions: ["gb"],
      },
      provenance: { source: "none", fetched_at: new Date().toISOString() },
    };
  }

  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  if (!apiKey) {
    throw new Error("COMPANIES_HOUSE_API_KEY is required for beneficial ownership lookup. Configure the environment variable.");
  }

  const authHeader = getAuthHeader(apiKey);
  const headers = { Authorization: authHeader, Accept: "application/json" };

  try {
    // Step 1: Resolve company number
    let resolvedNumber = companyNumber;
    let resolvedName = companyName;

    if (!resolvedNumber) {
      const searchRes = await fetch(
        `${CH_API}/search/companies?q=${encodeURIComponent(companyName)}&items_per_page=5`,
        { headers, signal: AbortSignal.timeout(10000) },
      );

      if (!searchRes.ok) {
        throw new Error(`Companies House search failed: HTTP ${searchRes.status}`);
      }

      const searchData = (await searchRes.json()) as {
        items?: Array<{ company_number: string; title: string; company_status: string }>;
      };
      const items = searchData.items ?? [];

      // Prefer active companies
      const active = items.find((i) => i.company_status === "active");
      const match = active ?? items[0];

      if (!match) {
        throw new Error(`No UK company found matching '${companyName}'.`);
      }

      resolvedNumber = match.company_number;
      resolvedName = match.title;
    }

    // Step 2: Fetch company profile + PSC data in parallel
    const [profileRes, pscRes] = await Promise.all([
      fetch(`${CH_API}/company/${resolvedNumber}`, {
        headers,
        signal: AbortSignal.timeout(10000),
      }),
      fetch(`${CH_API}/company/${resolvedNumber}/persons-with-significant-control`, {
        headers,
        signal: AbortSignal.timeout(10000),
      }),
    ]);

    // Parse company profile
    let companyStatus = "unknown";
    if (profileRes.ok) {
      const profile = (await profileRes.json()) as {
        company_name?: string;
        company_status?: string;
      };
      resolvedName = profile.company_name ?? resolvedName;
      companyStatus = profile.company_status ?? "unknown";
    }

    // Parse PSC data
    if (!pscRes.ok) {
      if (pscRes.status === 404) {
        return {
          output: {
            company_name: resolvedName,
            company_number: resolvedNumber,
            jurisdiction: "gb",
            company_status: companyStatus,
            beneficial_owners: [],
            total_beneficial_owners: 0,
            has_psc_data: false,
            note: "No PSC data filed for this company. It may be exempt (e.g. listed on a regulated market) or filings may be outstanding.",
            data_source: "UK Companies House PSC Register",
          },
          provenance: { source: "company-information.service.gov.uk", fetched_at: new Date().toISOString() },
        };
      }
      throw new Error(`Companies House PSC lookup failed: HTTP ${pscRes.status}`);
    }

    const pscData = (await pscRes.json()) as {
      items?: Array<{
        name: string;
        kind: string;
        nationality?: string;
        country_of_residence?: string;
        date_of_birth?: { month: number; year: number };
        natures_of_control?: string[];
        notified_on?: string;
        ceased_on?: string;
        address?: Record<string, string>;
      }>;
      total_results?: number;
    };

    const items = pscData.items ?? [];

    // Filter out ceased PSCs — only active beneficial owners
    const activePscs = items.filter((item) => !item.ceased_on);

    const beneficialOwners = activePscs.map((item) => ({
      name: item.name,
      type: pscKindToType(item.kind),
      nationality: item.nationality ?? null,
      country_of_residence: item.country_of_residence ?? null,
      date_of_birth: item.date_of_birth
        ? { month: item.date_of_birth.month, year: item.date_of_birth.year }
        : null,
      ownership_level: parseOwnershipLevel(item.natures_of_control ?? []),
      natures_of_control: item.natures_of_control ?? [],
      notified_on: item.notified_on ?? null,
    }));

    return {
      output: {
        company_name: resolvedName,
        company_number: resolvedNumber,
        jurisdiction: "gb",
        company_status: companyStatus,
        beneficial_owners: beneficialOwners,
        total_beneficial_owners: beneficialOwners.length,
        has_psc_data: true,
        data_source: "UK Companies House PSC Register",
      },
      provenance: { source: "company-information.service.gov.uk", fetched_at: new Date().toISOString() },
    };
  } catch (err) {
    console.error("[beneficial-ownership-lookup] Companies House:", err instanceof Error ? err.message : err);

    // If it's a validation error (not found, bad jurisdiction), rethrow
    if (err instanceof Error && (err.message.includes("No UK company found") || err.message.includes("currently available"))) {
      throw err;
    }

    // API failure — throw, don't fall back to LLM
    throw err;
  }
});
