import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * SEC Filing Events — company events from SEC EDGAR 8-K filings.
 *
 * 8-K "current reports" capture material events: leadership changes,
 * funding rounds, acquisitions, material agreements, financial results.
 * Free API, no auth, JSON, real-time updates.
 *
 * Data source: data.sec.gov (submissions API) + efts.sec.gov (full-text search)
 */

const UA = "Strale/1.0 hello@strale.io";

// SEC 8-K item codes → human-readable event types
const ITEM_DESCRIPTIONS: Record<string, string> = {
  "1.01": "Entry into a material definitive agreement",
  "1.02": "Termination of a material definitive agreement",
  "1.03": "Bankruptcy or receivership",
  "1.04": "Mine safety — reporting of shutdowns",
  "2.01": "Completion of acquisition or disposition of assets",
  "2.02": "Results of operations and financial condition",
  "2.03": "Creation of a direct financial obligation",
  "2.04": "Triggering events that accelerate or increase an obligation",
  "2.05": "Costs associated with exit or disposal activities",
  "2.06": "Material impairments",
  "3.01": "Notice of delisting or failure to satisfy listing standards",
  "3.02": "Unregistered sales of equity securities",
  "3.03": "Material modification to rights of security holders",
  "4.01": "Changes in registrant's certifying accountant",
  "4.02": "Non-reliance on previously issued financial statements",
  "5.01": "Changes in control of registrant",
  "5.02": "Departure of directors or officers; election of directors; appointment of officers",
  "5.03": "Amendments to articles of incorporation or bylaws",
  "5.04": "Temporary suspension of trading under employee benefit plans",
  "5.05": "Amendments to code of ethics or waiver",
  "5.06": "Change in shell company status",
  "5.07": "Submission of matters to a vote of security holders",
  "5.08": "Shareholder nominations pursuant to Exchange Act Rule 14a-11",
  "7.01": "Regulation FD disclosure",
  "8.01": "Other events",
  "9.01": "Financial statements and exhibits",
};

// Categorize items into business-relevant event types
function categorizeItems(items: string[]): string[] {
  const categories: string[] = [];
  for (const item of items) {
    if (["1.01", "1.02"].includes(item)) categories.push("material_agreement");
    if (["2.01"].includes(item)) categories.push("acquisition_or_disposition");
    if (["2.02"].includes(item)) categories.push("financial_results");
    if (["2.05", "2.06"].includes(item)) categories.push("restructuring");
    if (["5.01"].includes(item)) categories.push("change_of_control");
    if (["5.02"].includes(item)) categories.push("leadership_change");
    if (["5.03"].includes(item)) categories.push("corporate_governance");
    if (["7.01"].includes(item)) categories.push("regulatory_disclosure");
    if (["1.03"].includes(item)) categories.push("bankruptcy");
  }
  return Array.from(new Set(categories));
}

async function resolveCompanyToCik(query: string): Promise<{ cik: string; name: string } | null> {
  // Try the company search/tickers endpoint
  const searchUrl = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(query)}%22&forms=8-K&dateRange=custom&startdt=2025-01-01&enddt=2026-12-31`;
  const resp = await fetch(searchUrl, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) return null;
  const data = await resp.json() as any;
  const hit = data?.hits?.hits?.[0]?._source;
  if (hit?.ciks?.[0] && hit?.display_names?.[0]) {
    return { cik: hit.ciks[0], name: hit.display_names[0].split("  (")[0].trim() };
  }
  return null;
}

registerCapability("sec-filing-events", async (input: CapabilityInput) => {
  const companyName = (input.company_name as string)?.trim() ?? "";
  const cikInput = (input.cik as string)?.trim() ?? "";
  const ticker = (input.ticker as string)?.trim() ?? "";
  const maxEvents = Math.min(Number(input.max_events) || 10, 25);

  const query = cikInput || ticker || companyName;
  if (!query) {
    throw new Error("Provide 'company_name', 'ticker', or 'cik' to look up SEC filing events.");
  }

  // Resolve to CIK
  let cik = cikInput;
  let companyDisplayName = companyName;

  if (!cik) {
    const resolved = await resolveCompanyToCik(query);
    if (!resolved) {
      throw new Error(`No SEC filings found for "${query}". This capability covers US public companies that file with the SEC.`);
    }
    cik = resolved.cik;
    companyDisplayName = resolved.name;
  }

  // Pad CIK to 10 digits
  const paddedCik = cik.replace(/^0+/, "").padStart(10, "0");

  // Fetch submissions (all filings)
  const subUrl = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;
  const subResp = await fetch(subUrl, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (!subResp.ok) {
    throw new Error(`SEC EDGAR returned HTTP ${subResp.status} for CIK ${paddedCik}. The company may not exist in the SEC database.`);
  }

  const subData = await subResp.json() as any;
  companyDisplayName = subData.name || companyDisplayName;

  const recent = subData.filings?.recent || {};
  const forms = recent.form || [];
  const dates = recent.filingDate || [];
  const accessions = recent.accessionNumber || [];
  const primaryDocs = recent.primaryDocument || [];
  const items = recent.items || [];

  // Filter to 8-K filings
  const events: Record<string, unknown>[] = [];
  for (let i = 0; i < forms.length && events.length < maxEvents; i++) {
    if (forms[i] !== "8-K") continue;

    const itemList = items[i] ? String(items[i]).split(",").map((s: string) => s.trim()).filter(Boolean) : [];
    const accession = accessions[i]?.replace(/-/g, "");

    events.push({
      filing_date: dates[i],
      form: "8-K",
      items: itemList.map((item: string) => ({
        code: item,
        description: ITEM_DESCRIPTIONS[item] || "Unknown item",
      })),
      event_categories: categorizeItems(itemList),
      accession_number: accessions[i],
      filing_url: accession && primaryDocs[i]
        ? `https://www.sec.gov/Archives/edgar/data/${paddedCik}/${accession}/${primaryDocs[i]}`
        : null,
      edgar_url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${paddedCik}&type=8-K&dateb=&owner=include&count=10`,
    });
  }

  return {
    output: {
      company_name: companyDisplayName,
      cik: paddedCik,
      ticker: subData.tickers?.[0] || ticker || null,
      exchange: subData.exchanges?.[0] || null,
      sic: subData.sic || null,
      sic_description: subData.sicDescription || null,
      state: subData.stateOfIncorporation || null,
      total_filings_available: forms.filter((f: string) => f === "8-K").length,
      events_returned: events.length,
      events,
    },
    provenance: {
      source: "SEC EDGAR (data.sec.gov)",
      fetched_at: new Date().toISOString(),
    },
  };
});
