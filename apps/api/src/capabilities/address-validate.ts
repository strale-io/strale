import { CapabilityRefusalError, inputRefusal } from "../lib/capability-refusal.js";
import { registerCapability, type CapabilityInput } from "./index.js";

// Shared Nominatim rate limiter (1 req/sec per their usage policy).
//
// Each caller reserves its send slot synchronously, before awaiting, so
// concurrent calls are spaced one interval apart. The earlier version read
// the last call time, slept, then wrote it: N concurrent calls all read the
// same time, slept the same amount and fired together. On 2026-11-23 a
// paying buyer's concurrent batch did that, and Nominatim refused every call
// for 16 minutes (294 failed, unsettled, HTTP 629).
//
// A caller whose slot is further away than `maxWaitMs` is refused at once
// rather than queued past the sync-request ceiling (4 s wait + 10 s fetch
// stays under 15 s); it reserves nothing. The refusal is retryable and is
// recognised by REFUSAL_MESSAGE_PATTERNS, so it is unbilled and does not
// count against the breaker or the quality floor.
//
// The clock is monotonic and read on every call (a wall-clock step back
// would otherwise refuse every caller until the clock caught up).
export function createNominatimThrottle(
  intervalMs = 1100,
  maxWaitMs = 4000,
  now: () => number = () => performance.now(),
): () => Promise<void> {
  let nextSlot = -Infinity;
  return async () => {
    const t = now();
    const slot = Math.max(t, nextSlot);
    const wait = slot - t;
    if (wait > maxWaitMs) {
      const seconds = Math.ceil(wait / 1000);
      throw new CapabilityRefusalError(
        `Address lookups are limited to about one per second and the queue is full; retry in ${seconds} seconds.`,
        {
          fix: "Send address lookups one at a time, about one per second.",
          retryable: true,
          retry_after_seconds: seconds,
        },
      );
    }
    nextSlot = slot + intervalMs;
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  };
}

const nominatimThrottle = createNominatimThrottle();

export { nominatimThrottle };

registerCapability("address-validate", async (input: CapabilityInput) => {
  const address = ((input.address as string) ?? (input.task as string) ?? "").trim();
  if (!address) {
    throw inputRefusal("'address' is required. Provide a full postal address.", "address", "Send 'address' as a full postal address string.");
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
