import { eq, and, not, sql, desc, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  testSuites,
  testResults,
  testRunLog,
  transactionQuality,
  transactions,
  capabilities,
} from "../db/schema.js";
import { getExecutor } from "../capabilities/index.js";
import type { CapabilityResult } from "../capabilities/index.js";
import { computeHealthState, HEALTH_STATE_FREQUENCY_HOURS } from "./health-state.js";
import { sanitizeErrorMessage, getTestResultsForSlug } from "./trust-helpers.js";
import { computeDualProfileSQS } from "./sqs.js";
import { computeExecutionGuidance, type ComputeGuidanceInput } from "./execution-guidance.js";
import { classifyFailure } from "./failure-classifier.js";
import {
  attemptRemediation,
  buildRunSummary,
  formatRunSummary,
  type RemediationResult,
} from "./self-heal.js";
import { analyzeAndRemediate, applyRemediation } from "./auto-remediation.js";
import { checkUpstreamEscalation } from "./upstream-tracker.js";
import { getUnconfiguredCapabilities } from "./credential-health.js";
import { isChromiumHealthy, isBrowserlessCapability, probeChromiumHealth } from "./chromium-health.js";
import { findUnhealthyUpstream, refreshUpstreamMapping, isCacheExpired } from "./upstream-health-gate.js";
import { evaluateLifecycle } from "./lifecycle.js";
import { logHealthEvent } from "./health-monitor.js";
import { checkNewFailures, checkInfrastructureHealth } from "./meta-monitoring.js";
import type { CapabilityType } from "./reliability-profile.js";
import { computeFreshnessDecay, applyFreshnessDecay, shouldOverrideTrend } from "./freshness-decay.js";
import { withRetry } from "./retry.js";
import { createHash } from "node:crypto";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeOutputHash(output: unknown): string | null {
  if (output == null) return null;
  return createHash("sha256").update(JSON.stringify(output)).digest("hex");
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface ValidationCheck {
  field: string;
  operator: string;
  value?: unknown;
  values?: unknown[];
}

interface ValidationRules {
  checks: ValidationCheck[];
}

export type ScheduleTier = "A" | "B" | "C";

export interface TestRunOptions {
  capabilitySlug?: string;
  tier?: ScheduleTier;
}

export interface TestRunSummary {
  tier: string;
  total: number;
  passed: number;
  failed: number;
  avgResponseTimeMs: number;
  estimatedCostCents: number;
  results: SingleTestResult[];
}

interface SingleTestResult {
  testName: string;
  testType: string;
  capabilitySlug: string;
  passed: boolean;
  failureReason: string | null;
  responseTimeMs: number;
  remediation?: RemediationResult;
}

// ─── Tier-specific delays ───────────────────────────────────────────────────

const TIER_DELAY_MS: Record<ScheduleTier, number> = {
  A: 200,
  B: 500,
  C: 1000,
};
const DEFAULT_DELAY_MS = 200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Run tests ──────────────────────────────────────────────────────────────

/**
 * Run tests with optional filters.
 * - No args: runs all active tests (all tiers)
 * - { tier: 'A' }: runs only Tier A tests
 * - { capabilitySlug: 'iban-validate' }: runs tests for a specific capability
 */
export async function runTests(
  options?: TestRunOptions | string,
): Promise<TestRunSummary> {
  // Backward compat: accept bare string as capabilitySlug
  const opts: TestRunOptions =
    typeof options === "string" ? { capabilitySlug: options } : options ?? {};

  const db = getDb();
  const startedAt = new Date();

  const conditions = [
    eq(testSuites.active, true),
    // PRINCIPLE C: Piggyback suites are NEVER scheduled.
    // They receive data exclusively from real customer traffic via recordPiggybackResult().
    // Scheduling them wastes API calls by duplicating what regular tests already cover.
    not(eq(testSuites.testType, "piggyback")),
  ];
  if (opts.capabilitySlug) {
    conditions.push(eq(testSuites.capabilitySlug, opts.capabilitySlug));
  }
  if (opts.tier) {
    conditions.push(eq(testSuites.scheduleTier, opts.tier));
  }

  // T-1: Inner join with capabilities to skip test suites for deactivated capabilities
  const suitesRaw = await db
    .select({ suite: testSuites, fieldReliability: capabilities.outputFieldReliability, capabilityType: capabilities.capabilityType })
    .from(testSuites)
    .innerJoin(capabilities, eq(testSuites.capabilitySlug, capabilities.slug))
    .where(and(...conditions, eq(capabilities.isActive, true)));
  const suites = suitesRaw.map((r) => r.suite);

  // Build field reliability map for validateResult
  const fieldReliabilityMap = new Map<string, Record<string, string>>();
  // Build capability type map for failure classification
  const capabilityTypeMap = new Map<string, string>();
  for (const row of suitesRaw) {
    if (row.fieldReliability && !fieldReliabilityMap.has(row.suite.capabilitySlug)) {
      fieldReliabilityMap.set(
        row.suite.capabilitySlug,
        row.fieldReliability as Record<string, string>,
      );
    }
    if (row.capabilityType && !capabilityTypeMap.has(row.suite.capabilitySlug)) {
      capabilityTypeMap.set(row.suite.capabilitySlug, row.capabilityType);
    }
  }

  const tierLabel = opts.tier ?? "all";
  const delayMs = opts.tier ? TIER_DELAY_MS[opts.tier] : DEFAULT_DELAY_MS;
  const results: SingleTestResult[] = [];
  let totalResponseTime = 0;
  let totalEstimatedCost = 0;
  let totalActualCost = 0;

  // Pre-compute unconfigured capabilities to skip (avoids accumulating
  // hundreds of "no API key" failures that pollute the SQS scoring window)
  const unconfiguredSlugs = getUnconfiguredCapabilities();

  for (let i = 0; i < suites.length; i++) {
    const suite = suites[i];

    // Skip capabilities whose required credentials are missing
    if (unconfiguredSlugs.has(suite.capabilitySlug)) {
      console.log(
        `[test-runner] Skipping ${suite.capabilitySlug}: required credential not configured`,
      );
      continue;
    }

    // Skip capabilities whose upstream dependency is unhealthy
    // (prevents timeout failures from polluting the SQS window)
    const unhealthyUpstream = findUnhealthyUpstream(suite.capabilitySlug);
    if (unhealthyUpstream) {
      console.log(
        `[test-runner] Skipping ${suite.capabilitySlug}: upstream '${unhealthyUpstream}' unhealthy`,
      );
      continue;
    }

    const result = await runSingleTest(suite, fieldReliabilityMap, capabilityTypeMap);

    // ── Self-healing: attempt remediation on failures ──────────────────
    if (!result.passed && result.failureReason) {
      try {
        const remediation = await attemptRemediation(
          suite.id,
          suite.capabilitySlug,
          result.testName,
          result.testType,
          result.failureReason,
        );
        result.remediation = remediation;

        if (remediation.outcome === "auto_resolved" && remediation.verificationPassed) {
          result.passed = true;
          result.failureReason = null;
          console.log(
            `[self-heal] ✅ Auto-resolved: ${suite.capabilitySlug} — ${remediation.action}`,
          );
        } else if (remediation.outcome === "monitoring") {
          console.log(
            `[self-heal] 🟡 Monitoring: ${suite.capabilitySlug} — ${remediation.action}`,
          );
        } else {
          console.warn(
            `[self-heal] 🔴 Escalate: ${suite.capabilitySlug} — ${remediation.action}`,
          );
        }
      } catch (healErr) {
        console.error(
          `[self-heal] Remediation threw for ${suite.capabilitySlug}:`,
          healErr,
        );
      }

      // Auto-remediation: structural fixes (field reliability, volatile values)
      // Runs for upstream_changed/test_design failures that self-heal didn't resolve
      try {
        const autoActions = await analyzeAndRemediate(suite);
        if (autoActions.length > 0) {
          await applyRemediation(suite.id, autoActions);
          const applied = autoActions.filter((a) => a.applied);
          if (applied.length > 0) {
            // Mark the test result as auto-fixed
            const [latestRow] = await db
              .select({ id: testResults.id })
              .from(testResults)
              .where(eq(testResults.testSuiteId, suite.id))
              .orderBy(desc(testResults.executedAt))
              .limit(1);
            if (latestRow) {
              await db.update(testResults)
                .set({ autoFixed: true })
                .where(eq(testResults.id, latestRow.id));
            }

            for (const action of applied) {
              console.log(`[auto-remediation] ${suite.capabilitySlug}: ${action.description}`);
              logHealthEvent({
                eventType: "auto_remediation",
                capabilitySlug: suite.capabilitySlug,
                tier: 1,
                actionTaken: action.description,
                details: {
                  rule: action.rule,
                  confidence: action.confidence,
                  test_name: suite.testName,
                  changes: action.changes,
                },
              }).catch(() => {});
            }
          }
        }
      } catch (autoErr) {
        console.error(
          `[auto-remediation] Analysis threw for ${suite.capabilitySlug}:`,
          autoErr instanceof Error ? autoErr.message : autoErr,
        );
      }
    }

    results.push(result);
    totalResponseTime += result.responseTimeMs;
    totalEstimatedCost += suite.estimatedCostCents;
    totalActualCost += estimateTestCost(
      capabilityTypeMap?.get(suite.capabilitySlug),
      suite.testMode,
      result.responseTimeMs,
    );

    // Staggered delay between tests
    if (i < suites.length - 1) {
      await delay(delayMs);
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  const completedAt = new Date();

  // Log the run
  await db.insert(testRunLog).values({
    tier: tierLabel,
    startedAt,
    completedAt,
    totalTests: results.length,
    passed,
    failed,
    estimatedCostCents: totalEstimatedCost,
    actualCostCents: totalActualCost,
  });

  // ── Persist dual-profile SQS scores for affected capabilities ──────────
  const affectedSlugs = [...new Set(results.map((r) => r.capabilitySlug))];
  await persistDualProfileScores(affectedSlugs);

  // ── Check upstream escalation for capabilities with failures ──────────
  const failedSlugs = [...new Set(results.filter((r) => !r.passed).map((r) => r.capabilitySlug))];
  for (const slug of failedSlugs) {
    try {
      await checkUpstreamEscalation(slug);
    } catch (err) {
      console.warn(`[test-runner] Upstream escalation check failed for ${slug}:`, err);
    }
  }

  // ── Evaluate lifecycle transitions for all capabilities in this batch ──
  for (const slug of affectedSlugs) {
    evaluateLifecycle(slug).catch((err) => {
      console.error(`[lifecycle] Failed to evaluate ${slug}:`, err instanceof Error ? err.message : err);
    });
  }

  // ── Mass failure detection: >10% and >5 failures → situation assessment ──
  if (results.length > 0 && failed > 5 && failed / results.length > 0.10) {
    const classificationCounts: Record<string, number> = {};
    for (const r of results) {
      if (!r.passed && (r as any).failureClassification) {
        const c = String((r as any).failureClassification);
        classificationCounts[c] = (classificationCounts[c] ?? 0) + 1;
      }
    }
    const commonClassification = Object.entries(classificationCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";

    import("./situation-assessment.js").then(async ({ assessMassTestFailure }) => {
      const { evaluateAndAlert } = await import("./intelligent-alerts.js");
      const assessment = await assessMassTestFailure(failedSlugs, results.length, commonClassification);
      await evaluateAndAlert(assessment);
    }).catch((err) => {
      console.error("[situation] Mass failure assessment failed:", err instanceof Error ? err.message : err);
    });
  }

  // ── Meta-monitoring: post-test-run checks (8A) ─────────────────────────
  if (results.length > 0) {
    const batchForMeta = results.map((r) => ({
      capabilitySlug: r.capabilitySlug,
      passed: r.passed,
      failureClassification: (r as any).failureClassification as string | null | undefined,
    }));

    // Check 1: New failure alert (regressions)
    checkNewFailures(batchForMeta).then((check) => {
      if (!check.passed) {
        console.warn(`[META] ${check.details}`);
      }
    }).catch((err) => {
      console.error("[meta-monitoring] checkNewFailures failed:", err instanceof Error ? err.message : err);
    });

    // Check 2: Infrastructure health (systemic failures)
    checkInfrastructureHealth(batchForMeta).then((check) => {
      if (!check.passed) {
        console.error(`[META] CRITICAL: ${check.details}`);
      }
    }).catch((err) => {
      console.error("[meta-monitoring] checkInfrastructureHealth failed:", err instanceof Error ? err.message : err);
    });
  }

  return {
    tier: tierLabel,
    total: results.length,
    passed,
    failed,
    avgResponseTimeMs:
      results.length > 0
        ? Math.round(totalResponseTime / results.length)
        : 0,
    estimatedCostCents: totalEstimatedCost,
    results,
  };
}

async function runSingleTest(
  suite: typeof testSuites.$inferSelect,
  fieldReliabilityMap?: Map<string, Record<string, string>>,
  capabilityTypeMap?: Map<string, string>,
): Promise<SingleTestResult> {
  const db = getDb();
  const startTime = Date.now();

  // ── Dry-run mode for schema_check tests ──────────────────────────────────
  // Validates input against input_schema and output_schema structure
  // without calling any external service. FREE.
  if (suite.testType === "schema_check") {
    return runDryRunSchemaTest(suite);
  }

  // ── Regression test: compare current output structure against baseline ───
  if (suite.testType === "regression") {
    return runRegressionTest(suite);
  }

  // ── Fixture mode: validate stored baseline without calling the executor ────
  // For deterministic capabilities where the output never changes.
  // Zero cost — just validates baseline_output against validation_rules.
  if (suite.testMode === "fixture" && suite.baselineOutput) {
    return runFixtureTest(suite, fieldReliabilityMap);
  }

  // ── Real execution for other test types (negative, edge_case, known_answer)
  const executor = getExecutor(suite.capabilitySlug);

  if (!executor) {
    const failureReason = `No executor registered for '${suite.capabilitySlug}'`;
    const classification = classifyFailure(
      failureReason, false, false, suite.testType,
      suite.input as Record<string, unknown>,
      false, capabilityTypeMap?.get(suite.capabilitySlug),
    );

    await db.insert(testResults).values({
      testSuiteId: suite.id,
      capabilitySlug: suite.capabilitySlug,
      passed: false,
      failureReason,
      responseTimeMs: 0,
      failureClassification: classification.verdict,
    });

    await updateLastClassification(suite.id, classification);

    return {
      testName: suite.testName,
      testType: suite.testType,
      capabilitySlug: suite.capabilitySlug,
      passed: false,
      failureReason,
      responseTimeMs: 0,
    };
  }

  let capResult: CapabilityResult | null = null;
  let executionError: string | null = null;
  let responseTimeMs: number;

  // Skip retry for deterministic capabilities (no external calls — failure is permanent)
  const capType = capabilityTypeMap?.get(suite.capabilitySlug);
  const shouldRetry = capType !== "deterministic";

  try {
    if (shouldRetry) {
      capResult = await withRetry(
        () => executor(suite.input as Record<string, unknown>),
        { maxRetries: 1, baseDelayMs: 2000, slug: suite.capabilitySlug },
      );
    } else {
      capResult = await executor(suite.input as Record<string, unknown>);
    }
    responseTimeMs = Date.now() - startTime;
  } catch (err) {
    responseTimeMs = Date.now() - startTime;
    executionError =
      err instanceof Error ? err.message : String(err);
  }

  // Validate the result
  const reliability = fieldReliabilityMap?.get(suite.capabilitySlug) ?? null;
  const { passed, failureReason } = validateResult(
    suite,
    capResult,
    executionError,
    reliability,
  );

  // Classify failure if test didn't pass
  const executionSucceeded = capResult !== null && executionError === null;
  const validationFailed = capResult !== null && !passed;
  const previouslyPassed = (suite.lastClassification as any)?.verdict !== "test_design";
  const classification = !passed
    ? classifyFailure(
        failureReason, executionSucceeded, validationFailed,
        suite.testType, suite.input as Record<string, unknown>,
        previouslyPassed, capabilityTypeMap?.get(suite.capabilitySlug),
      )
    : null;

  // Write test result
  await db.insert(testResults).values({
    testSuiteId: suite.id,
    capabilitySlug: suite.capabilitySlug,
    passed,
    actualOutput: capResult?.output ?? null,
    failureReason,
    responseTimeMs,
    outputHash: computeOutputHash(capResult?.output),
    failureClassification: classification?.verdict ?? null,
  });

  // Update last_classification on suite for trend detection
  if (classification) {
    await updateLastClassification(suite.id, classification);
    // Log classification event to health monitor (fire-and-forget)
    logHealthEvent({
      eventType: "classification",
      capabilitySlug: suite.capabilitySlug,
      tier: classification.verdict === "capability_bug" ? 2 : 1,
      actionTaken: `Test classified as ${classification.verdict}`,
      details: {
        verdict: classification.verdict,
        test_name: suite.testName,
        test_type: suite.testType,
        error_snippet: (failureReason ?? "").substring(0, 200),
      },
    }).catch(() => {});
  } else if (suite.lastClassification) {
    // Test passed — clear last_classification (indicates recovery)
    await db.update(testSuites).set({
      lastClassification: null,
      updatedAt: new Date(),
    }).where(eq(testSuites.id, suite.id));
  }

  // Record quality data for this test execution (fire-and-forget)
  recordTestQuality(
    suite.capabilitySlug,
    capResult,
    executionError,
    responseTimeMs,
  ).catch(() => {});

  // Auto-capture example output + baseline from first successful test
  if (passed && capResult?.output) {
    captureExampleOutput(suite.capabilitySlug, capResult.output).catch(() => {});
    captureBaseline(suite, capResult.output).catch(() => {});
  }

  return {
    testName: suite.testName,
    testType: suite.testType,
    capabilitySlug: suite.capabilitySlug,
    passed,
    failureReason,
    responseTimeMs,
  };
}

// ─── Dry-run schema test (FREE) ──────────────────────────────────────────────

async function runDryRunSchemaTest(
  suite: typeof testSuites.$inferSelect,
): Promise<SingleTestResult> {
  const db = getDb();
  const startTime = Date.now();

  // Look up the capability's schemas
  const [cap] = await db
    .select({
      inputSchema: capabilities.inputSchema,
      outputSchema: capabilities.outputSchema,
    })
    .from(capabilities)
    .where(eq(capabilities.slug, suite.capabilitySlug))
    .limit(1);

  if (!cap) {
    const result: SingleTestResult = {
      testName: suite.testName,
      testType: suite.testType,
      capabilitySlug: suite.capabilitySlug,
      passed: false,
      failureReason: `Capability '${suite.capabilitySlug}' not found in database`,
      responseTimeMs: 0,
    };
    await db.insert(testResults).values({
      testSuiteId: suite.id,
      capabilitySlug: suite.capabilitySlug,
      passed: false,
      failureReason: result.failureReason,
      responseTimeMs: 0,
    });
    return result;
  }

  const inputSchema = (cap.inputSchema ?? {}) as Record<string, unknown>;
  const outputSchema = (cap.outputSchema ?? {}) as Record<string, unknown>;
  const testInput = suite.input as Record<string, unknown>;

  // 1. Validate input against input_schema
  const inputErrors = validateInputAgainstSchema(testInput, inputSchema);

  // 2. Validate output_schema is well-formed
  const schemaErrors = validateOutputSchemaStructure(outputSchema);

  // 3. Verify executor exists
  const executor = getExecutor(suite.capabilitySlug);
  const executorExists = !!executor;

  const allErrors = [...inputErrors, ...schemaErrors];
  if (!executorExists) {
    allErrors.push(`No executor registered for '${suite.capabilitySlug}'`);
  }

  const passed = allErrors.length === 0;
  const failureReason = passed ? null : allErrors.join("; ");
  const responseTimeMs = Date.now() - startTime;

  const classification = !passed
    ? classifyFailure(
        failureReason, false, false, suite.testType,
        suite.input as Record<string, unknown>,
      )
    : null;

  await db.insert(testResults).values({
    testSuiteId: suite.id,
    capabilitySlug: suite.capabilitySlug,
    passed,
    failureReason,
    responseTimeMs,
    failureClassification: classification?.verdict ?? null,
  });

  if (classification) {
    await updateLastClassification(suite.id, classification);
  }

  return {
    testName: suite.testName,
    testType: suite.testType,
    capabilitySlug: suite.capabilitySlug,
    passed,
    failureReason,
    responseTimeMs,
  };
}

/** Validate test input against a JSON Schema input_schema. */
function validateInputAgainstSchema(
  input: Record<string, unknown>,
  schema: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  const properties = (schema as { properties?: Record<string, any> }).properties ?? {};
  const required = new Set((schema as { required?: string[] }).required ?? []);

  // Check required fields are present
  for (const field of required) {
    if (!(field in input) || input[field] == null) {
      errors.push(`Missing required input field: '${field}'`);
    }
  }

  // Type-check provided fields against schema
  for (const [key, value] of Object.entries(input)) {
    if (!(key in properties)) continue; // extra fields are OK
    const prop = properties[key];
    if (!prop?.type || value == null) continue;

    const actualType = Array.isArray(value) ? "array" : typeof value;
    const expectedType = prop.type;

    if (expectedType === "integer" && actualType === "number") continue; // close enough
    if (expectedType === "number" && actualType === "number") continue;
    if (actualType !== expectedType) {
      errors.push(`Input '${key}': expected type '${expectedType}', got '${actualType}'`);
    }
  }

  return errors;
}

/** Validate that output_schema is a well-formed JSON Schema. */
function validateOutputSchemaStructure(
  schema: Record<string, unknown>,
): string[] {
  const errors: string[] = [];

  if (!schema.type && !schema.properties) {
    errors.push("output_schema has neither 'type' nor 'properties'");
  }

  if (schema.properties && typeof schema.properties !== "object") {
    errors.push("output_schema 'properties' must be an object");
  }

  return errors;
}

// ─── Fixture test (FREE — validates stored baseline) ─────────────────────────

/**
 * Run a fixture test: validate stored baseline_output against validation_rules
 * WITHOUT calling the real executor. Zero external cost.
 *
 * Used for deterministic capabilities where the output never changes for the
 * same input. Baselines are refreshed periodically via canary runs.
 */
async function runFixtureTest(
  suite: typeof testSuites.$inferSelect,
  fieldReliabilityMap?: Map<string, Record<string, string>>,
): Promise<SingleTestResult> {
  const db = getDb();
  const baselineOutput = suite.baselineOutput as Record<string, unknown>;

  // Validate baseline against current validation rules
  const reliability = fieldReliabilityMap?.get(suite.capabilitySlug) ?? null;
  const mockResult: CapabilityResult = {
    output: baselineOutput,
    provenance: { source: "fixture", fetched_at: new Date().toISOString() },
  };
  const { passed, failureReason } = validateResult(suite, mockResult, null, reliability);

  // Record the fixture test result (responseTimeMs = 0 since no external call)
  await db.insert(testResults).values({
    testSuiteId: suite.id,
    capabilitySlug: suite.capabilitySlug,
    passed,
    actualOutput: baselineOutput,
    failureReason,
    responseTimeMs: 0,
    outputHash: computeOutputHash(baselineOutput),
  });

  return {
    testName: suite.testName,
    testType: suite.testType,
    capabilitySlug: suite.capabilitySlug,
    passed,
    failureReason,
    responseTimeMs: 0,
  };
}

// ─── Regression test (FREE — compares structure) ─────────────────────────────

async function runRegressionTest(
  suite: typeof testSuites.$inferSelect,
): Promise<SingleTestResult> {
  const db = getDb();
  const startTime = Date.now();

  const baseline = suite.baselineOutput as Record<string, unknown> | null;
  if (!baseline) {
    // No baseline yet — skip gracefully
    const responseTimeMs = Date.now() - startTime;
    await db.insert(testResults).values({
      testSuiteId: suite.id,
      capabilitySlug: suite.capabilitySlug,
      passed: true,
      failureReason: null,
      responseTimeMs,
    });
    return {
      testName: suite.testName,
      testType: "regression",
      capabilitySlug: suite.capabilitySlug,
      passed: true,
      failureReason: null,
      responseTimeMs,
    };
  }

  // Execute the capability for real
  const executor = getExecutor(suite.capabilitySlug);
  if (!executor) {
    const responseTimeMs = Date.now() - startTime;
    const failureReason = `No executor registered for '${suite.capabilitySlug}'`;
    const cls = classifyFailure(failureReason, false, false, "regression", suite.input as Record<string, unknown>);
    await db.insert(testResults).values({
      testSuiteId: suite.id,
      capabilitySlug: suite.capabilitySlug,
      passed: false,
      failureReason,
      responseTimeMs,
      failureClassification: cls.verdict,
    });
    await updateLastClassification(suite.id, cls);
    return {
      testName: suite.testName,
      testType: "regression",
      capabilitySlug: suite.capabilitySlug,
      passed: false,
      failureReason,
      responseTimeMs,
    };
  }

  let currentOutput: Record<string, unknown> | null = null;
  let executionError: string | null = null;
  let responseTimeMs: number;

  try {
    const result = await executor(suite.input as Record<string, unknown>);
    responseTimeMs = Date.now() - startTime;
    currentOutput = result?.output ?? null;
  } catch (err) {
    responseTimeMs = Date.now() - startTime;
    executionError = err instanceof Error ? err.message : String(err);
  }

  if (executionError || !currentOutput) {
    const failureReason = executionError
      ? `Execution error: ${sanitizeErrorMessage(executionError) ?? executionError}`
      : "No output returned";
    const cls = classifyFailure(failureReason, !executionError, false, "regression", suite.input as Record<string, unknown>);
    await db.insert(testResults).values({
      testSuiteId: suite.id,
      capabilitySlug: suite.capabilitySlug,
      passed: false,
      failureReason,
      responseTimeMs,
      failureClassification: cls.verdict,
    });
    await updateLastClassification(suite.id, cls);
    return {
      testName: suite.testName,
      testType: "regression",
      capabilitySlug: suite.capabilitySlug,
      passed: false,
      failureReason,
      responseTimeMs,
    };
  }

  // Compare key structure
  const baselineKeys = extractKeyStructure(baseline);
  const currentKeys = extractKeyStructure(currentOutput);
  const missingKeys = baselineKeys.filter((k) => !currentKeys.includes(k));

  const passed = missingKeys.length === 0;
  const failureReason = passed
    ? null
    : `Missing keys vs baseline: ${missingKeys.join(", ")}`;

  const regressionCls = !passed
    ? classifyFailure(failureReason, true, true, "regression", suite.input as Record<string, unknown>, true)
    : null;

  await db.insert(testResults).values({
    testSuiteId: suite.id,
    capabilitySlug: suite.capabilitySlug,
    passed,
    actualOutput: currentOutput,
    failureReason,
    responseTimeMs,
    outputHash: computeOutputHash(currentOutput),
    failureClassification: regressionCls?.verdict ?? null,
  });

  if (regressionCls) {
    await updateLastClassification(suite.id, regressionCls);
  }

  return {
    testName: suite.testName,
    testType: "regression",
    capabilitySlug: suite.capabilitySlug,
    passed,
    failureReason,
    responseTimeMs,
  };
}

/** Recursively extract all key paths from an object. */
function extractKeyStructure(obj: unknown, prefix = ""): string[] {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    keys.push(fullKey);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...extractKeyStructure(value, fullKey));
    }
  }
  return keys;
}

/** Capture baseline output on first successful real execution. */
async function captureBaseline(
  suite: typeof testSuites.$inferSelect,
  output: Record<string, unknown>,
): Promise<void> {
  if (suite.baselineOutput) return; // already captured
  const db = getDb();
  await db
    .update(testSuites)
    .set({
      baselineOutput: output,
      baselineCapturedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(testSuites.id, suite.id));
}

// ─── Validation logic ───────────────────────────────────────────────────────

function validateResult(
  suite: typeof testSuites.$inferSelect,
  capResult: CapabilityResult | null,
  executionError: string | null,
  fieldReliability?: Record<string, string> | null,
): { passed: boolean; failureReason: string | null } {
  const rules = suite.validationRules as ValidationRules;

  if (suite.testType === "negative") {
    if (executionError || !capResult) {
      return { passed: true, failureReason: null };
    }
  }

  // known_bad: expects the capability to REJECT bad input or return a rejection signal.
  // Pass if: execution throws an error (correctly rejected), OR validation rules pass
  //          (e.g., {valid: false} as expected).
  // Fail if: execution succeeds with no rejection signal (semantic regression).
  if (suite.testType === "known_bad") {
    if (executionError) {
      return { passed: true, failureReason: null }; // Correctly rejected
    }
    // Execution succeeded — check if the output contains the expected rejection signal
    // via validation rules (e.g., is_false on "valid" field)
    if (capResult) {
      const output = capResult.output;
      for (const check of rules.checks) {
        const checkResult = runCheck(check, output);
        if (!checkResult.passed) {
          return {
            passed: false,
            failureReason: `Semantic regression: capability accepted bad input. ${checkResult.reason}`,
          };
        }
      }
      return { passed: true, failureReason: null }; // Rejection signal confirmed
    }
    return { passed: false, failureReason: "Semantic regression: no output and no error for bad input" };
  }

  if (suite.testType === "edge_case") {
    if (executionError) {
      return { passed: true, failureReason: null };
    }
    if (!capResult) {
      return {
        passed: false,
        failureReason: "Edge case: no result and no error",
      };
    }
  }

  if (executionError) {
    return { passed: false, failureReason: `Execution error: ${sanitizeErrorMessage(executionError) ?? executionError}` };
  }

  if (!capResult) {
    return { passed: false, failureReason: "No result returned" };
  }

  const output = capResult.output;
  for (const check of rules.checks) {
    const checkResult = runCheck(check, output);
    if (!checkResult.passed) {
      // If field reliability is annotated, respect it:
      // - guaranteed field missing → FAIL
      // - common field missing → PASS (acceptable absence)
      // - rare field missing → PASS (silently)
      // If no reliability data, fall back to current behavior (all checks enforced)
      if (fieldReliability && check.field) {
        const topField = check.field.split(".")[0];
        const level = fieldReliability[topField];
        if (level === "rare") {
          continue; // Silently skip
        }
        if (level === "common") {
          continue; // Acceptable absence
        }
        // 'guaranteed' or unknown field → enforce the check (fall through to fail)
      }
      return { passed: false, failureReason: checkResult.reason };
    }
  }

  return { passed: true, failureReason: null };
}

function runCheck(
  check: ValidationCheck,
  output: Record<string, unknown>,
): { passed: boolean; reason: string } {
  const value = getNestedValue(output, check.field);

  switch (check.operator) {
    case "equals":
      if (value !== check.value) {
        return {
          passed: false,
          reason: `${check.field}: expected '${check.value}', got '${value}'`,
        };
      }
      return { passed: true, reason: "" };

    case "not_null":
      if (value == null) {
        return { passed: false, reason: `${check.field}: expected non-null` };
      }
      return { passed: true, reason: "" };

    case "is_true":
      if (value !== true) {
        return {
          passed: false,
          reason: `${check.field}: expected true, got ${value}`,
        };
      }
      return { passed: true, reason: "" };

    case "is_false":
      if (value !== false) {
        return {
          passed: false,
          reason: `${check.field}: expected false, got ${value}`,
        };
      }
      return { passed: true, reason: "" };

    case "contains":
      if (
        typeof value !== "string" ||
        !value.toLowerCase().includes(String(check.value).toLowerCase())
      ) {
        return {
          passed: false,
          reason: `${check.field}: expected to contain '${check.value}', got '${value}'`,
        };
      }
      return { passed: true, reason: "" };

    case "in":
      if (!check.values || !check.values.includes(value)) {
        return {
          passed: false,
          reason: `${check.field}: expected one of [${check.values?.join(", ")}], got '${value}'`,
        };
      }
      return { passed: true, reason: "" };

    case "type": {
      const actualType = Array.isArray(value) ? "array" : typeof value;
      if (actualType !== check.value) {
        return {
          passed: false,
          reason: `${check.field}: expected type '${check.value}', got '${actualType}'`,
        };
      }
      return { passed: true, reason: "" };
    }

    case "gt": {
      if (typeof value !== "number" || value <= Number(check.value)) {
        return {
          passed: false,
          reason: `${check.field}: expected > ${check.value}, got ${value}`,
        };
      }
      return { passed: true, reason: "" };
    }

    case "lt": {
      if (typeof value !== "number" || value >= Number(check.value)) {
        return {
          passed: false,
          reason: `${check.field}: expected < ${check.value}, got ${value}`,
        };
      }
      return { passed: true, reason: "" };
    }

    case "gte": {
      if (typeof value !== "number" || value < Number(check.value)) {
        return {
          passed: false,
          reason: `${check.field}: expected >= ${check.value}, got ${value}`,
        };
      }
      return { passed: true, reason: "" };
    }

    default:
      return {
        passed: false,
        reason: `Unknown operator: ${check.operator}`,
      };
  }
}

function getNestedValue(
  obj: Record<string, unknown>,
  path: string,
): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ─── Quality recording for test executions ──────────────────────────────────

async function recordTestQuality(
  capabilitySlug: string,
  capResult: CapabilityResult | null,
  executionError: string | null,
  responseTimeMs: number,
): Promise<void> {
  const db = getDb();

  const [cap] = await db
    .select({ outputSchema: capabilities.outputSchema, id: capabilities.id })
    .from(capabilities)
    .where(eq(capabilities.slug, capabilitySlug))
    .limit(1);

  if (!cap) return;

  const [txn] = await db
    .insert(transactions)
    .values({
      userId: await getSystemUserId(),
      capabilityId: cap.id,
      status: executionError ? "failed" : "completed",
      input: {},
      priceCents: 0,
      transparencyMarker: "algorithmic",
      dataJurisdiction: "EU",
      error: executionError,
      latencyMs: responseTimeMs,
      completedAt: new Date(),
    })
    .returning({ id: transactions.id });

  const outputSchema = (cap.outputSchema ?? {}) as Record<string, unknown>;
  const properties =
    (outputSchema as { properties?: Record<string, unknown> }).properties ?? {};
  const fieldsExpected = Object.keys(properties).length;
  let fieldsReturned = 0;

  if (capResult?.output && typeof capResult.output === "object") {
    const outputObj = capResult.output as Record<string, unknown>;
    for (const key of Object.keys(properties)) {
      if (key in outputObj && outputObj[key] != null) fieldsReturned++;
    }
  }

  const fieldCompletenessPct =
    fieldsExpected > 0 ? (fieldsReturned / fieldsExpected) * 100 : 100;

  await db.insert(transactionQuality).values({
    transactionId: txn.id,
    responseTimeMs,
    schemaConformant: !executionError && fieldsReturned > 0,
    fieldsReturned,
    fieldsExpected,
    fieldCompletenessPct: fieldCompletenessPct.toFixed(2),
    errorType: executionError ? categorizeError(executionError) : null,
    qualityFlags: { source: "internal_test" },
  });
}

// ─── Auto-capture example outputs ────────────────────────────────────────

async function captureExampleOutput(
  capabilitySlug: string,
  output: Record<string, unknown>,
): Promise<void> {
  const db = getDb();

  const [cap] = await db
    .select({
      id: capabilities.id,
      outputSchema: capabilities.outputSchema,
    })
    .from(capabilities)
    .where(eq(capabilities.slug, capabilitySlug))
    .limit(1);

  if (!cap) return;

  const schema = (cap.outputSchema ?? {}) as Record<string, unknown>;
  // Skip if example already exists
  if ((schema as any).example) return;

  // Merge example into existing output_schema
  await db
    .update(capabilities)
    .set({
      outputSchema: { ...schema, example: output },
      updatedAt: new Date(),
    })
    .where(eq(capabilities.id, cap.id));
}

function categorizeError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("timeout") || lower.includes("etimedout"))
    return "upstream_timeout";
  if (lower.includes("rate limit") || lower.includes("429"))
    return "rate_limited";
  if (
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("fetch failed")
  )
    return "upstream_error";
  return "internal_error";
}

