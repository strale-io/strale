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

// ─── Availability input generation ──────────────────────────────────────────
// Goal: produce a minimal valid input that exercises the capability's upstream
// dependency. If the capability returns any result (even an error response),
// the dependency is available. Failure = timeout/crash/connection refused.

function generateAvailabilityInput(
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

    // Use examples/defaults if available (most likely to succeed)
    if (prop.example !== undefined) { input[key] = prop.example; continue; }
    if (prop.default !== undefined) { input[key] = prop.default; continue; }

    // URLs and domains — use known-available targets
    if (name.includes("url") || name.includes("website")) { input[key] = "https://example.com"; continue; }
    if (name === "domain" || name === "hostname" || name === "host") { input[key] = "example.com"; continue; }

    // Email
    if (name.includes("email")) { input[key] = "test@example.com"; continue; }

    // Company identifiers — use well-known values
    if (name === "domain" || name === "hostname") { input[key] = "google.com"; continue; }
    if (name === "company" || name === "company_name" || name === "name") { input[key] = "Google"; continue; }
    if (name === "ticker" || name === "symbol") { input[key] = "AAPL"; continue; }
    if (name === "username") { input[key] = "octocat"; continue; }

    // Country / locale
    if (name === "country_code" || name === "country") { input[key] = "US"; continue; }

    // Currency
    if (name === "from" || name === "source_currency" || name === "base") { input[key] = "USD"; continue; }
    if (name === "to" || name === "target_currency") { input[key] = "EUR"; continue; }
    if (name === "currency" || name === "currency_code") { input[key] = "USD"; continue; }
    if (name === "amount") { input[key] = 1; continue; }

    // Network
    if (name === "ip" || name === "ip_address") { input[key] = "8.8.8.8"; continue; }
    if (name === "port" || name === "ports") { input[key] = prop.type === "array" ? [80] : 80; continue; }
    if (name === "phone" || name === "phone_number") { input[key] = "+14155552671"; continue; }

    // Registry identifiers — use simple known values
    if (name.includes("org_number") || name === "organization_number" || name === "registration_number") { input[key] = "556703-7485"; continue; }
    if (name.includes("iban")) { input[key] = "DE89370400440532013000"; continue; }
    if (name === "bic" || name === "swift_code" || name.includes("swift")) { input[key] = "COBADEFFXXX"; continue; }
    if (name.includes("vat") && name.includes("number")) { input[key] = "SE556703748501"; continue; }

    // Text content — minimal
    if (name.includes("text") || name.includes("content") || name.includes("query") || name.includes("search") || name.includes("keyword")) { input[key] = "test"; continue; }
    if (name === "code" || name === "source_code") { input[key] = "const x = 1;"; continue; }

    // Date/time
    if (name === "year") { input[key] = 2025; continue; }
    if (name === "date" || name === "start_date") { input[key] = "2025-01-15"; continue; }

    // Type fallbacks for required fields only
    if (!required.has(key)) continue;
    if (prop.type === "string") input[key] = "test";
    else if (prop.type === "number" || prop.type === "integer") input[key] = 1;
    else if (prop.type === "boolean") input[key] = true;
    else if (prop.type === "array") input[key] = ["test"];
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

  // Find which capabilities already have dependency_health tests
  const existingDH = await db
    .select({ capabilitySlug: testSuites.capabilitySlug })
    .from(testSuites)
    .where(and(eq(testSuites.testType, "dependency_health"), eq(testSuites.active, true)));

  const hasDH = new Set(existingDH.map((s) => s.capabilitySlug));
  console.log(`${hasDH.size} capabilities already have dependency_health tests.`);

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const cap of allCaps) {
    if (hasDH.has(cap.slug)) {
      skipped++;
      continue;
    }

    const inputSchema = (cap.inputSchema ?? {}) as Record<string, unknown>;
    const testInput = generateAvailabilityInput(inputSchema);

    try {
      await db.insert(testSuites).values({
        capabilitySlug: cap.slug,
        testName: `${cap.name} — availability (dependency health)`,
        testType: "dependency_health",
        input: testInput,
        expectedOutput: null,
        validationRules: checks(), // pass = any response received (no crash/timeout)
        scheduleTier: assignTier(cap.transparencyTag, cap.maintenanceClass),
        estimatedCostCents: 0, // availability checks should be cheap
      });

      created++;
      const inputPreview = JSON.stringify(testInput).slice(0, 80);
      console.log(`  + ${cap.slug} (input: ${inputPreview}${inputPreview.length >= 80 ? "..." : ""})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${cap.slug}: ${msg}`);
      console.error(`  ! ${cap.slug}: ${msg}`);
    }
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Done.`);
  console.log(`  Created: ${created} dependency_health tests`);
  console.log(`  Skipped: ${skipped} (already had dependency_health)`);
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
