/**
 * DEC-20260423-B Stage C.2 — park 9 UK-property caps + 3 failed-backfill caps.
 *
 * Schema note: the prompt's Stage C.2 SQL references `deactivated_at` and
 * `deactivation_note` columns. The actual capabilities schema only has
 * `deactivation_reason` (text). Using that column for the tombstone marker;
 * `updated_at` serves the "when" purpose. Semantics preserved.
 *
 * Two tombstone reasons:
 *   - 9 UK-property: "park_permanent_dec_20260421_l" (per prompt's explicit
 *     UK-property cohort mapping)
 *   - 3 failed-backfill: "park_permanent_dec_20260423_b: blocked_backfill"
 *     (email-pattern-discover, officer-search, website-to-company — all
 *     only-piggyback suites, can't auto-discover fixtures).
 *
 * These caps stay at lifecycle_state='suspended' (they already were).
 * The deactivation_reason text marks them as permanently parked per
 * governance decision, not just operationally suspended.
 *
 * Rollback: UPDATE capabilities SET deactivation_reason = NULL WHERE slug
 * IN (...) AND deactivation_reason LIKE 'park_permanent_%'.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { inArray, eq } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import { capabilities } from "../src/db/schema.js";

const UK_SLUGS = [
  "council-tax-lookup", "stamp-duty-calculate", "uk-crime-stats",
  "uk-deprivation-index", "uk-epc-rating", "uk-flood-risk",
  "uk-rental-yield", "uk-sold-prices", "uk-transport-access",
] as const;

const BLOCKED_BACKFILL_SLUGS = [
  "email-pattern-discover", "officer-search", "website-to-company",
] as const;

async function main() {
  const db = getDb();

  // Pre-state
  const allSlugs = [...UK_SLUGS, ...BLOCKED_BACKFILL_SLUGS];
  const pre = await db
    .select({
      slug: capabilities.slug,
      lifecycleState: capabilities.lifecycleState,
      deactivationReason: capabilities.deactivationReason,
    })
    .from(capabilities)
    .where(inArray(capabilities.slug, allSlugs as unknown as string[]));
  console.log("PRE-STATE:");
  for (const r of pre) {
    console.log(`  ${r.slug}: lifecycle=${r.lifecycleState} reason=${r.deactivationReason ?? "<null>"}`);
  }

  if (pre.length !== allSlugs.length) {
    throw new Error(`Expected ${allSlugs.length} rows, found ${pre.length}. Halting.`);
  }

  // 9 UK-property: park_permanent_dec_20260421_l
  const ukReason = "park_permanent_dec_20260421_l: Parked per DEC-20260421-L; UK-property cluster decision 2026-04-23";
  for (const slug of UK_SLUGS) {
    await db
      .update(capabilities)
      .set({ deactivationReason: ukReason, updatedAt: new Date() })
      .where(eq(capabilities.slug, slug));
  }

  // 3 blocked-backfill: park_permanent_dec_20260423_b
  const bbReason = "park_permanent_dec_20260423_b: Backfill blocked — only piggyback test suites; no auto-discoverable fixture. See DEC-20260423-B Stage C.1 failure log.";
  for (const slug of BLOCKED_BACKFILL_SLUGS) {
    await db
      .update(capabilities)
      .set({ deactivationReason: bbReason, updatedAt: new Date() })
      .where(eq(capabilities.slug, slug));
  }

  // Post-state
  const post = await db
    .select({
      slug: capabilities.slug,
      lifecycleState: capabilities.lifecycleState,
      deactivationReason: capabilities.deactivationReason,
    })
    .from(capabilities)
    .where(inArray(capabilities.slug, allSlugs as unknown as string[]));
  console.log("\nPOST-STATE:");
  for (const r of post) {
    console.log(`  ${r.slug}: lifecycle=${r.lifecycleState} reason=${(r.deactivationReason ?? "").slice(0, 80)}...`);
  }

  const unmarked = post.filter((r) => !r.deactivationReason?.startsWith("park_permanent_"));
  if (unmarked.length > 0) {
    throw new Error(`Park failed: ${unmarked.map((r) => r.slug).join(", ")}`);
  }
  console.log(`\nAll ${allSlugs.length} caps tombstoned.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