// ─── System user for test transactions ──────────────────────────────────────

let _systemUserId: string | null = null;

async function getSystemUserId(): Promise<string> {
  if (_systemUserId) return _systemUserId;

  const db = getDb();
  const { users } = await import("../db/schema.js");

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, "system@strale.internal"))
    .limit(1);

  if (existing) {
    _systemUserId = existing.id;
    return existing.id;
  }

  const crypto = await import("node:crypto");
  const hash = crypto.createHash("sha256").update("system-internal-key").digest("hex");

  const [created] = await db
    .insert(users)
    .values({
      email: "system@strale.internal",
      name: "Strale Internal Test Runner",
      apiKeyHash: hash,
      keyPrefix: "sk_sys_",
    })
    .returning({ id: users.id });

  _systemUserId = created.id;
  return created.id;
}

// ─── Classification helpers ─────────────────────────────────────────────────

async function updateLastClassification(
  suiteId: string,
  classification: { verdict: string; confidence: string; reason: string },
): Promise<void> {
  const db = getDb();
  await db.update(testSuites).set({
    lastClassification: {
      verdict: classification.verdict,
      confidence: classification.confidence,
      reason: classification.reason,
      timestamp: new Date().toISOString(),
    },
    updatedAt: new Date(),
  }).where(eq(testSuites.id, suiteId));
}

