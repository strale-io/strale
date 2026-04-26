/**
 * One-off retirement script: soft-deactivate the 2 SE capabilities deactivated
 * in DEC-20260421-SE-B (annual-report-extract) and DEC-20260421-SE-C
 * (business-license-check-se).
 *
 * Both capabilities were already removed from the DEACTIVATED-skip auto-register
 * map (commits fc74b1b, 07055ab) so their executors no longer load. This
 * script flips the DB rows to is_active=false so /v1/do calls fail with a
 * clean "capability is deactivated" error rather than "no executor registered".
 *
 * Rollback:
 *   UPDATE capabilities SET is_active = true
 *    WHERE slug IN ('annual-report-extract', 'business-license-check-se');
 *   AND remove the DEACTIVATED-map entries in apps/api/src/capabilities/auto-register.ts.
 *
 * This script is idempotent — re-running after the UPDATE is a no-op.
 * Kept in the repo as a retirement-pattern artifact (per DEC-20260421-J).
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { inArray } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import { capabilities } from "../src/db/schema.js";

const SE_SLUGS = ["annual-report-extract", "business-license-check-se"];

async function main() {
  const db = getDb();

  const before = await db
    .select({ slug: capabilities.slug, isActive: capabilities.isActive })
    .from(capabilities)
    .where(inArray(capabilities.slug, SE_SLUGS));

  console.log("PRE-STATE:");
  for (const row of before) {
    console.log(`  ${row.slug}: is_active=${row.isActive}`);
  }

  if (before.length !== 2) {
    throw new Error(
      `Expected 2 SE-deactivated capabilities, found ${before.length}. Halting. Found: ${before.map((r) => r.slug).join(", ")}`,
    );
  }
  if (before.every((r) => !r.isActive)) {
    console.log("\nBoth already inactive. No-op. Exiting.");
    process.exit(0);
  }

  await db
    .update(capabilities)
    .set({ isActive: false, updatedAt: new Date() })
    .where(inArray(capabilities.slug, SE_SLUGS));

  const after = await db
    .select({ slug: capabilities.slug, isActive: capabilities.isActive })
    .from(capabilities)
    .where(inArray(capabilities.slug, SE_SLUGS));

  console.log("\nPOST-STATE:");
  for (const row of after) {
    console.log(`  ${row.slug}: is_active=${row.isActive}`);
  }

  if (after.some((r) => r.isActive)) {
    throw new Error("Update failed: at least one capability still active. Halting.");
  }
  console.log("\nBoth SE capabilities soft-deactivated.");

  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
