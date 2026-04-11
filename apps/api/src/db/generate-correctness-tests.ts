import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { getDb } from "./index.js";
import { capabilities, testSuites } from "./schema.js";
import { eq, and } from "drizzle-orm";

// ─── Validation helpers (same as seed-tests.ts) ─────────────────────────────

function checks(
  ...c: Array<{ field: string; operator: string; value?: unknown; values?: unknown[] }>
) {
  return { checks: c };
}

function notNull(field: string) {
  return { field, operator: "not_null" };
}
function isType(field: string, value: string) {
  return { field, operator: "type", value };
}
function gt(field: string, value: number) {
  return { field, operator: "gt", value };
}

// ─── Input generation (reused from generate-tests.ts) ───────────────────────

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

    // URLs and domains
    if (name.includes("url") || name.includes("website")) { input[key] = "https://example.com"; continue; }
    if (name === "domain" || name === "hostname" || name === "host") { input[key] = "google.com"; continue; }

    // Email
    if (name.includes("email")) { input[key] = "test@google.com"; continue; }

    // Financial identifiers
    if (name.includes("iban")) { input[key] = "DE89370400440532013000"; continue; }
    if (name === "bic" || name === "swift_code" || name.includes("swift")) { input[key] = "COBADEFFXXX"; continue; }
    if (name.includes("vat") && name.includes("number")) { input[key] = "SE556703748501"; continue; }
    if (["org_number", "organization_number", "registration_number", "company_number", "cvr_number", "business_id", "registry_code"].includes(name)) { input[key] = "556703-7485"; continue; }
    if (name === "lei") { input[key] = "549300MLUDYVRQOOXS22"; continue; }
    if (name === "eori" || name === "eori_number") { input[key] = "DE123456789012345"; continue; }
    if (name === "isbn") { input[key] = "978-0-13-468599-1"; continue; }

    // Company / name
    if (name === "company" || name === "company_name" || name === "name") { input[key] = "Google"; continue; }
    if (name === "ticker" || name === "symbol") { input[key] = "GOOG"; continue; }
    if (name === "username") { input[key] = "Google"; continue; }

    // Country / locale
    if (name === "country_code" || name === "country") { input[key] = "SE"; continue; }
    if (name === "locale") { input[key] = "en-US"; continue; }
    if (name.includes("language") || name === "lang") { input[key] = "en"; continue; }
    if (name === "target_language") { input[key] = "Swedish"; continue; }
    if (name === "source_language") { input[key] = "English"; continue; }

    // Currency
    if (name === "from" || name === "source_currency" || name === "base") { input[key] = "USD"; continue; }
    if (name === "to" || name === "target_currency") { input[key] = "EUR"; continue; }
    if (name === "currency" || name === "currency_code") { input[key] = "EUR"; continue; }
    if (name === "amount") { input[key] = 100; continue; }

    // Network
    if (name === "ip" || name === "ip_address") { input[key] = "8.8.8.8"; continue; }
    if (name === "port" || name === "ports") { input[key] = prop.type === "array" ? [80, 443] : 443; continue; }
    if (name === "phone" || name === "phone_number") { input[key] = "+14155552671"; continue; }

    // Location
    if (name === "city") { input[key] = "Stockholm"; continue; }
    if (name === "address") { input[key] = "1600 Amphitheatre Parkway, Mountain View, CA"; continue; }
    if (name === "latitude") { input[key] = 59.3293; continue; }
    if (name === "longitude") { input[key] = 18.0686; continue; }

    // Date / time
    if (name === "year") { input[key] = 2025; continue; }
    if (name === "date" || name === "start_date") { input[key] = "2025-01-15"; continue; }
    if (name === "end_date") { input[key] = "2025-12-31"; continue; }
    if (name === "timezone") { input[key] = "Europe/Stockholm"; continue; }
    if (name === "cron_expression" || name === "cron") { input[key] = "0 9 * * 1-5"; continue; }

    // Code / technical
    if (name === "diff") { input[key] = "- const x = 1;\n+ const x = 2;\n  return x;"; continue; }
    if (name === "code" || name === "source_code") { input[key] = "function hello() { return 'world'; }"; continue; }
    if (name === "sql" || name === "query") { input[key] = "SELECT * FROM users WHERE active = true LIMIT 10"; continue; }
    if (name === "natural_language_query") { input[key] = "Find all active users who signed up this month"; continue; }
    if (name === "table_schema") { input[key] = "users(id INT, name TEXT, email TEXT, active BOOL, created_at TIMESTAMP)"; continue; }
    if (name === "regex" || name === "pattern") { input[key] = "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"; continue; }
    if (name === "json" || name === "json_string") { input[key] = '{"name": "Test", "value": 42}'; continue; }
    if (name === "xml") { input[key] = "<root><item>test</item></root>"; continue; }
    if (name === "csv" || name === "csv_data") { input[key] = "name,age,city\nAlice,30,Stockholm\nBob,25,Oslo"; continue; }
    if (name === "markdown" || name === "md") { input[key] = "# Hello World\n\nThis is a **test** document."; continue; }
    if (name === "html") { input[key] = "<html><body><h1>Hello World</h1></body></html>"; continue; }
    if (name === "openapi" || name === "spec") { input[key] = JSON.stringify({ openapi: "3.0.0", info: { title: "Test API", version: "1.0" }, paths: {} }); continue; }
    if (name === "prompt") { input[key] = "Write a function to validate email addresses"; continue; }
    if (name === "jwt" || name === "token") { input[key] = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"; continue; }

    // DevOps
    if (name === "framework") { input[key] = "express"; continue; }
    if (name === "dialect") { input[key] = "postgres"; continue; }
    if (name === "style") { input[key] = "conventional"; continue; }

    // Structured data
    if (name === "data" && prop.type === "array") { input[key] = [{ name: "Alice", age: 30, city: "Stockholm" }, { name: "Bob", age: 25, city: "Oslo" }]; continue; }
    if (name === "schema" && prop.type === "object") { input[key] = { type: "object", properties: { name: { type: "string" }, email: { type: "string" } } }; continue; }
    if (name === "fields" && prop.type === "array") { input[key] = [{ name: "name", type: "string" }, { name: "email", type: "email" }]; continue; }
    if (name === "headers" && prop.type === "object") { input[key] = { "Content-Type": "application/json" }; continue; }

    // Text content (broad)
    if (name.includes("text") || name.includes("content") || name.includes("description") || name.includes("input") || name.includes("body") || name.includes("message")) { input[key] = "This is a test input for automated capability testing."; continue; }
    if (name.includes("search") || name.includes("keyword")) { input[key] = "artificial intelligence"; continue; }
    if (name.includes("title")) { input[key] = "Test Document Title"; continue; }
    if (name.includes("topic")) { input[key] = "software development best practices"; continue; }

    // Type fallbacks for required fields
    if (!required.has(key)) continue;
    if (prop.type === "string") input[key] = "test_value";
    else if (prop.type === "number" || prop.type === "integer") input[key] = 1;
    else if (prop.type === "boolean") input[key] = true;
    else if (prop.type === "array") input[key] = ["test_item"];
    else if (prop.type === "object") input[key] = { key: "value" };
  }

  return input;
}

