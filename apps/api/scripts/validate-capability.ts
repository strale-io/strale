/**
 * Validate a capability meets Gate 1 requirements (Playbook Section 1).
 *
 * Usage:
 *   npx tsx scripts/validate-capability.ts --slug <slug>
 *   npx tsx scripts/validate-capability.ts --all
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

// Side-effect imports to register all executors
import "../src/app.js";

import { eq } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import {
  capabilities,
  testSuites,
  capabilityLimitations,
} from "../src/db/schema.js";
import { getExecutor } from "../src/capabilities/index.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CheckResult {
  name: string;
  passed: boolean;
  detail?: string;
}

const VALID_CATEGORIES = [
  "company-data",
  "compliance",
  "developer-tools",
  "finance",
  "data-processing",
  "web-scraping",
  "monitoring",
  "validation",
  "data-extraction",
  "legal-regulatory",
  "file-conversion",
  // Additional categories in active use
  "agent-tooling",
  "competitive-intelligence",
  "content-writing",
  "document-extraction",
  "financial",
  "security",
  "text-processing",
  "trade",
  "utility",
  "web-intelligence",
];

const VALID_TRANSPARENCY_TAGS = ["algorithmic", "ai_generated", "mixed", null];

const REQUIRED_TEST_TYPES = [
  "known_answer",
  "schema_check",
  "negative",
  "edge_case",
  "dependency_health",
];

// ─── Validation logic ───────────────────────────────────────────────────────

async function validateCapability(slug: string): Promise<{
  slug: string;
  checks: CheckResult[];
  passed: boolean;
}> {
  const db = getDb();
  const checks: CheckResult[] = [];

  // 1. Capability exists in database
  const [cap] = await db
    .select()
    .from(capabilities)
    .where(eq(capabilities.slug, slug))
    .limit(1);

  checks.push({
    name: "Capability exists in database",
    passed: !!cap,
    detail: cap ? undefined : `No capability found with slug '${slug}'`,
  });

  if (!cap) {
    return { slug, checks, passed: false };
  }

  // 2. Executor is registered
  const executor = getExecutor(slug);
  checks.push({
    name: "Executor is registered",
    passed: !!executor,
    detail: executor ? undefined : `No executor registered for '${slug}'. Check app.ts imports.`,
  });

  // 3. Name is not empty
  checks.push({
    name: "Name is not empty",
    passed: !!cap.name && cap.name.trim().length > 0,
    detail: cap.name ? undefined : "name is null or empty",
  });

  // 4. Slug matches URL-safe pattern
  const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  checks.push({
    name: "Slug is URL-safe",
    passed: slugPattern.test(cap.slug),
    detail: slugPattern.test(cap.slug)
      ? undefined
      : `slug '${cap.slug}' does not match pattern: lowercase, hyphens, no spaces`,
  });

  // 5. Description is not empty and >= 20 chars
  const descOk = !!cap.description && cap.description.trim().length >= 20;
  checks.push({
    name: "Description is >= 20 characters",
    passed: descOk,
    detail: descOk
      ? undefined
      : `description is ${cap.description ? cap.description.length : 0} chars (minimum 20)`,
  });

  // 6. Category is valid
  const catOk = VALID_CATEGORIES.includes(cap.category);
  checks.push({
    name: "Category is valid",
    passed: catOk,
    detail: catOk
      ? undefined
      : `category '${cap.category}' not in valid list: ${VALID_CATEGORIES.join(", ")}`,
  });

  // 7. Price > 0
  checks.push({
    name: "Price > 0",
    passed: cap.priceCents > 0,
    detail: cap.priceCents > 0 ? undefined : `priceCents is ${cap.priceCents}`,
  });

  // 8. Input schema is valid JSON Schema
  const inputOk = isValidJsonSchema(cap.inputSchema);
  checks.push({
    name: "Input schema is valid (type: object with properties)",
    passed: inputOk,
    detail: inputOk ? undefined : "inputSchema missing type:object or has no properties",
  });

  // 9. Output schema is valid JSON Schema
  const outputOk = isValidJsonSchema(cap.outputSchema);
  checks.push({
    name: "Output schema is valid (type: object with properties)",
    passed: outputOk,
    detail: outputOk ? undefined : "outputSchema missing type:object or has no properties",
  });

  // 10. Data source is not empty
  const dsOk = !!cap.dataSource && cap.dataSource.trim().length > 0;
  checks.push({
    name: "Data source is not empty",
    passed: dsOk,
    detail: dsOk ? undefined : "dataSource is null or empty",
  });

  // 11. Data classification is not empty
  const dcOk = !!cap.dataClassification && cap.dataClassification.trim().length > 0;
  checks.push({
    name: "Data classification is not empty",
    passed: dcOk,
    detail: dcOk ? undefined : "dataClassification is null or empty",
  });

  // 12. Transparency tag is valid
  const tagOk = VALID_TRANSPARENCY_TAGS.includes(cap.transparencyTag ?? null);
  checks.push({
    name: "Transparency tag is valid",
    passed: tagOk,
    detail: tagOk
      ? undefined
      : `transparencyTag '${cap.transparencyTag}' not in: algorithmic, ai_generated, mixed, null`,
  });

  // 13. At least 1 limitation
  const lims = await db
    .select({ id: capabilityLimitations.id })
    .from(capabilityLimitations)
    .where(eq(capabilityLimitations.capabilitySlug, slug));
  checks.push({
    name: "At least 1 limitation exists",
    passed: lims.length >= 1,
    detail: lims.length >= 1 ? undefined : `Found ${lims.length} limitations`,
  });

  // 14. At least 5 test suites covering all required types
  const suites = await db
    .select({ testType: testSuites.testType })
    .from(testSuites)
    .where(eq(testSuites.capabilitySlug, slug));
  const typesCovered = new Set(suites.map((s) => s.testType));
  const missingTypes = REQUIRED_TEST_TYPES.filter((t) => !typesCovered.has(t));
  checks.push({
    name: "At least 5 test suites covering all types",
    passed: suites.length >= 5 && missingTypes.length === 0,
    detail:
      suites.length >= 5 && missingTypes.length === 0
        ? `${suites.length} suites, all types covered`
        : `${suites.length} suites, missing types: ${missingTypes.join(", ") || "none"} (need ${5 - suites.length > 0 ? `${5 - suites.length} more suites` : "all types"})`,
  });

  // 15. output_field_reliability is populated with at least one 'guaranteed' field
  const reliability = cap.outputFieldReliability as Record<string, string> | null;
  const hasGuaranteed =
    reliability != null &&
    Object.values(reliability).some((v) => v === "guaranteed");
  checks.push({
    name: "Field reliability has at least one guaranteed field",
    passed: hasGuaranteed,
    detail: hasGuaranteed
      ? `${Object.values(reliability!).filter((v) => v === "guaranteed").length} guaranteed fields`
      : reliability
        ? "No fields marked as guaranteed"
        : "output_field_reliability is null",
  });

  const allPassed = checks.every((c) => c.passed);
  return { slug, checks, passed: allPassed };
}

function isValidJsonSchema(schema: unknown): boolean {
  if (!schema || typeof schema !== "object") return false;
  const s = schema as Record<string, unknown>;
  if (s.type !== "object") return false;
  if (
    !s.properties ||
    typeof s.properties !== "object" ||
    Object.keys(s.properties as object).length === 0
  )
    return false;
  return true;
}

// ─── Output formatting ──────────────────────────────────────────────────────

function printReport(result: { slug: string; checks: CheckResult[]; passed: boolean }) {
  const passCount = result.checks.filter((c) => c.passed).length;
  const failCount = result.checks.filter((c) => !c.passed).length;
  const icon = result.passed ? "✅" : "❌";

  console.log(`\n${icon} ${result.slug} — ${passCount}/${result.checks.length} checks passed`);

  for (const check of result.checks) {
    const mark = check.passed ? "  ✓" : "  ✗";
    const detail = check.detail ? ` — ${check.detail}` : "";
    console.log(`${mark} ${check.name}${detail}`);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const slugIdx = args.indexOf("--slug");
  const allMode = args.includes("--all");

  if (!allMode && (slugIdx === -1 || !args[slugIdx + 1])) {
    console.error("Usage: npx tsx scripts/validate-capability.ts --slug <slug>");
    console.error("       npx tsx scripts/validate-capability.ts --all");
    process.exit(1);
  }

  const db = getDb();

  if (allMode) {
    const rows = await db
      .select({ slug: capabilities.slug })
      .from(capabilities)
      .where(eq(capabilities.isActive, true));

    console.log(`Validating ${rows.length} active capabilities...\n`);

    let passCount = 0;
    let failCount = 0;
    const failures: string[] = [];

    for (const row of rows) {
      const result = await validateCapability(row.slug);
      if (result.passed) {
        passCount++;
      } else {
        failCount++;
        failures.push(row.slug);
        printReport(result);
      }
    }

    console.log(`\n${"═".repeat(60)}`);
    console.log(`SUMMARY: ${passCount} passed, ${failCount} failed out of ${rows.length}`);
    if (failures.length > 0) {
      console.log(`\nFailing capabilities:\n  ${failures.join("\n  ")}`);
    }
    process.exit(failCount > 0 ? 1 : 0);
  } else {
    const slug = args[slugIdx + 1];
    const result = await validateCapability(slug);
    printReport(result);
    process.exit(result.passed ? 0 : 1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
