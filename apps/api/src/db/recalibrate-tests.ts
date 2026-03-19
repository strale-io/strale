/**
 * Test Suite Recalibration Script
 *
 * One-time script that validates all test suite fixtures against real capability
 * output. Replaces guessed assertions with validated ones.
 *
 * Usage: npx tsx apps/api/src/db/recalibrate-tests.ts [--dry-run] [--slug=xxx]
 *
 * Flags:
 *   --dry-run     Preview changes without writing to DB
 *   --slug=xxx    Only recalibrate suites for a specific capability
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../../.env") });

// Import app to register all capability executors
import "../app.js";

import { getDb } from "./index.js";
import { testSuites, capabilities } from "./schema.js";
import { eq, and } from "drizzle-orm";
import { getExecutor } from "../capabilities/index.js";
import { generateTestInput } from "../lib/test-input-generator.js";
import { classifyFieldVolatility, makeVolatilityAwareCheck } from "../lib/field-volatility.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ValidationCheck {
  field: string;
  operator: string;
  value?: unknown;
  values?: unknown[];
}

interface Report {
  totalProcessed: number;
  calibrated: number;
  inputUpgraded: number;
  assertionsRegenerated: number;
  skippedNegative: number;
  skippedEdgeCase: number;
  skippedPiggyback: number;
  failedNoExecutor: number;
  failedExecution: number;
  failedNoOutput: number;
  manualReview: Array<{ slug: string; testType: string; testName: string; reason: string }>;
  assertionChanges: {
    statusAssertionRemoved: number;
    newFieldsDiscovered: number;
  };
  inputUpgradeDetails: {
    manifestUsed: number;
    genericReplaced: number;
    heuristicGenerated: number;
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const GENERIC_VALUES = new Set([
  "test_value", "test", "test_item", "Google", "556703-7485",
]);

function isGenericInput(input: Record<string, unknown>): boolean {
  const values = Object.values(input);
  if (values.length === 0) return true;
  return values.every((v) =>
    typeof v === "string" && GENERIC_VALUES.has(v),
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Input resolution ───────────────────────────────────────────────────────

interface InputResolution {
  input: Record<string, unknown>;
  source: "manifest_health_check" | "manifest_known_answer" | "existing" | "heuristic";
  upgraded: boolean;
}

function resolveInput(
  suite: { input: unknown; testType: string; capabilitySlug: string },
  cap: { inputSchema: unknown; onboardingManifest: unknown },
): InputResolution {
  const suiteInput = suite.input as Record<string, unknown>;
  const inputSchema = cap.inputSchema as Record<string, unknown>;
  const manifest = cap.onboardingManifest as Record<string, unknown> | null;
  const testFixtures = (manifest?.test_fixtures ?? null) as Record<string, unknown> | null;

  // 1. Try manifest health_check_input (designed for normal execution paths)
  if (testFixtures?.health_check_input && typeof testFixtures.health_check_input === "object") {
    const hci = testFixtures.health_check_input as Record<string, unknown>;
    if (Object.keys(hci).length > 0) {
      return { input: hci, source: "manifest_health_check", upgraded: true };
    }
  }

  // known_answer.input is deliberately excluded — it may trigger special code
  // paths that return fields absent in normal output (DEC-20260319-D).

  // 2. Use existing input if it's non-generic
  if (Object.keys(suiteInput).length > 0 && !isGenericInput(suiteInput)) {
    return { input: suiteInput, source: "existing", upgraded: false };
  }

  // 4. Fall back to heuristic generation
  const generated = generateTestInput(inputSchema);
  if (Object.keys(generated).length > 0) {
    return { input: generated, source: "heuristic", upgraded: true };
  }

  // 5. Last resort — use existing input even if generic
  return { input: suiteInput, source: "existing", upgraded: false };
}

// ─── Assertion calibration ──────────────────────────────────────────────────

function calibrateAssertions(
  suite: { testType: string; validationRules: unknown },
  realOutput: Record<string, unknown>,
  fieldReliability?: Record<string, string> | null,
  fieldVolatilityOverrides?: Record<string, "stable" | "volatile" | "computed"> | null,
): { checks: ValidationCheck[] } {
  const checks: ValidationCheck[] = [];

  // Only assert not_null on fields marked 'guaranteed' in output_field_reliability.
  // Fields marked 'common' or 'rare' (or absent from the map) are skipped — they may
  // be null in certain execution paths, causing stale fixture drift (DEC-20260319-D).
  for (const [key, value] of Object.entries(realOutput)) {
    if (value !== null && value !== undefined) {
      const reliability = fieldReliability?.[key];
      if (reliability === "guaranteed") {
        checks.push({ field: key, operator: "not_null" });
      }
    }
  }

  // For known_answer: preserve existing value-based checks, but apply volatility
  // filtering (DEC-20260319-E). Volatile/computed fields get type checks instead of equals.
  if (suite.testType === "known_answer") {
    const existing = (suite.validationRules as { checks?: ValidationCheck[] })?.checks ?? [];
    for (const check of existing) {
      if (check.operator === "not_null") continue;
      if (!(check.field in realOutput)) continue;
      if (checks.some((c) => c.field === check.field && c.operator === check.operator)) continue;

      const volatility = classifyFieldVolatility(check.field, realOutput[check.field], fieldVolatilityOverrides);
      if (volatility === "stable") {
        checks.push(check);
      } else {
        const typeCheck = makeVolatilityAwareCheck(check.field, realOutput[check.field], volatility);
        if (typeCheck && !checks.some((c) => c.field === typeCheck.field && c.operator === typeCheck.operator)) {
          checks.push(typeCheck as ValidationCheck);
        }
      }
    }
  }

  return { checks };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const slugArg = args.find((a) => a.startsWith("--slug="));
  const targetSlug = slugArg?.split("=")[1];

  if (dryRun) console.log("[recalibrate] DRY RUN — no database writes\n");

  const db = getDb();

  // Checkpoint: count suites before
  const conditions = [eq(testSuites.active, true)];
  if (targetSlug) conditions.push(eq(testSuites.capabilitySlug, targetSlug));

  const suites = await db
    .select()
    .from(testSuites)
    .where(and(...conditions));

  console.log(`[recalibrate] Found ${suites.length} active test suites`);
  if (targetSlug) console.log(`[recalibrate] Filtered to slug: ${targetSlug}`);

  // Load capability data (inputSchema, onboardingManifest) for all relevant slugs
  const slugs = [...new Set(suites.map((s) => s.capabilitySlug))];
  const capMap = new Map<string, { inputSchema: unknown; onboardingManifest: unknown; outputFieldReliability: unknown }>();

  for (const slug of slugs) {
    const [cap] = await db
      .select({
        inputSchema: capabilities.inputSchema,
        onboardingManifest: capabilities.onboardingManifest,
        outputFieldReliability: capabilities.outputFieldReliability,
      })
      .from(capabilities)
      .where(eq(capabilities.slug, slug))
      .limit(1);

    if (cap) capMap.set(slug, cap);
  }

  const report: Report = {
    totalProcessed: 0,
    calibrated: 0,
    inputUpgraded: 0,
    assertionsRegenerated: 0,
    skippedNegative: 0,
    skippedEdgeCase: 0,
    skippedPiggyback: 0,
    failedNoExecutor: 0,
    failedExecution: 0,
    failedNoOutput: 0,
    manualReview: [],
    assertionChanges: {
      statusAssertionRemoved: 0,
      newFieldsDiscovered: 0,
    },
    inputUpgradeDetails: {
      manifestUsed: 0,
      genericReplaced: 0,
      heuristicGenerated: 0,
    },
  };

  // Group suites by slug to batch executions (avoids re-executing same capability)
  const suitesBySlug = new Map<string, typeof suites>();
  for (const suite of suites) {
    const list = suitesBySlug.get(suite.capabilitySlug) ?? [];
    list.push(suite);
    suitesBySlug.set(suite.capabilitySlug, list);
  }

  let processed = 0;
  const totalSlugs = suitesBySlug.size;

  for (const [slug, slugSuites] of suitesBySlug) {
    processed++;
    const cap = capMap.get(slug);
    if (!cap) continue;

    const executor = getExecutor(slug);

    // Try to get one good execution result for this capability
    let realOutput: Record<string, unknown> | null = null;
    let executionError: string | null = null;

    if (executor) {
      // Pick the best suite for input resolution — prefer known_answer/schema_check
      // (negative and edge_case suites have intentionally bad inputs)
      const calibratable = slugSuites.filter(
        (s) => s.testType === "known_answer" || s.testType === "schema_check" || s.testType === "dependency_health",
      );
      const bestSuite = calibratable[0] ?? slugSuites[0];
      const bestResolution = resolveInput(bestSuite, cap);

      try {
        const result = await executor(bestResolution.input);
        if (result?.output && Object.keys(result.output).length > 0) {
          realOutput = result.output;
        }
      } catch (err: any) {
        executionError = err.message?.slice(0, 200) ?? "Unknown error";
      }

      // Delay between capability executions
      await delay(2000);
    }

    // Progress indicator
    if (processed % 25 === 0 || processed === totalSlugs) {
      console.log(
        `[recalibrate] Progress: ${processed}/${totalSlugs} capabilities (${report.calibrated} calibrated, ${report.manualReview.length} flagged)`,
      );
    }

    // Now process each suite for this slug
    for (const suite of slugSuites) {
      report.totalProcessed++;

      // Skip types that shouldn't be recalibrated
      if (suite.testType === "negative") {
        report.skippedNegative++;
        continue;
      }
      if (suite.testType === "edge_case") {
        report.skippedEdgeCase++;
        continue;
      }
      if (suite.testType === "piggyback") {
        report.skippedPiggyback++;
        continue;
      }

      if (!executor) {
        report.failedNoExecutor++;
        report.manualReview.push({
          slug, testType: suite.testType, testName: suite.testName,
          reason: "No executor registered",
        });
        continue;
      }

      if (executionError) {
        report.failedExecution++;
        report.manualReview.push({
          slug, testType: suite.testType, testName: suite.testName,
          reason: executionError,
        });
        continue;
      }

      if (!realOutput) {
        report.failedNoOutput++;
        report.manualReview.push({
          slug, testType: suite.testType, testName: suite.testName,
          reason: "Execution succeeded but returned no output",
        });
        continue;
      }

      // Resolve best input for this specific suite
      const resolution = resolveInput(suite, cap);

      // Track input upgrades
      if (resolution.upgraded) {
        report.inputUpgraded++;
        if (resolution.source === "manifest_health_check" || resolution.source === "manifest_known_answer") {
          report.inputUpgradeDetails.manifestUsed++;
        } else if (resolution.source === "heuristic") {
          report.inputUpgradeDetails.heuristicGenerated++;
          if (isGenericInput(suite.input as Record<string, unknown>)) {
            report.inputUpgradeDetails.genericReplaced++;
          }
        }
      }

      // Calibrate assertions
      const oldRules = suite.validationRules as { checks?: ValidationCheck[] };
      const oldChecks = oldRules?.checks ?? [];
      const reliability = (cap.outputFieldReliability ?? null) as Record<string, string> | null;
      const manifest = cap.onboardingManifest as Record<string, unknown> | null;
      const volOverrides = (manifest?.field_volatility ?? null) as Record<string, "stable" | "volatile" | "computed"> | null;
      const newRules = calibrateAssertions(suite, realOutput, reliability, volOverrides);

      // Track assertion changes
      const hadStatusCheck = oldChecks.some((c) => c.field === "status" && c.operator === "not_null");
      const hasStatusInOutput = "status" in realOutput;
      if (hadStatusCheck && !hasStatusInOutput) {
        report.assertionChanges.statusAssertionRemoved++;
      }

      const oldFields = new Set(oldChecks.map((c) => c.field));
      const newFields = newRules.checks.filter((c) => !oldFields.has(c.field));
      report.assertionChanges.newFieldsDiscovered += newFields.length;

      const assertionsChanged =
        JSON.stringify(oldRules) !== JSON.stringify(newRules);

      if (assertionsChanged) {
        report.assertionsRegenerated++;
      }

      // Apply updates
      if (!dryRun && (resolution.upgraded || assertionsChanged)) {
        const updates: Record<string, unknown> = {
          updatedAt: new Date(),
        };

        if (resolution.upgraded) {
          updates.input = resolution.input;
        }

        if (assertionsChanged) {
          updates.validationRules = newRules;
        }

        // Always update baseline when we have real output
        updates.baselineOutput = realOutput;
        updates.baselineCapturedAt = new Date();

        await db
          .update(testSuites)
          .set(updates)
          .where(eq(testSuites.id, suite.id));
      }

      report.calibrated++;
    }
  }

  // ─── Print report ──────────────────────────────────────────────────────

  console.log("\n=== TEST SUITE RECALIBRATION REPORT ===\n");
  console.log(`Total suites processed:         ${report.totalProcessed}`);
  console.log(`  Calibrated successfully:      ${report.calibrated}`);
  console.log(`  Input upgraded:               ${report.inputUpgraded}`);
  console.log(`  Assertions regenerated:        ${report.assertionsRegenerated}`);
  console.log(`  Skipped (negative type):       ${report.skippedNegative}`);
  console.log(`  Skipped (edge_case type):      ${report.skippedEdgeCase}`);
  console.log(`  Skipped (piggyback type):      ${report.skippedPiggyback}`);
  console.log(`  Failed — no executor:          ${report.failedNoExecutor}`);
  console.log(`  Failed — execution error:      ${report.failedExecution}`);
  console.log(`  Failed — no output:            ${report.failedNoOutput}`);

  console.log("\nInput upgrades:");
  console.log(`  Manifest fixture used:         ${report.inputUpgradeDetails.manifestUsed}`);
  console.log(`  Generic value replaced:        ${report.inputUpgradeDetails.genericReplaced}`);
  console.log(`  Heuristic generated:           ${report.inputUpgradeDetails.heuristicGenerated}`);

  console.log("\nAssertion changes:");
  console.log(`  "status" assertion removed:    ${report.assertionChanges.statusAssertionRemoved}`);
  console.log(`  New fields discovered:         ${report.assertionChanges.newFieldsDiscovered}`);

  if (report.manualReview.length > 0) {
    console.log(`\nManual review needed (${report.manualReview.length}):`);
    // Group by reason for cleaner output
    const byReason = new Map<string, string[]>();
    for (const item of report.manualReview) {
      const key = item.reason.slice(0, 80);
      const list = byReason.get(key) ?? [];
      list.push(`${item.slug} (${item.testType})`);
      byReason.set(key, list);
    }
    for (const [reason, items] of byReason) {
      console.log(`  ${reason}:`);
      for (const item of items.slice(0, 10)) {
        console.log(`    ${item}`);
      }
      if (items.length > 10) {
        console.log(`    ... and ${items.length - 10} more`);
      }
    }
  }

  if (dryRun) {
    console.log("\n[recalibrate] DRY RUN — no changes were written to the database");
  }

  console.log("\n=== END REPORT ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("[recalibrate] Fatal error:", err);
  process.exit(1);
});
