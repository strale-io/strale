/**
 * Child-process side of places-search: DuckDB over the Overture Maps places
 * GeoParquet release on its public S3 bucket (AWS Open Data, anonymous reads).
 * The parent names the release and its files (shared.ts resolvePlacesRelease);
 * DuckDB reads only byte ranges of those files.
 *
 * Runs out of the API process on purpose. DuckDB's parquet footers and HTTP
 * buffers take a few hundred MB while a query runs (measured 2026-10-29:
 * ~400 MB over the API's baseline when queried in-process), so the parent
 * forks this worker on demand and kills it after an idle period: memory is
 * held only while the capability is in use. See ./client.ts.
 *
 * Release files are partitioned roughly by longitude and spatially sorted
 * inside, so the worker builds a row-group bbox index once per release (from
 * parquet footer statistics) and hands DuckDB only the files whose row groups
 * can intersect the query box; DuckDB then prunes row groups itself.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import {
  PLACE_FILE_URL,
  type PlacesQuery,
  type PlacesRelease,
  type PlacesResult,
  type WorkerRequest,
  type WorkerResponse,
} from "./shared.js";

interface FileIndex {
  url: string;
  /** Per row group: [xmin_lo, xmin_hi, ymin_lo, ymin_hi] of the bbox.xmin / bbox.ymin columns. */
  groups: [number, number, number, number][];
}

let conn: DuckDBConnection | null = null;
let index: { release: string; files: FileIndex[] } | null = null;

async function connection(): Promise<DuckDBConnection> {
  if (conn) return conn;
  const db = await DuckDBInstance.create(":memory:", { memory_limit: "256MB", threads: "2" });
  const c = await db.connect();
  // Anonymous reads: blank keys stop DuckDB picking up any AWS_* credentials
  // from the environment, which the public bucket refuses.
  await c.run(
    "INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2'; SET s3_access_key_id=''; " +
      "SET s3_secret_access_key=''; SET s3_session_token=''; " +
      // The parquet footer cache stays off while the index reads every footer
      // (all of them resident run to ~600 MB); search() turns it on for the
      // few files queries touch, and RSS_CAP_BYTES bounds what it grows to.
      "SET enable_http_metadata_cache=true; SET parquet_metadata_cache=false;",
  );
  conn = c;
  return c;
}

async function ensureIndex({ release, files: urls }: PlacesRelease): Promise<{ release: string; files: FileIndex[] }> {
  if (index?.release === release) return index;
  // The parent lists the bucket; this process only re-checks the URL shape,
  // because the URLs are inlined into SQL below.
  if (urls.length === 0 || !urls.every((u) => PLACE_FILE_URL.test(u))) {
    throw new Error("Refusing an Overture file list outside the expected release shape");
  }
  // The worker exits when idle, so keep the index on local disk per release:
  // building it reads every file footer (~10 s), a cached copy reads nothing.
  const cachePath = join(tmpdir(), `strale-overture-places-index-${release}.json`);
  try {
    const cached = JSON.parse(readFileSync(cachePath, "utf8")) as FileIndex[];
    if (cached.length === urls.length && cached.every((f, i) => f.url === urls[i])) {
      index = { release, files: cached };
      return index;
    }
  } catch {
    // no cached index yet
  }
  const c = await connection();
  // search() turns the footer cache on; indexing a new release must not fill it.
  await c.run("SET parquet_metadata_cache=false;");
  const list = urls.map((u) => `'${u}'`).join(",");
  const reader = await c.runAndReadAll(
    `SELECT file_name, row_group_id, path_in_schema, stats_min, stats_max
       FROM parquet_metadata([${list}])
      WHERE path_in_schema IN ('bbox, xmin', 'bbox, ymin')`,
  );
  const byFile = new Map<string, Map<number, [number, number, number, number]>>();
  for (const row of reader.getRows()) {
    const [file, rg, col, lo, hi] = row as [string, bigint | number, string, string, string];
    const groups = byFile.get(file) ?? new Map();
    byFile.set(file, groups);
    const g = groups.get(Number(rg)) ?? [Infinity, -Infinity, Infinity, -Infinity];
    if (col === "bbox, xmin") { g[0] = Number(lo); g[1] = Number(hi); } else { g[2] = Number(lo); g[3] = Number(hi); }
    groups.set(Number(rg), g);
  }
  index = { release, files: urls.map((url) => ({ url, groups: [...(byFile.get(url)?.values() ?? [])] })) };
  try {
    writeFileSync(cachePath, JSON.stringify(index.files));
  } catch {
    // read-only tmp: rebuild on next start
  }
  return index;
}

function filesFor(files: FileIndex[], box: { w: number; e: number; s: number; n: number }): string[] {
  return files
    .filter((f) => f.groups.some(([x0, x1, y0, y1]) => x1 >= box.w && x0 <= box.e && y1 >= box.s && y0 <= box.n))
    .map((f) => f.url);
}

