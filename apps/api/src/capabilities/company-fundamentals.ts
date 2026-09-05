import { registerCapability, type CapabilityInput } from "./index.js";
import { readJsonWithLimit } from "../lib/resource-limits.js";

// SEC XBRL company-concept API — the primary source for US filers' reported
// financials, free and keyless. Preferred over a commercial aggregator under
// the preference order in DEC-20260813-A: official API first.
//
// The SEC requires a descriptive User-Agent with a contact address and asks
// for no more than 10 requests/second, so concepts are fetched in bounded
// batches rather than one burst.
// Verified live 2026-09-05 (AAPL -> FY2025 revenue $416,161,000,000).
const DATA = "https://data.sec.gov/api/xbrl/companyconcept";
const TICKERS = "https://www.sec.gov/files/company_tickers.json";
const USER_AGENT = "Strale/1.0 (support@strale.io)";

// Concept tags change as filers adopt new taxonomies: Apple stopped reporting
// `Revenues` in 2018. Each metric therefore carries a fallback chain, tried in
// order until one returns data.
const METRICS: Array<{ key: string; label: string; tags: string[] }> = [
  { key: "revenue", label: "Revenue", tags: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"] },
  { key: "operating_income", label: "Operating income", tags: ["OperatingIncomeLoss"] },
  { key: "net_income", label: "Net income", tags: ["NetIncomeLoss"] },
  { key: "assets", label: "Total assets", tags: ["Assets"] },
  { key: "liabilities", label: "Total liabilities", tags: ["Liabilities"] },
  { key: "equity", label: "Shareholders' equity", tags: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"] },
  { key: "cash", label: "Cash and equivalents", tags: ["CashAndCashEquivalentsAtCarryingValue"] },
  { key: "eps_diluted", label: "Diluted EPS", tags: ["EarningsPerShareDiluted"] },
  { key: "shares_diluted", label: "Diluted shares outstanding", tags: ["WeightedAverageNumberOfDilutedSharesOutstanding"] },
];

interface Fact { start?: string; end?: string; val?: number; accn?: string; fy?: number; fp?: string; form?: string; filed?: string }
interface ConceptResponse { cik?: number; entityName?: string; label?: string; units?: Record<string, Fact[]> }
interface TickerRow { cik_str?: number; ticker?: string; title?: string }

// The ticker map is ~800 KB and changes slowly; hold it for an hour so a
// burst of lookups costs one fetch.
let tickerCache: { at: number; map: Map<string, { cik: string; title: string }> } | null = null;
const TICKER_TTL_MS = 60 * 60 * 1000;

/** Zero-pad a CIK to the 10 digits the data API's path expects. */
export function padCik(cik: string | number): string {
  return String(cik).replace(/\D/g, "").padStart(10, "0");
}

/**
 * Pick the value for the most recently *ended* annual period. Filers restate,
 * so several rows can share a fiscal year; the latest `end` wins, and among
 * equal ends the most recently filed.
 */
export function latestAnnual(facts: Fact[]): Fact | null {
  const annual = facts.filter((f) => typeof f.val === "number" && f.form?.startsWith("10-K") && f.fp === "FY" && f.end);
  if (annual.length === 0) return null;
  return annual.reduce((best, f) => {
    const cmp = String(f.end).localeCompare(String(best.end));
    if (cmp > 0) return f;
    if (cmp === 0 && String(f.filed ?? "").localeCompare(String(best.filed ?? "")) > 0) return f;
    return best;
  });
}

/** USD first; EPS lands in USD/shares and share counts in `shares`. */
export function pickUnit(units: Record<string, Fact[]>): { unit: string; facts: Fact[] } | null {
  const keys = Object.keys(units);
  if (keys.length === 0) return null;
  const preferred = ["USD", "USD/shares", "shares", "pure"].find((u) => keys.includes(u));
  const unit = preferred ?? keys[0];
  return { unit, facts: units[unit] ?? [] };
}

async function secFetch(url: string, timeoutMs = 15_000): Promise<Response> {
  return fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function resolveTicker(ticker: string): Promise<{ cik: string; title: string }> {
  const now = Date.now();
  if (!tickerCache || now - tickerCache.at > TICKER_TTL_MS) {
    const res = await secFetch(TICKERS, 25_000);
    if (!res.ok) throw new Error(`SEC ticker directory returned HTTP ${res.status}.`);
    const raw = await readJsonWithLimit<Record<string, TickerRow>>(res, 4 * 1024 * 1024);
    const map = new Map<string, { cik: string; title: string }>();
    for (const row of Object.values(raw)) {
      if (row?.ticker && row.cik_str !== undefined) {
        map.set(row.ticker.toUpperCase(), { cik: padCik(row.cik_str), title: row.title ?? "" });
      }
    }
    tickerCache = { at: now, map };
  }
  const hit = tickerCache.map.get(ticker.toUpperCase());
  if (!hit) {
    throw new Error(`Ticker '${ticker}' is not in the SEC's registrant directory. Only companies that file with the SEC are covered; pass 'cik' directly if you have it.`);
  }
  return hit;
}

registerCapability("company-fundamentals", async (input: CapabilityInput) => {
  const tickerRaw = typeof input.ticker === "string" ? input.ticker.trim() : "";
  const cikRaw = input.cik === undefined || input.cik === null ? "" : String(input.cik).trim();
  if (tickerRaw.length === 0 && cikRaw.length === 0) {
    throw new Error("One of 'ticker' (e.g. AAPL) or 'cik' (e.g. 320193) is required.");
  }

  let cik: string;
  let registrantName: string | null = null;
  let ticker: string | null = null;

  if (tickerRaw.length > 0) {
    if (!/^[A-Za-z0-9.-]{1,10}$/.test(tickerRaw)) {
      throw new Error(`'${tickerRaw}' is not a valid ticker symbol.`);
    }
    const hit = await resolveTicker(tickerRaw);
    cik = hit.cik;
    registrantName = hit.title || null;
    ticker = tickerRaw.toUpperCase();
  } else {
    if (!/^\d{1,10}$/.test(cikRaw.replace(/^CIK/i, ""))) {
      throw new Error(`'${cikRaw}' is not a valid CIK. A CIK is up to 10 digits, e.g. 320193.`);
    }
    cik = padCik(cikRaw.replace(/^CIK/i, ""));
  }

  // Resolve each metric's fallback chain; run metrics in batches of five so a
  // single invocation stays inside the SEC's 10 requests/second guidance.
  const fundamentals: Record<string, unknown> = {};
  const unavailable: string[] = [];
  let entityName: string | null = null;
  let anyConceptFound = false;

  for (let i = 0; i < METRICS.length; i += 5) {
    const batch = METRICS.slice(i, i + 5);
    const settled = await Promise.all(
      batch.map(async (metric) => {
        for (const tag of metric.tags) {
          let res: Response;
          try {
            res = await secFetch(`${DATA}/CIK${cik}/us-gaap/${tag}.json`);
          } catch {
            continue;
          }
          // A 404 means this filer does not report under that tag — expected,
          // and the reason the fallback chain exists.
          if (res.status === 404) continue;
          if (res.status === 429) {
            throw new Error("The SEC is rate-limiting requests right now. Retry shortly.");
          }
          if (!res.ok) continue;
          const body = await readJsonWithLimit<ConceptResponse>(res).catch(() => null);
          if (!body?.units) continue;
          const picked = pickUnit(body.units);
          if (!picked) continue;
          const fact = latestAnnual(picked.facts);
          if (!fact) continue;
          return { metric, tag, body, fact, unit: picked.unit };
        }
        return { metric, tag: null, body: null, fact: null, unit: null };
      }),
    );

    for (const r of settled) {
      if (r.fact && r.body) {
        anyConceptFound = true;
        entityName ??= r.body.entityName ?? null;
        fundamentals[r.metric.key] = {
          label: r.metric.label,
          value: r.fact.val ?? null,
          unit: r.unit,
          concept: r.tag,
          fiscal_year: r.fact.fy ?? null,
          period_start: r.fact.start ?? null,
          period_end: r.fact.end ?? null,
          form: r.fact.form ?? null,
          filed: r.fact.filed ?? null,
          accession: r.fact.accn ?? null,
        };
      } else {
        fundamentals[r.metric.key] = null;
        unavailable.push(r.metric.key);
      }
    }
  }

  if (!anyConceptFound) {
    throw new Error(`No annual (10-K) XBRL financial data is on file at the SEC for CIK ${cik}. Foreign private issuers filing 20-F and companies that have never filed a 10-K are not covered.`);
  }

  const periods = Object.values(fundamentals)
    .filter((v): v is Record<string, unknown> => v !== null && typeof v === "object")
    .map((v) => String(v.period_end ?? ""))
    .filter(Boolean)
    .sort();

  return {
    output: {
      cik,
      ticker,
      entity_name: entityName ?? registrantName,
      // The latest period any metric covers. Metrics can differ by a period
      // when a filer restates one line and not another, so each metric also
      // carries its own period above.
      latest_period_end: periods[periods.length - 1] ?? null,
      fundamentals,
      metrics_unavailable: unavailable,
      source_url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=10-K`,
    },
    provenance: {
      source: "SEC XBRL company-concept API (EDGAR financial statement data)",
      fetched_at: new Date().toISOString(),
    },
  };
});
