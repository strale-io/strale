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

export type MatchConfidence = "exact" | "high" | "low";

// Common corporate suffixes / stopwords stripped before comparing names, so
// "Apple Inc" and "Apple Inc." compare equal. Applied as standalone tokens
// after punctuation has been flattened to spaces.
const CORP_SUFFIX_RE =
  /\b(incorporated|inc|corporation|corp|company|co|llc|ltd|limited|lp|plc|holdings?|group|the)\b/gi;

/**
 * Normalize a company name for fuzzy comparison: lowercase, flatten punctuation
 * to spaces, drop common corporate suffixes, collapse whitespace.
 */
export function normalizeCompanyName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(CORP_SUFFIX_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Classify how well the name the caller asked for matches the name SEC EDGAR
 * actually returned for the resolved CIK.
 *
 * Why this exists: name lookups resolve via SEC full-text *filing* search
 * (`searchEdgar`), which returns the top-scoring filing that mentions the query
 * — not an entity lookup. For a private company with no filings of its own
 * (e.g. "Stripe Inc" pre-IPO) every hit is a *different* public filer that
 * merely mentions the name, so the capability would otherwise return someone
 * else's identity with no signal. This surfaces that risk (per the DEC-
 * 20260428-B "screening_signal" transparency spirit): callers gate on
 * `is_exact_match` / `match_confidence` rather than trusting a fuzzy hit.
 *
 * Errs toward "low": a correct-but-abbreviated match (e.g. "IBM" vs
 * "International Business Machines Corp") is flagged low, which is the safe
 * direction — a false "low" prompts a caller to verify; a false "exact" would
 * assert a wrong identity.
 */
export function classifyNameMatch(
  searched: string,
  matched: string,
): { match_confidence: MatchConfidence; is_exact_match: boolean } {
  const q = normalizeCompanyName(searched);
  const m = normalizeCompanyName(matched);
  if (!q || !m) return { match_confidence: "low", is_exact_match: false };
  if (q === m) return { match_confidence: "exact", is_exact_match: true };

  const qTokens = new Set(q.split(" "));
  const mTokens = new Set(m.split(" "));
  const intersection = [...qTokens].filter((t) => mTokens.has(t)).length;
  // Both sets are non-empty here (guarded above), so union is too.
  const jaccard = intersection / new Set([...qTokens, ...mTokens]).size;

  // A partial overlap only counts as "high" when BOTH names carry ≥2 tokens.
  // A single-token name (Stripe, Uber, Meta) that shares its one token with a
  // longer, different name ("Stripe Financial Holdings") is not a confident
  // match and must fall through to "low" — otherwise Jaccard 1/2 would call it
  // "high", the exact false-confidence this signal exists to prevent.
  const bothMultiToken = qTokens.size >= 2 && mTokens.size >= 2;
  return bothMultiToken && jaccard >= 0.5
    ? { match_confidence: "high", is_exact_match: false }
    : { match_confidence: "low", is_exact_match: false };
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
    model: "claude-haiku-4-5-20251001",
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
    throw new Error("'cik' or 'company_name' is required. Provide a CIK number or US company name.");
  }

  const trimmed = raw.trim();
  let cik = findCik(trimmed);
  // Null when the caller supplied a CIK directly (an authoritative, exact
  // lookup with no name-matching ambiguity); set to the resolved name when we
  // had to search EDGAR for it.
  let searchedName: string | null = null;
  if (!cik) {
    searchedName = await extractCompanyName(trimmed);
    cik = await searchEdgar(searchedName);
  }

  const company = await fetchCompany(cik);

  const match =
    searchedName === null
      ? { match_confidence: "exact" as MatchConfidence, is_exact_match: true }
      : classifyNameMatch(searchedName, String(company.company_name ?? ""));

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
