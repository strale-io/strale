/**
 * Shared SEC ticker/CIK/title map.
 *
 * SEC publishes an authoritative ticker → CIK → title map at
 * https://www.sec.gov/files/company_tickers.json (shape:
 * `{ "0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."}, ... }`).
 *
 * This was previously duplicated (loader + linear-scan matching) in both
 * `sec-filing-events.ts` (`loadTickers`) and `officer-search.ts`
 * (`searchUsOfficers`'s inline fetch). Extracted here as the single source of
 * truth so `us-company-data.ts` can resolve tickers and exact company titles
 * WITHOUT going through SEC's full-text *filing* search (`searchEdgar`),
 * which ranks by filing-text relevance, not entity identity, and is what
 * caused common words ("Apple") to resolve to the wrong filer
 * ("Apple Hospitality REIT, Inc.").
 *
 * `resolveByTicker` and `resolveByTitle` are deliberately conservative:
 * exact match only, never a "closest" guess. Ambiguous title matches (e.g. a
 * name that matches 2+ entries once a trailing corporate suffix is ignored)
 * return null rather than picking one — the caller falls through to the
 * existing LLM+EFTS path with its low-confidence gate.
 */

import { normalizeCompanyName } from "./company-name-match.js";
import { logWarn } from "./log.js";

export interface SecTickerEntry {
  cik_str: number | string;
  ticker: string;
  title: string;
}

export type SecTickerMap = Record<string, SecTickerEntry>;

export interface SecTickerMatch {
  cik: string;
  title: string;
  ticker: string;
}

const UA = "Strale/1.0 hello@strale.io";
const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const TICKERS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let cache: SecTickerMap | null = null;
let cachedAt = 0;
// Coalesce concurrent cold-start loads into one fetch (the file is ~1MB and
// SEC fair-access throttles at 10 req/s — three capabilities now funnel
// through this loader). On failure, cool down for 60s instead of re-fetching
// on every request: us-company-data calls both resolvers per request, so an
// un-cooled SEC outage added up to 2 × 15s of timeout per call.
let inFlight: Promise<SecTickerMap> | null = null;
let lastFailureAt = 0;
const FAILURE_COOLDOWN_MS = 60_000;
// Lookup indexes built once per cache refresh (24h) so resolveByTicker /
// resolveByTitle are O(1) per call instead of a ~10k-entry linear scan —
// resolveByTitle previously re-ran the normalizeCompanyName regex pipeline
// against every entry's title on every lookup (~30k regex ops per call).
// titleIndex maps normalizedTitle → ALL entries sharing that form, so the
// "exactly one candidate or null" ambiguity rule is preserved.
let tickerIndex: Map<string, SecTickerEntry> | null = null;
let titleIndex: Map<string, SecTickerEntry[]> | null = null;

function padCik(cikStr: number | string): string {
  return String(cikStr).padStart(10, "0");
}

function buildIndexes(map: SecTickerMap): void {
  tickerIndex = new Map();
  titleIndex = new Map();
  for (const entry of Object.values(map)) {
    if (entry.ticker) tickerIndex.set(entry.ticker.toUpperCase(), entry);
    const norm = normalizeCompanyName(entry.title ?? "");
    if (norm) {
      const bucket = titleIndex.get(norm);
      if (bucket) bucket.push(entry);
      else titleIndex.set(norm, [entry]);
    }
  }
}

/**
 * Load (and in-process cache, 24h TTL) the SEC ticker/CIK/title map.
 * `fetchImpl` is injectable for tests; defaults to global fetch.
 *
 * Never throws for callers that want a soft-fail: pass through and catch,
 * or use `resolveByTicker`/`resolveByTitle` which already swallow load
 * failures and return null.
 */
export async function loadSecTickerMap(
  fetchImpl: typeof fetch = fetch,
): Promise<SecTickerMap> {
  if (cache && Date.now() - cachedAt < TICKERS_TTL_MS) return cache;

  // Recent failure: don't hammer SEC. Serve the stale map if we ever had
  // one (stale-but-authoritative beats falling through to the EFTS
  // full-text path this lib exists to avoid); otherwise fail fast.
  if (Date.now() - lastFailureAt < FAILURE_COOLDOWN_MS) {
    if (cache) return cache;
    throw new Error("SEC company tickers list unavailable (cooling down after a recent failed load).");
  }

  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const resp = await fetchImpl(TICKERS_URL, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok) {
        throw new Error(`Could not load SEC company tickers list (HTTP ${resp.status}).`);
      }
      const data = (await resp.json()) as SecTickerMap;
      cache = data;
      cachedAt = Date.now();
      buildIndexes(data);
      return data;
    } catch (err) {
      lastFailureAt = Date.now();
      if (cache) {
        // TTL expired and the refresh failed — serve the stale map rather
        // than letting callers regress to the wrong-filer EFTS path.
        logWarn("sec-ticker-map", "refresh failed, serving stale map", {
          err: err instanceof Error ? err.message : String(err),
          stale_age_ms: Date.now() - cachedAt,
        });
        return cache;
      }
      throw err;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Test-only: reset the in-process cache so tests don't leak state. */
export function _resetSecTickerMapCacheForTests(): void {
  cache = null;
  cachedAt = 0;
  tickerIndex = null;
  titleIndex = null;
  inFlight = null;
  lastFailureAt = 0;
}

/**
 * Load the map for the resolvers' soft-fail contract: swallow the load
 * failure, log it once with the caller's name, return null. Both resolvers
 * share this so the swallow/log behaviour can't drift between them.
 */
async function safeLoadMap(
  caller: string,
  fetchImpl: typeof fetch,
): Promise<SecTickerMap | null> {
  try {
    return await loadSecTickerMap(fetchImpl);
  } catch (err) {
    logWarn("sec-ticker-map", `ticker map load failed, ${caller} returning null`, {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Case-insensitive EXACT ticker match. Returns null (never guesses) when the
 * map fails to load or the ticker is not present.
 */
export async function resolveByTicker(
  symbol: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SecTickerMatch | null> {
  const query = symbol.trim().toUpperCase();
  if (!query) return null;

  if (!(await safeLoadMap("resolveByTicker", fetchImpl))) return null;

  const entry = tickerIndex?.get(query);
  if (!entry) return null;
  return { cik: padCik(entry.cik_str), title: entry.title, ticker: entry.ticker };
}

/**
 * Match on normalized title (reuses `normalizeCompanyName` from
 * company-name-match.ts, the same normalizer every other registry lookup
 * uses).
 *
 * `normalizeCompanyName` already lowercases, strips punctuation, and strips
 * trailing corporate suffixes (Inc/Corp/Co/Ltd/LLC/PLC/... — see
 * `CORP_SUFFIX_RE`), so a single normalized-equality pass over both sides
 * already gives "exact normalized equality, suffix-agnostic": "Apple",
 * "Apple Inc", and "Apple Inc." all normalize to "apple" and compare equal.
 * ONLY returns a hit when it is unambiguous (exactly one candidate matches
 * that normalized form) — multiple candidates → null, never a guess.
 */
export async function resolveByTitle(
  name: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SecTickerMatch | null> {
  const raw = name.trim();
  if (!raw) return null;

  const target = normalizeCompanyName(raw);
  if (!target) return null;

  if (!(await safeLoadMap("resolveByTitle", fetchImpl))) return null;

  const matches = titleIndex?.get(target);
  if (!matches || matches.length !== 1) return null; // 0 = no match, >1 = ambiguous — never guess

  const hit = matches[0];
  return { cik: padCik(hit.cik_str), title: hit.title, ticker: hit.ticker };
}
