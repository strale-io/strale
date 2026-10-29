import { inputRefusal } from "../lib/capability-refusal.js";
import {
  LICENSE_NOTICE_URLS,
  LICENSE_TEXT_URLS,
  OVERTURE_ATTRIBUTION_URL,
  attributionLine,
  isReturnableLicense,
} from "./lib/overture-places/attribution.js";
import { queryPlaces } from "./lib/overture-places/client.js";
import { registerCapability, type CapabilityInput } from "./index.js";

const MAX_RADIUS_M = 5_000;
const DEFAULT_RADIUS_M = 1_000;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

registerCapability("places-search", async (input: CapabilityInput) => {
  const latitude = num(input.latitude ?? input.lat);
  const longitude = num(input.longitude ?? input.lon ?? input.lng);
  if (latitude === null || latitude < -90 || latitude > 90) {
    throw inputRefusal(
      "'latitude' is required: a number from -90 to 90.",
      "latitude",
      "Send 'latitude' and 'longitude' in decimal degrees; geocode an address or city first with address-geocode.",
    );
  }
  if (longitude === null || longitude < -180 || longitude > 180) {
    throw inputRefusal(
      "'longitude' is required: a number from -180 to 180.",
      "longitude",
      "Send 'longitude' in decimal degrees alongside 'latitude'.",
    );
  }

  const radiusIn = input.radius_m ?? input.radius;
  const radius_m = radiusIn === undefined ? DEFAULT_RADIUS_M : num(radiusIn);
  if (radius_m === null || radius_m < 10 || radius_m > MAX_RADIUS_M) {
    throw inputRefusal(
      `'radius_m' must be from 10 to ${MAX_RADIUS_M} metres.`,
      "radius_m",
      "Send 'radius_m' as a number of metres from 10 to 5000, or omit it for 1000.",
    );
  }

  const limitIn = input.limit;
  const limit = limitIn === undefined ? DEFAULT_LIMIT : num(limitIn);
  if (limit === null || !Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw inputRefusal(
      `'limit' must be a whole number from 1 to ${MAX_LIMIT}.`,
      "limit",
      "Send 'limit' as a whole number from 1 to 50, or omit it for 20.",
    );
  }

  const query = text(input.query ?? input.q ?? input.task);
  if (query !== null && (query.length < 2 || query.length > 100)) {
    throw inputRefusal("'query' must be 2 to 100 characters.", "query", "Send 'query' as 2 to 100 characters of a place name or kind of place, such as pharmacy.");
  }
  const categoryRaw = text(input.category);
  const category = categoryRaw === null ? null : categoryRaw.toLowerCase().replace(/[\s-]+/g, "_");
  if (category !== null && !/^[a-z0-9_]{2,60}$/.test(category)) {
    throw inputRefusal(
      "'category' must be an Overture category id such as 'pharmacy' or 'coffee_shop'.",
      "category",
      "Send 'category' as a lower-case Overture category id such as coffee_shop, or use 'query' for free text.",
    );
  }

  const result = await queryPlaces({ latitude, longitude, radius_m, query, category, limit });

  // A row is returned only if every source behind it carries a licence this
  // capability knows how to honour.
  const rows = result.rows.filter((r) => r.sources.length > 0 && r.sources.every((x) => isReturnableLicense(x.license)));
  const withheld = result.rows.length - rows.length;

  const attribution = new Map<string, string>();
  for (const r of rows) {
    for (const x of r.sources) attribution.set(`${x.dataset}|${x.license}`, attributionLine(x.dataset, x.license as string));
  }
  const licenseIds = [...new Set(rows.flatMap((r) => r.sources.map((x) => x.license as string)))].sort();
  const licenses = licenseIds.map((id) => ({
    id,
    text_url: LICENSE_TEXT_URLS[id],
    ...(LICENSE_NOTICE_URLS[id] ? { notice_url: LICENSE_NOTICE_URLS[id] } : {}),
  }));

  return {
    output: {
      places: rows.map((r) => ({
        name: r.name,
        category: r.category,
        taxonomy: r.taxonomy,
        brand: r.brand,
        address: r.address,
        latitude: r.latitude,
        longitude: r.longitude,
        distance_m: r.distance_m,
        confidence: r.confidence,
        operating_status: r.operating_status,
        phones: r.phones,
        websites: r.websites,
        overture_id: r.id,
        sources: r.sources,
        licenses: [...new Set(r.sources.map((x) => x.license as string))].sort(),
      })),
      result_count: rows.length,
      withheld_unknown_license: withheld,
      search: { latitude, longitude, radius_m, query, category, limit },
      overture_release: result.release,
      attribution: [...attribution.values()],
      licenses,
    },
    provenance: {
      source: "overture-maps-places",
      fetched_at: new Date().toISOString(),
      dataset_release: result.release,
      source_url: `s3://overturemaps-us-west-2/release/${result.release}/theme=places/type=place/`,
      attribution: [...attribution.values()],
      attribution_url: OVERTURE_ATTRIBUTION_URL,
      licenses,
    },
  };
});
