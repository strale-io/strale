import { registerCapability, type CapabilityInput } from "./index.js";

// Open-Meteo API — free, no key required, no rate limit for reasonable use
const GEO_API = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_API = "https://api.open-meteo.com/v1/forecast";

registerCapability("weather-lookup", async (input: CapabilityInput) => {
  let lat = Number(input.latitude ?? input.lat);
  let lon = Number(input.longitude ?? input.lon ?? input.lng);
  const city = ((input.city as string) ?? (input.location as string) ?? (input.task as string) ?? "").trim();

  // Geocode city name if no coordinates provided
  if ((isNaN(lat) || isNaN(lon)) && city) {
    const geoUrl = `${GEO_API}?name=${encodeURIComponent(city)}&count=1&language=en`;
    const gr = await fetch(geoUrl, { signal: AbortSignal.timeout(10000) });
    if (!gr.ok) throw new Error(`Geocoding API returned HTTP ${gr.status}`);
    const gd = (await gr.json()) as any;
    if (!gd.results?.length) throw new Error(`Location "${city}" not found.`);
    lat = gd.results[0].latitude;
    lon = gd.results[0].longitude;
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
