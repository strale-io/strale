import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * US federal court records search via CourtListener + RECAP (Free Law
 * Project). Returns dockets matching the query — civil litigation,
 * bankruptcy, criminal, IP, etc. across federal district + appellate
 * courts.
 *
 * Vendor: CourtListener (courtlistener.com) — non-profit, free public
 * data; commercial use permitted under their terms. Token-gated as of
 * 2025 policy change (anonymous access blocked); free signup at
 * courtlistener.com/sign-up generates a token immediately.
 *
 * Selection per DEC-20260430-A. Pairs with sec-api.io (extended SEC
 * filings) and Docket Alarm (PAYG federal/state docket coverage).
 *
 * Activation: requires COURTLISTENER_API_TOKEN in env. Sign up at
 * https://www.courtlistener.com/sign-up/ and copy the token from your
 * profile page (format: 40-char hex string).
 *
 * Two query modes:
 *   1. Search by case_name / party_name across all dockets.
 *   2. Filter by court_type=bankruptcy to get only bankruptcy filings
 *      (focused query for Payee Assurance risk decisions).
 */

const CL_API = "https://www.courtlistener.com/api/rest/v3";

registerCapability("us-court-search", async (input: CapabilityInput) => {
  const token = process.env.COURTLISTENER_API_TOKEN;
  if (!token) {
    throw new Error(
      "COURTLISTENER_API_TOKEN is required. Sign up at https://www.courtlistener.com/sign-up/ (free, instant) and copy the token from your profile page.",
    );
  }

  const query = ((input.query as string) ?? (input.party_name as string) ?? (input.company_name as string) ?? "").trim();
  if (!query) {
    throw new Error("'query' (or 'party_name' / 'company_name') is required.");
  }

  const courtTypeFilter = ((input.court_type as string) ?? "").trim().toLowerCase();
  const sinceDate = ((input.since_date as string) ?? "").trim();
  const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 100);

  const params = new URLSearchParams({
    q: query,
    type: "r", // RECAP dockets (federal civil/criminal/bankruptcy)
    order_by: "dateFiled desc",
  });
  if (sinceDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sinceDate)) {
      throw new Error(`Invalid since_date: "${sinceDate}". Must be ISO date YYYY-MM-DD.`);
    }
    params.set("filed_after", sinceDate);
  }

  const res = await fetch(`${CL_API}/search/?${params.toString()}`, {
    headers: {
      Authorization: `Token ${token}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(`CourtListener rejected the token (HTTP ${res.status}). Verify COURTLISTENER_API_TOKEN.`);
  }
  if (!res.ok) {
    throw new Error(`CourtListener returned HTTP ${res.status}`);
  }

  const data = (await res.json()) as { count?: number; results?: any[] };
  const allResults = data.results ?? [];

  // Optional client-side filter for bankruptcy court types.
  // CourtListener's `court` field is a court ID like "txnb" (TX Northern
  // Bankruptcy); bankruptcy IDs commonly end in "b" (e.g. "casb", "njb").
  const filtered = courtTypeFilter === "bankruptcy"
    ? allResults.filter((r) => /(bankr|^.+b$)/i.test(r.court ?? ""))
    : allResults;

  const results = filtered.slice(0, limit);

  // Bankruptcy detection — does the result set include any bankruptcy court entries?
  const bankruptcyCases = allResults.filter((r) => /(bankr|^.+b$)/i.test(r.court ?? ""));
  const hasBankruptcyFiling = bankruptcyCases.length > 0;

  return {
    output: {
      query,
      court_type_filter: courtTypeFilter || null,
      total_matches: data.count ?? allResults.length,
      returned_count: results.length,
      has_bankruptcy_filing: hasBankruptcyFiling,
      bankruptcy_count: bankruptcyCases.length,
      most_recent_filing_date: results[0]?.dateFiled ?? null,
      most_recent_bankruptcy:
        bankruptcyCases[0]
          ? {
              case_name: bankruptcyCases[0].caseName ?? bankruptcyCases[0].caseNameShort ?? null,
              court: bankruptcyCases[0].court ?? null,
              court_id: bankruptcyCases[0].court_id ?? null,
              date_filed: bankruptcyCases[0].dateFiled ?? null,
              docket_number: bankruptcyCases[0].docketNumber ?? null,
              absolute_url: bankruptcyCases[0].absolute_url ? `https://www.courtlistener.com${bankruptcyCases[0].absolute_url}` : null,
            }
          : null,
      cases: results.map((r) => ({
        case_name: r.caseName ?? r.caseNameShort ?? null,
        court: r.court ?? null,
        court_id: r.court_id ?? null,
        date_filed: r.dateFiled ?? null,
        docket_number: r.docketNumber ?? null,
        nature_of_suit: r.suitNature ?? null,
        absolute_url: r.absolute_url ? `https://www.courtlistener.com${r.absolute_url}` : null,
      })),
      data_source: "CourtListener + RECAP (Free Law Project)",
    },
    provenance: {
      source: "courtlistener.com",
      fetched_at: new Date().toISOString(),
      acquisition_method: "direct_api" as const,
      license: "Per Free Law Project terms (commercial use permitted)",
    },
  };
});