// ─── Correctness validation from output schema ─────────────────────────────

function getCorrectnessChecks(
  outputSchema: Record<string, unknown>,
): ReturnType<typeof checks> {
  const props = (outputSchema as { properties?: Record<string, any> }).properties;
  if (!props) return checks();

  const rules: Array<{ field: string; operator: string; value?: unknown }> = [];

  for (const [key, prop] of Object.entries(props)) {
    // Always check key exists and is not null
    rules.push(notNull(key));

    // Type-specific value validation
    if (prop.type === "number" || prop.type === "integer") {
      rules.push(isType(key, "number"));
      // Scores and rates should be positive
      const name = key.toLowerCase();
      if (name.includes("score") || name.includes("rate") || name.includes("count") || name.includes("total")) {
        rules.push(gt(key, -1));
      }
    } else if (prop.type === "string") {
      rules.push(isType(key, "string"));
    } else if (prop.type === "boolean") {
      rules.push(isType(key, "boolean"));
    } else if (prop.type === "array") {
      rules.push(isType(key, "array"));
    } else if (prop.type === "object") {
      rules.push(isType(key, "object"));
    }

    // Cap at 8 rules to keep tests focused
    if (rules.length >= 8) break;
  }

  return checks(...rules);
}

// ─── Cost + tier ────────────────────────────────────────────────────────────

function estimateCost(priceCents: number, tag: string | null): number {
  if (tag === "algorithmic") return 0;
  return priceCents; // AI/mixed capabilities cost their price per call
}

function assignTier(tag: string | null, maintenanceClass?: string | null): string {
  if (maintenanceClass) {
    switch (maintenanceClass) {
      case "pure-computation": return "A";
      case "free-stable-api": return "B";
      case "commercial-stable-api": return "B";
      case "requires-domain-expertise": return "B";
      case "scraping-stable-target": return "C";
      case "scraping-fragile-target": return "C";
    }
  }
  if (tag === "algorithmic") return "A";
  return "C";
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function generate() {
  const db = getDb();

  const allCaps = await db
    .select()
    .from(capabilities)
    .where(eq(capabilities.isActive, true));

  console.log(`Found ${allCaps.length} active capabilities.`);

  // Find which capabilities already have known_answer tests
  const existingKA = await db
    .select({ capabilitySlug: testSuites.capabilitySlug })
    .from(testSuites)
    .where(and(eq(testSuites.testType, "known_answer"), eq(testSuites.active, true)));

  const hasKnownAnswer = new Set(existingKA.map((s) => s.capabilitySlug));
  console.log(`${hasKnownAnswer.size} capabilities already have known_answer tests.`);

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const cap of allCaps) {
    if (hasKnownAnswer.has(cap.slug)) {
      skipped++;
      continue;
    }

    const inputSchema = (cap.inputSchema ?? {}) as Record<string, unknown>;
    const outputSchema = (cap.outputSchema ?? {}) as Record<string, unknown>;

    const testInput = generateTestInput(inputSchema);
    const validationRules = getCorrectnessChecks(outputSchema);
    const tier = assignTier(cap.transparencyTag, cap.maintenanceClass);
    const cost = estimateCost(cap.priceCents, cap.transparencyTag);

    try {
      await db.insert(testSuites).values({
        capabilitySlug: cap.slug,
        testName: `${cap.name} — correctness check`,
        testType: "known_answer",
        input: testInput,
        expectedOutput: null,
        validationRules,
        scheduleTier: tier,
        estimatedCostCents: cost,
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
  console.log(`  Created: ${created} correctness tests`);
  console.log(`  Skipped: ${skipped} (already had known_answer)`);
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
