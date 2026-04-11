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

// ─── Edge case input generation ─────────────────────────────────────────────
// Goal: produce unusual-but-valid inputs that test boundary conditions.
// The test PASSES if the capability returns any result or structured error.
// It FAILS only on crashes/unhandled exceptions.

function generateEdgeCaseInput(
  inputSchema: Record<string, unknown>,
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  const props = (inputSchema as { properties?: Record<string, any> }).properties;
  if (!props) return input;

  for (const [key, prop] of Object.entries(props)) {
    const name = key.toLowerCase();

    // ── URL fields: malformed URL ──
    if (name.includes("url") || name.includes("website")) {
      input[key] = "not-a-valid-url";
      continue;
    }

    // ── Domain fields: IP address ──
    if (name === "domain" || name === "hostname" || name === "host") {
      input[key] = "127.0.0.1";
      continue;
    }

    // ── Email fields: plus addressing ──
    if (name.includes("email")) {
      input[key] = "test+edge-case-very-long-tag-12345@subdomain.example.co.uk";
      continue;
    }

    // ── Financial identifiers: wrong format ──
    if (name.includes("iban")) { input[key] = "XX00"; continue; }
    if (name === "bic" || name === "swift_code" || name.includes("swift")) { input[key] = "X"; continue; }
    if (name.includes("vat") && name.includes("number")) { input[key] = "ZZ000"; continue; }
    if (["org_number", "organization_number", "registration_number", "company_number", "cvr_number", "business_id", "registry_code"].includes(name)) { input[key] = "0"; continue; }
    if (name === "lei") { input[key] = "0000000000000000000X"; continue; }
    if (name === "eori" || name === "eori_number") { input[key] = "XX0"; continue; }
    if (name === "isbn") { input[key] = "000-0-00-000000-0"; continue; }

    // ── Company/name: unicode + special chars ──
    if (name === "company" || name === "company_name" || name === "name") {
      input[key] = "Ñoño & Cía. S.A. / «Тест» 株式会社";
      continue;
    }
    if (name === "ticker" || name === "symbol") { input[key] = "ZZZZZ"; continue; }
    if (name === "username") { input[key] = "a"; continue; }

    // ── Country: invalid code ──
    if (name === "country_code" || name === "country") { input[key] = "ZZ"; continue; }

    // ── Currency: same from/to ──
    if (name === "from" || name === "source_currency" || name === "base") { input[key] = "XYZ"; continue; }
    if (name === "to" || name === "target_currency") { input[key] = "XYZ"; continue; }
    if (name === "currency" || name === "currency_code") { input[key] = "XYZ"; continue; }
    if (name === "amount") { input[key] = 0; continue; }

    // ── Network: edge values ──
    if (name === "ip" || name === "ip_address") { input[key] = "0.0.0.0"; continue; }
    if (name === "port" || name === "ports") { input[key] = prop.type === "array" ? [0] : 0; continue; }
    if (name === "phone" || name === "phone_number") { input[key] = "+0"; continue; }

    // ── Date/time: far future ──
    if (name === "year") { input[key] = 2099; continue; }
    if (name === "date" || name === "start_date") { input[key] = "2099-12-31"; continue; }
    if (name === "end_date") { input[key] = "2099-12-31"; continue; }

    // ── Code: empty/minimal ──
    if (name === "code" || name === "source_code") { input[key] = ""; continue; }
    if (name === "sql" || name === "query") { input[key] = ";"; continue; }
    if (name === "json" || name === "json_string") { input[key] = "null"; continue; }
    if (name === "xml") { input[key] = "<>"; continue; }
    if (name === "csv" || name === "csv_data") { input[key] = ""; continue; }
    if (name === "html") { input[key] = "<!DOCTYPE>"; continue; }

    // ── Text fields: very long string with unicode ──
    if (name.includes("text") || name.includes("content") || name.includes("description") || name.includes("input") || name.includes("body") || name.includes("message") || name.includes("prompt")) {
      input[key] = "边缘测试 ".repeat(100).trim(); // ~500 chars of Chinese + spaces
      continue;
    }
    if (name.includes("search") || name.includes("keyword")) { input[key] = ""; continue; }
    if (name.includes("title")) { input[key] = "A".repeat(500); continue; }
    if (name.includes("topic")) { input[key] = "🎯🔥💡"; continue; }

    // ── Type-based edge values for remaining fields ──
    if (prop.type === "string") { input[key] = ""; continue; }
    if (prop.type === "number" || prop.type === "integer") { input[key] = -1; continue; }
    if (prop.type === "boolean") { input[key] = false; continue; }
    if (prop.type === "array") { input[key] = []; continue; }
    if (prop.type === "object") { input[key] = {}; continue; }
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

  // Find which capabilities already have edge_case tests
  const existingEC = await db
    .select({ capabilitySlug: testSuites.capabilitySlug })
    .from(testSuites)
    .where(and(eq(testSuites.testType, "edge_case"), eq(testSuites.active, true)));

  const hasEdgeCase = new Set(existingEC.map((s) => s.capabilitySlug));
  console.log(`${hasEdgeCase.size} capabilities already have edge_case tests.`);

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const cap of allCaps) {
    if (hasEdgeCase.has(cap.slug)) {
      skipped++;
      continue;
    }

    const inputSchema = (cap.inputSchema ?? {}) as Record<string, unknown>;
    const testInput = generateEdgeCaseInput(inputSchema);

    try {
      await db.insert(testSuites).values({
        capabilitySlug: cap.slug,
        testName: `${cap.name} — edge case (boundary values)`,
        testType: "edge_case",
        input: testInput,
        expectedOutput: null,
        validationRules: checks(), // just don't crash
        scheduleTier: assignTier(cap.transparencyTag, cap.maintenanceClass),
        estimatedCostCents: 0, // edge cases with bad input should fail fast
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
  console.log(`  Created: ${created} edge case tests`);
  console.log(`  Skipped: ${skipped} (already had edge_case)`);
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
