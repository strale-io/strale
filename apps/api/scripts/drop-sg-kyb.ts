/**
 * One-off retirement script for the SG KYB surface.
 *
 * Soft-deactivates 3 solutions: invoice-verify-sg, kyb-complete-sg,
 * kyb-essentials-sg. Context: see
 * audit-reports/2026-04-21-singapore-kyb-investigation.md @ 5a04325.
 *
 * Classification: Type 3 (structural — no viable data source at price point).
 * Evidence: 41/41 failed production transactions, OpenCorporates returns
 * nothing for canonical SG entities, 0 customer transactions on dependent
 * solutions.
 *
 * Rollback:
 *   UPDATE solutions SET is_active = true
 *    WHERE slug IN ('invoice-verify-sg','kyb-complete-sg','kyb-essentials-sg');
 *
 * This script is idempotent — re-running after the UPDATE is a no-op.
 * Kept in the repo as a retirement-pattern artifact (per DEC-20260421-J
 * establishing the retirement pattern).
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { inArray } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import { solutions } from "../src/db/schema.js";

const SG_SLUGS = ["invoice-verify-sg", "kyb-complete-sg", "kyb-essentials-sg"];

async function main() {
  const db = getDb();

  // Pre-state
  const before = await db
    .select({ slug: solutions.slug, isActive: solutions.isActive })
    .from(solutions)
    .where(inArray(solutions.slug, SG_SLUGS));

  console.log("PRE-STATE:");
  for (const row of before) {
    console.log(`  ${row.slug}: is_active=${row.isActive}`);
  }

  if (before.length !== 3) {
    throw new Error(
      `Expected 3 SG solutions, found ${before.length}. Halting. Found: ${before.map((r) => r.slug).join(", ")}`,
    );
  }
  if (before.every((r) => !r.isActive)) {
    console.log("\nAll 3 already inactive. No-op. Exiting.");
    process.exit(0);
  }

  // Soft-deactivate
  await db
    .update(solutions)
    .set({ isActive: false, updatedAt: new Date() })
    .where(inArray(solutions.slug, SG_SLUGS));

  // Post-state
  const after = await db
    .select({ slug: solutions.slug, isActive: solutions.isActive })
    .from(solutions)
    .where(inArray(solutions.slug, SG_SLUGS));

  console.log("\nPOST-STATE:");
  for (const row of after) {
    console.log(`  ${row.slug}: is_active=${row.isActive}`);
  }

  if (after.some((r) => r.isActive)) {
    throw new Error("Update failed: at least one solution still active. Halting.");
  }
  console.log("\nAll 3 SG solutions soft-deactivated.");

  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
