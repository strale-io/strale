/**
 * One-off cleanup for SE deactivation DB side-effects (2026-04-21).
 *
 * Context: commits fc74b1b (business-license-check-se, DEC-20260421-SE-C) and
 * 07055ab (annual-report-extract, DEC-20260421-SE-B) deactivated two SE
 * capabilities at the executor layer via the DEACTIVATED map in
 * auto-register.ts. Commit 07055ab also removed step 4b from the
 * seed-kyb-solutions.ts generator for kyb-complete-se.
 *
 * Two prod DB side-effects remained:
 *   1. capabilities.is_active = true for both deactivated slugs
 *   2. solution_steps row for kyb-complete-se still references annual-report-extract
 *
 * This script:
 *   - sets capabilities.is_active = false for both slugs
 *   - deletes the annual-report-extract step from the kyb-complete-se solution
 *
 * Idempotent: re-running is a no-op once clean.
 *
 * Usage:
 *   npx tsx scripts/cleanup-se-deactivation-2026-04-21.ts           # live run
 *   npx tsx scripts/cleanup-se-deactivation-2026-04-21.ts --dry-run # preview only
 *
 * Rollback:
 *   UPDATE capabilities SET is_active = true WHERE slug IN
 *     ('annual-report-extract','business-license-check-se');
 *   -- solution_step row restoration requires manual INSERT; previous config
 *   -- would be stepOrder=9 (pre-removal), parallelGroup=4, canParallel=true,
 *   -- inputMap={"org_number":"$input.org_number"}. Re-running
 *   -- seed-kyb-solutions.ts will NOT restore it because the generator no
 *   -- longer emits this step (07055ab).
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import { capabilities, solutions, solutionSteps } from "../src/db/schema.js";

const TARGET_SLUGS = ["annual-report-extract", "business-license-check-se"] as const;
const TARGET_SOLUTION_SLUG = "kyb-complete-se";
const STALE_STEP_SLUG = "annual-report-extract";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`MODE: ${dryRun ? "DRY RUN" : "LIVE"}`);
  const db = getDb();

  // PRE-STATE
  const capsPre = await db
    .select({ slug: capabilities.slug, isActive: capabilities.isActive })
    .from(capabilities)
    .where(inArray(capabilities.slug, TARGET_SLUGS as unknown as string[]));

  console.log("\nPRE-STATE capabilities:");
  for (const c of capsPre) console.log(`  ${c.slug}: is_active=${c.isActive}`);

  if (capsPre.length !== TARGET_SLUGS.length) {
    throw new Error(
      `Expected ${TARGET_SLUGS.length} capability rows, found ${capsPre.length}. Halting.`,
    );
  }

  const sol = await db
    .select({ id: solutions.id, slug: solutions.slug })
    .from(solutions)
    .where(eq(solutions.slug, TARGET_SOLUTION_SLUG));

  if (sol.length !== 1) {
    throw new Error(
      `Expected exactly 1 solution with slug=${TARGET_SOLUTION_SLUG}, found ${sol.length}. Halting.`,
    );
  }
  const solutionId = sol[0].id;

  const stalePre = await db
    .select({
      stepOrder: solutionSteps.stepOrder,
      capabilitySlug: solutionSteps.capabilitySlug,
    })
    .from(solutionSteps)
    .where(
      and(
        eq(solutionSteps.solutionId, solutionId),
        eq(solutionSteps.capabilitySlug, STALE_STEP_SLUG),
      ),
    );
  console.log(`\nPRE-STATE solution_steps (${TARGET_SOLUTION_SLUG} + ${STALE_STEP_SLUG}): ${stalePre.length} row(s)`);
  for (const s of stalePre) console.log(`  order=${s.stepOrder} cap=${s.capabilitySlug}`);

  // Sanity: confirm no other solutions reference these deactivated caps.
  const otherRefs = await db
    .select({
      solutionId: solutionSteps.solutionId,
      capabilitySlug: solutionSteps.capabilitySlug,
    })
    .from(solutionSteps)
    .where(inArray(solutionSteps.capabilitySlug, TARGET_SLUGS as unknown as string[]));
  const unexpected = otherRefs.filter(
    (r) => !(r.solutionId === solutionId && r.capabilitySlug === STALE_STEP_SLUG),
  );
  if (unexpected.length > 0) {
    console.error("\nUNEXPECTED solution_steps referencing deactivated slugs:");
    for (const r of unexpected) {
      console.error(`  solutionId=${r.solutionId} cap=${r.capabilitySlug}`);
    }
    throw new Error(
      `Halting: ${unexpected.length} unexpected solution_step reference(s) to deactivated slugs. Review before proceeding.`,
    );
  }

  // Decide what changes are needed
  const capsToUpdate = capsPre.filter((c) => c.isActive).map((c) => c.slug);
  const needDeleteStep = stalePre.length > 0;

  console.log("\nPLANNED CHANGES:");
  if (capsToUpdate.length === 0) {
    console.log("  capabilities.is_active: no-op (both already inactive)");
  } else {
    console.log(`  UPDATE capabilities SET is_active=false WHERE slug IN (${capsToUpdate.map((s) => `'${s}'`).join(", ")})`);
  }
  if (!needDeleteStep) {
    console.log("  solution_steps delete: no-op (row already gone)");
  } else {
    console.log(`  DELETE FROM solution_steps WHERE solution_id='${solutionId}' AND capability_slug='${STALE_STEP_SLUG}' (${stalePre.length} row)`);
  }

  if (capsToUpdate.length === 0 && !needDeleteStep) {
    console.log("\nAlready clean. Exiting.");
    process.exit(0);
  }

  if (dryRun) {
    console.log("\nDRY RUN — no writes performed.");
    process.exit(0);
  }

  // LIVE: transaction
  await db.transaction(async (tx) => {
    if (capsToUpdate.length > 0) {
      await tx
        .update(capabilities)
        .set({ isActive: false, updatedAt: new Date() })
        .where(inArray(capabilities.slug, capsToUpdate));
    }
    if (needDeleteStep) {
      await tx
        .delete(solutionSteps)
        .where(
          and(
            eq(solutionSteps.solutionId, solutionId),
            eq(solutionSteps.capabilitySlug, STALE_STEP_SLUG),
          ),
        );
    }
  });

  // POST-STATE
  const capsPost = await db
    .select({ slug: capabilities.slug, isActive: capabilities.isActive })
    .from(capabilities)
    .where(inArray(capabilities.slug, TARGET_SLUGS as unknown as string[]));
  console.log("\nPOST-STATE capabilities:");
  for (const c of capsPost) console.log(`  ${c.slug}: is_active=${c.isActive}`);

  const stalePost = await db
    .select({ capabilitySlug: solutionSteps.capabilitySlug })
    .from(solutionSteps)
    .where(
      and(
        eq(solutionSteps.solutionId, solutionId),
        eq(solutionSteps.capabilitySlug, STALE_STEP_SLUG),
      ),
    );
  console.log(`\nPOST-STATE solution_steps (${TARGET_SOLUTION_SLUG} + ${STALE_STEP_SLUG}): ${stalePost.length} row(s)`);

  const stillActive = capsPost.filter((c) => c.isActive);
  if (stillActive.length > 0 || stalePost.length > 0) {
    throw new Error("Cleanup verification failed — state is not as expected.");
  }

  console.log("\nCleanup complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
