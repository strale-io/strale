/**
 * Add SECONDARY (name-search) test fixtures for 5 capabilities
 * that Gate 5 flagged as having no name-path coverage.
 *
 * Run: npx tsx scripts/add-name-fixtures.ts
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { getDb } from "../src/db/index.js";
import { testSuites } from "../src/db/schema.js";
import { getExecutor } from "../src/capabilities/index.js";
import { autoRegisterCapabilities } from "../src/capabilities/auto-register.js";

interface FixtureDef {
  slug: string;
  testName: string;
  input: Record<string, unknown>;
  checks: Array<{ field: string; operator: string; value?: unknown }>;
  costCents: number;
}

const fixtures: FixtureDef[] = [
  {
    slug: "uk-company-data",
    testName: "uk-company-data-name-search-rolls-royce",
    input: { company_number: "Rolls-Royce Holdings" },
    checks: [
      { field: "company_name", operator: "contains", value: "ROLLS-ROYCE" },
      { field: "status", operator: "not_null" },
      { field: "registration_number", operator: "not_null" },
    ],
    costCents: 5,
  },
  {
    slug: "credit-report-summary",
    testName: "credit-report-summary-name-search-volvo",
    input: { org_number: "Volvo Car" },
    checks: [
      { field: "company_name", operator: "contains", value: "Volvo" },
    ],
    costCents: 80,
  },
  {
    slug: "polish-company-data",
    testName: "polish-company-data-name-search-budimex",
    input: { krs_number: "Budimex" },
    checks: [
      { field: "company_name", operator: "contains", value: "BUDIMEX" },
      { field: "krs_number", operator: "not_null" },
      { field: "register_type", operator: "equals", value: "commercial" },
    ],
    costCents: 80,
  },
  {
    slug: "french-company-data",
    testName: "french-company-data-name-search-sodexo",
    input: { siren: "Sodexo" },
    checks: [
      { field: "company_name", operator: "contains", value: "SODEXO" },
      { field: "siren", operator: "not_null" },
      { field: "status", operator: "equals", value: "active" },
    ],
    costCents: 5,
  },
  {
    slug: "estonian-company-data",
    testName: "estonian-company-data-name-search-wise",
    input: { registry_code: "Wise" },
    checks: [
      { field: "company_name", operator: "contains", value: "Wise" },
      { field: "registry_code", operator: "not_null" },
    ],
    costCents: 80,
  },
];

async function main() {
  console.log("Registering capability executors...");
  await autoRegisterCapabilities();

  const db = getDb();

  for (const f of fixtures) {
    console.log(`\n=== ${f.slug}: ${f.testName} ===`);

    // 1. Execute the capability to verify the fixture works
    console.log(`  Executing with input: ${JSON.stringify(f.input)}`);
    const executor = getExecutor(f.slug);
    if (!executor) {
      console.error(`  SKIP: no executor found for ${f.slug}`);
      continue;
    }

    try {
      const result = await executor(f.input);
      const output = result.output as Record<string, unknown>;
      console.log(`  Output keys: ${Object.keys(output).join(", ")}`);

      // 2. Validate checks against actual output
      let allPass = true;
      for (const check of f.checks) {
        const actual = output[check.field];
        let pass = false;
        if (check.operator === "not_null") {
          pass = actual != null;
        } else if (check.operator === "contains" && typeof actual === "string" && typeof check.value === "string") {
          pass = actual.toUpperCase().includes(check.value.toUpperCase());
        } else if (check.operator === "equals") {
          pass = actual === check.value;
        }
        const icon = pass ? "PASS" : "FAIL";
        console.log(`  ${icon}: ${check.field} ${check.operator} ${check.value ?? ""} (actual: ${typeof actual === "string" ? actual.slice(0, 60) : actual})`);
        if (!pass) allPass = false;
      }

      if (!allPass) {
        console.error(`  SKIP INSERT: fixture checks failed against live output`);
        continue;
      }

      // 3. Insert the fixture
      await db.insert(testSuites).values({
        capabilitySlug: f.slug,
        testName: f.testName,
        testType: "known_answer",
        input: f.input,
        validationRules: { checks: f.checks },
        active: true,
        scheduleTier: "B",
        estimatedCostCents: f.costCents,
        testMode: "live",
      });
      console.log(`  INSERTED: ${f.testName}`);
    } catch (err) {
      console.error(`  FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
