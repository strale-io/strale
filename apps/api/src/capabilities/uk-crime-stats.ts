import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * UK street-level crime statistics from the UK Police API.
 * Free, no API key required. Returns crime counts by category
 * with a computed safety score.
 */

registerCapability("uk-crime-stats", async (input: CapabilityInput) => {
  const postcode = ((input.postcode as string) ?? "").trim().toUpperCase();
  const lat = Number(input.latitude ?? input.lat ?? 0);
  const lng = Number(input.longitude ?? input.lng ?? input.lon ?? 0);

  if (!postcode && (!lat || !lng)) {
    throw new Error("'postcode' or 'latitude'+'longitude' is required.");
  }

  // If postcode provided, geocode it via postcodes.io (free, no key)
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

  // Fetch latest available month's crime data
  const crimeResp = await fetch(
    `https://data.police.uk/api/crimes-street/all-crime?lat=${useLat}&lng=${useLng}`,
    { signal: AbortSignal.timeout(15000) },
  );

  if (!crimeResp.ok) {
    throw new Error(`UK Police API returned HTTP ${crimeResp.status}.`);
  }

  const crimes = (await crimeResp.json()) as Array<Record<string, unknown>>;

  // Aggregate by category
  const counts: Record<string, number> = {};
  for (const crime of crimes) {
    const cat = (crime.category as string) ?? "other";
    counts[cat] = (counts[cat] ?? 0) + 1;
  }

  // Sort by count descending
  const categories = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => ({ category: category.replace(/-/g, " "), count }));

  // Safety score: 100 = safest, 0 = most crime
  // Based on total crimes within ~1 mile radius. < 20 = safe, > 200 = high crime
  const total = crimes.length;
  const safetyScore = Math.max(0, Math.min(100, Math.round(100 - (total / 3))));

  const safetyLabel =
    safetyScore >= 80 ? "very low crime" :
    safetyScore >= 60 ? "low crime" :
    safetyScore >= 40 ? "moderate crime" :
    safetyScore >= 20 ? "above average crime" :
    "high crime area";

  // Extract the month from the data
  const month = crimes.length > 0 ? (crimes[0].month as string) ?? null : null;

  return {
    output: {
      location: postcode || `${useLat},${useLng}`,
      total_crimes: total,
      safety_score: safetyScore,
      safety_label: safetyLabel,
      month,
      categories,
      top_crime: categories[0]?.category ?? null,
    },
    provenance: { source: "data.police.uk", fetched_at: new Date().toISOString() },
  };
});
