/**
 * One-off retirement script for the commercial-KYB-aggregator-dependent
 * country surfaces. Soft-deactivates 18 solutions across 6 EU jurisdictions
 * (NL, PT, LT, ES, DE, AT) by setting `is_active = false`.
 *
 * Context: DEC-20260427-I (commercial KYB-aggregator scraping ban).
 * The underlying capabilities (dutch-, portuguese-, lithuanian-, spanish-,
 * german-, austrian-company-data) were sourcing data via ToS-prohibited
 * scraping of northdata.com / empresia.es / infocif.es / firmenbuch.finapu.com /
 * wko.at. Same legal flavour as DEC-20260420-H (Allabolag), just different
 * jurisdictions. Capabilities deactivated in apps/api/src/capabilities/
 * auto-register.ts in the same commit.
 *
 * Solutions paused (15):
 *   kyb-essentials-{nl,pt,es,de,at}
 *   kyb-complete-{nl,pt,es,de,at}
 *   invoice-verify-{nl,pt,es,de,at}
 *
 * Note: Lithuania (LT) has no seeded solutions despite the deactivated
 * lithuanian-company-data capability — nothing to pause on the LT side.
 *
 * Reactivation: each country needs a licensed registry / aggregator contract.
 * Re-enable per country (not as a batch) by:
 *   1. Wire compliant data source into the country's *-company-data executor
 *   2. Remove from DEACTIVATED in auto-register.ts
 *   3. UPDATE solutions SET is_active = true WHERE slug IN (
 *        'kyb-essentials-{cc}','kyb-complete-{cc}','invoice-verify-{cc}'
 *      );
 *
 * Rollback (full):
 *   UPDATE solutions SET is_active = true
 *    WHERE slug IN (
 *      'kyb-essentials-nl','kyb-essentials-pt','kyb-essentials-es',
 *      'kyb-essentials-de','kyb-essentials-at',
 *      'kyb-complete-nl','kyb-complete-pt','kyb-complete-es',
 *      'kyb-complete-de','kyb-complete-at',
 *      'invoice-verify-nl','invoice-verify-pt','invoice-verify-es',
 *      'invoice-verify-de','invoice-verify-at'
 *    );
 *
 * This script is idempotent — re-running after the UPDATE is a no-op.
 * Kept in the repo as a retirement-pattern artifact (per DEC-20260421-J).
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
config({ path: resolve(import.meta.dirname, "../../../.env") });

// UTF-16 fallback for .env
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

import { inArray } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import { solutions } from "../src/db/schema.js";

const COUNTRIES = ["nl", "pt", "es", "de", "at"] as const;
const FAMILIES = ["kyb-essentials", "kyb-complete", "invoice-verify"] as const;

const SLUGS: string[] = [];
for (const family of FAMILIES) {
  for (const cc of COUNTRIES) {
    SLUGS.push(`${family}-${cc}`);
  }
}

async function main() {
  const db = getDb();

  const before = await db
    .select({ slug: solutions.slug, isActive: solutions.isActive })
    .from(solutions)
    .where(inArray(solutions.slug, SLUGS));

  console.log(`PRE-STATE (${before.length}/${SLUGS.length} found):`);
  for (const row of before) {
    console.log(`  ${row.slug}: is_active=${row.isActive}`);
  }

  const missing = SLUGS.filter((s) => !before.some((r) => r.slug === s));
  if (missing.length > 0) {
    console.log(`\nMISSING (${missing.length}): ${missing.join(", ")}`);
    console.log("Halting — solutions table is missing expected slugs.");
    process.exit(1);
  }

  if (before.every((r) => !r.isActive)) {
    console.log("\nAll already inactive. No-op. Exiting.");
    process.exit(0);
  }

  await db
    .update(solutions)
    .set({ isActive: false, updatedAt: new Date() })
    .where(inArray(solutions.slug, SLUGS));

  const after = await db
    .select({ slug: solutions.slug, isActive: solutions.isActive })
    .from(solutions)
    .where(inArray(solutions.slug, SLUGS));

  console.log("\nPOST-STATE:");
  for (const row of after) {
    console.log(`  ${row.slug}: is_active=${row.isActive}`);
  }

  if (after.some((r) => r.isActive)) {
    throw new Error("Update failed: at least one solution still active. Halting.");
  }
  console.log(`\nAll ${SLUGS.length} solutions soft-deactivated.`);

  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
