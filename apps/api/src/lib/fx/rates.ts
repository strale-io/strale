import { MAX_FETCHED_API_RESPONSE_BYTES, readJsonWithLimit, readTextWithLimit } from "../resource-limits.js";
import { discardBody, safeFetch } from "../safe-fetch.js";

const ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const CACHE_MS = 60 * 60 * 1000;
const STALE_MS = 4 * 24 * 60 * 60 * 1000;
const FAILED_REFRESH_BACKOFF_MS = 5 * 60 * 1000;
const CURRENCIES_CACHE_MS = 24 * 60 * 60 * 1000;

// ECB euro reference rates page, reviewed 2026-11-08.
export const ECB_REFERENCE_CURRENCIES = new Set([
  "EUR", "USD", "JPY", "CZK", "DKK", "GBP", "HUF", "PLN", "RON",
  "SEK", "CHF", "ISK", "NOK", "TRY", "AUD", "BRL", "CAD", "CNY", "HKD",
  "IDR", "ILS", "INR", "KRW", "MXN", "MYR", "NZD", "PHP", "SGD", "THB", "ZAR",
]);

export interface EcbReferenceRates { date: string; rates: Map<string, number>; stale?: true }
export interface FrankfurterRate { date: string; base: string; quote: string; rate: number }
export type FrankfurterSeries = FrankfurterRate[];

// Five years of daily v2 points are currently well below this; 512 KiB leaves
// substantial room for JSON formatting and future response-field growth.
export const FRANKFURTER_SERIES_MAX_BYTES = 512 * 1024;

export class FxCurrencyUnavailableError extends Error {
  constructor(readonly status: 404 | 422) {
    super("The source has no published reference rate for this currency pair.");
    this.name = "FxCurrencyUnavailableError";
  }
}

let ecbCache: { value: EcbReferenceRates; fetchedAt: number } | undefined;
let ecbInFlight: Promise<EcbReferenceRates> | undefined;
let ecbRefreshFailure: { error: Error; failedAt: number } | undefined;
const frankfurterCache = new Map<string, { value: FrankfurterRate; fetchedAt: number }>();
const frankfurterInFlight = new Map<string, Promise<FrankfurterRate>>();
let currenciesCache: { value: Set<string>; fetchedAt: number } | undefined;
let currenciesInFlight: Promise<Set<string>> | undefined;

const isPositiveRate = (value: number) => Number.isFinite(value) && value > 0;

