import { MODELS } from "../lib/models.js";
import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";
import { withRetry } from "../lib/retry.js";

const SEC_HEADERS = {
  "User-Agent": "Strale/1.0 admin@strale.io",
  Accept: "application/json",
} as const;

// US company data via SEC EDGAR (free, no auth, requires User-Agent)
const EDGAR_SEARCH = "https://www.sec.gov/cgi-bin/browse-edgar";
const EDGAR_COMPANY = "https://data.sec.gov/submissions";

// CIK: up to 10 digits; EIN: xx-xxxxxxx
const CIK_RE = /^\d{1,10}$/;

function findCik(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "");
  return CIK_RE.test(cleaned) ? cleaned.padStart(10, "0") : null;
}

export { normalizeCompanyName, classifyNameMatch } from "../lib/company-name-match.js";
export type { MatchConfidence } from "../lib/company-name-match.js";
import { classifyNameMatch } from "../lib/company-name-match.js";
import type { MatchConfidence } from "../lib/company-name-match.js";
import { resolveByTicker, resolveByTitle } from "../lib/sec-ticker-map.js";

// A ticker is normally 1-5 chars, but don't hard-fail longer ones — just try
// the map and fall through on a miss. Deliberately NO case coercion: only
// input that is ALREADY all-uppercase counts as ticker-shaped. Coercing
// ("Ford".toUpperCase() → "FORD") made ordinary company names hijackable by
// unrelated tickers — FORD is Forward Industries, Inc., not Ford Motor Co —
// and the hit was stamped match_confidence "exact", bypassing the
// DEC-20260428-B low-confidence gate with a confidently-wrong identity.
// Mixed/lower-case ticker input is still served via the explicit `ticker`
// input field (unambiguous caller intent) or the LLM+EFTS fallback.
const TICKER_SHAPE_RE = /^[A-Z0-9.]{1,10}$/;

function looksLikeTicker(input: string): boolean {
  return TICKER_SHAPE_RE.test(input);
}

/**
 * Fetch a SEC endpoint, retrying once on transient upstream failure.
 *
 * SEC EFTS/EDGAR intermittently returns 5xx and 429 (fair-access throttling,
 * max 10 req/s) even for well-formed requests (observed 2026-07: a "Stripe Inc"
 * lookup failed with HTTP 500 while the same query succeeds on retry). We
 * delegate to the shared `withRetry` primitive — its defaults already retry
 * 429 / 502 / 503 / 504 and network errors; we add bare `HTTP 5xx` locally
 * because a plain 500 is the exact case seen and isn't in the shared default
 * set (widening the shared default would change retry behaviour for every
 * capability, out of scope here). A 5xx/429 is surfaced as a retryable Error;
 * 4xx (incl. 404) is returned unretried for the caller to interpret.
 *
 * Interaction with the route layer: on the /v1/do path, `executeWithRetry`
 * (routes/do.ts) already wraps non-deterministic executors in another
 * `withRetry`. For a bare 500 that layer does NOT re-retry (not in its default
 * set), so this inner retry is the sole authority — matching the observed bug.
 * For 429/502/503/504 the two layers stack (~4 attempts worst case); that's
 * bounded and only on rare persistent failures. This retry is also what covers
 * the x402 path, which does not go through `executeWithRetry` at all.
 *
 * `fetchImpl` is injectable for tests; defaults to global fetch.
 */
export function fetchSec(
  url: string,
  label: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  return withRetry(
    async () => {
      const response = await fetchImpl(url, {
        headers: SEC_HEADERS,
        signal: AbortSignal.timeout(10000),
      });
      if (response.status >= 500 || response.status === 429) {
        throw new Error(`${label} returned HTTP ${response.status}`);
      }
      return response;
    },
    { maxRetries: 1, baseDelayMs: 400, slug: "us-company-data", retryableErrors: [/HTTP 5\d\d/i] },
  );
}

