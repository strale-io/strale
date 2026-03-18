import { registerCapability, type CapabilityInput } from "./index.js";
import { nominatimThrottle } from "./address-validate.js";

registerCapability("address-geocode", async (input: CapabilityInput) => {
  const address = ((input.address as string) ?? (input.task as string) ?? "").trim();
  if (!address) {
    throw new Error("'address' is required. Provide an address or place name to geocode.");
  }

  await nominatimThrottle();

  const params = new URLSearchParams({
    q: address,
    format: "jsonv2",
    addressdetails: "1",
    limit: "1",
  });

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
        latitude: null,
        longitude: null,
        display_name: null,
        bounding_box: null,
        place_type: null,
        importance_score: null,
        input_address: address,
        found: false,
      },
      provenance: { source: "openstreetmap-nominatim", fetched_at: new Date().toISOString() },
    };
  }

  const r = results[0];

  return {
    output: {
      latitude: parseFloat(r.lat) || null,
      longitude: parseFloat(r.lon) || null,
      display_name: r.display_name ?? null,
      bounding_box: r.boundingbox
        ? {
            south: parseFloat(r.boundingbox[0]),
            north: parseFloat(r.boundingbox[1]),
            west: parseFloat(r.boundingbox[2]),
            east: parseFloat(r.boundingbox[3]),
          }
        : null,
      place_type: r.type ?? r.addresstype ?? null,
      importance_score: r.importance ?? null,
      input_address: address,
      found: true,
    },
    provenance: { source: "openstreetmap-nominatim", fetched_at: new Date().toISOString() },
  };
});
