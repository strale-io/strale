import { registerCapability, type CapabilityInput } from "./index.js";

// Open-Meteo API — free, no key required, no rate limit for reasonable use
const GEO_API = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_API = "https://api.open-meteo.com/v1/forecast";

interface GeoHit {
  name: string;
  latitude: number;
  longitude: number;
  country_code?: string;
  country?: string;
  admin1?: string;
  admin2?: string;
  admin3?: string;
  admin4?: string;
}

// Common ways callers name a country that Open-Meteo's `country` field does
// not spell out. Keys and values are lower case; values are ISO 3166-1 alpha-2.
const COUNTRY_ALIASES: Record<string, string> = {
  uk: "gb",
  "great britain": "gb",
  britain: "gb",
  usa: "us",
  "united states of america": "us",
  america: "us",
  uae: "ae",
  turkey: "tr",
  "czech republic": "cz",
  holland: "nl",
  "south korea": "kr",
};

// Open-Meteo spells US first-level administrative areas this way. A state
// code may also be an ISO country code (for example CA), so callers using a
// two-letter qualifier need both interpretations considered together.
const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia",
};

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** One comma-separated part of a place string, with postal codes removed ("Michigan 48505" → "Michigan"). */
const cleanPart = (s: string) => s.replace(/\b\d{3,}(-\d+)?\b/g, " ").replace(/\s+/g, " ").trim();

/** Does any of the caller's qualifiers ("UK", "New York City", "Ontario") name this hit's country or region? */
export function hitMatchesQualifiers(hit: GeoHit, qualifiers: string[]): boolean {
  const cc = (hit.country_code ?? "").toLowerCase();
  // Each region name also counts without a leading "the" or a trailing generic
  // word, so "Pabna" names "Pabna District" and "Netherlands" "The Netherlands".
  const names = [hit.country, hit.admin1, hit.admin2, hit.admin3, hit.admin4]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .map(norm)
    .flatMap((n) => [n, n.replace(/^the /, "").replace(/ (district|division|province|state|county|region|governorate|prefecture|municipality|city)$/, "")]);
  return qualifiers.some((raw) => {
    const q = norm(raw);
    if (!q) return false;
    if (cc && (q === cc || COUNTRY_ALIASES[q] === cc)) return true;
    // The qualifier is the name, or starts with it as whole words: "new york
    // city" names admin1 "new york". Never the other way round or in the middle,
    // so "ireland" does not name "northern ireland" and "new hampshire" does not
    // name "hampshire". Single letters never match.
    return names.some((n) => n.length > 1 && (q === n || q.startsWith(`${n} `)));
  });
}

/** Filter hits by qualifiers while resolving the dual meaning of US state codes. */
function qualifiedHits(hits: GeoHit[], qualifiers: string[], input: string): GeoHit[] {
  for (const qualifier of qualifiers) {
    const code = qualifier.trim().toUpperCase();
    const state = US_STATES[code];
    if (!state) continue;
    const hasStateHit = hits.some((hit) =>
      (hit.country_code ?? "").toLowerCase() === "us" && norm(hit.admin1 ?? "") === norm(state));
    const hasCountryHit = hits.some((hit) => (hit.country_code ?? "").toLowerCase() === code.toLowerCase());
    if (hasStateHit && hasCountryHit) {
      throw new Error(`Location "${input}" is ambiguous: "${code}" can mean a US state or a country. Write the state or country name in full, or pass latitude and longitude.`);
    }
  }

  return qualifiers.reduce((candidates, qualifier) => {
    const code = qualifier.trim().toUpperCase();
    const state = US_STATES[code];
    if (!state) {
      return candidates.filter((hit) => hitMatchesQualifiers(hit, [qualifier]));
    }

    const stateHits = candidates.filter((hit) =>
      (hit.country_code ?? "").toLowerCase() === "us" && norm(hit.admin1 ?? "") === norm(state));
    const countryHits = candidates.filter((hit) => (hit.country_code ?? "").toLowerCase() === code.toLowerCase());
    return stateHits.length ? stateHits : countryHits;
  }, hits);
}

async function geocodeName(name: string, count: number): Promise<GeoHit[]> {
  const geoUrl = `${GEO_API}?name=${encodeURIComponent(name)}&count=${count}&language=en`;
  const gr = await fetch(geoUrl, { signal: AbortSignal.timeout(10000) });
  if (!gr.ok) throw new Error(`Geocoding API returned HTTP ${gr.status}`);
  const gd = (await gr.json()) as { results?: GeoHit[] };
  return Array.isArray(gd.results)
    ? gd.results.filter((h): h is GeoHit => !!h && typeof h === "object" && Number.isFinite(h.latitude) && Number.isFinite(h.longitude))
    : [];
}

/**
 * Open-Meteo's geocoder matches a bare place name only: "London" resolves,
 * "London, UK" returns nothing. Callers overwhelmingly write "place, region,
 * country", so a qualified string is split on commas, the leading part is
 * looked up, and the hit whose country or regions all the remaining parts name
 * is taken. If no hit is in the region the caller named, the call refuses
 * rather than returning weather for a different place of that name.
 */
