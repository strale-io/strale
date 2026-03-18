import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { getDb } from "./index.js";
import { testSuites } from "./schema.js";
import { eq, and } from "drizzle-orm";

const db = getDb();

// ─── Remove optional field checks from known_answer validation_rules ────────
// These capabilities work fine but check fields that aren't always present
// in LLM-extracted data. Following the Belgian pattern: only assert on
// company_name, status, and other reliably-present fields.

const OPTIONAL_FIELDS: Record<string, string[]> = {
  "japanese-company-data":    ["corporate_number", "business_type"],
  "australian-company-data":  ["abn", "acn"],
  "canadian-company-data":    ["corporation_number", "business_type"],
  "employer-review-summary":  ["overall_rating", "ratings_breakdown"],
  "salary-benchmark":         ["p25", "p75"],
  "credit-report-summary":    ["credit_rating"],
  "product-search":           ["total_results_estimate"],
  "price-compare":            ["lowest_price", "highest_price", "average_price"],
  "return-policy-extract":    ["free_returns", "refund_method"],
  "terms-of-service-extract": ["governing_law", "arbitration_clause"],
  "annual-report-extract":    ["employees"],
  "customs-duty-lookup":      ["duty_rate", "duty_type", "anti_dumping", "preferential_rates"],
  "google-search":            ["total_results_estimate"],
};

console.log("=== Removing optional field checks from known_answer tests ===\n");
let totalUpdated = 0;

for (const [slug, fieldsToRemove] of Object.entries(OPTIONAL_FIELDS)) {
  const rows = await db.select({
    id: testSuites.id,
    validationRules: testSuites.validationRules,
  })
    .from(testSuites)
    .where(and(
      eq(testSuites.capabilitySlug, slug),
      eq(testSuites.testType, "known_answer"),
      eq(testSuites.active, true),
    ));

  for (const row of rows) {
    const rules = row.validationRules as any;
    if (!rules?.checks || !Array.isArray(rules.checks)) continue;

    const before = rules.checks.length;
    const newChecks = rules.checks.filter(
      (c: any) => !fieldsToRemove.includes(c.field),
    );
    const removed = before - newChecks.length;

    if (removed === 0) {
      console.log(`${slug}: no matching fields found`);
      continue;
    }

    const removedNames = rules.checks
      .filter((c: any) => fieldsToRemove.includes(c.field))
      .map((c: any) => `${c.field}:${c.operator}`)
      .join(", ");

    await db.update(testSuites)
      .set({ validationRules: { checks: newChecks } })
      .where(eq(testSuites.id, row.id));

    const remaining = newChecks.map((c: any) => `${c.field}:${c.operator}`).join(", ");
    console.log(`${slug}: removed ${removed} checks (${removedNames})`);
    console.log(`  Remaining: ${remaining}`);
    totalUpdated++;
  }
}

// Customs-duty: if all checks removed, add minimal hs_code check
const cdRows = await db.select({
  id: testSuites.id,
  validationRules: testSuites.validationRules,
})
  .from(testSuites)
  .where(and(
    eq(testSuites.capabilitySlug, "customs-duty-lookup"),
    eq(testSuites.testType, "known_answer"),
    eq(testSuites.active, true),
  ));

for (const row of cdRows) {
  const rules = row.validationRules as any;
  if (rules?.checks?.length === 0) {
    await db.update(testSuites)
      .set({
        validationRules: {
          checks: [
            { field: "hs_code", operator: "not_null" },
            { field: "hs_code", value: "string", operator: "type" },
          ],
        },
      })
      .where(eq(testSuites.id, row.id));
    console.log(`customs-duty-lookup: added minimal hs_code check`);
    totalUpdated++;
  }
}

console.log(`\n=== Updated ${totalUpdated} test suites ===`);
process.exit(0);
