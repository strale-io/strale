import { registerCapability, type CapabilityInput } from "./index.js";
import { readStringArray } from "../lib/capability-input.js";

/**
 * Country economic indicators — World Bank Indicators (WDI) API. Official,
 * free, no API key. Provides macroeconomic country-risk context for KYB
 * (GDP, growth, inflation, unemployment, population, trade openness) —
 * complements country-trade-data.ts, which covers detailed export/import
 * commodity and partner breakdowns from the same API but does not surface
 * general macro/inflation/labor indicators.
 *
 * API docs: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392
 */

const WB_API = "https://api.worldbank.org/v2";

// Friendly key → World Bank indicator code. Curated for KYB/country-risk
// relevance rather than exhaustively covering the ~16,000 WDI indicators.
const INDICATOR_MAP: Record<string, string> = {
  gdp_usd: "NY.GDP.MKTP.CD",
  gdp_growth_percent: "NY.GDP.MKTP.KD.ZG",
  gdp_per_capita_usd: "NY.GDP.PCAP.CD",
  inflation_percent: "FP.CPI.TOTL.ZG",
  unemployment_percent: "SL.UEM.TOTL.ZS",
  population: "SP.POP.TOTL",
  gni_per_capita_usd: "NY.GNP.PCAP.CD",
  exports_percent_gdp: "NE.EXP.GNFS.ZS",
  imports_percent_gdp: "NE.IMP.GNFS.ZS",
  fdi_inflow_percent_gdp: "BX.KLT.DINV.WD.GD.ZS",
};

const DEFAULT_INDICATORS = [
  "gdp_usd",
  "gdp_growth_percent",
  "inflation_percent",
  "unemployment_percent",
  "population",
];

interface IndicatorResult {
  value: number | null;
  year: string | null;
  unavailable_reason?: string;
}

async function fetchIndicator(
  countryCode: string,
  indicatorCode: string,
  year: string | undefined,
): Promise<IndicatorResult> {
  // mrv (most-recent-value) and date are mutually exclusive in the World
  // Bank API — sending both silently ignores `date` and returns the most
  // recent observation instead, which would misreport requested_year for
  // an explicit historical-year query.
  const params = new URLSearchParams({ format: "json" });
  if (year) {
    params.set("date", year);
  } else {
    params.set("mrv", "1");
  }

  const url = `${WB_API}/country/${encodeURIComponent(countryCode)}/indicator/${indicatorCode}?${params.toString()}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    return { value: null, year: null, unavailable_reason: `HTTP ${response.status}` };
  }

  const data = (await response.json()) as any;

  // World Bank returns a single-element array with a `message` on invalid
  // country/indicator combinations, and a two-element [meta, values] array
  // on success (values may be an empty array if there's no data at all).
  if (!Array.isArray(data) || data.length < 2 || !Array.isArray(data[1])) {
    const msg = data?.[0]?.message?.[0]?.value;
    return { value: null, year: null, unavailable_reason: msg || "no data returned" };
  }

  const entry = data[1][0];
  if (!entry || entry.value === null || entry.value === undefined) {
    return { value: null, year: entry?.date ?? null, unavailable_reason: "no observation for this period" };
  }

  return { value: entry.value, year: entry.date ?? null };
}

registerCapability("country-economic-indicators", async (input: CapabilityInput) => {
  const countryCode = ((input.country_code as string) ?? (input.country as string) ?? (input.task as string) ?? "").trim();
  if (countryCode.length < 2 || countryCode.length > 3) {
    throw new Error("'country_code' is required (ISO 2-letter or 3-letter code, e.g. SE or SWE).");
  }

  const year = (input.year as string | number | undefined) ? String(input.year).trim() : undefined;
  if (year && !/^\d{4}$/.test(year)) {
    throw new Error("'year' must be a 4-digit year.");
  }

  // Absent still means "use the defaults". What changes is that an
  // `indicators` the caller DID send but shaped wrongly is now refused rather
  // than silently discarded — the old `Array.isArray(...)` test fell through
  // to DEFAULT_INDICATORS, so a caller passing a bare string got a successful,
  // billed response about indicators they never asked for.
  const requestedIndicators = readStringArray(input.indicators, "indicators");
  let requestedKeys = DEFAULT_INDICATORS;
  if (requestedIndicators.length > 0) {
    const invalid = requestedIndicators.filter((k) => !INDICATOR_MAP[k]);
    if (invalid.length > 0) {
      throw new Error(
        `Unknown indicator key(s): ${invalid.join(", ")}. Valid keys: ${Object.keys(INDICATOR_MAP).join(", ")}.`,
      );
    }
    requestedKeys = requestedIndicators;
  }

  const results = await Promise.all(
    requestedKeys.map(async (key) => {
      const wbCode = INDICATOR_MAP[key];
      const result = await fetchIndicator(countryCode, wbCode, year);
      return [key, result] as const;
    }),
  );

  const indicators: Record<string, IndicatorResult> = {};
  let anyAvailable = false;
  for (const [key, result] of results) {
    indicators[key] = result;
    if (result.value !== null) anyAvailable = true;
  }

  if (!anyAvailable) {
    throw new Error(
      `No World Bank data available for '${countryCode}'. Verify the ISO country code is valid (e.g. SE, US, DE).`,
    );
  }

  return {
    output: {
      country_code: countryCode.toUpperCase(),
      requested_year: year || "most_recent",
      indicators,
      indicator_codes: Object.fromEntries(requestedKeys.map((k) => [k, INDICATOR_MAP[k]])),
    },
    provenance: {
      source: "api.worldbank.org",
      fetched_at: new Date().toISOString(),
      upstream_vendor: "The World Bank Group",
      acquisition_method: "official_api",
      primary_source_reference: "https://data.worldbank.org/",
    },
  };
});