// ─── Test execution cost estimation ────────────────────────────────────────────

/**
 * Estimate the actual cost of a test execution in cents.
 * Based on capability type and whether a real API call was made.
 *
 * These are estimates — precise to within ~2x, good enough for cost tracking.
 */
function estimateTestCost(
  capabilityType: string | undefined,
  testMode: string | null,
  responseTimeMs: number,
): number {
  // Fixture and dry-run tests are free
  if (testMode === "fixture") return 0;

  switch (capabilityType) {
    case "deterministic":
      return 0; // No external calls
    case "scraping":
      return 1; // ~€0.01 per Browserless page render
    case "ai_assisted":
      return 1; // ~€0.01 per Haiku call (most use cheapest model)
    case "stable_api":
      // Most API calls are free (government registries, etc.)
      // Paid APIs (Serper, Dilisense) cost ~€0.01-0.02 per call
      return responseTimeMs > 5000 ? 1 : 0; // Long response = likely paid API
    default:
      return 0;
  }
}

// ─── Piggyback count cache ────────────────────────────────────────────────────

const _piggybackCountCache = new Map<string, { count: number; expiresAt: number }>();
const PIGGYBACK_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getPiggybackCountLast30Days(slug: string): Promise<number> {
  const cached = _piggybackCountCache.get(slug);
  if (cached && Date.now() < cached.expiresAt) return cached.count;

  const db = getDb();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const rows = await db.execute(sql`
    SELECT COUNT(*)::integer AS count
    FROM test_results tr
    WHERE tr.capability_slug = ${slug}
      AND tr.test_suite_id IN (
        SELECT id FROM test_suites WHERE test_type = 'piggyback' AND capability_slug = ${slug}
      )
      AND tr.executed_at >= ${thirtyDaysAgo.toISOString()}::timestamptz
  `);
  const count = ((Array.isArray(rows) ? rows : (rows as any)?.rows ?? [])[0] as any)?.count ?? 0;
  _piggybackCountCache.set(slug, { count, expiresAt: Date.now() + PIGGYBACK_CACHE_TTL_MS });
  return count;
}

