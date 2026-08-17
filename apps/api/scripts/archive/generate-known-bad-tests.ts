/**
 * Generate known_bad test suites for existing capabilities.
 *
 * For each active capability, generates a test with deliberately invalid input
 * and asserts the capability correctly rejects it (error thrown or "valid: false").
 *
 * Usage: npx tsx scripts/generate-known-bad-tests.ts [--dry-run]
 */

import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import { capabilities, testSuites } from "../src/db/schema.js";
import { autoRegisterCapabilities } from "../src/capabilities/auto-register.js";

const DRY_RUN = process.argv.includes("--dry-run");

// ─── Bad input generators by field name ──────────────────────────────────────

const FIELD_BAD_VALUES: Record<string, unknown> = {
  iban: "INVALID123",
  vat_number: "XX000000000",
  vat: "XX000000000",
  email: "not-an-email",
  url: "not-a-url",
  domain: "thisisnotarealdomain12345.xyz",
  company_number: "0000000",
  org_number: "000000-0000",
  organization_number: "000000-0000",
  abn: "00000000000",
  isbn: "000-0-00-000000-0",
  swift_code: "INVALID",
  bic: "INVALID",
  lei: "0000000000000000000X",
  eori: "XX000000000000",
  ip: "999.999.999.999",
  ip_address: "999.999.999.999",
  phone: "not-a-phone",
  cron: "* * * * * * * *",
  json: "{broken json",
  xml: "<broken xml",
  markdown: "",
  host: "thisisnotarealdomain12345.xyz",
  ticker: "ZZZZZZZZZ",
  isin: "XX0000000000",
  query: "",
  name: "",
  entity_name: "",
  text: "",
  content: "",
};

// Capabilities where known_bad doesn't make sense (pure text processing, generation, etc.)
const SKIP_CATEGORIES = new Set([
  "data-processing", // json-repair, csv-clean etc. — they process anything
]);

const SKIP_SLUGS = new Set([
  "json-repair",
  "csv-clean",
  "deduplicate",
  "markdown-to-html",
  "base64-encode-url",
  "flatten-json",
  "csv-to-json",
  "xml-to-json",
  "json-to-csv",
  "image-resize",
  "risk-narrative-generate",
  "url-to-text",
  "pii-redact",
]);

// Capabilities that return a "valid" boolean field — assert is_false
const VALIDATION_CAPABILITIES = new Set([
  "iban-validate", "vat-validate", "vat-format-validate", "swift-validate",
  "isbn-validate", "email-validate", "json-schema-validate", "sepa-xml-validate",
  "openapi-validate", "invoice-validate", "eori-validate",
]);

function generateBadInput(inputSchema: any, slug: string): Record<string, unknown> | null {
  if (!inputSchema?.properties) return null;

  const required = inputSchema.required ?? Object.keys(inputSchema.properties);
  const badInput: Record<string, unknown> = {};

  for (const field of required) {
    const prop = inputSchema.properties[field];
    if (!prop) continue;

    // Use field-specific bad value if available
    const badValue = FIELD_BAD_VALUES[field.toLowerCase()];
    if (badValue !== undefined) {
      badInput[field] = badValue;
      continue;
    }

    // Type-based fallback
    if (prop.type === "string") {
      badInput[field] = "INVALID_TEST_VALUE_12345";
    } else if (prop.type === "number" || prop.type === "integer") {
      badInput[field] = -99999;
    } else if (prop.type === "boolean") {
      badInput[field] = null;
    } else if (prop.type === "object") {
      badInput[field] = {};
    } else if (prop.type === "array") {
      badInput[field] = [];
    } else {
      badInput[field] = "INVALID";
    }
  }

  return Object.keys(badInput).length > 0 ? badInput : null;
}

function generateValidationRules(slug: string): Array<{ field: string; operator: string; value?: unknown }> {
  if (VALIDATION_CAPABILITIES.has(slug)) {
    return [{ field: "valid", operator: "is_false" }];
  }
  // For non-validation capabilities, the test passes if the executor throws
  // No explicit validation rules needed — the test runner treats thrown errors as PASS
  return [];
}

async function main() {
  await autoRegisterCapabilities();
  const db = getDb();

  const allCaps = await db
    .select({
      slug: capabilities.slug,
      category: capabilities.category,
      inputSchema: capabilities.inputSchema,
    })
    .from(capabilities)
    .where(and(eq(capabilities.isActive, true)));

  // Check existing known_bad suites
  const existingRows = await db
    .select({ capabilitySlug: testSuites.capabilitySlug })
    .from(testSuites)
    .where(and(eq(testSuites.testType, "known_bad"), eq(testSuites.active, true)));
  const existingSlugs = new Set(existingRows.map((r) => r.capabilitySlug));

  let created = 0;
  let skipped = 0;
  let alreadyExists = 0;

  for (const cap of allCaps) {
    if (existingSlugs.has(cap.slug)) {
      alreadyExists++;
      continue;
    }

    if (SKIP_SLUGS.has(cap.slug)) {
      skipped++;
      continue;
    }

    const badInput = generateBadInput(cap.inputSchema, cap.slug);
    if (!badInput) {
      skipped++;
      continue;
    }

    const validationRules = generateValidationRules(cap.slug);

    if (!DRY_RUN) {
      await db.insert(testSuites).values({
        capabilitySlug: cap.slug,
        testName: `${cap.slug}__known_bad`,
        testType: "known_bad",
        input: badInput,
        validationRules: { checks: validationRules },
        scheduleTier: "B",
        estimatedCostCents: 0, // Most will throw before making external calls
      });
    }

    created++;
  }

  console.log(`\n[known-bad] Results:`);
  console.log(`  Total active capabilities: ${allCaps.length}`);
  console.log(`  Already have known_bad: ${alreadyExists}`);
  console.log(`  Skipped (not applicable): ${skipped}`);
  console.log(`  Created: ${created}`);
  if (DRY_RUN) console.log(`  (Dry run — no changes applied)`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