function parseEcbXml(xml: string): EcbReferenceRates {
  const date = xml.match(/Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']/)?.[1];
  if (!date) throw new Error("ECB daily reference-rate response has no rate date.");
  const rates = new Map<string, number>([["EUR", 1]]);
  for (const match of xml.matchAll(/Cube\s+currency=["']([A-Z]{3})["']\s+rate=["']([^"']+)["']/g)) {
    const rate = Number(match[2]);
    if (!isPositiveRate(rate)) throw new Error(`ECB returned an invalid reference rate for ${match[1]}.`);
    rates.set(match[1], rate);
  }
  if (rates.size === 1) throw new Error("ECB daily reference-rate response contains no currency rates.");
  return { date, rates };
}

function isPastNextExpectedPublication(rateDate: string, now: number): boolean {
  const next = new Date(`${rateDate}T15:00:00.000Z`);
  do next.setUTCDate(next.getUTCDate() + 1);
  while (next.getUTCDay() === 0 || next.getUTCDay() === 6);
  return now > next.getTime();
}

async function fetchEcbReferenceRates(): Promise<EcbReferenceRates> {
  const response = await safeFetch(ECB_URL, { headers: { Accept: "application/xml, text/xml" }, timeoutMs: 5_000, acquisitionMethod: "direct_api" });
  if (!response.ok) {
    await discardBody(response, "ECB reference rates: non-2xx");
    throw new Error(`ECB reference-rate service unavailable: HTTP ${response.status}.`);
  }
  try {
    return parseEcbXml(await readTextWithLimit(response, MAX_FETCHED_API_RESPONSE_BYTES, "rate_source", "a reference-rate response of"));
  } catch (error) {
    throw new Error(`ECB reference-rate service unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function getEcbReferenceRates(): Promise<EcbReferenceRates> {
  const now = Date.now();
  if (ecbCache && now - ecbCache.fetchedAt < CACHE_MS) return { ...ecbCache.value, ...(isPastNextExpectedPublication(ecbCache.value.date, now) ? { stale: true as const } : {}) };
  if (ecbRefreshFailure && now - ecbRefreshFailure.failedAt < FAILED_REFRESH_BACKOFF_MS) {
    if (ecbCache && now - Date.parse(`${ecbCache.value.date}T00:00:00Z`) <= STALE_MS) return { ...ecbCache.value, ...(isPastNextExpectedPublication(ecbCache.value.date, now) ? { stale: true as const } : {}) };
    throw ecbRefreshFailure.error;
  }
  if (!ecbInFlight) {
    ecbInFlight = fetchEcbReferenceRates().then((value) => {
      ecbCache = { value, fetchedAt: Date.now() };
      ecbRefreshFailure = undefined;
      return value;
    }).finally(() => { ecbInFlight = undefined; });
  }
  try {
    const value = await ecbInFlight;
    return { ...value, ...(isPastNextExpectedPublication(value.date, now) ? { stale: true as const } : {}) };
  } catch (error) {
    const upstreamError = error instanceof Error ? error : new Error(String(error));
    ecbRefreshFailure = { error: upstreamError, failedAt: now };
    if (ecbCache && now - Date.parse(`${ecbCache.value.date}T00:00:00Z`) <= STALE_MS) return { ...ecbCache.value, ...(isPastNextExpectedPublication(ecbCache.value.date, now) ? { stale: true as const } : {}) };
    throw upstreamError;
  }
}

export function isEcbReferenceCurrency(code: string): boolean {
  return (ecbCache?.value.rates ?? ECB_REFERENCE_CURRENCIES).has(code);
}

async function fetchFrankfurterRate(base: string, quote: string): Promise<FrankfurterRate> {
  const response = await safeFetch(`https://api.frankfurter.dev/v2/rate/${base}/${quote}`, { headers: { Accept: "application/json" }, timeoutMs: 5_000, acquisitionMethod: "vendor_api" });
  if (response.status === 404 || response.status === 422) {
    await discardBody(response, "Frankfurter rate: unsupported pair");
    throw new FxCurrencyUnavailableError(response.status);
  }
  if (!response.ok) {
    await discardBody(response, "Frankfurter rate: non-2xx");
    throw new Error(`Frankfurter rate service unavailable: HTTP ${response.status}.`);
  }
  try {
    const data = await readJsonWithLimit<FrankfurterRate>(response, MAX_FETCHED_API_RESPONSE_BYTES, "rate_source", "a reference-rate response of");
    if (!data || data.base !== base || data.quote !== quote || !isPositiveRate(data.rate) || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new Error("invalid or mismatched response");
    return data;
  } catch (error) {
    throw new Error(`Frankfurter rate service unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function getFrankfurterCurrencies(): Promise<Set<string>> {
  if (currenciesCache && Date.now() - currenciesCache.fetchedAt < CURRENCIES_CACHE_MS) return currenciesCache.value;
  if (!currenciesInFlight) currenciesInFlight = (async () => {
    const response = await safeFetch("https://api.frankfurter.dev/v2/currencies", { headers: { Accept: "application/json" }, timeoutMs: 5_000, acquisitionMethod: "vendor_api" });
    if (!response.ok) {
      await discardBody(response, "Frankfurter currencies: non-2xx");
      throw new Error(`Frankfurter currency list unavailable: HTTP ${response.status}.`);
    }
    try {
      const data = await readJsonWithLimit<unknown>(response, MAX_FETCHED_API_RESPONSE_BYTES, "rate_source", "a currency-list response of");
      // /v2/currencies answers an array of { iso_code, ... }. Anything else
      // (an error object, say) must not become a cached list of "codes".
      if (!Array.isArray(data)) throw new Error("invalid response");
      const rawCodes: unknown[] = data.map((entry) => (entry as { iso_code?: unknown } | null)?.iso_code);
      const codes = new Set(rawCodes.filter((code): code is string => typeof code === "string" && /^[A-Z]{3}$/.test(code)));
      if (!codes.size) throw new Error("invalid response");
      currenciesCache = { value: codes, fetchedAt: Date.now() };
      return codes;
    } catch (error) { throw new Error(`Frankfurter currency list unavailable: ${error instanceof Error ? error.message : String(error)}`); }
  })().finally(() => { currenciesInFlight = undefined; });
  return currenciesInFlight!;
}

export async function getFrankfurterRate(base: string, quote: string): Promise<FrankfurterRate> {
  const key = `${base}/${quote}`;
  const cached = frankfurterCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached.value;
  let inFlight = frankfurterInFlight.get(key);
  if (!inFlight) {
    inFlight = fetchFrankfurterRate(base, quote).then((value) => {
      frankfurterCache.set(key, { value, fetchedAt: Date.now() });
      return value;
    }).finally(() => { frankfurterInFlight.delete(key); });
    frankfurterInFlight.set(key, inFlight);
  }
  return inFlight;
}

export async function getFrankfurterSeries(base: string, quote: string, start: string, end: string): Promise<FrankfurterSeries> {
  const params = new URLSearchParams({ base, quotes: quote, from: start, to: end });
  const response = await safeFetch(`https://api.frankfurter.dev/v2/rates?${params}`, {
    headers: { Accept: "application/json" }, timeoutMs: 10_000, acquisitionMethod: "vendor_api",
  });
  if (response.status === 404 || response.status === 422) {
    await discardBody(response, "Frankfurter series: unsupported pair");
    throw new FxCurrencyUnavailableError(response.status);
  }
  if (!response.ok) {
    await discardBody(response, "Frankfurter series: non-2xx");
    throw new Error(`Frankfurter rate service unavailable: HTTP ${response.status}.`);
  }
  try {
    const data = await readJsonWithLimit<unknown>(response, FRANKFURTER_SERIES_MAX_BYTES, "rate_source", "a historical-rate response of");
    if (!Array.isArray(data)) throw new Error("invalid response (expected an array)");
    for (const item of data) {
      const point = item as Partial<FrankfurterRate> | null;
      if (!point || point.base !== base || point.quote !== quote || typeof point.date !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(point.date) || point.date < start || point.date > end ||
          typeof point.rate !== "number" || !isPositiveRate(point.rate)) {
        throw new Error("invalid or mismatched response");
      }
    }
    return data as FrankfurterSeries;
  } catch (error) {
    throw new Error(`Frankfurter rate service unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function __resetFxRateCachesForTests(): void {
  ecbCache = undefined;
  ecbInFlight = undefined;
  ecbRefreshFailure = undefined;
  frankfurterCache.clear();
  frankfurterInFlight.clear();
  currenciesCache = undefined;
  currenciesInFlight = undefined;
}
