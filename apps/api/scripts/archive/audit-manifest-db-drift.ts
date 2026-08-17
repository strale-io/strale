/**
 * Phase B (read-only) of the SI-fix continuation work, 2026-05-11.
 *
 * Compares the set of slugs in manifests/*.yaml against the set of slugs in
 * the prod capabilities table, and surfaces both directions of drift.
 *
 * Two classes of finding:
 *   1. Manifests-without-DB-row — slug exists in manifests/ but not in the
 *      capabilities table. These would have shipped via PR without an
 *      onboard.ts run, like SI.
 *   2. DB-rows-without-manifest — slug exists in prod but has no manifest
 *      file. Less critical (the runtime works); flagged for housekeeping.
 *
 * Read-only. No writes. Safe to run against prod.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });
import { sql } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import { manifestSlugs } from "./lib/manifest-slugs.js";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const MANIFESTS_DIR = resolve(REPO_ROOT, "manifests");

const manifests = manifestSlugs({
  manifestsDir: MANIFESTS_DIR,
  onMalformed: (file, err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[audit-manifest-db-drift] skipping malformed manifest ${file}: ${msg}`);
  },
});

const db = getDb();
const rows = await db.execute(sql`
  SELECT slug, lifecycle_state, visible, is_active
  FROM capabilities
  ORDER BY slug
`);
const dbRowsArr: any[] = Array.isArray(rows) ? rows : (rows as any).rows ?? [];
const dbBySlug = new Map<string, { lifecycle_state: string; visible: boolean; is_active: boolean }>();
for (const r of dbRowsArr) {
  dbBySlug.set(r.slug, {
    lifecycle_state: r.lifecycle_state,
    visible: r.visible,
    is_active: r.is_active,
  });
}

const manifestsWithoutDb: string[] = [];
const dbWithoutManifest: string[] = [];

for (const slug of manifests) {
  if (!dbBySlug.has(slug)) manifestsWithoutDb.push(slug);
}
for (const slug of dbBySlug.keys()) {
  if (!manifests.has(slug)) dbWithoutManifest.push(slug);
}

manifestsWithoutDb.sort();
dbWithoutManifest.sort();

console.log(`Manifests on disk: ${manifests.size}`);
console.log(`Capabilities in prod DB: ${dbBySlug.size}`);
console.log("");
console.log(`=== Class 1: Manifests-without-DB-row (${manifestsWithoutDb.length}) ===`);
console.log("These shipped to repo but were never registered via onboard.ts.");
for (const slug of manifestsWithoutDb) console.log(`  ${slug}`);
console.log("");
console.log(`=== Class 2: DB-rows-without-manifest (${dbWithoutManifest.length}) ===`);
console.log("These exist in prod but have no manifest in repo.");
for (const slug of dbWithoutManifest) {
  const row = dbBySlug.get(slug)!;
  console.log(`  ${slug}  lifecycle=${row.lifecycle_state} visible=${row.visible} is_active=${row.is_active}`);
}

process.exit(0);
