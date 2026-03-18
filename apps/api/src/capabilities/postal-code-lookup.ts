import { registerCapability, type CapabilityInput } from "./index.js";

// Zippopotam.us — free, no key needed
registerCapability("postal-code-lookup", async (input: CapabilityInput) => {
  const postalCode = ((input.postal_code as string) ?? (input.zip as string) ?? (input.task as string) ?? "").trim();
  if (!postalCode) throw new Error("'postal_code' is required.");

  const countryCode = ((input.country_code as string) ?? (input.country as string) ?? "US").trim().toLowerCase();

  const url = `https://api.zippopotam.us/${countryCode}/${encodeURIComponent(postalCode)}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (res.status === 404) {
    return {
      output: {
        postal_code: postalCode,
        country_code: countryCode.toUpperCase(),
        valid: false,
        places: [],
        error: "Postal code not found",
      },
      provenance: { source: "zippopotam.us", fetched_at: new Date().toISOString() },
    };
  }

  if (!res.ok) {
    throw new Error(`Zippopotam.us error: HTTP ${res.status}`);
  }

  const data = (await res.json()) as any;

  const places = (data.places ?? []).map((p: any) => ({
    name: p["place name"] ?? null,
    state: p.state ?? null,
    state_abbreviation: p["state abbreviation"] ?? null,
    latitude: p.latitude ? parseFloat(p.latitude) : null,
    longitude: p.longitude ? parseFloat(p.longitude) : null,
  }));

  return {
    output: {
      postal_code: data["post code"] ?? postalCode,
      country_code: (data["country abbreviation"] ?? countryCode).toUpperCase(),
      country_name: data.country ?? null,
      valid: true,
      places,
    },
    provenance: { source: "zippopotam.us", fetched_at: new Date().toISOString() },
  };
});
