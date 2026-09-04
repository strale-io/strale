import { registerCapability, type CapabilityInput } from "./index.js";
import { readJsonWithLimit } from "../lib/resource-limits.js";
import { readBoundedInt } from "../lib/capability-input.js";

// USGS Earthquake Hazards Program — FDSN event web service (official, free,
// no key). Verified live 2026-09-04.
const API = "https://earthquake.usgs.gov/fdsnws/event/1/query";
const USER_AGENT = "Strale/1.0 (support@strale.io)";
const DATE_RE = /^\d{4}-\d{2}-\d{2}(T[0-9:.]+Z?)?$/;

interface Feature {
  id?: string;
  properties?: { mag?: number | null; place?: string | null; time?: number; updated?: number; tz?: number | null; url?: string; felt?: number | null; cdi?: number | null; mmi?: number | null; alert?: string | null; status?: string; tsunami?: number; sig?: number; magType?: string; type?: string; title?: string };
  geometry?: { coordinates?: [number, number, number] };
}

function readNumber(value: unknown, field: string, min: number, max: number): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`'${field}' must be a number between ${min} and ${max}.`);
  return n;
}

registerCapability("usgs-earthquake-search", async (input: CapabilityInput) => {
  const minMagnitude = readNumber(input.min_magnitude, "min_magnitude", -1, 10) ?? 4.5;
  const maxMagnitude = readNumber(input.max_magnitude, "max_magnitude", -1, 10);
  const limit = readBoundedInt(input.limit, "limit", { min: 1, max: 100, fallback: 20 });
  const latitude = readNumber(input.latitude, "latitude", -90, 90);
  const longitude = readNumber(input.longitude, "longitude", -180, 180);
  const radiusKm = readNumber(input.max_radius_km, "max_radius_km", 1, 20_001);
  if ((latitude === null) !== (longitude === null)) throw new Error("'latitude' and 'longitude' must be given together.");
  const startTime = typeof input.start_time === "string" && input.start_time.trim() ? input.start_time.trim() : null;
  const endTime = typeof input.end_time === "string" && input.end_time.trim() ? input.end_time.trim() : null;
  for (const [field, v] of [["start_time", startTime], ["end_time", endTime]] as const) {
    if (v && !DATE_RE.test(v)) throw new Error(`'${field}' must be an ISO date (YYYY-MM-DD) or datetime.`);
  }
  const orderBy = input.order === "magnitude" ? "magnitude" : "time";

  const params = new URLSearchParams({ format: "geojson", limit: String(limit), orderby: orderBy, minmagnitude: String(minMagnitude) });
  if (maxMagnitude !== null) params.set("maxmagnitude", String(maxMagnitude));
  if (startTime) params.set("starttime", startTime);
  if (endTime) params.set("endtime", endTime);
  if (latitude !== null && longitude !== null) {
    params.set("latitude", String(latitude));
    params.set("longitude", String(longitude));
    params.set("maxradiuskm", String(radiusKm ?? 500));
  }
  if (!startTime && !endTime) {
    // Default window: the last 30 days, so a bare call is bounded and fresh.
    params.set("starttime", new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
  }

  const response = await fetch(`${API}?${params.toString()}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (response.status === 400) throw new Error("USGS rejected the query parameters (HTTP 400). Check dates and coordinates.");
  if (response.status === 429 || response.status === 503) throw new Error(`USGS is throttling requests right now (HTTP ${response.status}). Retry shortly.`);
  if (!response.ok) throw new Error(`USGS returned HTTP ${response.status}.`);

  const data = await readJsonWithLimit<{ features?: Feature[]; metadata?: { count?: number; generated?: number } }>(response);
  const features = Array.isArray(data.features) ? data.features : [];
  const earthquakes = features.map((f) => {
    const p = f.properties ?? {};
    const [lon, lat, depth] = f.geometry?.coordinates ?? [null, null, null];
    return {
      id: f.id ?? null,
      magnitude: p.mag ?? null,
      magnitude_type: p.magType ?? null,
      place: p.place ?? null,
      time: p.time ? new Date(p.time).toISOString() : null,
      updated: p.updated ? new Date(p.updated).toISOString() : null,
      latitude: lat,
      longitude: lon,
      depth_km: depth,
      tsunami_warning: p.tsunami === 1,
      alert_level: p.alert ?? null,
      felt_reports: p.felt ?? null,
      significance: p.sig ?? null,
      status: p.status ?? null,
      event_type: p.type ?? null,
      url: p.url ?? null,
    };
  });

  return {
    output: {
      filters: { min_magnitude: minMagnitude, max_magnitude: maxMagnitude, start_time: params.get("starttime"), end_time: endTime, latitude, longitude, max_radius_km: latitude !== null ? (radiusKm ?? 500) : null, order: orderBy },
      count: data.metadata?.count ?? earthquakes.length,
      earthquakes,
    },
    provenance: { source: "earthquake.usgs.gov", fetched_at: new Date().toISOString() },
  };
});
