/**
 * Backfill output_field_reliability annotations for all active capabilities.
 *
 * Logic per capability:
 * 1. Read outputSchema to get declared output fields
 * 2. If known_answer/schema_check test results exist (happy-path tests only),
 *    analyze actual outputs to determine field presence rates:
 *    - Present in ≥70% of successful outputs → guaranteed
 *    - Present in 30–70% → common
 *    - Present in <30% → rare
 * 3. Schema fallback: if test data produced zero guaranteed fields,
 *    promote schema 'required' fields to guaranteed.
 * 4. If no qualifying test results at all, use heuristic from outputSchema:
 *    - Fields in the 'required' array → guaranteed
 *    - All other fields → common (conservative default)
 * 5. Write the annotation to output_field_reliability column
 *
 * Usage:
 *   npx tsx scripts/backfill-field-reliability.ts
 *   npx tsx scripts/backfill-field-reliability.ts --dry-run
 *   npx tsx scripts/backfill-field-reliability.ts --force
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { eq, and, desc, inArray } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import { capabilities, testResults, testSuites } from "../src/db/schema.js";
import type { CapabilityType } from "../src/lib/reliability-profile.js";

type ReliabilityLevel = "guaranteed" | "common" | "rare";

// Threshold above which a field is classified as 'guaranteed', per capability type.
//
// PRINCIPLE: A field should only be 'guaranteed' if it is STRUCTURALLY present
// in every successful execution, not conditionally (e.g., only when matches exist).
// Never mark input-dependent or AI-uncertain fields as guaranteed regardless of rate.
//
// - deterministic/stable_api: stable code, consistent outputs → 80% threshold
// - scraping: upstream HTML varies, fields can disappear → 90% threshold
// - ai_assisted: extraction is inherently uncertain, format-dependent → 95% threshold
const GUARANTEED_THRESHOLD_BY_TYPE: Record<CapabilityType, number> = {
  deterministic: 0.80,
  stable_api: 0.80,
  scraping: 0.90,
  ai_assisted: 0.95,
};
type ReliabilityMap = Record<string, ReliabilityLevel>;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force"); // Re-annotate even if already set
  const db = getDb();

  const allCaps = await db
    .select({
      slug: capabilities.slug,
      capabilityType: capabilities.capabilityType,
      outputSchema: capabilities.outputSchema,
      outputFieldReliability: capabilities.outputFieldReliability,
    })
    .from(capabilities)
    .where(eq(capabilities.isActive, true));

  console.log(`Processing ${allCaps.length} active capabilities${dryRun ? " (dry run)" : ""}...\n`);

  let annotated = 0;
  let skipped = 0;
  let fromTestData = 0;
  let fromSchemaFallback = 0; // test data used but no guaranteed → schema promoted required fields
  let fromHeuristic = 0;
  const uncertain: Array<{ slug: string; fields: string[] }> = [];

  for (const cap of allCaps) {
    // Skip if already annotated (unless --force)
    if (cap.outputFieldReliability != null && !force) {
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

    // Query happy-path test results only (known_answer + schema_check).
    // Negative and edge_case tests produce sparse/empty outputs and would
    // drag field presence rates down, masking genuinely stable fields.
    const results = await db
      .select({ actualOutput: testResults.actualOutput })
      .from(testResults)
      .innerJoin(testSuites, eq(testResults.testSuiteId, testSuites.id))
      .where(
        and(
          eq(testResults.capabilitySlug, cap.slug),
          eq(testResults.passed, true),
          inArray(testSuites.testType, ["known_answer", "schema_check"]),
        ),
      )
      .orderBy(desc(testResults.executedAt))
      .limit(20); // Use up to 20 most recent successful happy-path results

    let reliability: ReliabilityMap;
    const uncertainFields: string[] = [];

    if (results.length >= 3) {
      // Data-driven approach: analyze actual field presence
      fromTestData++;
      reliability = {};

      // Apply type-specific threshold for 'guaranteed' classification
      const capType = (cap.capabilityType as CapabilityType) ?? "stable_api";
      const guaranteedThreshold = GUARANTEED_THRESHOLD_BY_TYPE[capType] ?? 0.80;

      for (const field of fieldNames) {
        let presentCount = 0;
        for (const result of results) {
          const output = result.actualOutput as Record<string, unknown> | null;
          if (output && output[field] !== undefined && output[field] !== null) {
            presentCount++;
          }
        }
        const rate = presentCount / results.length;

        if (rate >= guaranteedThreshold) {
          reliability[field] = "guaranteed";
          // Flag fields just above the threshold as uncertain
          if (rate < guaranteedThreshold + 0.10) {
            uncertainFields.push(`${field}(${(rate * 100).toFixed(0)}%)`);
          }
        } else if (rate >= 0.3) {
          reliability[field] = "common";
          // Flag near-threshold fields
          if (rate >= guaranteedThreshold - 0.05 || (rate >= 0.25 && rate < 0.35)) {
            uncertainFields.push(`${field}(${(rate * 100).toFixed(0)}%)`);
          }
        } else {
          reliability[field] = "rare";
          if (rate >= 0.25) {
            uncertainFields.push(`${field}(${(rate * 100).toFixed(0)}%)`);
          }
        }
      }

      // Schema fallback: if test data still yields zero guaranteed fields,
      // promote fields to guaranteed using the schema. If a 'required' array
      // exists, only those fields get promoted. If no required array (most
      // schemas don't define one), treat ALL schema properties as guaranteed —
      // they're part of the defined output interface by the capability author.
      if (!Object.values(reliability).some((v) => v === "guaranteed")) {
        const fieldsToPromote = requiredFields.size > 0
          ? fieldNames.filter((f) => requiredFields.has(f))
          : fieldNames; // no required array → promote all schema fields
        for (const field of fieldsToPromote) {
          reliability[field] = "guaranteed";
        }
        fromSchemaFallback++;
        fromTestData--; // re-classify: counted as testData above, adjust
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
  console.log(`  From test data (>= 3 results, guaranteed via rates): ${fromTestData}`);
  console.log(`  From test data + schema fallback (no rate hit 70%): ${fromSchemaFallback}`);
  console.log(`  From heuristic only (< 3 qualifying results): ${fromHeuristic}`);

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