async function extractCompanyName(text: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");
  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: MODELS.capability_default.id,
    max_tokens: 100,
    messages: [{ role: "user", content: `Extract the US company name from this request. Return ONLY the company name, nothing else.\n\nRequest: "${text}"` }],
  });
  const name = r.content[0].type === "text" ? r.content[0].text.trim().replace(/^["']|["']$/g, "") : "";
  if (!name) throw new Error(`Could not identify a company name from: "${text}".`);
  return name;
}

async function searchEdgar(name: string): Promise<string> {
  const url = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(name)}%22&forms=10-K,10-Q,8-K&_source=ciks,display_names,biz_locations,inc_states,sics`;
  const response = await fetchSec(url, "SEC EDGAR search");
  if (!response.ok) throw new Error(`SEC EDGAR search returned HTTP ${response.status}`);
  const data = (await response.json()) as any;
  const hits = data?.hits?.hits;
  if (!hits || hits.length === 0) {
    throw new Error(`No US company found matching "${name}" in SEC EDGAR.`);
  }
  const cik = hits[0]._source?.ciks?.[0];
  if (!cik) throw new Error(`No CIK found for "${name}".`);
  return cik;
}

async function fetchCompany(cik: string): Promise<Record<string, unknown>> {
  const paddedCik = cik.padStart(10, "0");
  const url = `${EDGAR_COMPANY}/CIK${paddedCik}.json`;
  const response = await fetchSec(url, "SEC EDGAR");

  if (response.status === 404) {
    throw new Error(`US company with CIK ${cik} not found in SEC EDGAR.`);
  }
  if (!response.ok) throw new Error(`SEC EDGAR returned HTTP ${response.status}`);
  const data = (await response.json()) as any;

  const addr = data.addresses?.business || data.addresses?.mailing || {};
  const address = [
    addr.street1,
    addr.street2,
    [addr.city, addr.stateOrCountry].filter(Boolean).join(", "),
    addr.zipCode,
  ].filter(Boolean).join(", ");

  return {
    company_name: data.name || "",
    cik: data.cik || cik,
    entity_type: data.entityType || null,
    sic: data.sic || null,
    sic_description: data.sicDescription || null,
    state: data.stateOfIncorporation || addr.stateOrCountry || null,
    address,
    ein: data.ein || null,
    fiscal_year_end: data.fiscalYearEnd || null,
    ticker: data.tickers?.[0] || null,
    exchange: data.exchanges?.[0] || null,
    status: data.entityType ? "active" : "unknown",
  };
}

registerCapability("us-company-data", async (input: CapabilityInput) => {
  const raw = (input.cik as string) ?? (input.company as string) ?? (input.company_name as string) ?? (input.ticker as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error(
      "Provide one of: 'company' (CIK, ticker, or company name), 'cik', 'company_name', or 'ticker'.",
    );
  }

  const trimmed = raw.trim();
  let cik = findCik(trimmed);
  // Null when the caller supplied a CIK directly (an authoritative, exact
  // lookup with no name-matching ambiguity); set to the resolved name/ticker
  // whenever we had to resolve one (ticker map, title map, or EDGAR search).
  let searchedName: string | null = null;
  // Pre-computed match when resolution came from the exact ticker/title map
  // rather than EDGAR full-text filing search — set below, skips the
  // post-fetchCompany classification (and, more importantly, skips the
  // Anthropic call entirely).
  let preResolvedMatch: { match_confidence: MatchConfidence; is_exact_match: boolean } | null = null;
  // Which path produced the identity — surfaced in the output so a KYB
  // consumer can audit HOW "exact" was established (DEC-20260428-B:
  // per-fact traceability). "cik" | "ticker" | "title" | "search".
  let resolutionMethod: "cik" | "ticker" | "title" | "search" = cik ? "cik" : "search";

  // Explicit `ticker` field = unambiguous caller intent; any casing accepted.
  const explicitTicker =
    typeof input.ticker === "string" && input.ticker.trim() ? input.ticker.trim() : null;
  if (!cik && explicitTicker) {
    const tickerHit = await resolveByTicker(explicitTicker);
    if (tickerHit) {
      cik = tickerHit.cik;
      searchedName = explicitTicker;
      resolutionMethod = "ticker";
      preResolvedMatch = { match_confidence: "exact", is_exact_match: true };
    }
  }

  // Title map BEFORE ticker map for generic input: an exact normalized-title
  // hit is the strongest identity signal a name-like string can produce, and
  // checking it first stops name/ticker collisions ("HP" the company vs "HP"
  // the Helmerich & Payne ticker) from short-circuiting to the wrong filer.
  if (!cik) {
    const titleHit = await resolveByTitle(trimmed);
    if (titleHit) {
      cik = titleHit.cik;
      searchedName = trimmed;
      resolutionMethod = "title";
      // resolveByTitle only ever returns a hit on unambiguous normalized-
      // title equality, so this is always "exact" in practice — routing it
      // through classifyNameMatch (rather than hardcoding "exact") keeps the
      // confidence computation in one place and stays correct even if
      // resolveByTitle's matching rules loosen in the future.
      preResolvedMatch = classifyNameMatch(trimmed, titleHit.title);
    }
  }

  // Ticker map for generic input ONLY when the raw string is already
  // all-uppercase ticker shape (see looksLikeTicker — no case coercion).
  if (!cik && looksLikeTicker(trimmed)) {
    const tickerHit = await resolveByTicker(trimmed);
    if (tickerHit) {
      cik = tickerHit.cik;
      searchedName = trimmed;
      resolutionMethod = "ticker";
      preResolvedMatch = { match_confidence: "exact", is_exact_match: true };
    }
  }

  // Fallback: LLM name extraction + SEC full-text filing search. Only
  // reached when the input isn't a CIK and didn't resolve via the exact
  // ticker/title map — i.e. exactly the cases the map can't answer.
  if (!cik) {
    searchedName = await extractCompanyName(trimmed);
    cik = await searchEdgar(searchedName);
    resolutionMethod = "search";
  }

  const company = await fetchCompany(cik);

  const match =
    preResolvedMatch ??
    (searchedName === null
      ? { match_confidence: "exact" as MatchConfidence, is_exact_match: true }
      : classifyNameMatch(searchedName, String(company.company_name ?? "")));

  // Refuse to *assert* a low-confidence identity by default. A name search
  // resolves via SEC full-text filing search, so a private company with no
  // filings (e.g. "Stripe Inc") resolves to a different public filer that
  // merely mentions the name. Returning that identity would let a bundled KYB
  // solution pipe the wrong company straight into sanctions/PEP screening
  // (DEC-20260428-B: never assert a fact not in the input). Callers who want
  // the best-effort match opt in explicitly with allow_low_confidence.
  const allowLowConfidence = input.allow_low_confidence === true;
  if (match.match_confidence === "low" && !allowLowConfidence) {
    const closest = company.company_name ? ` ("${company.company_name}")` : "";
    throw new Error(
      `No confident SEC EDGAR match for "${searchedName}". The closest filing belongs to a different entity${closest}, ` +
        `which is common for private companies with no SEC filings of their own. Supply the company's CIK for an exact ` +
        `lookup, or pass allow_low_confidence=true to receive the best-effort match with its confidence flags.`,
    );
  }

  const output = {
    ...company,
    searched_name: searchedName,
    match_confidence: match.match_confidence,
    is_exact_match: match.is_exact_match,
    resolution_method: resolutionMethod,
  };

  return {
    output,
    provenance: {
      source: "sec.gov/edgar",
      source_url: `${EDGAR_COMPANY}/CIK${cik.padStart(10, "0")}.json`,
      fetched_at: new Date().toISOString(),
      acquisition_method: "direct_api" as const,
      primary_source_reference: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik.padStart(10, "0")}`,
    },
  };
});