async function search(r: PlacesRelease, q: PlacesQuery): Promise<PlacesResult> {
  const { release, files } = await ensureIndex(r);
  // Degrees per metre: latitude is constant; longitude widens with cos(lat).
  const dLat = q.radius_m / 111_320;
  const dLon = q.radius_m / (111_320 * Math.max(Math.cos((q.latitude * Math.PI) / 180), 0.01));
  const box = { w: q.longitude - dLon, e: q.longitude + dLon, s: q.latitude - dLat, n: q.latitude + dLat };
  const targets = filesFor(files, box);
  if (targets.length === 0) return { release, files_scanned: 0, rows: [] };

  const c = await connection();
  await c.run("SET parquet_metadata_cache=true;");
  const list = targets.map((u) => `'${u}'`).join(",");
  const prepared = await c.prepare(`
    WITH hits AS (
      SELECT id, names.primary AS name, basic_category, taxonomy.primary AS taxonomy_primary,
             addresses[1] AS address, (bbox.ymin + bbox.ymax) / 2 AS lat, (bbox.xmin + bbox.xmax) / 2 AS lon,
             confidence, operating_status, phones, websites, brand.names.primary AS brand,
             -- sources is per property: a merged place can take its phone from one
             -- dataset and its name from another, under different licences.
             list_distinct(list_transform(sources, lambda s: struct_pack(dataset := s.dataset, license := s.license))) AS row_sources
        FROM read_parquet([${list}])
       WHERE bbox.xmin BETWEEN $w AND $e AND bbox.ymin BETWEEN $s AND $n
         AND names.primary IS NOT NULL
         AND ($q IS NULL OR contains(lower(names.primary), lower($q))
              OR contains(lower(coalesce(basic_category, '')), lower(replace($q, ' ', '_')))
              OR contains(lower(coalesce(taxonomy.primary, '')), lower(replace($q, ' ', '_'))))
         AND ($cat IS NULL OR basic_category = $cat OR taxonomy.primary = $cat
              OR list_contains(taxonomy.hierarchy, $cat))
    )
    SELECT *, 2 * 6371008.8 * asin(sqrt(
             pow(sin(radians(lat - $lat) / 2), 2) +
             cos(radians($lat)) * cos(radians(lat)) * pow(sin(radians(lon - $lon) / 2), 2))) AS distance_m
      FROM hits
     WHERE distance_m <= $r
     ORDER BY distance_m
     LIMIT $lim`);
  prepared.bind({
    w: box.w, e: box.e, s: box.s, n: box.n,
    q: q.query ?? null, cat: q.category ?? null,
    lat: q.latitude, lon: q.longitude, r: q.radius_m, lim: q.limit,
  });
  const reader = await prepared.runAndReadAll();
  const rows = reader.getRowObjectsJson() as unknown as Record<string, unknown>[];
  return {
    release,
    files_scanned: targets.length,
    rows: rows.map((r) => {
      const a = (r.address ?? {}) as Record<string, string | null>;
      return {
        id: String(r.id),
        name: String(r.name),
        category: (r.basic_category as string | null) ?? null,
        taxonomy: (r.taxonomy_primary as string | null) ?? null,
        brand: (r.brand as string | null) ?? null,
        address: {
          freeform: a.freeform ?? null,
          locality: a.locality ?? null,
          postcode: a.postcode ?? null,
          region: a.region ?? null,
          country: a.country ?? null,
        },
        latitude: Number(r.lat),
        longitude: Number(r.lon),
        distance_m: Math.round(Number(r.distance_m)),
        confidence: r.confidence == null ? null : Math.round(Number(r.confidence) * 1000) / 1000,
        operating_status: (r.operating_status as string | null) ?? null,
        phones: (r.phones as string[] | null) ?? [],
        websites: (r.websites as string[] | null) ?? [],
        sources: ((r.row_sources as { dataset: string | null; license: string | null }[] | null) ?? [])
          .map((x) => ({ dataset: x.dataset ?? "unknown", license: x.license ?? null }))
          .sort((a, b) => (a.dataset + (a.license ?? "")).localeCompare(b.dataset + (b.license ?? ""))),
      };
    }),
  };
}

/** Above this resident size the worker retires after replying; the next call forks a fresh one. */
const RSS_CAP_BYTES = 450 * 1024 * 1024;

process.on("message", async (msg: WorkerRequest) => {
  let reply: WorkerResponse;
  try {
    const result = await search(msg.release, msg.query);
    reply = { id: msg.id, ok: true, result, retire: process.memoryUsage().rss > RSS_CAP_BYTES };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    reply = { id: msg.id, ok: false, error, retire: process.memoryUsage().rss > RSS_CAP_BYTES };
  }
  // The parent drops this worker on `retire` before sending anything else.
  process.send?.(reply, () => {
    if (reply.retire) process.exit(0);
  });
});
