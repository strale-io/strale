import { registerCapability, type CapabilityInput } from "./index.js";

// Open-Meteo API — free, no key required, no rate limit for reasonable use
const GEO_API = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_API = "https://api.open-meteo.com/v1/forecast";

interface GeoHit {
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
};

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** One comma-separated part of a place string, with postal codes removed ("Michigan 48505" → "Michigan"). */
const cleanPart = (s: string) => s.replace(/\b\d{3,}(-\d+)?\b/g, " ").replace(/\s+/g, " ").trim();

/** Does any of the caller's qualifiers ("UK", "New York City", "Ontario") name this hit's country or region? */
export function hitMatchesQualifiers(hit: GeoHit, qualifiers: string[]): boolean {
  const cc = (hit.country_code ?? "").toLowerCase();
  const names = [hit.country, hit.admin1, hit.admin2, hit.admin3, hit.admin4]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .map(norm);
  return qualifiers.some((raw) => {
    const q = norm(raw);
    if (!q) return false;
    if (cc && (q === cc || COUNTRY_ALIASES[q] === cc)) return true;
    // Whole-word containment either way: "new york city" names admin1 "new york";
    // "north holland" names "north holland". Single letters never match.
    return names.some((n) => n.length > 1 && (` ${q} `.includes(` ${n} `) || ` ${n} `.includes(` ${q} `)));
  });
}

async function geocodeName(name: string, count: number): Promise<GeoHit[]> {
  const geoUrl = `${GEO_API}?name=${encodeURIComponent(name)}&count=${count}&language=en`;
  const gr = await fetch(geoUrl, { signal: AbortSignal.timeout(10000) });
  if (!gr.ok) throw new Error(`Geocoding API returned HTTP ${gr.status}`);
  const gd = (await gr.json()) as { results?: GeoHit[] };
  return Array.isArray(gd.results) ? gd.results : [];
}

/**
 * Open-Meteo's geocoder matches a bare place name only: "London" resolves,
 * "London, UK" returns nothing. Callers overwhelmingly write "place, region,
 * country", so a qualified string is split on commas, the leading part is
 * looked up, and the hit whose country or region the remaining parts name is
 * taken. If none of the hits is in the region the caller named, the call
 * refuses rather than returning weather for a different place of that name.
 */
export async function resolvePlace(city: string): Promise<GeoHit> {
  const direct = await geocodeName(city, 1);
  if (direct.length) return direct[0];

  const parts = city.split(",").map(cleanPart).filter(Boolean);
  if (parts.length < 2) {
    if (parts.length === 1 && parts[0] !== city) {
      const bare = await geocodeName(parts[0], 1);
      if (bare.length) return bare[0];
    }
    throw new Error(`Location "${city}" not found.`);
  }

  // Try each part as the place name, with the parts after it as qualifiers.
  // The last part is never looked up on its own: it is the country or region.
  // At most three lookups, so a string of many commas cannot fan out upstream.
  let candidatesSeen = false;
  for (let i = 0; i < Math.min(parts.length - 1, 3); i++) {
    const hits = await geocodeName(parts[i], 10);
    if (hits.length) candidatesSeen = true;
    const match = hits.find((h) => hitMatchesQualifiers(h, parts.slice(i + 1)));
    if (match) return match;
  }
  throw new Error(
    candidatesSeen
      ? `Location "${city}" not found: places of that name exist, but none in ${parts.slice(1).join(", ")}. Pass latitude and longitude for an exact location.`
      : `Location "${city}" not found.`,
  );
}

registerCapability("weather-lookup", async (input: CapabilityInput) => {
  let lat = Number(input.latitude ?? input.lat);
  let lon = Number(input.longitude ?? input.lon ?? input.lng);
  const city = ((input.city as string) ?? (input.location as string) ?? (input.task as string) ?? "").trim();

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
