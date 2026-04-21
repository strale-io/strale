/**
 * One-off park script for the `company-intelligence-sdr` solution.
 *
 * Park semantics — DISTINCT FROM RETIREMENT (DEC-20260421-J):
 *   - Soft-deactivates ONE solution (is_active = false).
 *   - DOES NOT remove seed entries — preserves cheap revival optionality.
 *   - DOES NOT touch the two dependent capabilities (email-pattern-discover,
 *     officer-search) — they stay `lifecycle_state = suspended` per their
 *     original admin-batch intent of 2026-04-19 17:46:49.
 *   - DOES NOT add capabilities to auto-register's DEACTIVATED map —
 *     suspended ≠ deactivated; executors remain registered and available
 *     for revival.
 *
 * Context: see audit-reports/2026-04-21-sdr-intelligence-investigation.md
 * @ 7264abc, especially §7 (Park plan) and §9 (recommendation rationale).
 *
 * Why park, not retire:
 *   - Both capabilities are Type 5 (technically healthy, code complete,
 *     credentials present, single test + single transaction both passed).
 *   - Strong hypothesis: product-strategy suspension (SDR off-wedge from
 *     Strale's KYB/compliance positioning). Not a technical failure.
 *   - Retirement would remove seed entries and incur re-onboarding cost
 *     (~3.5h manifests + pipeline) if priorities ever change.
 *   - Park cost: one UPDATE + sitemap regen. Revival cost if triggered:
 *     ~20min (UPDATE is_active = true on solution + un-suspend caps +
 *     re-run readiness). Net optionality preserved.
 *
 * Rollback:
 *   UPDATE solutions SET is_active = true
 *    WHERE slug = 'company-intelligence-sdr';
 *
 * Idempotent: re-running after the UPDATE is a no-op. Kept in repo as a
 * park-pattern artifact (DEC-20260421-L). Mirrors the retirement-pattern
 * artifact `drop-sg-kyb.ts` but semantically distinct.
 *
 * Note: `solutions` table has no `deactivation_reason` column (only
 * `capabilities` does). Park intent is documented in this script header +
 * the commit message + DEC-20260421-K/L. To discover later why this
 * solution is inactive: grep the repo for the slug, or read
 * audit-reports/2026-04-21-sdr-intelligence-investigation.md.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { eq } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import { solutions } from "../src/db/schema.js";

const SLUG = "company-intelligence-sdr";

async function main() {
  const db = getDb();

  // Pre-state
  const before = await db
    .select({ slug: solutions.slug, isActive: solutions.isActive })
    .from(solutions)
    .where(eq(solutions.slug, SLUG));

  console.log("PRE-STATE:");
  if (before.length === 0) {
    throw new Error(`Solution '${SLUG}' not found. Halting — can't park a non-existent row.`);
  }
  if (before.length !== 1) {
    throw new Error(`Expected 1 '${SLUG}' row, found ${before.length}. Halting.`);
  }
  console.log(`  ${before[0].slug}: is_active=${before[0].isActive}`);

  if (!before[0].isActive) {
    console.log("\nAlready inactive. No-op. Exiting.");
    process.exit(0);
  }

  // Park: soft-deactivate only. Nothing else on this row or any other row.
  await db
    .update(solutions)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(solutions.slug, SLUG));

  // Post-state
  const after = await db
    .select({ slug: solutions.slug, isActive: solutions.isActive })
    .from(solutions)
    .where(eq(solutions.slug, SLUG));

  console.log("\nPOST-STATE:");
  console.log(`  ${after[0].slug}: is_active=${after[0].isActive}`);

  if (after[0].isActive) {
    throw new Error("Update failed: solution still active. Halting.");
  }
  console.log("\nSolution parked.");
  console.log("Capabilities email-pattern-discover + officer-search: unchanged (stay suspended).");
  console.log("Seed entries in apps/api/src/db/seed-solutions.ts: unchanged (preserves revival).");

  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
