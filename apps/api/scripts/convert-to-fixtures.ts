/**
 * Convert deterministic capability tests from live to fixture mode.
 *
 * For capabilities with capability_type = 'deterministic', known_answer and
 * edge_case tests can run against stored baselines instead of calling the
 * executor. This reduces external API calls to zero for ~60 capabilities.
 *
 * Only converts suites that already have a baseline_output captured
 * (from a previous successful test run). Suites without baselines are
 * logged but skipped — they need a live run first.
 *
 * Usage: npx tsx scripts/convert-to-fixtures.ts [--dry-run]
 */

import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import { capabilities, testSuites } from "../src/db/schema.js";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const db = getDb();

  // Find all deterministic capabilities
  const deterministicCaps = await db
    .select({ slug: capabilities.slug })
    .from(capabilities)
    .where(and(
      eq(capabilities.capabilityType, "deterministic"),
      eq(capabilities.isActive, true),
    ));

  const slugs = deterministicCaps.map((c) => c.slug);
  console.log(`[fixture] Found ${slugs.length} deterministic capabilities`);

  if (slugs.length === 0) {
    console.log("[fixture] Nothing to convert");
    process.exit(0);
  }

  // Find live test suites for these capabilities (known_answer + edge_case only)
  const liveSuites = await db
    .select()
    .from(testSuites)
    .where(and(
      inArray(testSuites.capabilitySlug, slugs),
      eq(testSuites.active, true),
      eq(testSuites.testMode, "live"),
      inArray(testSuites.testType, ["known_answer", "edge_case"]),
    ));

  let converted = 0;
  let noBaseline = 0;
  let skipped = 0;

  for (const suite of liveSuites) {
    if (!suite.baselineOutput) {
      noBaseline++;
      if (noBaseline <= 10) {
        console.log(`  [skip] ${suite.capabilitySlug}/${suite.testType}: no baseline captured yet`);
      }
      continue;
    }

    if (!DRY_RUN) {
      await db.update(testSuites)
        .set({
          testMode: "fixture",
          fixtureLastRefreshed: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(testSuites.id, suite.id));
    }
    converted++;
  }

  console.log(`\n[fixture] Results:`);
  console.log(`  Deterministic capabilities: ${slugs.length}`);
  console.log(`  Live suites found (known_answer + edge_case): ${liveSuites.length}`);
  console.log(`  Converted to fixture: ${converted}`);
  console.log(`  No baseline (need live run first): ${noBaseline}`);
  if (DRY_RUN) console.log(`  (Dry run — no changes applied)`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
