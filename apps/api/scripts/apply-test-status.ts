/**
 * Apply test_status annotations to known won't-fix capabilities.
 *
 * These capabilities have structural limitations that cause persistent test
 * failures which are NOT capability bugs:
 *
 *   - ecb-interest-rates:    ECB SDW API is geo-restricted (EU-only, Railway is US East)
 *   - page-speed-test:       Google PageSpeed API intermittently rate-limits
 *   - youtube-summarize:     Requires specific auth context
 *   - norwegian-company-data: brreg.no API intermittently unavailable
 *
 * Usage:
 *   npx tsx scripts/apply-test-status.ts
 *   npx tsx scripts/apply-test-status.ts --dry-run
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { eq, and } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import { testSuites } from "../src/db/schema.js";

interface StatusUpdate {
  slug: string;
  status: "infra_limited" | "env_dependent" | "upstream_broken";
  reason: string;
}

const UPDATES: StatusUpdate[] = [
  {
    slug: "ecb-interest-rates",
    status: "infra_limited",
    reason: "ECB SDW API is geo-restricted to EU; Railway runs in US East",
  },
  {
    slug: "page-speed-test",
    status: "env_dependent",
    reason: "Google PageSpeed Insights API intermittently rate-limits from shared IPs",
  },
  {
    slug: "youtube-summarize",
    status: "env_dependent",
    reason: "YouTube transcript extraction requires specific auth/cookie context",
  },
  {
    slug: "norwegian-company-data",
    status: "upstream_broken",
    reason: "brreg.no Enhetsregisteret API intermittently unavailable from non-NO IPs",
  },
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const db = getDb();

  console.log(`Applying test_status to ${UPDATES.length} capabilities${dryRun ? " (dry run)" : ""}...\n`);

  let applied = 0;
  let skipped = 0;

  for (const update of UPDATES) {
    const suites = await db
      .select({ id: testSuites.id, testStatus: testSuites.testStatus })
      .from(testSuites)
      .where(and(
        eq(testSuites.capabilitySlug, update.slug),
        eq(testSuites.active, true),
        eq(testSuites.testStatus, "normal"),
      ));

    if (suites.length === 0) {
      console.log(`  ⊘ ${update.slug}: no normal suites to update`);
      skipped++;
      continue;
    }

    if (!dryRun) {
      for (const suite of suites) {
        await db.update(testSuites).set({
          testStatus: update.status,
          quarantineReason: update.reason,
          updatedAt: new Date(),
        }).where(eq(testSuites.id, suite.id));
      }
    }

    console.log(`  ✓ ${update.slug}: ${suites.length} suite(s) → ${update.status}`);
    console.log(`    Reason: ${update.reason}`);
    applied++;
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`Applied: ${applied}, Skipped: ${skipped}${dryRun ? " (DRY RUN)" : ""}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
