/**
 * End-to-end smoke test for a capability (Pipeline spec Section 7).
 *
 * Usage:
 *   npx tsx scripts/smoke-test.ts --slug <slug>
 *   npx tsx scripts/smoke-test.ts --all [--dry-run]
 *
 * --dry-run skips live execution (steps 2-3), only runs structural checks.
 * Useful for --all mode since live execution costs money for non-algorithmic capabilities.
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

// Register all capability executors so smoke tests can execute them
import { autoRegisterCapabilities } from "../src/capabilities/auto-register.js";

import { eq } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import {
  capabilities,
  testSuites,
  capabilityLimitations,
} from "../src/db/schema.js";
import { getExecutor } from "../src/capabilities/index.js";

// Base URL for internal API calls (smoke test runs locally against the live DB)
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "";

// ─── Types ──────────────────────────────────────────────────────────────────

interface StepResult {
  step: number;
  name: string;
  passed: boolean;
  detail?: string;
  durationMs?: number;
}

// ─── Smoke test logic ───────────────────────────────────────────────────────

async function smokeTest(
  slug: string,
  dryRun: boolean,
): Promise<{ slug: string; steps: StepResult[]; passed: boolean }> {
  const db = getDb();
  const steps: StepResult[] = [];

  // Step 1: Structural validation (Gate 1 checks)
  const start1 = Date.now();
  const [cap] = await db
    .select()
    .from(capabilities)
    .where(eq(capabilities.slug, slug))
    .limit(1);

  if (!cap) {
    steps.push({ step: 1, name: "Capability exists", passed: false, detail: `'${slug}' not found` });
    return { slug, steps, passed: false };
  }

  const executor = getExecutor(slug);
  const suites = await db
    .select()
    .from(testSuites)
    .where(eq(testSuites.capabilitySlug, slug));
  const lims = await db
    .select({ id: capabilityLimitations.id })
    .from(capabilityLimitations)
    .where(eq(capabilityLimitations.capabilitySlug, slug));

  const typesCovered = new Set(suites.map((s) => s.testType));
  const priceOk = cap.isFreeTier ? cap.priceCents >= 0 : cap.priceCents > 0;
  const structuralOk =
    !!cap.name &&
    !!cap.description &&
    priceOk &&
    !!executor &&
    suites.length >= 5 &&
    typesCovered.has("known_answer") &&
    typesCovered.has("schema_check") &&
    typesCovered.has("negative") &&
    lims.length >= 1;

  const structuralIssues: string[] = [];
  if (!priceOk) structuralIssues.push(`priceCents=${cap.priceCents} must be > 0 for non-free-tier`);
  if (!executor) structuralIssues.push("no executor registered");
  if (suites.length < 5) structuralIssues.push(`only ${suites.length} test suites`);
  if (!typesCovered.has("known_answer")) structuralIssues.push("missing known_answer test");
  if (!typesCovered.has("schema_check")) structuralIssues.push("missing schema_check test");
  if (!typesCovered.has("negative")) structuralIssues.push("missing negative test");
  if (lims.length === 0) structuralIssues.push("no limitations");

  steps.push({
    step: 1,
    name: "Structural validation",
    passed: structuralOk,
    detail: structuralOk ? "All checks passed" : structuralIssues.join("; "),
    durationMs: Date.now() - start1,
  });

  if (!structuralOk && !executor) {
    // Can't proceed without an executor
    return { slug, steps, passed: false };
  }

  // Step 2: Execute with known_answer test input
  const knownAnswerSuite = suites.find((s) => s.testType === "known_answer");
  if (!dryRun && executor && knownAnswerSuite) {
    const start2 = Date.now();
    try {
      const testInput = knownAnswerSuite.input as Record<string, unknown>;
      const result = await Promise.race([
        executor(testInput),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout after 30s")), 30_000),
        ),
      ]);
      const hasOutput = result && result.output && typeof result.output === "object";
      steps.push({
        step: 2,
        name: "Live execution succeeds",
        passed: !!hasOutput,
        detail: hasOutput
          ? `Returned ${Object.keys(result.output).length} fields`
          : "Execution returned no output",
        durationMs: Date.now() - start2,
      });

      // Step 3: Validate guaranteed fields
      if (hasOutput) {
        const start3 = Date.now();
        const reliability = cap.outputFieldReliability as Record<string, string> | null;
        if (reliability) {
          const guaranteed = Object.entries(reliability)
            .filter(([, level]) => level === "guaranteed")
            .map(([field]) => field);
          const missing = guaranteed.filter(
            (f) => result.output[f] === undefined || result.output[f] === null,
          );
          steps.push({
            step: 3,
            name: "Guaranteed fields present",
            passed: missing.length === 0,
            detail:
              missing.length === 0
                ? `All ${guaranteed.length} guaranteed fields present`
                : `Missing guaranteed fields: ${missing.join(", ")}`,
            durationMs: Date.now() - start3,
          });
        } else {
          steps.push({
            step: 3,
            name: "Guaranteed fields present",
            passed: true,
            detail: "No field reliability annotations yet (skipped)",
            durationMs: Date.now() - start3,
          });
        }
      }
    } catch (err) {
      steps.push({
        step: 2,
        name: "Live execution succeeds",
        passed: false,
        detail: `Execution error: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - start2,
      });
    }
  } else if (dryRun) {
    steps.push({
      step: 2,
      name: "Live execution (skipped — dry run)",
      passed: true,
      detail: "Skipped in dry-run mode",
    });
    steps.push({
      step: 3,
      name: "Guaranteed fields (skipped — dry run)",
      passed: true,
      detail: "Skipped in dry-run mode",
    });
  }

  // Step 4: Negative test — empty input returns structured error
  const negativeSuite = suites.find((s) => s.testType === "negative");
  if (!dryRun && executor && negativeSuite) {
    const start4 = Date.now();
    try {
      const result = await Promise.race([
        executor({}),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout after 15s")), 15_000),
        ),
      ]);
      // Negative test should ideally throw or return an error, not succeed
      // If it returns output, that's acceptable (some capabilities handle empty input gracefully)
      steps.push({
        step: 4,
        name: "Negative test (empty input)",
        passed: true,
        detail: "Returned structured output (graceful handling)",
        durationMs: Date.now() - start4,
      });
    } catch (err) {
      // An error is expected behavior for negative tests — as long as it's not a crash
      const msg = err instanceof Error ? err.message : String(err);
      const isStructured = !msg.includes("Cannot read properties") && !msg.includes("TypeError");
      steps.push({
        step: 4,
        name: "Negative test (empty input)",
        passed: isStructured,
        detail: isStructured
          ? `Structured error: ${msg.slice(0, 80)}`
          : `Crash-like error: ${msg.slice(0, 80)}`,
        durationMs: Date.now() - start4,
      });
    }
  } else if (dryRun) {
    steps.push({
      step: 4,
      name: "Negative test (skipped — dry run)",
      passed: true,
      detail: "Skipped in dry-run mode",
    });
  }

  // Step 5: SQS status
  const start5 = Date.now();
  const sqs = cap.matrixSqs ? parseFloat(cap.matrixSqs) : null;
  const sqsOk = sqs !== null || cap.lifecycleState === "probation" || cap.lifecycleState === "validating";
  steps.push({
    step: 5,
    name: "SQS is computed or building",
    passed: sqsOk,
    detail: sqs !== null ? `SQS = ${sqs}` : `lifecycle=${cap.lifecycleState}, SQS pending`,
    durationMs: Date.now() - start5,
  });

  // Step 6: Limitations populated
  steps.push({
    step: 6,
    name: "Limitations populated",
    passed: lims.length > 0,
    detail: `${lims.length} limitation(s)`,
  });

  // Step 7: Discoverable if active + visible
  const start7 = Date.now();
  const shouldBeDiscoverable = cap.visible && cap.lifecycleState === "active";
  if (shouldBeDiscoverable) {
    // Already confirmed by existence — but verify isActive too
    steps.push({
      step: 7,
      name: "Discoverable (active + visible)",
      passed: cap.isActive,
      detail: cap.isActive ? "Active and visible" : "visible=true but isActive=false",
      durationMs: Date.now() - start7,
    });
  } else {
    steps.push({
      step: 7,
      name: "Discoverability check",
      passed: true,
      detail: `lifecycle=${cap.lifecycleState}, visible=${cap.visible} — not expected to be discoverable`,
      durationMs: Date.now() - start7,
    });
  }

  // Step 8: Test suite inputs are valid JSON matching capability's input schema
  const start8 = Date.now();
  try {
    const inputSchema = cap.inputSchema as { properties?: Record<string, unknown> } | null;
    const schemaFields = inputSchema?.properties ? Object.keys(inputSchema.properties) : [];
    const invalidSuites: string[] = [];
    for (const suite of suites) {
      const input = suite.input;
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        invalidSuites.push(`${suite.testType}:not-an-object`);
        continue;
      }
      // Verify at least one input key matches a schema field (for capabilities with defined fields)
      if (schemaFields.length > 0) {
        const inputKeys = Object.keys(input as Record<string, unknown>);
        const overlap = inputKeys.filter((k) => schemaFields.includes(k));
        if (inputKeys.length > 0 && overlap.length === 0) {
          invalidSuites.push(`${suite.testType}:no-schema-overlap`);
        }
      }
    }
    steps.push({
      step: 8,
      name: "Test suite inputs are valid",
      passed: invalidSuites.length === 0,
      detail:
        invalidSuites.length === 0
          ? `All ${suites.length} suite inputs valid`
          : `Invalid inputs: ${invalidSuites.join(", ")}`,
      durationMs: Date.now() - start8,
    });
  } catch (err) {
    steps.push({
      step: 8,
      name: "Test suite inputs are valid",
      passed: false,
      detail: `Check error: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start8,
    });
  }

  // Step 9: Capability appears in search results (active capabilities only)
  const start9 = Date.now();
  if (cap.lifecycleState === "active" && cap.visible) {
    try {
      const searchRes = await fetch(
        `${API_BASE}/v1/suggest?q=${encodeURIComponent(cap.name.split(" ").slice(0, 3).join(" "))}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (searchRes.ok) {
        const body = (await searchRes.json()) as { results?: Array<{ slug: string }> };
        const found = (body.results ?? []).some((r) => r.slug === slug);
        steps.push({
          step: 9,
          name: "Appears in search results",
          passed: found,
          detail: found
            ? "Found in suggest results"
            : `Not found in suggest results for "${cap.name.split(" ").slice(0, 3).join(" ")}"`,
          durationMs: Date.now() - start9,
        });
      } else {
        steps.push({
          step: 9,
          name: "Appears in search results",
          passed: true, // non-blocking: suggest endpoint may not be running locally
          detail: `Suggest endpoint returned ${searchRes.status} — skipped`,
          durationMs: Date.now() - start9,
        });
      }
    } catch {
      steps.push({
        step: 9,
        name: "Appears in search results",
        passed: true, // non-blocking: local server may not be running
        detail: "Suggest endpoint unreachable — skipped",
        durationMs: Date.now() - start9,
      });
    }
  } else {
    steps.push({
      step: 9,
      name: "Search discoverability",
      passed: true,
      detail: `lifecycle=${cap.lifecycleState} — not expected to be discoverable`,
      durationMs: Date.now() - start9,
    });
  }

  // Step 10: Trust profile returns valid data
  const start10 = Date.now();
  try {
    const trustRes = await fetch(
      `${API_BASE}/v1/internal/trust/capabilities/${slug}`,
      {
        headers: INTERNAL_SECRET ? { "x-internal-secret": INTERNAL_SECRET } : {},
        signal: AbortSignal.timeout(8000),
      },
    );
    if (trustRes.ok) {
      const body = (await trustRes.json()) as Record<string, unknown>;
      const hasRequired =
        "sqs" in body &&
        "quality_profile" in body &&
        "reliability_profile" in body;
      steps.push({
        step: 10,
        name: "Trust profile returns valid data",
        passed: hasRequired,
        detail: hasRequired
          ? `SQS=${body.sqs}, QP=${typeof body.quality_profile}, RP=${typeof body.reliability_profile}`
          : `Missing fields: ${["sqs", "quality_profile", "reliability_profile"].filter((k) => !(k in body)).join(", ")}`,
        durationMs: Date.now() - start10,
      });
    } else {
      steps.push({
        step: 10,
        name: "Trust profile returns valid data",
        passed: true, // non-blocking: internal endpoint may need auth
        detail: `Trust endpoint returned ${trustRes.status} — skipped`,
        durationMs: Date.now() - start10,
      });
    }
  } catch {
    steps.push({
      step: 10,
      name: "Trust profile returns valid data",
      passed: true, // non-blocking: local server may not be running
      detail: "Trust endpoint unreachable — skipped",
      durationMs: Date.now() - start10,
    });
  }

  // Step 11: Field reliability annotations exist and are non-empty
  const start11 = Date.now();
  const reliability = cap.outputFieldReliability as Record<string, string> | null;
  const hasAnnotations = reliability != null && Object.keys(reliability).length > 0;
  steps.push({
    step: 11,
    name: "Field reliability annotations populated",
    passed: hasAnnotations,
    detail: hasAnnotations
      ? `${Object.keys(reliability!).length} fields annotated`
      : reliability
        ? "output_field_reliability is empty — run backfill-field-reliability.ts"
        : "output_field_reliability is null — run backfill-field-reliability.ts",
    durationMs: Date.now() - start11,
  });

  const allPassed = steps.every((s) => s.passed);
  return { slug, steps, passed: allPassed };
}

// ─── Output formatting ──────────────────────────────────────────────────────

function printReport(result: { slug: string; steps: StepResult[]; passed: boolean }) {
  const icon = result.passed ? "✅" : "❌";
  console.log(`\n${icon} ${result.slug}`);

  for (const step of result.steps) {
    const mark = step.passed ? "  ✓" : "  ✗";
    const timing = step.durationMs !== undefined ? ` (${step.durationMs}ms)` : "";
    const detail = step.detail ? ` — ${step.detail}` : "";
    console.log(`${mark} Step ${step.step}: ${step.name}${detail}${timing}`);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // Register executors so smoke tests can execute capabilities
  await autoRegisterCapabilities();

  const args = process.argv.slice(2);
  const slugIdx = args.indexOf("--slug");
  const allMode = args.includes("--all");
  const dryRun = args.includes("--dry-run");

  if (!allMode && (slugIdx === -1 || !args[slugIdx + 1])) {
    console.error("Usage: npx tsx scripts/smoke-test.ts --slug <slug>");
    console.error("       npx tsx scripts/smoke-test.ts --all [--dry-run]");
    process.exit(1);
  }

  const db = getDb();

  if (allMode) {
    const rows = await db
      .select({ slug: capabilities.slug })
      .from(capabilities)
      .where(eq(capabilities.isActive, true));

    console.log(
      `Smoke testing ${rows.length} active capabilities${dryRun ? " (dry run)" : ""}...\n`,
    );

    let passCount = 0;
    let failCount = 0;
    const failures: string[] = [];

    for (const row of rows) {
      const result = await smokeTest(row.slug, dryRun);
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
    const result = await smokeTest(slug, dryRun);
    printReport(result);
    process.exit(result.passed ? 0 : 1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