// ─── Adaptive scheduled execution ────────────────────────────────────────────

const TIER_MINIMUM_MS: Record<string, number> = {
  A: 6 * 60 * 60 * 1000,   // Tier A: max cost ceiling 6h
  B: 24 * 60 * 60 * 1000,  // Tier B: max cost ceiling 24h
  C: 72 * 60 * 60 * 1000,  // Tier C: max cost ceiling 72h
};

const SCHEDULER_CHECK_INTERVAL_MS = 60 * 60 * 1000; // Check once per hour
const HEALTH_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const WEEKLY_SWEEP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // Weekly health sweep

let _schedulerRunning = false;

/**
 * Compute the adaptive test interval for a capability.
 * Formula: max(health_state_interval, tier_minimum)
 * Special cases:
 *   - Probation (< 5 runs): min(6h, tier) — test as fast as tier allows
 *   - SQS < 50: min(6h, tier) — intensify when quality is degraded
 */
async function computeAdaptiveInterval(slug: string, tier: string): Promise<number> {
  const tierMs = TIER_MINIMUM_MS[tier] ?? TIER_MINIMUM_MS.B;
  const sixHoursMs = 6 * 60 * 60 * 1000;

  // Get SQS to check probation and quality degradation
  const dual = await computeDualProfileSQS(slug);

  // Probation: fewer than 5 qualifying runs → test as fast as tier allows
  if (dual.matrix.pending && dual.qp.runs_analyzed < 5) {
    return Math.min(sixHoursMs, tierMs);
  }

  // Score-triggered intensification: SQS < 50 → 6h but respect tier ceiling
  if (!dual.matrix.pending && dual.score < 50) {
    return Math.min(sixHoursMs, tierMs);
  }

  // Piggyback optimization: if enough customer traffic is providing free
  // correctness data, reduce the frequency of expensive scheduled tests.
  // 10+ piggyback results in 30d → extend interval to Tier C minimum (72h).
  // This makes heavily-used capabilities cheaper to test.
  try {
    const piggybackCount = await getPiggybackCountLast30Days(slug);
    if (piggybackCount >= 10) {
      const tierCMs = TIER_MINIMUM_MS.C;
      return Math.max(tierCMs, tierMs);
    }
  } catch {
    // Piggyback lookup failure shouldn't affect scheduling
  }

  // Normal: health-state-driven frequency, bounded by tier minimum
  const testData = await getTestResultsForSlug(slug);
  const healthState = computeHealthState(testData.history_30d);
  const healthMs = HEALTH_STATE_FREQUENCY_HOURS[healthState] * 60 * 60 * 1000;

  return Math.max(healthMs, tierMs);
}

