import { logError } from "../../lib/log.js";

const OPENSANCTIONS_CATALOG_URL = "https://data.opensanctions.org/datasets/latest/default/index.json";
const CACHE_TTL_MS = 60 * 60 * 1000;

export type CatalogInfo = {
  collection: string;
  list_count: number | null;
  version: string | null;
  last_updated_at: string | null;
};

const FALLBACK: CatalogInfo = {
  collection: "opensanctions/default",
  list_count: null,
  version: null,
  last_updated_at: null,
};

let cache: { data: CatalogInfo; expires: number } | null = null;

export async function getOpenSanctionsCatalog(): Promise<CatalogInfo> {
  const now = Date.now();
  if (cache && cache.expires > now) return cache.data;
  try {
    const res = await fetch(OPENSANCTIONS_CATALOG_URL, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = (await res.json()) as {
        last_export?: string;
        updated_at?: string;
        version?: string;
        datasets?: string[];
      };
      const info: CatalogInfo = {
        collection: "opensanctions/default",
        list_count: data.datasets?.length ?? null,
        version: data.version ?? null,
        last_updated_at: data.last_export ?? data.updated_at ?? null,
      };
      cache = { data: info, expires: now + CACHE_TTL_MS };
      return info;
    }
  } catch (err) {
    logError("opensanctions-catalog-fetch-failed", err);
  }
  return FALLBACK;
}
