/**
 * Populate fallback_capability_slug, fallback_coverage, fallback_verification_level
 * in the capabilities table from CAPABILITY_FALLBACKS.
 *
 * Usage: npx tsx scripts/populate-fallbacks.ts
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { eq } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import { capabilities } from "../src/db/schema.js";
import { CAPABILITY_FALLBACKS } from "../src/data/capability-fallbacks.js";

async function populate() {
  const db = getDb();

  console.log(`Populating ${CAPABILITY_FALLBACKS.length} fallback relationships...\n`);

  let updated = 0;
  let skipped = 0;

  for (const fb of CAPABILITY_FALLBACKS) {
    // Verify both slugs exist
    const [primary] = await db
      .select({ slug: capabilities.slug })
      .from(capabilities)
      .where(eq(capabilities.slug, fb.primarySlug))
      .limit(1);

    const [fallback] = await db
      .select({ slug: capabilities.slug })
      .from(capabilities)
      .where(eq(capabilities.slug, fb.fallbackSlug))
      .limit(1);

    if (!primary) {
      console.log(`  SKIP: Primary '${fb.primarySlug}' not found in DB`);
      skipped++;
      continue;
    }
    if (!fallback) {
      console.log(`  SKIP: Fallback '${fb.fallbackSlug}' not found in DB`);
      skipped++;
      continue;
    }

    await db
      .update(capabilities)
      .set({
        fallbackCapabilitySlug: fb.fallbackSlug,
        fallbackCoverage: fb.coverage,
        fallbackVerificationLevel: fb.verificationLevel,
        updatedAt: new Date(),
      })
      .where(eq(capabilities.slug, fb.primarySlug));

    console.log(`  OK: ${fb.primarySlug} → ${fb.fallbackSlug} (${fb.verificationLevel})`);
    updated++;
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped`);
  process.exit(0);
}

populate().catch((e) => {
  console.error(e);
  process.exit(1);
});
