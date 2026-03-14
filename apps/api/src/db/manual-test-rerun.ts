import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../../../.env") });

// Import app to trigger all capability executor registrations (side-effect imports)
import "../app.js";

import { runTests } from "../lib/test-runner.js";

// ─── Capabilities with fixed test inputs (do NOT include quarantined ones) ──

const fixedSlugs = [
  // Phase 2: bad inputs (now have real company names)
  "austrian-company-data",
  "hong-kong-company-data",
  "singapore-company-data",
  // Phase 3: bad URLs
  "youtube-summarize",
  "terms-of-service-extract",
  "competitor-compare",
  "privacy-policy-analyze",
  "invoice-extract",
  // Phase 4: schema drift
  "google-search",
  "commit-message-generate",
  "social-post-generate",
  // Phase 5: optional field / registry number fixes
  "italian-company-data",
  "belgian-company-data",
  "canadian-company-data",
  "irish-company-data",
  "latvian-company-data",
  "german-company-data",
  "portuguese-company-data",
  "swiss-company-data",
  "japanese-company-data",
  "dutch-company-data",
  "indian-company-data",
  "australian-company-data",
  "company-tech-stack",
  "pricing-page-extract",
  "salary-benchmark",
  "employer-review-summary",
  "price-compare",
  "product-reviews-extract",
  "product-search",
  "image-to-text",
  "customs-duty-lookup",
  "schema-migration-generate",
  "credit-report-summary",
  "return-policy-extract",
  // Remaining 5 (from fix-low-sqs-remaining.ts)
  "annual-report-extract",
  "lithuanian-company-data",
  "brand-mention-search",
  "uk-company-data",
  "patent-search",
];

console.log(`=== Manual test re-run for ${fixedSlugs.length} fixed capabilities ===`);
console.log("This will make real API calls to external services.\n");

const overall = { total: 0, passed: 0, failed: 0, errors: 0 };
const failedSlugs: string[] = [];

for (let i = 0; i < fixedSlugs.length; i++) {
  const slug = fixedSlugs[i];
  console.log(`[${i + 1}/${fixedSlugs.length}] ${slug}...`);

  try {
    const summary = await runTests({ capabilitySlug: slug });
    overall.total += summary.total;
    overall.passed += summary.passed;
    overall.failed += summary.failed;

    const passRate = summary.total > 0
      ? ((summary.passed / summary.total) * 100).toFixed(0)
      : "0";

    console.log(
      `  ${summary.passed}/${summary.total} passed (${passRate}%) — ${summary.avgResponseTimeMs}ms avg`,
    );

    if (summary.failed > 0) {
      failedSlugs.push(slug);
      for (const r of summary.results) {
        if (!r.passed) {
          console.log(`    ❌ [${r.testType}] ${r.failureReason ?? "unknown"}`);
        }
      }
    }
  } catch (err) {
    overall.errors++;
    failedSlugs.push(slug);
    console.log(`  ❌ ERROR: ${(err as Error).message}`);
  }

  // Small delay between capabilities to avoid hammering external services
  if (i < fixedSlugs.length - 1) {
    await new Promise((r) => setTimeout(r, 300));
  }
}

console.log("\n=== SUMMARY ===");
console.log(`Total tests run: ${overall.total}`);
console.log(`Passed: ${overall.passed} (${overall.total > 0 ? ((overall.passed / overall.total) * 100).toFixed(1) : 0}%)`);
console.log(`Failed: ${overall.failed}`);
console.log(`Errors: ${overall.errors}`);

if (failedSlugs.length > 0) {
  console.log(`\nCapabilities with failures (${failedSlugs.length}):`);
  for (const s of failedSlugs) console.log(`  - ${s}`);
}

console.log("\nSQS scores will recalculate on next quality aggregation cycle.");
process.exit(0);
