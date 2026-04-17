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

// Register all capability executors so the executor-registered check works
import { autoRegisterCapabilities } from "../src/capabilities/auto-register.js";

import { eq, and } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import {
  capabilities,
  testSuites,
  capabilityLimitations,
} from "../src/db/schema.js";
import { getExecutor } from "../src/capabilities/index.js";
import { transitionCapability } from "../src/lib/lifecycle.js";
import { validateFixture } from "../src/lib/fixture-quality.js";

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

async function validateCapability(slug: string, apply = false): Promise<{
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

  const currentState = cap?.lifecycleState ?? null;

  checks.push({
    name: "Capability exists in database",
    passed: !!cap,
    detail: cap ? undefined : `No capability found with slug '${slug}'`,
  });

  if (!cap) {
    return { slug, checks, passed: false };
  }

  // 1b. Slug is unique among active capabilities (catches duplicate active rows)
  const duplicates = await db
    .select({ slug: capabilities.slug })
    .from(capabilities)
    .where(and(eq(capabilities.slug, slug), eq(capabilities.isActive, true)));
  checks.push({
    name: "Slug is unique among active capabilities",
    passed: duplicates.length <= 1,
    detail:
      duplicates.length <= 1
        ? undefined
        : `Found ${duplicates.length} active rows with slug '${slug}' — duplicate detected`,
  });

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

  // 7. Price is valid (> 0 for paid capabilities, 0 allowed for free-tier)
  const priceOk = cap.isFreeTier ? cap.priceCents >= 0 : cap.priceCents > 0;
  checks.push({
    name: "Price is valid",
    passed: priceOk,
    detail: priceOk
      ? cap.isFreeTier
        ? `free-tier (priceCents=${cap.priceCents})`
        : undefined
      : `priceCents is ${cap.priceCents} (must be > 0 for non-free-tier)`,
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
    .select({ testType: testSuites.testType, input: testSuites.input })
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

  // 14b. known_answer fixture quality — rejects placeholder / schema-invalid inputs.
  // Mirrors the onboarding gate in scripts/onboard.ts so readiness cannot pass
  // for capabilities whose public example input would be meaningless.
  const knownAnswer = suites.find((s) => s.testType === "known_answer");
  if (knownAnswer) {
    const quality = validateFixture(knownAnswer.input, cap.inputSchema);
    checks.push({
      name: "known_answer fixture quality",
      passed: quality.ok,
      detail: quality.ok
        ? "fixture looks like a real example"
        : quality.reasons.join("; "),
    });
  }

  // 15. output_field_reliability is populated (non-empty annotation map)
  // Note: we require annotations exist but do NOT mandate guaranteed fields —
  // some capabilities (e.g. AI-extraction) legitimately have only common/rare fields.
  const reliability = cap.outputFieldReliability as Record<string, string> | null;
  const hasAnnotations =
    reliability != null && Object.keys(reliability).length > 0;
  const guaranteedCount = reliability
    ? Object.values(reliability).filter((v) => v === "guaranteed").length
    : 0;
  checks.push({
    name: "Field reliability annotations exist and are non-empty",
    passed: hasAnnotations,
    detail: hasAnnotations
      ? `${Object.keys(reliability!).length} fields annotated (${guaranteedCount} guaranteed)`
      : reliability
        ? "output_field_reliability is empty object"
        : "output_field_reliability is null — run backfill-field-reliability.ts",
  });

  // 16. Gate 5: Path coverage for multi-path capabilities (DEC-20260411-B)
  const { runGate5 } = await import("../src/lib/gate5-path-coverage.js");
  const gate5 = await runGate5(slug);
  if (gate5.isMultiPath) {
    checks.push({
      name: "Gate 5: All entry points have fixture coverage",
      passed: gate5.passed,
      detail: gate5.passed
        ? `${gate5.entryPoints.length} entry points, all covered`
        : `${gate5.issues.length} uncovered: ${gate5.issues.map((i) => i.split("'")[1] || i.slice(0, 50)).join(", ")}`,
    });
  }

  const allPassed = checks.every((c) => c.passed);

  // Apply lifecycle transition for capabilities in 'validating' state (requires --apply flag)
  if (apply && currentState === "validating") {
    try {
      if (allPassed) {
        await transitionCapability(slug, "probation", "All Gate 1 checks passed", "validation");
        console.log(`  → Capability ${slug} moved to probation — all checks passed`);
      } else {
        const failedChecks = checks.filter((c) => !c.passed).map((c) => c.name).join("; ");
        await transitionCapability(slug, "draft", `Gate 1 failed: ${failedChecks}`, "validation");
        console.log(`  → Capability ${slug} moved to draft — ${failedChecks}`);
      }
    } catch (err) {
      console.warn(`[validate] Lifecycle transition failed for ${slug}:`, err);
    }
  }

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
  // Register executors so the executor-registered check works
  await autoRegisterCapabilities();

  const args = process.argv.slice(2);
  const slugIdx = args.indexOf("--slug");
  const allMode = args.includes("--all");
  const apply = args.includes("--apply");

  if (!allMode && (slugIdx === -1 || !args[slugIdx + 1])) {
    console.error("Usage: npx tsx scripts/validate-capability.ts --slug <slug> [--apply]");
    console.error("       npx tsx scripts/validate-capability.ts --all [--apply]");
    console.error("");
    console.error("  --apply  Apply lifecycle transitions for capabilities in 'validating' state");
    console.error("           Pass: validating → probation");
    console.error("           Fail: validating → draft");
    process.exit(1);
  }

  const db = getDb();

  if (allMode) {
    const rows = await db
      .select({ slug: capabilities.slug })
      .from(capabilities)
      .where(eq(capabilities.isActive, true));

    console.log(`Validating ${rows.length} active capabilities${apply ? " (--apply: transitions enabled)" : ""}...\n`);

    let passCount = 0;
    let failCount = 0;
    const failures: string[] = [];

    for (const row of rows) {
      const result = await validateCapability(row.slug, apply);
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
    const result = await validateCapability(slug, apply);
    printReport(result);
    process.exit(result.passed ? 0 : 1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
