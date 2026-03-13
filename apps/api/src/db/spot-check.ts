/**
 * Spot-check: run tests for the capabilities that had broken inputs/validation
 * rules and were fixed in the recent audit. Focuses on cheap algorithmic caps
 * first, then light external-API caps.
 *
 * Usage: npx tsx apps/api/src/db/spot-check.ts
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../../.env") });

// Import app to trigger all capability side-effect registrations
import "../app.js";
import { runTests } from "../lib/test-runner.js";

// Previously-failing caps sorted cheapest-first.
// Skip Browserless and missing-API-key caps — those are infra issues, not test issues.
const SLUGS = [
  // ── Purely algorithmic (fast, free) ──────────────────────────────────────
  "iban-validate",          // removed phantom `error` check
  "unit-convert",           // fixed from_unit/to_unit values
  "payment-reference-generate", // fixed type enum
  "diff-json",              // fixed before/after fields
  "json-schema-validate",   // fixed data+schema fields
  "iso-country-lookup",     // rewrote checks to match actual output shape
  "incoterms-explain",      // fixed input + rewrote checks
  "date-parse",             // fixed date_string field name
  "flatten-json",           // fixed nested object input
  "marketplace-fee-calculate", // fixed marketplace enum
  "gitignore-generate",     // fixed languages to array
  "schema-infer",           // fixed data to array
  "changelog-generate",     // fixed commits array

  // ── Light external APIs (cheap) ───────────────────────────────────────────
  "us-company-data",        // fixed sic_code → sic
  "company-id-detect",      // fixed all_matches → matches, fixed input
  "llm-output-validate",    // fixed auto_fixed_output → auto_fixed
  "sql-explain",            // fixed tables → tables_referenced
  "sql-optimize",           // removed fake improvements field
  "openapi-validate",       // removed fake stats field
  "crypto-price",           // fixed symbol to BTC
  "npm-package-info",       // fixed package to express
  "pypi-package-info",      // fixed package to requests
  "barcode-lookup",         // fixed to real EAN-13
  "phone-normalize",        // fixed phone_string field name
  "dangerous-goods-classify", // fixed input + rewrote checks
];

async function main() {
  console.log(`Spot-checking ${SLUGS.length} previously-failing capabilities...\n`);

  let totalPassed = 0;
  let totalFailed = 0;
  const failures: { slug: string; testName: string; reason: string }[] = [];
  const noTests: string[] = [];

  for (const slug of SLUGS) {
    try {
      const summary = await runTests({ capabilitySlug: slug });
      if (summary.total === 0) {
        noTests.push(slug);
        continue;
      }
      totalPassed += summary.passed;
      totalFailed += summary.failed;

      const status = summary.failed === 0 ? "✓" : "✗";
      console.log(
        `${status} ${slug.padEnd(38)} ${summary.passed}/${summary.total} passed`,
      );

      for (const r of summary.results) {
        if (!r.passed && r.failureReason) {
          failures.push({ slug, testName: r.testName, reason: r.failureReason });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ! ${slug}: runner threw — ${msg}`);
    }
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`TOTAL  passed: ${totalPassed}  failed: ${totalFailed}`);
  const total = totalPassed + totalFailed;
  const pct = total > 0 ? Math.round((totalPassed / total) * 100) : 0;
  console.log(`Pass rate: ${pct}%`);

  if (failures.length > 0) {
    console.log(`\nFailing tests:`);
    for (const f of failures) {
      console.log(`  ✗ ${f.slug} / "${f.testName}"`);
      console.log(`    ${f.reason.split("\n")[0].slice(0, 120)}`);
    }
  }

  if (noTests.length > 0) {
    console.log(`\nNo tests found (check slug): ${noTests.join(", ")}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Spot-check failed:", err);
  process.exit(1);
});
