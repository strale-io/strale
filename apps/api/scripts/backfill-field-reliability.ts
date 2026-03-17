/**
 * Backfill output_field_reliability annotations for all active capabilities.
 *
 * Logic per capability:
 * 1. Read outputSchema to get declared output fields
 * 2. If test results exist, analyze actual outputs to determine field presence rates:
 *    - Present in >90% of successful outputs → guaranteed
 *    - Present in >50% → common
 *    - Present in <50% → rare
 * 3. If no test results, use heuristic from outputSchema:
 *    - Fields in the 'required' array → guaranteed
 *    - All other fields → common (conservative default)
 * 4. Write the annotation to output_field_reliability column
 *
 * Usage:
 *   npx tsx scripts/backfill-field-reliability.ts
 *   npx tsx scripts/backfill-field-reliability.ts --dry-run
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import { capabilities, testResults } from "../src/db/schema.js";

type ReliabilityLevel = "guaranteed" | "common" | "rare";
type ReliabilityMap = Record<string, ReliabilityLevel>;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const db = getDb();

  const allCaps = await db
    .select({
      slug: capabilities.slug,
      outputSchema: capabilities.outputSchema,
      outputFieldReliability: capabilities.outputFieldReliability,
    })
    .from(capabilities)
    .where(eq(capabilities.isActive, true));

  console.log(`Processing ${allCaps.length} active capabilities${dryRun ? " (dry run)" : ""}...\n`);

  let annotated = 0;
  let skipped = 0;
  let fromTestData = 0;
  let fromHeuristic = 0;
  const uncertain: Array<{ slug: string; fields: string[] }> = [];

  for (const cap of allCaps) {
    // Skip if already annotated
    if (cap.outputFieldReliability != null) {
      skipped++;
      continue;
    }

    const schema = cap.outputSchema as Record<string, unknown> | null;
    if (!schema || typeof schema !== "object") {
      skipped++;
      continue;
    }

    const properties = (schema.properties ?? {}) as Record<string, unknown>;
    const fieldNames = Object.keys(properties);
    if (fieldNames.length === 0) {
      skipped++;
      continue;
    }

    const requiredFields = new Set<string>(
      Array.isArray(schema.required) ? (schema.required as string[]) : [],
    );

    // Try to get test result data
    const results = await db
      .select({ actualOutput: testResults.actualOutput })
      .from(testResults)
      .where(
        and(
          eq(testResults.capabilitySlug, cap.slug),
          eq(testResults.passed, true),
        ),
      )
      .orderBy(desc(testResults.createdAt))
      .limit(20); // Use up to 20 most recent successful results

    let reliability: ReliabilityMap;
    const uncertainFields: string[] = [];

    if (results.length >= 3) {
      // Data-driven approach: analyze actual field presence
      fromTestData++;
      reliability = {};

      for (const field of fieldNames) {
        let presentCount = 0;
        for (const result of results) {
          const output = result.actualOutput as Record<string, unknown> | null;
          if (output && output[field] !== undefined && output[field] !== null) {
            presentCount++;
          }
        }
        const rate = presentCount / results.length;

        if (rate >= 0.9) {
          reliability[field] = "guaranteed";
        } else if (rate >= 0.5) {
          reliability[field] = "common";
          // Flag near-threshold fields
          if (rate >= 0.85 || (rate >= 0.45 && rate < 0.55)) {
            uncertainFields.push(`${field}(${(rate * 100).toFixed(0)}%)`);
          }
        } else {
          reliability[field] = "rare";
          if (rate >= 0.45) {
            uncertainFields.push(`${field}(${(rate * 100).toFixed(0)}%)`);
          }
        }
      }
    } else {
      // Heuristic approach: use schema required array
      fromHeuristic++;
      reliability = {};

      for (const field of fieldNames) {
        reliability[field] = requiredFields.has(field) ? "guaranteed" : "common";
      }
    }

    if (uncertainFields.length > 0) {
      uncertain.push({ slug: cap.slug, fields: uncertainFields });
    }

    if (!dryRun) {
      await db
        .update(capabilities)
        .set({ outputFieldReliability: reliability })
        .where(eq(capabilities.slug, cap.slug));
    }
    annotated++;
  }

  // Summary
  console.log("═".repeat(60));
  console.log(`BACKFILL SUMMARY${dryRun ? " (DRY RUN — no changes written)" : ""}`);
  console.log(`  Total active capabilities: ${allCaps.length}`);
  console.log(`  Annotated: ${annotated}`);
  console.log(`  Skipped (already annotated or no schema): ${skipped}`);
  console.log(`  From test data (>= 3 results): ${fromTestData}`);
  console.log(`  From heuristic (schema required array): ${fromHeuristic}`);

  if (uncertain.length > 0) {
    console.log(`\n⚠ UNCERTAIN CASES (fields near thresholds — review manually):`);
    for (const { slug, fields } of uncertain) {
      console.log(`  ${slug}: ${fields.join(", ")}`);
    }
  }

  if (annotated > 0 && !dryRun) {
    console.log(`\n✅ ${annotated} capabilities annotated with field reliability.`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
