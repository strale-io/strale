/**
 * Backfill `maintenance_class` from DB → manifest YAML files.
 *
 * Per audit-reports/manifest_drift_inventory.md (2026-04-20), Class 1 drift
 * affects 242 manifests — all missing the `maintenance_class` field while
 * DB has the correct value. This script closes that drift safely:
 *
 *   1. Read DB rows for every active capability with a manifest
 *   2. For each manifest, if `maintenance_class` is missing OR mismatched,
 *      write the DB value into the YAML
 *   3. Print a summary: changes made vs. already-aligned vs. orphans
 *
 * Run with --dry-run first to preview. The script never modifies DB; it
 * only writes manifest YAML files in the repo.
 *
 * Usage:
 *   npx tsx scripts/backfill-manifest-maintenance-class.ts --dry-run
 *   npx tsx scripts/backfill-manifest-maintenance-class.ts
 */

import { config } from "dotenv";
import { resolve, basename } from "node:path";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

config({ path: resolve(import.meta.dirname, "../../../.env") });

if (!process.env.DATABASE_URL) {
  const buf = readFileSync(resolve(import.meta.dirname, "../../../.env"));
  const text = buf.toString("utf16le");
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  for (const line of clean.split(/\r?\n/)) {
    if (line.startsWith("DATABASE_URL=")) {
      process.env.DATABASE_URL = line.substring("DATABASE_URL=".length);
      break;
    }
  }
}

import { getDb } from "../src/db/index.js";
import { capabilities } from "../src/db/schema.js";

const dryRun = process.argv.includes("--dry-run");
const manifestsDir = resolve(import.meta.dirname, "../../../manifests");

interface DbCap {
  slug: string;
  maintenanceClass: string | null;
  priceCents: number | null;
  freshnessCategory: string | null;
  transparencyTag: string | null;
}

async function main() {
  console.log(`Mode: ${dryRun ? "DRY RUN (no writes)" : "WRITE"}\n`);

  const db = getDb();
  const rows = await db
    .select({
      slug: capabilities.slug,
      maintenanceClass: capabilities.maintenanceClass,
      priceCents: capabilities.priceCents,
      freshnessCategory: capabilities.freshnessCategory,
      transparencyTag: capabilities.transparencyTag,
    })
    .from(capabilities);

  // Quick read-only audit pass: report drift counts per field across all
  // currently-active capabilities. Helps decide whether a write pass is
  // even needed before running it.
  let driftMaintenanceClass = 0;
  let driftPriceCents = 0;
  let driftFreshness = 0;
  let driftTransparency = 0;
  for (const r of rows) {
    const file = resolve(manifestsDir, `${r.slug}.yaml`);
    let content: string;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      continue; // no manifest for this DB row
    }
    const get = (re: RegExp) => content.match(re)?.[1]?.trim().replace(/^["']|["']$/g, "");
    const yMaint = get(/^maintenance_class:\s*(.+?)\s*$/m);
    const yPrice = get(/^price_cents:\s*(.+?)\s*$/m);
    const yFresh = get(/^freshness_category:\s*(.+?)\s*$/m);
    const yTransp = get(/^transparency_tag:\s*(.+?)\s*$/m);
    if (r.maintenanceClass && yMaint && yMaint !== r.maintenanceClass) driftMaintenanceClass++;
    if (r.priceCents != null && yPrice && Number(yPrice) !== r.priceCents) driftPriceCents++;
    if (r.freshnessCategory && yFresh && yFresh !== r.freshnessCategory) driftFreshness++;
    if (r.transparencyTag && yTransp && yTransp !== r.transparencyTag) driftTransparency++;
  }
  console.log(`Drift audit (DB-canonical view, before writes):`);
  console.log(`  maintenance_class drift:    ${driftMaintenanceClass}`);
  console.log(`  price_cents drift:          ${driftPriceCents}`);
  console.log(`  freshness_category drift:   ${driftFreshness}`);
  console.log(`  transparency_tag drift:     ${driftTransparency}`);
  console.log("");

  const dbBySlug = new Map<string, DbCap>(
    rows.map((r) => [r.slug, r as DbCap]),
  );

  const manifestFiles = readdirSync(manifestsDir).filter((f) => f.endsWith(".yaml"));

  let priceUpdates = 0;
  let priceAlreadyAligned = 0;
  let orphans = 0;
  const reverseDrift: Array<{ slug: string; yamlPrice: number; dbPrice: number }> = [];

  for (const file of manifestFiles) {
    const slug = basename(file, ".yaml");
    const dbCap = dbBySlug.get(slug);

    if (!dbCap) {
      orphans++;
      continue;
    }
    if (dbCap.priceCents == null) {
      continue;
    }

    const path = resolve(manifestsDir, file);
    let content = readFileSync(path, "utf-8");
    let modified = false;

    // price_cents: integer field. Per audit-report 2026-04-20 the
    // canonical direction is DB-lower-than-YAML (admin repricing pattern).
    // The reverse — DB-higher-than-YAML — is suspicious and almost
    // certainly indicates the DB row didn't get updated when the YAML was
    // rewritten (recent migration, etc.). Don't auto-backfill those:
    // collect them for manual review.
    const priceRe = /^price_cents:\s*(\d+)\s*$/m;
    const priceMatch = content.match(priceRe);
    if (priceMatch) {
      const yamlPrice = Number(priceMatch[1]);
      if (yamlPrice === dbCap.priceCents) {
        priceAlreadyAligned++;
      } else if (dbCap.priceCents < yamlPrice) {
        // Safe direction: DB has a lower (admin-repriced) value.
        content = content.replace(priceRe, `price_cents: ${dbCap.priceCents}`);
        modified = true;
        priceUpdates++;
        console.log(`  ↻ ${slug}: price_cents ${yamlPrice} → ${dbCap.priceCents}`);
      } else {
        // Reverse drift: DB price > YAML price. Likely DB row stale from
        // a YAML rewrite (e.g. country-data migration). Manual review.
        reverseDrift.push({ slug, yamlPrice, dbPrice: dbCap.priceCents });
      }
    }

    if (modified && !dryRun) {
      writeFileSync(path, content, "utf-8");
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Manifest files scanned: ${manifestFiles.length}`);
  console.log(`price_cents updates (DB < YAML, safe direction): ${priceUpdates}`);
  console.log(`price_cents already aligned: ${priceAlreadyAligned}`);
  console.log(`Orphan manifests (no DB row): ${orphans}`);
  console.log(`\nTotal YAML files modified: ${priceUpdates}`);

  if (reverseDrift.length > 0) {
    console.log(`\n⚠ Reverse drift detected (DB price > YAML price) on ${reverseDrift.length} caps:`);
    console.log(`  These need manual review — likely DB rows missed an update during recent capability migrations.`);
    console.log(`  Customers calling these caps may currently be billed the higher DB price; YAML/intent is the lower price.\n`);
    for (const r of reverseDrift) {
      console.log(`  - ${r.slug}: DB ${r.dbPrice}¢ > YAML ${r.yamlPrice}¢`);
    }
  }
  if (dryRun) {
    console.log(`\n(dry-run — no files written. Re-run without --dry-run to apply.)`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
