import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * US SEC filings extended search via sec-api.io.
 *
 * Vendor: sec-api.io — paid SEC filings index covering 10-K, 10-Q, 8-K,
 * S-1, proxy, insider Form 4, and full-text search across the EDGAR
 * corpus. Selection per DEC-20260430-A as a $49/mo supplement to the
 * free SEC EDGAR API (which us-company-data uses).
 *
 * Use cases beyond raw EDGAR:
 *   - Full-text search across filing bodies (find a name buried in a 10-K)
 *   - Filing-event monitoring (recent 8-K material events)
 *   - Cross-form aggregation (all filings for a CIK in one call)
 *
 * Activation: requires SEC_API_IO_TOKEN in env. Subscribe at
 * https://sec-api.io and configure the API key.
 *
 * Two input modes:
 *   1. cik (10-digit Central Index Key): exact entity lookup
 *   2. company_name + optional form_type: name-based filing search
 */

const SEC_API = "https://api.sec-api.io";

registerCapability("us-sec-filings-extended", async (input: CapabilityInput) => {
  const token = process.env.SEC_API_IO_TOKEN;
  if (!token) {
    throw new Error(
      "SEC_API_IO_TOKEN is required for sec-api.io. Subscribe at https://sec-api.io and configure the token.",
    );
  }

  const cik = ((input.cik as string) ?? "").trim();
  const companyName = ((input.company_name as string) ?? (input.business_name as string) ?? "").trim();
  const formType = ((input.form_type as string) ?? "").trim();
  const sinceDate = ((input.since_date as string) ?? "").trim();
  const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 100);

  if (!cik && !companyName) {
    throw new Error("'cik' or 'company_name' is required.");
  }

  // sec-api.io uses Lucene-style query syntax via POST
  const queryParts: string[] = [];
  if (cik) queryParts.push(`cik:${cik.replace(/^0+/, "")}`);
  if (companyName) queryParts.push(`companyName:"${companyName.replace(/"/g, "")}"`);
  if (formType) queryParts.push(`formType:"${formType}"`);
  if (sinceDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sinceDate)) {
      throw new Error(`Invalid since_date: "${sinceDate}". Must be ISO date YYYY-MM-DD.`);
    }
    queryParts.push(`filedAt:[${sinceDate} TO *]`);
  }

  const body = {
    query: { query_string: { query: queryParts.join(" AND ") } },
    from: "0",
    size: String(limit),
    sort: [{ filedAt: { order: "desc" } }],
  };

  const res = await fetch(`${SEC_API}?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(`sec-api.io rejected the token (HTTP ${res.status}). Verify SEC_API_IO_TOKEN.`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`sec-api.io returned HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as { total?: { value?: number } | number; filings?: any[] };
  const total = typeof data.total === "object" ? (data.total?.value ?? 0) : (data.total ?? 0);
  const filings = data.filings ?? [];

  return {
    output: {
      query: cik ? `cik:${cik}` : companyName,
      cik: cik || null,
      company_name: companyName || null,
      form_type_filter: formType || null,
      total_matches: total,
      returned_count: filings.length,
      most_recent_filing_date: filings[0]?.filedAt ?? null,
      most_recent_8k_date: filings.find((f: any) => f.formType === "8-K")?.filedAt ?? null,
      filings: filings.slice(0, limit).map((f: any) => ({
        accession_no: f.accessionNo ?? null,
        cik: f.cik ?? null,
        company_name: f.companyName ?? null,
        ticker: f.ticker ?? null,
        form_type: f.formType ?? null,
        filed_at: f.filedAt ?? null,
        period_of_report: f.periodOfReport ?? null,
        link_to_filing: f.linkToFilingDetails ?? f.linkToHtml ?? null,
      })),
      data_source: "sec-api.io (extended SEC EDGAR index)",
    },
    provenance: {
      source: "sec-api.io",
      fetched_at: new Date().toISOString(),
      acquisition_method: "vendor_aggregation" as const,
      upstream_vendor: "sec-api.io",
      attribution: "SEC EDGAR data via sec-api.io",
    },
  };
});