/** Get timestamp of the most recent test result for a capability. */
async function getLastTestRun(slug: string): Promise<Date | null> {
  const db = getDb();
  const [latest] = await db
    .select({ executedAt: testResults.executedAt })
    .from(testResults)
    .where(eq(testResults.capabilitySlug, slug))
    .orderBy(desc(testResults.executedAt))
    .limit(1);
  return latest?.executedAt ?? null;
}

/** Single adaptive scheduler sweep: determine which capabilities are due and run them. */
async function runAdaptiveScheduler(): Promise<void> {
  const db = getDb();

  // Refresh upstream health mapping if stale
  if (isCacheExpired()) {
    await refreshUpstreamMapping().catch(() => {});
  }

  // Get unique capabilities with their schedule tier, excluding quarantined/infra_limited
  const suiteRows = await db
    .select({
      capabilitySlug: testSuites.capabilitySlug,
      scheduleTier: testSuites.scheduleTier,
    })
    .from(testSuites)
    .where(and(
      eq(testSuites.active, true),
      inArray(testSuites.testStatus, ["normal", "env_dependent", "upstream_broken"]),
    ));

  // Deduplicate — use the most permissive (lowest cost) tier per capability
  const tierBySlug = new Map<string, string>();
  for (const row of suiteRows) {
    const existing = tierBySlug.get(row.capabilitySlug);
    // If no existing tier, or current is "better" (A < B < C in cost), prefer A
    if (!existing || row.scheduleTier < existing) {
      tierBySlug.set(row.capabilitySlug, row.scheduleTier);
    }
  }

  const dueSlugs: string[] = [];
  const now = Date.now();

  for (const [slug, tier] of tierBySlug) {
    try {
      const [interval, lastRun] = await Promise.all([
        computeAdaptiveInterval(slug, tier),
        getLastTestRun(slug),
      ]);

      const msSinceLastRun = lastRun ? now - lastRun.getTime() : Infinity;
      if (msSinceLastRun >= interval) {
        dueSlugs.push(slug);
      }
    } catch (err) {
      console.warn(`[scheduler] Skipping ${slug}: interval computation failed:`, err instanceof Error ? err.message : err);
    }
  }

  // Log scheduler diagnostics
  const totalEligible = tierBySlug.size;
  console.log(`[scheduler] ${totalEligible} eligible capabilities, ${dueSlugs.length} due for testing`);

  if (dueSlugs.length === 0) {
    return;
  }

  let passed = 0;
  let failed = 0;

  for (const slug of dueSlugs) {
    try {
      const summary = await runTests({ capabilitySlug: slug });
      passed += summary.passed;
      failed += summary.failed;

        // Collect remediations from this run
        const remediations = summary.results
          .filter((r) => r.remediation)
          .map((r) => r.remediation!);

        if (remediations.length > 0) {
          const runSummary = buildRunSummary(
            summary.passed,
            summary.total,
            remediations,
          );
          console.log(`[self-heal] Run summary:\n${formatRunSummary(runSummary)}`);
        }

        // Still log individual failures for Railway log monitoring
        for (const r of summary.results) {
          if (!r.passed) {
            const tag = r.remediation
              ? `[${r.remediation.outcome}]`
              : "[escalate]";
            console.warn(
              `[test-runner] FAIL ${tag} [${r.capabilitySlug}] ${r.testName} — ${r.failureReason}`,
            );
          }
        }
    } catch (err) {
      console.error(`[scheduler] ${slug} threw:`, err);
    }
    await delay(500);
  }

  console.log(`[scheduler] Sweep done: ${passed} passed, ${failed} failed across ${dueSlugs.length} capabilities`);

  // Write scheduler heartbeat for watchdog monitoring
  logHealthEvent({
    eventType: "scheduler_heartbeat",
    tier: 1,
    actionTaken: `Scheduler sweep completed: ${dueSlugs.length} capabilities tested`,
    details: {
      tested: dueSlugs.length,
      passed,
      failed,
    },
  }).catch(() => {});
}

