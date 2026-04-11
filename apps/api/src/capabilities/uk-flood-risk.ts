import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * UK flood risk assessment from the Environment Agency.
 * Free API, no key required. Returns flood risk level,
 * nearby flood areas, and risk factors.
 */

registerCapability("uk-flood-risk", async (input: CapabilityInput) => {
  const postcode = ((input.postcode as string) ?? "").trim().toUpperCase();
  const lat = Number(input.latitude ?? input.lat ?? 0);
  const lng = Number(input.longitude ?? input.lng ?? input.lon ?? 0);

  if (!postcode && (!lat || !lng)) {
    throw new Error("'postcode' or 'latitude'+'longitude' is required.");
  }

  // Geocode postcode if needed
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

  // Query Environment Agency flood areas within 2km
  const floodResp = await fetch(
    `https://environment.data.gov.uk/flood-monitoring/id/floodAreas?lat=${useLat}&long=${useLng}&dist=2`,
    { signal: AbortSignal.timeout(10000) },
  );

  let floodAreas: Array<Record<string, unknown>> = [];
  if (floodResp.ok) {
    const data = (await floodResp.json()) as Record<string, unknown>;
    floodAreas = ((data.items ?? []) as Array<Record<string, unknown>>).slice(0, 10);
  }

  // Query current flood warnings
  const warningResp = await fetch(
    `https://environment.data.gov.uk/flood-monitoring/id/floods?lat=${useLat}&long=${useLng}&dist=5`,
    { signal: AbortSignal.timeout(10000) },
  );

  let warnings: Array<Record<string, unknown>> = [];
  if (warningResp.ok) {
    const data = (await warningResp.json()) as Record<string, unknown>;
    warnings = ((data.items ?? []) as Array<Record<string, unknown>>).slice(0, 5);
  }

  // Determine risk level from flood areas
  const hasCoastalRisk = floodAreas.some((a) => String(a.floodType ?? "").includes("Coastal"));
  const hasRiverRisk = floodAreas.some((a) => String(a.floodType ?? "").includes("River"));
  const hasSurfaceRisk = floodAreas.some((a) => String(a.floodType ?? "").includes("Surface"));
  const activeWarnings = warnings.filter((w) => {
    const severity = String(w.severityLevel ?? "");
    return severity.includes("1") || severity.includes("2") || severity.includes("3");
  });

  let riskLevel: string;
  if (activeWarnings.length > 0) {
    riskLevel = "high";
  } else if (floodAreas.length === 0) {
    riskLevel = "very low";
  } else if (floodAreas.length <= 2) {
    riskLevel = "low";
  } else if (floodAreas.length <= 5) {
    riskLevel = "medium";
  } else {
    riskLevel = "high";
  }

  return {
    output: {
      location: postcode || `${useLat},${useLng}`,
      risk_level: riskLevel,
      flood_areas_nearby: floodAreas.length,
      active_warnings: activeWarnings.length,
      risk_factors: {
        river_flooding: hasRiverRisk,
        coastal_flooding: hasCoastalRisk,
        surface_water: hasSurfaceRisk,
      },
      flood_areas: floodAreas.map((a) => ({
        name: a.label ?? a.notation,
        type: a.floodType,
        description: a.description,
      })),
      warnings: activeWarnings.map((w) => ({
        description: w.description,
        severity: w.severityLevel,
        message: w.message,
        time_raised: w.timeRaised,
      })),
    },
    provenance: { source: "environment.data.gov.uk", fetched_at: new Date().toISOString() },
  };
});
