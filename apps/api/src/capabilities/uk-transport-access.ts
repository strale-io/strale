import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * UK public transport accessibility score by postcode.
 * Uses NaPTAN (National Public Transport Access Nodes) for stop data
 * and postcodes.io for geocoding. Free, no API key required.
 */

registerCapability("uk-transport-access", async (input: CapabilityInput) => {
  const postcode = ((input.postcode as string) ?? "").trim().toUpperCase();
  const lat = Number(input.latitude ?? input.lat ?? 0);
  const lng = Number(input.longitude ?? input.lng ?? input.lon ?? 0);

  if (!postcode && (!lat || !lng)) {
    throw new Error("'postcode' or 'latitude'+'longitude' is required.");
  }

  // Geocode postcode
  let useLat = lat;
  let useLng = lng;

  if (postcode && (!lat || !lng)) {
    const geoResp = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!geoResp.ok) throw new Error(`Invalid postcode '${postcode}'.`);
    const geoData = (await geoResp.json()) as Record<string, unknown>;
    const result = geoData.result as Record<string, unknown> | null;
    if (!result?.latitude || !result?.longitude) {
      throw new Error(`Could not geocode postcode '${postcode}'.`);
    }
    useLat = result.latitude as number;
    useLng = result.longitude as number;
  }

  // Fetch nearby transport stops from NaPTAN (CSV format, parse ourselves)
  const naptanUrl = `https://naptan.api.dft.gov.uk/v1/access-nodes?lat=${useLat}&lon=${useLng}&maxDistance=1000&maxResults=30&dataFormat=csv`;
  const naptanResp = await fetch(naptanUrl, { signal: AbortSignal.timeout(10000) });

  if (!naptanResp.ok) {
    throw new Error(`NaPTAN API returned HTTP ${naptanResp.status}.`);
  }

  const csvText = await naptanResp.text();
  const lines = csvText.trim().split("\n");

  if (lines.length < 2) {
    return {
      output: {
        location: postcode || `${useLat},${useLng}`,
        transport_score: 0,
        transport_label: "very poor",
        total_stops_within_1km: 0,
        stops_by_type: {},
        nearest_stops: [],
      },
      provenance: { source: "naptan.api.dft.gov.uk", fetched_at: new Date().toISOString() },
    };
  }

  // Parse CSV headers
  const headers = lines[0].split(",");
  const nameIdx = headers.indexOf("CommonName");
  const typeIdx = headers.indexOf("StopType");
  const latIdx = headers.indexOf("Latitude");
  const lonIdx = headers.indexOf("Longitude");
  const statusIdx = headers.indexOf("Status");

  const stops: Array<{
    name: string;
    type: string;
    type_label: string;
    distance_m: number;
  }> = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const status = cols[statusIdx] ?? "";
    if (status !== "active" && status !== "act") continue;

    const stopLat = parseFloat(cols[latIdx] ?? "0");
    const stopLon = parseFloat(cols[lonIdx] ?? "0");
    const stopType = cols[typeIdx] ?? "unknown";
    const name = cols[nameIdx] ?? "Unknown";

    const distance = haversineMeters(useLat, useLng, stopLat, stopLon);

    stops.push({
      name,
      type: stopType,
      type_label: STOP_TYPE_LABELS[stopType] ?? stopType,
      distance_m: Math.round(distance),
    });
  }

  // Sort by distance
  stops.sort((a, b) => a.distance_m - b.distance_m);

  // Count by type
  const byType: Record<string, number> = {};
  for (const stop of stops) {
    const label = stop.type_label;
    byType[label] = (byType[label] ?? 0) + 1;
  }

  // Compute transport score (0-100)
  const hasRail = stops.some((s) => ["RLY", "MET", "PLT"].includes(s.type));
  const hasBus = stops.some((s) => ["BCT", "BCS", "BCQ"].includes(s.type));
  const hasTram = stops.some((s) => ["TMU", "MET"].includes(s.type));

  const nearestRailM = stops.find((s) => ["RLY", "MET", "PLT"].includes(s.type))?.distance_m ?? 99999;
  const nearestBusM = stops.find((s) => ["BCT", "BCS", "BCQ"].includes(s.type))?.distance_m ?? 99999;

  let score = 0;
  score += Math.min(30, Math.max(0, 30 - (nearestBusM / 50))); // bus within 1500m = up to 30
  score += Math.min(40, Math.max(0, 40 - (nearestRailM / 50))); // rail within 2000m = up to 40
  score += Math.min(15, stops.length); // more stops = more options, up to 15
  if (hasTram) score += 10;
  if (hasRail && hasBus) score += 5;
  score = Math.min(100, Math.max(0, Math.round(score)));

  const scoreLabel =
    score >= 80 ? "excellent" :
    score >= 60 ? "good" :
    score >= 40 ? "moderate" :
    score >= 20 ? "poor" :
    "very poor";

  return {
    output: {
      location: postcode || `${useLat},${useLng}`,
      transport_score: score,
      transport_label: scoreLabel,
      total_stops_within_1km: stops.length,
      has_rail: hasRail,
      has_bus: hasBus,
      has_tram: hasTram,
      nearest_rail_m: nearestRailM < 99999 ? nearestRailM : null,
      nearest_bus_m: nearestBusM < 99999 ? nearestBusM : null,
      stops_by_type: byType,
      nearest_stops: stops.slice(0, 10).map((s) => ({
        name: s.name,
        type: s.type_label,
        distance_m: s.distance_m,
      })),
    },
    provenance: { source: "naptan.api.dft.gov.uk", fetched_at: new Date().toISOString() },
  };
});

// ─── Helpers ────────────────────────────────────────────────────────────────

const STOP_TYPE_LABELS: Record<string, string> = {
  BCT: "bus stop",
  BCS: "bus stop (pair)",
  BCQ: "bus stop (on-street)",
  RLY: "rail station",
  MET: "metro/tram stop",
  PLT: "rail platform",
  TMU: "tram stop",
  FER: "ferry terminal",
  AIR: "airport",
  GAT: "bus station entrance",
  BST: "bus station bay",
};

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