/**
 * @deprecated Use startTestScheduler() from jobs/test-scheduler.ts instead.
 * This uses setInterval which resets on every deploy — the DB-driven scheduler
 * polls based on last_tested_at and is deploy-resistant.
 */
export function startScheduledTests(): void {
  if (_schedulerRunning) return;
  _schedulerRunning = true;

  console.log("[scheduler] Adaptive scheduler started (hourly checks, health-state-driven frequency)");

  // Repair stale scores 15s after startup — re-persist for capabilities where
  // test_results are newer than capabilities.last_tested_at (indicates a prior
  // persist failure that left scores stale despite successful test runs).
  setTimeout(() => {
    repairStaleScores().catch((err) =>
      console.error("[scheduler] Stale score repair failed:", err),
    );
  }, 15_000);

  // Initial sweep 30s after startup to avoid competing with server init
  setTimeout(() => {
    runAdaptiveScheduler().catch((err) =>
      console.error("[scheduler] Initial sweep failed:", err),
    );
  }, 30_000);

  // Recurring hourly check
  setInterval(() => {
    runAdaptiveScheduler().catch((err) =>
      console.error("[scheduler] Sweep failed:", err),
    );
  }, SCHEDULER_CHECK_INTERVAL_MS);

  // Dependency health checks remain on independent 6h schedule
  const runHealthChecks = async () => {
    try {
      const { runDependencyHealthChecks } = await import("./dependency-health.js");
      const results = await runDependencyHealthChecks();
      const unhealthy = Object.entries(results).filter(([, r]) => !r.healthy);
      if (unhealthy.length > 0) {
        console.warn(
          `[health-check] Unhealthy dependencies: ${unhealthy.map(([name, r]) => `${name} (${r.error ?? "down"})`).join(", ")}`,
        );

        // Note: alerting for critical service failures is handled by the
        // situation assessment pipeline in dependency-health.ts. No direct
        // interrupt email here — the assessment correlates probe history,
        // test results, and customer impact before deciding to alert.
      } else {
        console.log(
          `[health-check] All dependencies healthy: ${Object.entries(results).map(([name, r]) => `${name}=${r.latency_ms}ms`).join(", ")}`,
        );
      }
    } catch (err) {
      console.error("[health-check] Failed:", err);
    }
  };

  setTimeout(runHealthChecks, 60_000); // 1min after startup
  setInterval(runHealthChecks, HEALTH_CHECK_INTERVAL_MS);

  // Chromium/Browserless health probe — 30-min cycle, faster than the 6h
  // dependency check. When Chromium is down, the test runner skips all 52
  // Browserless capabilities to prevent SQS pollution from timeout failures.
  const CHROMIUM_CHECK_INTERVAL_MS = 30 * 60 * 1000;
  const runChromiumProbe = () => {
    probeChromiumHealth().catch((err) =>
      console.error("[chromium-health] Probe error:", err instanceof Error ? err.message : err),
    );
  };
  setTimeout(runChromiumProbe, 45_000); // 45s after startup
  setInterval(runChromiumProbe, CHROMIUM_CHECK_INTERVAL_MS);

  // Weekly health sweep — auto-remediation + quarantine review + health report
  const runSweep = async () => {
    try {
      const { runWeeklyHealthSweep } = await import("./health-sweep.js");
      await runWeeklyHealthSweep();
    } catch (err) {
      console.error("[health-sweep] Weekly sweep failed:", err);
    }
  };

  setTimeout(runSweep, 5 * 60_000); // 5min after startup
  setInterval(runSweep, WEEKLY_SWEEP_INTERVAL_MS);

  // Daily self-healing diagnostic (DEC-20260319-F)
  const DIAGNOSTIC_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const runDiagnosticCheck = async () => {
    try {
      const { runDiagnostic } = await import("../diagnostics/self-heal-check.js");
      const report = await runDiagnostic();

      if (report.failed > 0) {
        console.error(
          `[diagnostic] ${report.passed}/${report.checksRun} passed — ${report.criticalFindings.length} critical finding(s):`,
        );
        for (const f of report.criticalFindings) {
          console.error(`[diagnostic]   ${f}`);
        }
      } else {
        console.log(
          `[diagnostic] ${report.passed}/${report.checksRun} checks passed`,
        );
      }

      if (report.warnings.length > 0) {
        console.warn(`[diagnostic] ${report.warnings.length} warning(s)`);
      }
    } catch (err) {
      console.error("[diagnostic] Failed to run:", err instanceof Error ? err.message : err);
    }
  };

  setTimeout(runDiagnosticCheck, 10 * 60_000); // 10min after startup
  setInterval(runDiagnosticCheck, DIAGNOSTIC_INTERVAL_MS);

  // Daily SQS snapshot — captures scores for historical trend analysis
  // Runs once per day, 2 hours after startup (after daily test batches complete)
  const SNAPSHOT_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const runDailySnapshot = async () => {
    try {
      const { captureDailySnapshots } = await import("./sqs-snapshots.js");
      await captureDailySnapshots();
    } catch (err) {
      console.error("[sqs-snapshot] Daily snapshot failed:", err instanceof Error ? err.message : err);
    }
  };
  setTimeout(runDailySnapshot, 2 * 60 * 60_000); // 2h after startup
  setInterval(runDailySnapshot, SNAPSHOT_INTERVAL_MS);

  // Weekly data retention cleanup — purges old test_results, transaction_quality,
  // health_monitor_events, and sqs_daily_snapshot beyond their retention windows
  const RETENTION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
  const runRetentionCleanup = async () => {
    try {
      const { cleanupOldTestData } = await import("./data-retention.js");
      await cleanupOldTestData();
    } catch (err) {
      console.error("[retention] Cleanup failed:", err instanceof Error ? err.message : err);
    }
  };
  setTimeout(runRetentionCleanup, 3 * 60 * 60_000); // 3h after startup
  setInterval(runRetentionCleanup, RETENTION_INTERVAL_MS);

  // Staleness refresh — re-decays matrix_sqs for untested capabilities every 2h
  const STALE_REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000;
  const runStaleRefresh = async () => {
    try {
      const { refreshStaleScores } = await import("../jobs/refresh-stale-scores.js");
      await refreshStaleScores();
    } catch (err) {
      console.error("[stale-refresh] Failed:", err instanceof Error ? err.message : err);
    }
  };
  setTimeout(runStaleRefresh, 90 * 60_000); // 1.5h after startup
  setInterval(runStaleRefresh, STALE_REFRESH_INTERVAL_MS);

  // Weekly digest — Monday 08:00 CET (07:00 UTC in winter, 06:00 UTC in summer)
  scheduleWeeklyDigest();
}