export async function resolvePlace(city: string): Promise<GeoHit> {
  const direct = await geocodeName(city, 1);
  if (direct.length) return direct[0];

  const parts = city.split(",").map(cleanPart).filter(Boolean);
  if (parts.length < 2) {
    const collapsedInput = city.replace(/\s+/g, " ").trim();
    if (parts.length === 1 && parts[0] === collapsedInput && collapsedInput !== city) {
      throw new Error(`Location "${city}" not found.`);
    }
    // A bare-name retry only when the caller wrote no comma ("Flint 48505").
    // "Springfield, 62701" named a region by postcode; guessing the top
    // Springfield would ignore it, so that refuses.
    if (parts.length === 1 && parts[0] !== collapsedInput && !city.includes(",")) {
      const bare = await geocodeName(parts[0], 1);
      if (bare.length) return bare[0];
    }

    if (parts.length === 1 && !city.includes(",")) {
      const words = parts[0].split(" ");
      let cityRuleRan = false;

      // Some callers append "City" to an unambiguous city name, while the
      // geocoder stores the place without that suffix. Require the returned
      // name to be exact so a related municipality is never substituted.
      if (words.length > 1 && norm(words.at(-1)!) === "city") {
        cityRuleRan = true;
        const name = words.slice(0, -1).join(" ");
        const hits = await geocodeName(name, 20);
        const match = hits.find((hit) => norm(hit.name) === norm(name));
        if (match) return match;
      }

      // Try the last one, two, then three words as a country or region. Each
      // lookup is accepted only when the qualifier identifies that hit.
      let mismatch: { name: string; qualifier: string } | undefined;
      const firstQualifierWords = cityRuleRan ? 2 : 1;
      const lastQualifierWords = Math.min(3, words.length - 1);
      for (let qualifierWords = firstQualifierWords; qualifierWords <= lastQualifierWords; qualifierWords++) {
        const name = words.slice(0, -qualifierWords).join(" ");
        const qualifier = words.slice(-qualifierWords).join(" ");
        const hits = await geocodeName(name, 20);
        const exactNameHits = hits.filter((hit) => norm(hit.name) === norm(name));
        const match = qualifiedHits(exactNameHits, [qualifier], city)[0];
        if (match) return match;
        if (!mismatch && hits.length) mismatch = { name, qualifier };
      }

      if (mismatch) {
        throw new Error(`Location "${city}" not found: places named "${mismatch.name}" exist, but none in ${mismatch.qualifier}. Pass latitude and longitude for an exact location.`);
      }
    }
    throw new Error(`Location "${city}" not found.`);
  }

  // Only the leading part is looked up, and a hit is taken only when every
  // later part names its country or one of its regions. Looking up a later
  // part on its own ("Georgia" out of "Twiggs County, Georgia, USA") finds a
  // different place of that name, so it is never done.
  const [name, ...qualifiers] = parts;
  const hits = await geocodeName(name, 20);
  const match = qualifiedHits(hits, qualifiers, city)[0];
  if (match) return match;
  throw new Error(
    hits.length
      ? `Location "${city}" not found: places named "${name}" exist, but none in ${qualifiers.join(", ")}. Pass latitude and longitude for an exact location.`
      : `Location "${city}" not found.`,
  );
}

registerCapability("weather-lookup", async (input: CapabilityInput) => {
  let lat = Number(input.latitude ?? input.lat);
  let lon = Number(input.longitude ?? input.lon ?? input.lng);
  const city = [input.city, input.location, input.place, input.task]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0)
    ?.trim() ?? "";

  // Geocode city name if no coordinates provided
  if ((isNaN(lat) || isNaN(lon)) && city) {
    const place = await resolvePlace(city);
    lat = place.latitude;
    lon = place.longitude;
  }

  if (isNaN(lat) || isNaN(lon)) {
    throw new Error("'city' (location name) or 'latitude'/'longitude' is required.");
  }

  const params = [
    `latitude=${lat}`,
    `longitude=${lon}`,
    `current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,wind_direction_10m,weather_code`,
    `daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code`,
    `timezone=auto`,
    `forecast_days=7`,
  ].join("&");

  const response = await fetch(`${WEATHER_API}?${params}`, {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) throw new Error(`Open-Meteo API returned HTTP ${response.status}`);
  const data = (await response.json()) as any;

  const weatherCodes: Record<number, string> = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Foggy", 48: "Depositing rime fog",
    51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
    80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
    85: "Slight snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail",
  };

  const current = data.current;
  const daily = data.daily;

  const forecast = daily?.time?.map((date: string, i: number) => ({
    date,
    high_c: daily.temperature_2m_max?.[i],
    low_c: daily.temperature_2m_min?.[i],
    precipitation_mm: daily.precipitation_sum?.[i],
    condition: weatherCodes[daily.weather_code?.[i]] ?? "Unknown",
  })) ?? [];

  return {
    output: {
      location: city || `${lat}, ${lon}`,
      coordinates: { latitude: lat, longitude: lon },
      timezone: data.timezone,
      current: {
        temperature_c: current?.temperature_2m,
        feels_like_c: current?.apparent_temperature,
        humidity_percent: current?.relative_humidity_2m,
        precipitation_mm: current?.precipitation,
        wind_speed_kmh: current?.wind_speed_10m,
        wind_direction_deg: current?.wind_direction_10m,
        condition: weatherCodes[current?.weather_code] ?? "Unknown",
      },
      forecast_7day: forecast,
    },
    provenance: { source: "api.open-meteo.com", fetched_at: new Date().toISOString() },
  };
});
