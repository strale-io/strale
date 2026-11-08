import { MAX_FETCHED_API_RESPONSE_BYTES, readJsonWithLimit, readTextWithLimit } from "../resource-limits.js";
import { safeFetch } from "../safe-fetch.js";

const ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const CACHE_MS = 60 * 60 * 1000;
const STALE_MS = 4 * 24 * 60 * 60 * 1000;

export interface EcbReferenceRates { date: string; rates: Map<string, number>; stale?: true }
export interface FrankfurterRate { date: string; base: string; quote: string; rate: number }

export class FxCurrencyUnavailableError extends Error {
  constructor(readonly status: 404 | 422) {
    super("The source has no published reference rate for this currency pair.");
    this.name = "FxCurrencyUnavailableError";
  }
}

let ecbCache: { value: EcbReferenceRates; fetchedAt: number } | undefined;
let ecbInFlight: Promise<EcbReferenceRates> | undefined;
const frankfurterCache = new Map<string, { value: FrankfurterRate; fetchedAt: number }>();
const frankfurterInFlight = new Map<string, Promise<FrankfurterRate>>();

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
  if (!response.ok) throw new Error(`ECB reference-rate source returned HTTP ${response.status}.`);
  return parseEcbXml(await readTextWithLimit(response, MAX_FETCHED_API_RESPONSE_BYTES, "rate_source", "a reference-rate response of"));
}

export async function getEcbReferenceRates(): Promise<EcbReferenceRates> {
  const now = Date.now();
  if (ecbCache && now - ecbCache.fetchedAt < CACHE_MS) return { ...ecbCache.value, ...(isPastNextExpectedPublication(ecbCache.value.date, now) ? { stale: true as const } : {}) };
  if (!ecbInFlight) {
    ecbInFlight = fetchEcbReferenceRates().then((value) => {
      ecbCache = { value, fetchedAt: Date.now() };
      return value;
    }).finally(() => { ecbInFlight = undefined; });
  }
  try {
    const value = await ecbInFlight;
    return { ...value, ...(isPastNextExpectedPublication(value.date, now) ? { stale: true as const } : {}) };
  } catch (error) {
    if (ecbCache && now - ecbCache.fetchedAt <= STALE_MS) return { ...ecbCache.value, ...(isPastNextExpectedPublication(ecbCache.value.date, now) ? { stale: true as const } : {}) };
    throw error;
  }
}

async function fetchFrankfurterRate(base: string, quote: string): Promise<FrankfurterRate> {
  const response = await safeFetch(`https://api.frankfurter.dev/v2/rate/${base}/${quote}`, { headers: { Accept: "application/json" }, timeoutMs: 5_000, acquisitionMethod: "vendor_api" });
  if (response.status === 404 || response.status === 422) throw new FxCurrencyUnavailableError(response.status);
  if (!response.ok) throw new Error(`Frankfurter rate source returned HTTP ${response.status}.`);
  const data = await readJsonWithLimit<FrankfurterRate>(response, MAX_FETCHED_API_RESPONSE_BYTES, "rate_source", "a reference-rate response of");
  if (data.base !== base || data.quote !== quote || !isPositiveRate(data.rate) || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new Error("Frankfurter rate source returned an invalid or mismatched response.");
  return data;
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

export function __resetFxRateCachesForTests(): void {
  ecbCache = undefined;
  ecbInFlight = undefined;
  frankfurterCache.clear();
  frankfurterInFlight.clear();
}