/**
 * Schedule the weekly health digest to send at Monday 08:00 Europe/Stockholm.
 * Computes the next Monday 08:00 CET and uses setTimeout to fire it,
 * then repeats weekly via setInterval.
 */
export function scheduleWeeklyDigest(): void {
  const msUntilNextMonday0800CET = computeMsUntilNextMonday0800CET();

  console.log(
    `[digest-scheduler] First digest in ${Math.round(msUntilNextMonday0800CET / 3600_000)}h`,
  );

  setTimeout(async () => {
    await runWeeklyDigest();
    // After first fire, repeat exactly every 7 days
    setInterval(runWeeklyDigest, 7 * 24 * 3600_000);
  }, msUntilNextMonday0800CET);
}

async function runWeeklyDigest(): Promise<void> {
  try {
    const { compileWeeklyDigest } = await import("./digest-compiler.js");
    const { formatDigestEmail } = await import("./digest-formatter.js");
    const { sendDigestEmail, isEmailConfigured } = await import("./digest-sender.js");

    if (!isEmailConfigured()) {
      console.warn("[digest-scheduler] RESEND_API_KEY not set — skipping digest send");
      return;
    }

    const data = await compileWeeklyDigest();
    const { html, subject } = formatDigestEmail(data);
    await sendDigestEmail(html, subject);

    console.log(`[digest-scheduler] Weekly digest sent: "${subject}"`);
  } catch (err) {
    console.error("[digest-scheduler] Digest send failed:", err);
  }
}

/**
 * Compute milliseconds until the next Monday 08:00 CET/CEST.
 * Handles CET↔CEST transitions via Europe/Stockholm locale string parsing.
 */
function computeMsUntilNextMonday0800CET(): number {
  const now = new Date();

  // Get current local time components in Stockholm timezone
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Stockholm",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
    hour12: false,
  });

  const parts = fmt.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";

  const year = parseInt(get("year"), 10);
  const month = parseInt(get("month"), 10) - 1; // 0-indexed
  const day = parseInt(get("day"), 10);
  const hour = parseInt(get("hour"), 10);
  const minute = parseInt(get("minute"), 10);

  // Build a local "midnight today" in Stockholm by constructing the ISO string
  // and parsing it as Stockholm-local time
  const todayMidnightUtc = stockholmLocalToUtc(year, month, day, 0, 0);

  // Day of week in Stockholm (0=Sun, 1=Mon...6=Sat)
  const dow = new Date(todayMidnightUtc).getDay();

  // Days until next Monday (0 = today if today is Monday)
  const daysUntilMonday = dow === 1 ? 0 : (8 - dow) % 7;

  let targetMs = stockholmLocalToUtc(year, month, day + daysUntilMonday, 8, 0);

  // If we've already passed Monday 08:00 today (or it's already Monday and past 08:00)
  const currentMinuteMs = stockholmLocalToUtc(year, month, day, hour, minute);
  if (targetMs <= currentMinuteMs) {
    targetMs += 7 * 24 * 3600_000;
  }

  return targetMs - now.getTime();
}

