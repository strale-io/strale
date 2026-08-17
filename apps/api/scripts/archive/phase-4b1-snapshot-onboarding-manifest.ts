/**
 * Phase 4b.1 — snapshot manifests into capabilities.onboarding_manifest.
 *
 * Outcome C (per Step 1 audit): 3 code consumers read `onboarding_manifest`
 * and fall back to heuristics on NULL, but provide materially better behavior
 * when populated (self-heal fixture recovery, onboarding input resolution,
 * test recalibration). All 307 rows are currently NULL; populating the 275
 * rows that have a YAML is a zero-risk data improvement.
 *
 * Scope:
 *   - 275 slugs with a YAML in `manifests/` — snapshot the parsed YAML.
 *   - 32 orphan DB rows without a YAML — stay NULL (4b.2 scope).
 *
 * Rollback:
 *   UPDATE capabilities SET onboarding_manifest = NULL
 *    WHERE slug IN (...); -- any subset, or catalog-wide.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { readFileSync, readdirSync } from "node:fs";
import yaml from "js-yaml";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import { capabilities } from "../src/db/schema.js";

const MANIFEST_DIR = resolve(import.meta.dirname, "../../../manifests");

async function main() {
  const db = getDb();

  // Pre-state check
  const preRes = (await db.execute(
    sql`SELECT COUNT(*)::int AS n FROM capabilities WHERE onboarding_manifest IS NOT NULL AND jsonb_typeof(onboarding_manifest) = 'object'`,
  )) as unknown as Array<{ n: number }>;
  console.log(`PRE: rows with non-null onboarding_manifest = ${preRes[0]?.n ?? 0}`);

  const files = readdirSync(MANIFEST_DIR)
    .filter((f) => f.endsWith(".yaml"))
    .sort();

  let updated = 0;
  let skipped = 0;
  const failures: Array<{ slug: string; err: string }> = [];

  for (const f of files) {
    const slug = f.replace(/\.yaml$/, "");
    const file = resolve(MANIFEST_DIR, f);
    let manifestObj: Record<string, unknown>;
    try {
      manifestObj = yaml.load(readFileSync(file, "utf8")) as Record<string, unknown>;
    } catch (err) {
      failures.push({ slug, err: `parse: ${(err as Error).message}` });
      continue;
    }
    if (!manifestObj || typeof manifestObj !== "object") {
      failures.push({ slug, err: "parsed manifest is not an object" });
      continue;
    }
    try {
      const res = await db
        .update(capabilities)
        .set({
          onboardingManifest: manifestObj as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(capabilities.slug, slug));
      const rowCount = (res as unknown as { count?: number; rowCount?: number }).count
        ?? (res as unknown as { rowCount?: number }).rowCount
        ?? 1;
      if (rowCount > 0) updated++;
      else skipped++;
    } catch (err) {
      failures.push({ slug, err: `update: ${(err as Error).message}` });
    }
  }

  // Post-state check
  const postRes = (await db.execute(
    sql`SELECT COUNT(*)::int AS n FROM capabilities WHERE onboarding_manifest IS NOT NULL AND jsonb_typeof(onboarding_manifest) = 'object'`,
  )) as unknown as Array<{ n: number }>;
  const stillNull = (await db.execute(
    sql`SELECT COUNT(*)::int AS n FROM capabilities WHERE onboarding_manifest IS NULL`,
  )) as unknown as Array<{ n: number }>;

  console.log(`\nPOST:`);
  console.log(`  rows with non-null onboarding_manifest = ${postRes[0]?.n ?? 0}`);
  console.log(`  rows still NULL (orphans, out-of-scope)  = ${stillNull[0]?.n ?? 0}`);
  console.log(`\nFiles processed: ${files.length}`);
  console.log(`  UPDATE matched a row: ${updated}`);
  console.log(`  UPDATE matched nothing (slug not in DB): ${skipped}`);
  console.log(`  failures: ${failures.length}`);
  if (failures.length > 0) {
    for (const fr of failures) console.log(`    ${fr.slug}: ${fr.err}`);
  }

  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
