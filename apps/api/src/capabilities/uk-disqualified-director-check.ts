import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * UK disqualified director check — Companies House Disqualified Officers
 * register. Official, free API (requires the same COMPANIES_HOUSE_API_KEY
 * already used by insolvency-check.ts, officer-search.ts, and
 * uk-company-data.ts — no new credential to provision).
 *
 * Two modes, deliberately kept separate to avoid misattributing a serious
 * negative finding to the wrong person:
 *
 *  - search mode (`name` given): returns CANDIDATE matches only — name,
 *    date of birth, address snippet. It does NOT auto-fetch full
 *    disqualification detail for a "best guess" match, because disqualified-
 *    officer names are not unique (common-name collision risk is exactly the
 *    failure mode documented in the registry-name-search lesson — taking
 *    result[0] on a name search has produced wrong-entity answers before).
 *    The caller disambiguates using date_of_birth/address, then re-calls in
 *    detail mode with the chosen officer_id.
 *
 *  - detail mode (`officer_id` given): fetches the full disqualification
 *    record for that specific, already-identified person.
 *
 * GDPR Art. 22 classification: screening_signal — this returns candidate
 * matches / findings for the customer to evaluate, not a resolved verdict
 * about a specific named individual (per DEC-20260428-B).
 *
 * API docs: https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api
 */

const CH_API = "https://api.company-information.service.gov.uk";

function authHeader(key: string): string {
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

function extractOfficerId(selfLink: string | undefined): string | null {
  if (!selfLink) return null;
  // e.g. /disqualified-officers/natural/AbC123xYZ
  const parts = selfLink.split("/").filter(Boolean);
  return parts[parts.length - 1] || null;
}

registerCapability("uk-disqualified-director-check", async (input: CapabilityInput) => {
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  if (!apiKey) {
    throw new Error("COMPANIES_HOUSE_API_KEY is required for UK disqualified-director checks.");
  }

  const name = ((input.name as string) ?? (input.task as string) ?? "").trim();
  const officerId = ((input.officer_id as string) ?? "").trim();

  if (!officerId && name.length < 2) {
    throw new Error("Provide 'name' (minimum 2 characters) to search, or 'officer_id' to fetch a specific disqualification record.");
  }

  if (officerId) {
    // ─── Detail mode ──────────────────────────────────────────────────────
    const cleanId = officerId.replace(/^\/?disqualified-officers\/natural\//, "");
    const url = `${CH_API}/disqualified-officers/natural/${encodeURIComponent(cleanId)}`;
    const response = await fetch(url, {
      headers: { Authorization: authHeader(apiKey), Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (response.status === 404) {
      return {
        output: {
          mode: "detail",
          officer_id: cleanId,
          found: false,
          message: "No disqualification record found for this officer_id.",
        },
        provenance: { source: "companies-house-uk", fetched_at: new Date().toISOString() },
      };
    }
    if (!response.ok) {
      throw new Error(`Companies House disqualified-officers API returned HTTP ${response.status}.`);
    }

    const data = (await response.json()) as any;
    const disqualifications = Array.isArray(data.disqualifications) ? data.disqualifications : [];

    return {
      output: {
        mode: "detail",
        officer_id: cleanId,
        found: true,
        name: [data.title, data.forename, data.other_forenames, data.surname].filter(Boolean).join(" ") || null,
        date_of_birth: data.date_of_birth ?? null,
        nationality: data.nationality ?? null,
        disqualification_count: disqualifications.length,
        disqualifications: disqualifications.map((d: any) => ({
          case_identifier: d.case_identifier ?? null,
          court_name: d.court_name ?? null,
          disqualification_type: d.disqualification_type ?? null,
          disqualified_from: d.disqualified_from ?? null,
          disqualified_until: d.disqualified_until ?? null,
          heard_on: d.heard_on ?? null,
          undertaken_on: d.undertaken_on ?? null,
          company_names: Array.isArray(d.company_names) ? d.company_names : [],
          reason: d.reason
            ? {
                act: d.reason.act ?? null,
                section: d.reason.section ?? null,
                description_identifier: d.reason.description_identifier ?? null,
              }
            : null,
        })),
      },
      provenance: {
        source: "companies-house-uk",
        fetched_at: new Date().toISOString(),
        upstream_vendor: "UK Companies House (Insolvency Service disqualification data)",
        acquisition_method: "official_api",
        primary_source_reference: "https://www.gov.uk/government/publications/disqualified-director-searches",
      },
    };
  }

  // ─── Search mode ──────────────────────────────────────────────────────
  const searchUrl = `${CH_API}/search/disqualified-officers?q=${encodeURIComponent(name)}&items_per_page=10`;
  const response = await fetch(searchUrl, {
    headers: { Authorization: authHeader(apiKey), Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Companies House disqualified-officers search returned HTTP ${response.status}.`);
  }

  const data = (await response.json()) as any;
  const items: any[] = Array.isArray(data.items) ? data.items : [];

  return {
    output: {
      mode: "search",
      query: name,
      total_results: Number(data.total_results) || items.length,
      candidates: items.map((item) => ({
        officer_id: extractOfficerId(item.links?.self),
        name: item.title ?? null,
        date_of_birth: item.date_of_birth ?? null,
        address_snippet: item.address_snippet ?? null,
        snippet: item.snippet ?? null,
      })),
    },
    provenance: {
      source: "companies-house-uk",
      fetched_at: new Date().toISOString(),
      upstream_vendor: "UK Companies House (Insolvency Service disqualification data)",
      acquisition_method: "official_api",
      primary_source_reference: "https://www.gov.uk/government/publications/disqualified-director-searches",
    },
  };
});
