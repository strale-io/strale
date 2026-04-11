import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { getDb } from "./index.js";
import { capabilities, testSuites } from "./schema.js";
import { eq, and } from "drizzle-orm";
import { assignTier } from "../lib/test-generation.js";

// ─── Validation helpers ─────────────────────────────────────────────────────

function checks(
  ...c: Array<{ field: string; operator: string; value?: unknown }>
) {
  return { checks: c };
}

function notNull(field: string) {
  return { field, operator: "not_null" };
}
function isType(field: string, value: string) {
  return { field, operator: "type", value };
}

// ─── Schema validation from output schema ───────────────────────────────────
// Goal: verify the output conforms to the declared output_schema structure.
// Checks every top-level property exists with the correct type.

function getSchemaChecks(
  outputSchema: Record<string, unknown>,
): ReturnType<typeof checks> {
  const props = (outputSchema as { properties?: Record<string, any> }).properties;
  if (!props) return checks();

  const rules: Array<{ field: string; operator: string; value?: unknown }> = [];

  for (const [key, prop] of Object.entries(props)) {
    rules.push(notNull(key));

    if (prop.type === "string") rules.push(isType(key, "string"));
    else if (prop.type === "number" || prop.type === "integer") rules.push(isType(key, "number"));
    else if (prop.type === "boolean") rules.push(isType(key, "boolean"));
    else if (prop.type === "array") rules.push(isType(key, "array"));
    else if (prop.type === "object") rules.push(isType(key, "object"));

    if (rules.length >= 10) break;
  }

  return checks(...rules);
}

// ─── Input generation (reused from correctness generator) ───────────────────

function generateTestInput(
  inputSchema: Record<string, unknown>,
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  const props = (inputSchema as { properties?: Record<string, any> }).properties;
  if (!props) return input;

  const required = new Set(
    (inputSchema as { required?: string[] }).required ?? [],
  );

  for (const [key, prop] of Object.entries(props)) {
    const name = key.toLowerCase();

    if (prop.example !== undefined) { input[key] = prop.example; continue; }
    if (prop.default !== undefined) { input[key] = prop.default; continue; }

    if (name.includes("url") || name.includes("website")) { input[key] = "https://example.com"; continue; }
    if (name === "domain" || name === "hostname" || name === "host") { input[key] = "google.com"; continue; }
    if (name.includes("email")) { input[key] = "test@google.com"; continue; }
    if (name === "company" || name === "company_name" || name === "name") { input[key] = "Google"; continue; }
    if (name === "ticker" || name === "symbol") { input[key] = "GOOG"; continue; }
    if (name === "username") { input[key] = "Google"; continue; }
    if (name === "country_code" || name === "country") { input[key] = "SE"; continue; }
    if (name === "from" || name === "source_currency" || name === "base") { input[key] = "USD"; continue; }
    if (name === "to" || name === "target_currency") { input[key] = "EUR"; continue; }
    if (name === "currency" || name === "currency_code") { input[key] = "EUR"; continue; }
    if (name === "amount") { input[key] = 100; continue; }
    if (name === "ip" || name === "ip_address") { input[key] = "8.8.8.8"; continue; }
    if (name === "port" || name === "ports") { input[key] = prop.type === "array" ? [80, 443] : 443; continue; }
    if (name === "phone" || name === "phone_number") { input[key] = "+14155552671"; continue; }
    if (name.includes("iban")) { input[key] = "DE89370400440532013000"; continue; }
    if (name === "bic" || name === "swift_code" || name.includes("swift")) { input[key] = "COBADEFFXXX"; continue; }
    if (name.includes("vat") && name.includes("number")) { input[key] = "SE556703748501"; continue; }
    if (name.includes("org_number") || name === "organization_number" || name === "registration_number") { input[key] = "556703-7485"; continue; }
    if (name.includes("text") || name.includes("content") || name.includes("query") || name.includes("search") || name.includes("keyword")) { input[key] = "test input for schema validation"; continue; }
    if (name === "code" || name === "source_code") { input[key] = "function hello() { return 'world'; }"; continue; }
    if (name === "sql") { input[key] = "SELECT 1"; continue; }
    if (name === "year") { input[key] = 2025; continue; }
    if (name === "date" || name === "start_date") { input[key] = "2025-01-15"; continue; }

    if (!required.has(key)) continue;
    if (prop.type === "string") input[key] = "test_value";
    else if (prop.type === "number" || prop.type === "integer") input[key] = 1;
    else if (prop.type === "boolean") input[key] = true;
    else if (prop.type === "array") input[key] = ["test_item"];
    else if (prop.type === "object") input[key] = { key: "value" };
  }

  return input;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function generate() {
  const db = getDb();

  const allCaps = await db
    .select()
    .from(capabilities)
    .where(eq(capabilities.isActive, true));

  console.log(`Found ${allCaps.length} active capabilities.`);

  const existing = await db
    .select({ capabilitySlug: testSuites.capabilitySlug })
    .from(testSuites)
    .where(and(eq(testSuites.testType, "schema_check"), eq(testSuites.active, true)));

  const hasSC = new Set(existing.map((s) => s.capabilitySlug));
  console.log(`${hasSC.size} capabilities already have schema_check tests.`);

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const cap of allCaps) {
    if (hasSC.has(cap.slug)) {
      skipped++;
      continue;
    }

    const inputSchema = (cap.inputSchema ?? {}) as Record<string, unknown>;
    const outputSchema = (cap.outputSchema ?? {}) as Record<string, unknown>;
    const testInput = generateTestInput(inputSchema);
    const validationRules = getSchemaChecks(outputSchema);

    try {
      await db.insert(testSuites).values({
        capabilitySlug: cap.slug,
        testName: `${cap.name} — schema conformance`,
        testType: "schema_check",
        input: testInput,
        expectedOutput: null,
        validationRules,
        scheduleTier: assignTier(cap.transparencyTag, cap.maintenanceClass),
        estimatedCostCents: cap.priceCents,
      });

      created++;
      console.log(`  + ${cap.slug} (${validationRules.checks.length} checks)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${cap.slug}: ${msg}`);
      console.error(`  ! ${cap.slug}: ${msg}`);
    }
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Done.`);
  console.log(`  Created: ${created} schema_check tests`);
  console.log(`  Skipped: ${skipped} (already had schema_check)`);
  console.log(`  Errors:  ${errors.length}`);

  if (errors.length > 0) {
    console.log(`\nErrors:`);
    for (const e of errors) console.log(`  - ${e}`);
  }

  process.exit(0);
}

generate().catch((err) => {
  console.error("Generate failed:", err);
  process.exit(1);
});
