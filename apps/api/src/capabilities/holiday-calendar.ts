import { registerCapability, type CapabilityInput } from "./index.js";

// Nager.Date API — free, no key needed
const NAGER_API = "https://date.nager.at/api/v3";

// Cache holidays per country+year (holidays don't change mid-year)
const holidayCache = new Map<string, { data: any[]; cachedAt: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

export async function getHolidays(countryCode: string, year: number): Promise<any[]> {
  const key = `${countryCode}-${year}`;
  const cached = holidayCache.get(key);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return cached.data;
  }

  const url = `${NAGER_API}/PublicHolidays/${year}/${countryCode}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`Country '${countryCode}' not supported by Nager.Date API. Use ISO 2-letter codes (e.g. 'SE', 'US', 'DE').`);
    }
    throw new Error(`Nager.Date API error: HTTP ${res.status}`);
  }

  const data = (await res.json()) as any[];
  holidayCache.set(key, { data, cachedAt: Date.now() });
  return data;
}

registerCapability("holiday-calendar", async (input: CapabilityInput) => {
  const rawCountry = ((input.country_code as string) ?? (input.country as string) ?? (input.task as string) ?? "").trim().toUpperCase();
  if (!rawCountry) {
    throw new Error("'country_code' is required (ISO 2-letter code).");
  }

  const codeMatch = rawCountry.match(/\b([A-Z]{2})\b/);
  const countryCode = codeMatch ? codeMatch[1] : rawCountry.slice(0, 2);

  const currentYear = new Date().getFullYear();
  const year = input.year != null
    ? typeof input.year === "number" ? input.year : parseInt(String(input.year), 10)
    : currentYear;

  if (isNaN(year) || year < 1900 || year > 2100) {
    throw new Error("'year' must be between 1900 and 2100.");
  }

  const holidays = await getHolidays(countryCode, year);

  return {
    output: {
      country_code: countryCode,
      year,
      total_holidays: holidays.length,
      holidays: holidays.map((h: any) => ({
        date: h.date,
        name: h.name ?? h.localName,
        local_name: h.localName ?? null,
        type: h.types?.[0] ?? "Public",
        fixed: h.fixed ?? null,
        global: h.global ?? null,
        counties: h.counties ?? null,
      })),
    },
    provenance: { source: "nager.date", fetched_at: new Date().toISOString() },
  };
});
