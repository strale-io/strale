/** Types and release discovery shared by the places-search worker and its client. */
import { readTextWithLimit } from "../../../lib/resource-limits.js";

export const OVERTURE_BUCKET_HTTPS = "https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com";

export interface PlacesQuery {
  latitude: number;
  longitude: number;
  radius_m: number;
  query: string | null;
  category: string | null;
  limit: number;
}

export interface PlacesRow {
  id: string;
  name: string;
  category: string | null;
  taxonomy: string | null;
  brand: string | null;
  address: {
    freeform: string | null;
    locality: string | null;
    postcode: string | null;
    region: string | null;
    country: string | null;
  };
  latitude: number;
  longitude: number;
  distance_m: number;
  confidence: number | null;
  operating_status: string | null;
  phones: string[];
  websites: string[];
  source: string | null;
  license: string | null;
  source_record_id: string | null;
}

export interface PlacesResult {
  release: string;
  files_scanned: number;
  rows: PlacesRow[];
}

export interface PlacesRelease {
  release: string;
  /** s3:// URLs of the release's place files, each matching PLACE_FILE_URL. */
  files: string[];
}

export interface WorkerRequest {
  id: number;
  release: PlacesRelease;
  query: PlacesQuery;
}

/** `retire`: the worker passed its memory cap and exits after this reply. */
export type WorkerResponse =
  | { id: number; ok: true; result: PlacesResult; retire: boolean }
  | { id: number; ok: false; error: string; retire: boolean };

/** Release ids (e.g. "2026-10-21.0") on the bucket, newest first. */
export function parseReleases(xml: string): string[] {
  return [...xml.matchAll(/<Prefix>release\/(\d{4}-\d{2}-\d{2}\.\d+)\/<\/Prefix>/g)]
    .map((m) => m[1])
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

/**
 * The only file URL shape the worker accepts. URLs are inlined into SQL
 * (DuckDB's read_parquet takes no bound list), so this is the injection guard.
 */
export const PLACE_FILE_URL =
  /^s3:\/\/overturemaps-us-west-2\/release\/\d{4}-\d{2}-\d{2}\.\d+\/theme=places\/type=place\/part-[A-Za-z0-9-]+\.zstd\.parquet$/;

/** A bucket listing is a few KB; a page of 1,000 keys stays well under this. */
const MAX_LISTING_BYTES = 1024 * 1024;

async function listBucket(query: string): Promise<string> {
  const res = await fetch(`${OVERTURE_BUCKET_HTTPS}/?${query}`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Overture bucket listing failed: HTTP ${res.status}`);
  return readTextWithLimit(res, MAX_LISTING_BYTES, "overture_release", "an Overture bucket listing");
}

/** Place-file URLs named in a bucket listing, keeping only the accepted shape. */
export function parsePlaceFiles(xml: string): string[] {
  return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)]
    .map((m) => `s3://overturemaps-us-west-2/${m[1]}`)
    .filter((u) => PLACE_FILE_URL.test(u))
    .sort();
}

/**
 * The newest release that has place files. A release folder can appear
 * before its places files finish uploading, so the one before it is tried too.
 */
export async function resolvePlacesRelease(): Promise<PlacesRelease> {
  const releases = parseReleases(await listBucket("list-type=2&prefix=release/&delimiter=/"));
  for (const release of releases.slice(0, 2)) {
    const prefix = `release/${release}/theme=places/type=place/`;
    const files = parsePlaceFiles(await listBucket(`list-type=2&prefix=${encodeURIComponent(prefix)}`));
    if (files.length > 0) return { release, files };
  }
  throw new Error(`No Overture release with places files among ${releases.slice(0, 2).join(", ") || "none"}`);
}
