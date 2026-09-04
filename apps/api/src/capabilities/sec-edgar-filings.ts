import { registerCapability, type CapabilityInput } from "./index.js";
import { readJsonWithLimit } from "../lib/resource-limits.js";
import { readBoundedInt } from "../lib/capability-input.js";

// SEC EDGAR — official, free, no key. Fair-access rules: a descriptive
// User-Agent with a contact address, and at most 10 requests/second.
// Ticker → CIK comes from the SEC's own mapping file (~800 KB), cached in
// memory for a day so a ticker lookup costs one upstream call, not two.
// Verified live 2026-09-04 (AAPL → CIK 320193).
const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const SUBMISSIONS_URL = "https://data.sec.gov/submissions";
const USER_AGENT = "Strale/1.0 (support@strale.io)";
const TICKER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type TickerRow = { cik_str?: number; ticker?: string; title?: string };
let tickerCache: { at: number; byTicker: Map<string, { cik: number; title: string }> } | null = null;

async function loadTickerMap(): Promise<Map<string, { cik: number; title: string }>> {
  if (tickerCache && Date.now() - tickerCache.at < TICKER_CACHE_TTL_MS) return tickerCache.byTicker;
  const res = await fetch(TICKERS_URL, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`SEC ticker index returned HTTP ${res.status}.`);
  const rows = await readJsonWithLimit<Record<string, TickerRow>>(res);
  const byTicker = new Map<string, { cik: number; title: string }>();
  for (const r of Object.values(rows)) {
    if (r && typeof r.ticker === "string" && typeof r.cik_str === "number") byTicker.set(r.ticker.toUpperCase(), { cik: r.cik_str, title: r.title ?? "" });
  }
  tickerCache = { at: Date.now(), byTicker };
  return byTicker;
}

interface Submissions {
  cik?: string; name?: string; tickers?: string[]; exchanges?: string[]; sic?: string; sicDescription?: string;
  stateOfIncorporation?: string; fiscalYearEnd?: string; entityType?: string; category?: string; ein?: string;
  addresses?: { business?: { street1?: string; city?: string; stateOrCountry?: string; zipCode?: string } };
  filings?: { recent?: { accessionNumber?: string[]; filingDate?: string[]; reportDate?: string[]; form?: string[]; primaryDocument?: string[]; primaryDocDescription?: string[]; items?: string[] } };
}

registerCapability("sec-edgar-filings", async (input: CapabilityInput) => {
  const tickerRaw = typeof input.ticker === "string" ? input.ticker.trim().toUpperCase() : "";
  const cikRaw = input.cik === undefined || input.cik === null ? "" : String(input.cik).trim();
  if (!tickerRaw && !cikRaw) throw new Error("'ticker' or 'cik' is required (e.g. ticker AAPL, or cik 320193).");
  if (cikRaw && !/^\d{1,10}$/.test(cikRaw)) throw new Error("'cik' must be a number of up to 10 digits.");
  if (tickerRaw && !/^[A-Z0-9.-]{1,10}$/.test(tickerRaw)) throw new Error("'ticker' must be an exchange ticker symbol (1-10 characters).");

  const formFilter = typeof input.form_type === "string" && input.form_type.trim() ? input.form_type.trim().toUpperCase() : null;
  const limit = readBoundedInt(input.limit, "limit", { min: 1, max: 50, fallback: 20 });

  let cik: number;
  let resolvedTicker: string | null = null;
  if (cikRaw) {
    cik = Number(cikRaw);
  } else {
    const map = await loadTickerMap();
    const hit = map.get(tickerRaw);
    if (!hit) throw new Error(`Ticker '${tickerRaw}' is not in the SEC's company ticker index. Provide the CIK instead.`);
    cik = hit.cik;
    resolvedTicker = tickerRaw;
  }

  const padded = String(cik).padStart(10, "0");
  const res = await fetch(`${SUBMISSIONS_URL}/CIK${padded}.json`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (res.status === 404) throw new Error(`No EDGAR filer found for CIK ${cik}.`);
  if (res.status === 403 || res.status === 429) throw new Error(`SEC EDGAR is throttling requests right now (HTTP ${res.status}). Retry shortly.`);
  if (!res.ok) throw new Error(`SEC EDGAR returned HTTP ${res.status}.`);

  const sub = await readJsonWithLimit<Submissions>(res);
  const r = sub.filings?.recent ?? {};
  const n = r.accessionNumber?.length ?? 0;
  const filings: unknown[] = [];
  for (let i = 0; i < n && filings.length < limit; i++) {
    const form = r.form?.[i] ?? "";
    if (formFilter && form.toUpperCase() !== formFilter) continue;
    const accession = r.accessionNumber?.[i] ?? "";
    const doc = r.primaryDocument?.[i] ?? "";
    const accessionPath = accession.replace(/-/g, "");
    filings.push({
      form,
      filing_date: r.filingDate?.[i] ?? null,
      report_date: r.reportDate?.[i] || null,
      accession_number: accession,
      primary_document: doc || null,
      description: r.primaryDocDescription?.[i] || null,
      items: r.items?.[i] || null,
      url: accession && doc ? `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionPath}/${doc}` : null,
      index_url: accession ? `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionPath}/` : null,
    });
  }

  return {
    output: {
      cik,
      name: sub.name ?? null,
      ticker: resolvedTicker ?? sub.tickers?.[0] ?? null,
      tickers: sub.tickers ?? [],
      exchanges: sub.exchanges ?? [],
      entity_type: sub.entityType ?? null,
      sic_code: sub.sic ?? null,
      sic_description: sub.sicDescription ?? null,
      state_of_incorporation: sub.stateOfIncorporation ?? null,
      fiscal_year_end: sub.fiscalYearEnd ?? null,
      filer_category: sub.category ?? null,
      business_address: sub.addresses?.business ? {
        street: sub.addresses.business.street1 ?? null, city: sub.addresses.business.city ?? null,
        state_or_country: sub.addresses.business.stateOrCountry ?? null, zip: sub.addresses.business.zipCode ?? null,
      } : null,
      form_filter: formFilter,
      recent_filings_available: n,
      returned: filings.length,
      filings,
      edgar_url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${padded}`,
    },
    provenance: { source: "sec.gov EDGAR", fetched_at: new Date().toISOString() },
  };
});