/**
 * Convert Stockholm local time to UTC milliseconds.
 * Works by finding the UTC offset at that approximate time.
 */
function stockholmLocalToUtc(year: number, month: number, day: number, hour: number, minute: number): number {
  // Approximate: construct UTC candidate assuming CET (UTC+1) and refine
  const approxUtcMs = Date.UTC(year, month, day, hour - 1, minute);

  // Find actual Stockholm offset at that time
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Stockholm",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
    hour12: false,
  });

  const parts = fmt.formatToParts(new Date(approxUtcMs));
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);

  const localH = get("hour");
  const localM = get("minute");
  const offsetMins = (hour * 60 + minute) - (localH * 60 + localM);

  return approxUtcMs + offsetMins * 60_000;
}

// ─── Stale score repair ─────────────────────────────────────────────────────
// Detects capabilities where test_results exist more recently than
// capabilities.last_tested_at — indicating a prior persist failure. Re-runs
// persistDualProfileScores for those capabilities to recover their scores.

export async function repairStaleScores(): Promise<void> {
  const db = getDb();

  // Find capabilities where the latest test_result is newer than last_tested_at
  const staleRows = await db.execute(sql`
    SELECT c.slug,
           c.last_tested_at AS cap_tested,
           MAX(tr.executed_at) AS result_tested
    FROM capabilities c
    INNER JOIN test_results tr ON tr.capability_slug = c.slug
    WHERE c.is_active = true
    GROUP BY c.slug, c.last_tested_at
    HAVING MAX(tr.executed_at) > COALESCE(c.last_tested_at, '1970-01-01'::timestamptz) + INTERVAL '1 hour'
    ORDER BY MAX(tr.executed_at) - COALESCE(c.last_tested_at, '1970-01-01'::timestamptz) DESC
    LIMIT 50
  `);

  const rows = (Array.isArray(staleRows) ? staleRows : (staleRows as any)?.rows ?? []) as Array<{
    slug: string;
    cap_tested: Date | null;
    result_tested: Date;
  }>;

  if (rows.length === 0) {
    console.log("[stale-repair] No stale scores detected — all capabilities up to date");
    return;
  }

  const slugs = rows.map((r) => r.slug);
  console.log(`[stale-repair] Found ${slugs.length} capabilities with stale scores — re-persisting: ${slugs.join(", ")}`);

  await persistDualProfileScores(slugs);

  console.log("[stale-repair] Repair complete");
}

// ─── Dual-profile score persistence ──────────────────────────────────────────

export async function persistDualProfileScores(slugs: string[]): Promise<void> {
  if (slugs.length === 0) return;

  const db = getDb();

  // Tier-to-hours mapping
  const TIER_HOURS: Record<string, number> = { A: 6, B: 24, C: 72 };

  let persisted = 0;
  let skippedPending = 0;
  let failed = 0;

  for (const slug of slugs) {
    try {
      const dual = await computeDualProfileSQS(slug);
      if (dual.matrix.pending) {
        skippedPending++;
        continue;
      }

      // Look up capability metadata for guidance computation
      const [cap] = await db
        .select({
          priceCents: capabilities.priceCents,
          capabilityType: capabilities.capabilityType,
          dataSource: capabilities.dataSource,
        })
        .from(capabilities)
        .where(eq(capabilities.slug, slug))
        .limit(1);

      // Get last test time for this capability
      const [lastTest] = await db
        .select({ executedAt: testResults.executedAt })
        .from(testResults)
        .where(eq(testResults.capabilitySlug, slug))
        .orderBy(desc(testResults.executedAt))
        .limit(1);

      // Look up effective schedule tier (most frequent active suite)
      const [suiteRow] = await db
        .select({ scheduleTier: testSuites.scheduleTier })
        .from(testSuites)
        .where(and(eq(testSuites.capabilitySlug, slug), eq(testSuites.active, true)))
        .orderBy(testSuites.scheduleTier) // A < B < C — picks most frequent
        .limit(1);
      const scheduleTierHours = TIER_HOURS[suiteRow?.scheduleTier ?? "B"] ?? 24;

      // Compute freshness decay
      const freshness = computeFreshnessDecay(
        lastTest?.executedAt ?? null,
        scheduleTierHours,
      );
      const rawMatrixSqs = dual.matrix.score;
      const decayedMatrixSqs = dual.matrix.pending
        ? rawMatrixSqs
        : applyFreshnessDecay(rawMatrixSqs, freshness);

      const capType = (cap?.capabilityType as CapabilityType) ?? "stable_api";
      const rpAvailRate = dual.rp.factors.current_availability.score;
      const hasExtFailures = rpAvailRate < 90;

      // Override trend to "stale" when freshness warrants it
      const effectiveTrend = shouldOverrideTrend(freshness) ? "stale" as const : dual.rp.trend;

      const guidanceInput: ComputeGuidanceInput = {
        slug,
        qpGrade: dual.qp.grade === "pending" ? "F" : dual.qp.grade,
        rpGrade: dual.rp.grade === "pending" ? "F" : dual.rp.grade,
        rpScore: dual.rp.score,
        rpTrend: effectiveTrend === "stale" ? "declining" : dual.rp.trend,
        rpAvailabilityRate: rpAvailRate,
        matrixSqs: decayedMatrixSqs,
        capabilityType: capType,
        testScheduleHours: scheduleTierHours,
        lastTestedAt: lastTest?.executedAt?.toISOString() ?? null,
        priceCents: cap?.priceCents ?? 0,
        dataSource: cap?.dataSource ?? null,
        hasExternalFailures: hasExtFailures,
      };

      let guidance = await computeExecutionGuidance(guidanceInput);

      // Apply freshness overrides to execution guidance
      if (freshness.staleness_level === "expired" || freshness.staleness_level === "unverified") {
        const daysSinceTested = lastTest?.executedAt
          ? Math.round((Date.now() - lastTest.executedAt.getTime()) / 86400_000)
          : null;
        guidance = {
          ...guidance,
          usable: false,
          strategy: "unavailable",
          confidence_after_strategy: 0,
          context: daysSinceTested != null
            ? `Capability has not been tested in ${daysSinceTested} days. Quality cannot be verified.`
            : "Capability has never been tested. Quality cannot be verified.",
        };
      } else if (freshness.staleness_level === "stale") {
        guidance = {
          ...guidance,
          confidence_after_strategy: Math.round(guidance.confidence_after_strategy * 0.5),
          strategy: guidance.strategy === "direct" ? "retry_with_backoff" : guidance.strategy,
        };
      }

      const now = new Date();
      await db
        .update(capabilities)
        .set({
          qpScore: dual.qp.pending ? null : String(dual.qp.score),
          rpScore: dual.rp.pending ? null : String(dual.rp.score),
          matrixSqs: dual.matrix.pending ? null : String(decayedMatrixSqs),
          matrixSqsRaw: dual.matrix.pending ? null : String(rawMatrixSqs),
          trend: effectiveTrend,
          freshnessLevel: freshness.staleness_level,
          lastTestedAt: lastTest?.executedAt ?? null,
          freshnessDecayedAt: now,
          guidanceUsable: guidance.usable,
          guidanceStrategy: guidance.strategy,
          guidanceConfidence: String(guidance.confidence_after_strategy),
          updatedAt: now,
        })
        .where(eq(capabilities.slug, slug));

      persisted++;
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[dual-profile] PERSIST FAILED for ${slug}: ${msg}`);
      // Log to health events for visibility (do not swallow silently)
      logHealthEvent({
        eventType: "persist_failure",
        capabilitySlug: slug,
        tier: 1,
        actionTaken: `persistDualProfileScores failed: ${msg}`,
        details: { slug, error: msg },
      }).catch(() => {});
    }
  }

  if (slugs.length > 0) {
    console.log(`[dual-profile] Persist complete: ${persisted} updated, ${skippedPending} pending, ${failed} failed (of ${slugs.length} total)`);
  }
}
