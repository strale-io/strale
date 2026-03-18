import { registerCapability, type CapabilityInput } from "./index.js";

// Shared Nominatim rate limiter (1 req/sec per their usage policy)
let lastNominatimCall = 0;
async function nominatimThrottle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastNominatimCall;
  if (elapsed < 1100) {
    await new Promise((resolve) => setTimeout(resolve, 1100 - elapsed));
  }
  lastNominatimCall = Date.now();
}

export { nominatimThrottle };

registerCapability("address-validate", async (input: CapabilityInput) => {
  const address = ((input.address as string) ?? (input.task as string) ?? "").trim();
  if (!address) {
    throw new Error("'address' is required. Provide a full postal address.");
  }

  const countryCode = ((input.country_code as string) ?? "").trim().toLowerCase() || undefined;

  await nominatimThrottle();

  const params = new URLSearchParams({
    q: address,
    format: "jsonv2",
    addressdetails: "1",
    limit: "1",
  });
  if (countryCode) {
    params.set("countrycodes", countryCode);
  }

  const url = `https://nominatim.openstreetmap.org/search?${params}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Strale/1.0 (api; admin@strale.io)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`Nominatim error: HTTP ${res.status}`);
  }

  const results = (await res.json()) as any[];

  if (results.length === 0) {
    return {
      output: {
        valid: false,
        confidence: 0,
        formatted_address: null,
        components: null,
        latitude: null,
        longitude: null,
        match_type: null,
        input_address: address,
      },
      provenance: { source: "openstreetmap-nominatim", fetched_at: new Date().toISOString() },
    };
  }

  const r = results[0];
  const addr = r.address ?? {};
  const importance = r.importance ?? 0;
  const confidence = Math.min(importance * 1.2, 1.0);

  let matchType = "approximate";
  if (r.type === "house" || r.type === "building") matchType = "exact";
  else if (r.type === "street" || r.addresstype === "road") matchType = "interpolated";

  return {
    output: {
      valid: confidence > 0.3,
      confidence: Math.round(confidence * 100) / 100,
      formatted_address: r.display_name ?? null,
      components: {
        street: addr.road ?? addr.street ?? null,
        house_number: addr.house_number ?? null,
        city: addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? null,
        state: addr.state ?? null,
        postal_code: addr.postcode ?? null,
        country: addr.country ?? null,
        country_code: addr.country_code?.toUpperCase() ?? null,
      },
      latitude: parseFloat(r.lat) || null,
      longitude: parseFloat(r.lon) || null,
      match_type: matchType,
      input_address: address,
    },
    provenance: { source: "openstreetmap-nominatim", fetched_at: new Date().toISOString() },
  };
});
