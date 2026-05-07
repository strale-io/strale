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
// SQS engine and execution-guidance retired (DEC-20260503-B).
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
// Lifecycle automatic evaluation removed (DEC-20260503-B).
import { logHealthEvent } from "./health-monitor.js";
import { checkNewFailures, checkInfrastructureHealth } from "./meta-monitoring.js";
// reliability-profile, freshness-decay deleted with the SQS engine (DEC-20260503-B).
import { withRetry } from "./retry.js";
import { fireAndForget } from "./fire-and-forget.js";
import { log, logError, logWarn } from "./log.js";
import { createHash } from "node:crypto";
import { calculateNullFieldRatio } from "./null-field-ratio.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeOutputHash(output: unknown): string | null {
  if (output == null) return null;
  return createHash("sha256").update(JSON.stringify(output)).digest("hex");
}

/**
 * Decide whether a test result should feed `recordTestEvidence` (positive
 * health signal to the circuit breaker).
 *
 * Only known_answer tests with a real successful execution count. edge_case
 * is excluded because `validateResult` treats any thrown error as edge_case
 * "passed" — that's a non-signal, not evidence of health. The
 * `executionError === null` guard is defensive against future validateResult
 * quirks that might mark known_answer passed despite a thrown error.
 *
 * Phase 3 Harden Fix A. See `docs/research/2026-05-07-dk-phase2-understand.md`
 * (in branch `investigation/dk-phase-2-understand`) for the false-recovery
 * incident this gate prevents.
 */
export function shouldRecordTestEvidence(
  passed: boolean,
  testType: string,
  executionError: string | null,
): boolean {
  return passed && testType === "known_answer" && executionError === null;
}

/**
 * Decide whether a failed test should feed `recordFailure` (negative health
 * signal to the circuit breaker).
 *
 * Fires only on:
 *   - testType in {known_answer, dependency_health} — these probe upstream
 *     reachability + correctness. Other types (negative/edge_case/regression/
 *     schema_check/known_bad/piggyback) either reflect test design or do not
 *     prove upstream health.
 *   - verdict in {upstream_transient, unknown} — upstream-side failures
 *     and uncategorized failures (which empirically are usually upstream
 *     issues the categorizer hasn't pattern-matched yet, e.g., the DK CVR
 *     quota error). Suppressed: capability_bug, test_design,
 *     test_infrastructure, stale_input, upstream_changed, upstream_degraded.
 *
 * Throttling to one recordFailure per slug per runTests invocation is the
 * caller's responsibility (strategy b — bounded blast radius on first
 * deploy). See the call site in runSingleTest for the Set-backed throttle.
 *
 * Phase 3 Harden Fix B. Wires test-runner failures into the operational
 * substrate (capability_health). Without this, real upstream failures are
 * invisible to the breaker until a customer call arrives at /v1/do — a
 * pathway that doesn't fire for low-traffic capabilities like
 * danish-company-data (no /v1/do traffic since 2026-04-10 yet 30+ hours
 * of continuous test failures).
 */
export function shouldRecordFailureFromTest(
  passed: boolean,
  testType: string,
  verdict: string,
): boolean {
  if (passed) return false;
  if (testType !== "known_answer" && testType !== "dependency_health") return false;
  return verdict === "upstream_transient" || verdict === "unknown";
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
  testType?: string;
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
  if (opts.testType) {
    conditions.push(eq(testSuites.testType, opts.testType));
  }

  // T-1: Inner join with capabilities to skip deactivated/suspended capabilities.
  // Suspended caps are intentionally offline — testing them wastes resources.
  // Draft and validating caps ARE tested (they need runs for auto-promotion).
  const suitesRaw = await db
    .select({ suite: testSuites, fieldReliability: capabilities.outputFieldReliability, capabilityType: capabilities.capabilityType, outputSchema: capabilities.outputSchema })
    .from(testSuites)
    .innerJoin(capabilities, eq(testSuites.capabilitySlug, capabilities.slug))
    .where(and(
      ...conditions,
      eq(capabilities.isActive, true),
      not(inArray(capabilities.lifecycleState, ["suspended", "deactivated"])),
    ));
  const suites = suitesRaw.map((r) => r.suite);

  // Build field reliability map for validateResult
  const fieldReliabilityMap = new Map<string, Record<string, string>>();
  // Build capability type map for failure classification
  const capabilityTypeMap = new Map<string, string>();
  // Build output schema map for null-ratio check (Gate 2)
  const outputSchemaMap = new Map<string, Record<string, unknown>>();
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
    if (row.outputSchema && !outputSchemaMap.has(row.suite.capabilitySlug)) {
      outputSchemaMap.set(row.suite.capabilitySlug, row.outputSchema as Record<string, unknown>);
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

  // Phase 3 Harden Fix B — strategy (b) self-throttle: at most one
  // recordFailure invocation per slug per runTests invocation. With the
  // in-process scheduler's hourly per-cap cadence, a chronically-failing
  // capability takes ~3 cron ticks (~3h) to trip from the test-driven path,
  // bounding the blast radius on first deploy. See the audit summary in the
  // PR body and docs/research/2026-05-07-dk-phase2-understand.md (branch
  // investigation/dk-phase-2-understand) for the strategy choice.
  const recordFailureFiredForSlugs = new Set<string>();

  for (let i = 0; i < suites.length; i++) {
    const suite = suites[i];

    // Skip capabilities whose required credentials are missing
    if (unconfiguredSlugs.has(suite.capabilitySlug)) {
      log.info(
        { label: "test-runner-skip-unconfigured", capability_slug: suite.capabilitySlug },
        "test-runner-skip-unconfigured",
      );
      continue;
    }

    // Skip capabilities whose upstream dependency is unhealthy
    // (prevents timeout failures from polluting the SQS window)
    const unhealthyUpstream = findUnhealthyUpstream(suite.capabilitySlug);
    if (unhealthyUpstream) {
      log.info(
        { label: "test-runner-skip-unhealthy-upstream", capability_slug: suite.capabilitySlug, upstream: unhealthyUpstream },
        "test-runner-skip-unhealthy-upstream",
      );
      continue;
    }

    const result = await runSingleTest(
      suite,
      fieldReliabilityMap,
      capabilityTypeMap,
      outputSchemaMap,
      recordFailureFiredForSlugs,
    );

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
          log.info(
            { label: "self-heal-auto-resolved", capability_slug: suite.capabilitySlug, action: remediation.action },
            "self-heal-auto-resolved",
          );
        } else if (remediation.outcome === "monitoring") {
          log.info(
            { label: "self-heal-monitoring", capability_slug: suite.capabilitySlug, action: remediation.action },
            "self-heal-monitoring",
          );
        } else {
          logWarn("self-heal-escalate", "self-heal outcome requires escalation", {
            capability_slug: suite.capabilitySlug,
            action: remediation.action,
          });
        }
      } catch (healErr) {
        logError("self-heal-threw", healErr, { capability_slug: suite.capabilitySlug });
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
              log.info(
                { label: "auto-remediation-applied", capability_slug: suite.capabilitySlug, description: action.description, rule: action.rule },
                "auto-remediation-applied",
              );
              fireAndForget(
                () =>
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
                  }),
                { label: "health-event-log", context: { slug: suite.capabilitySlug, event: "auto_remediation" } },
              );
            }
          }
        }
      } catch (autoErr) {
        logError("auto-remediation-analysis-threw", autoErr, { capability_slug: suite.capabilitySlug });
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

  // SQS persistence retired (DEC-20260503-B). The substrate (last_tested_at,
  // failure classification, test_results history) lives on test_suites and
  // test_results; routing engines compute their own freshness signals when
  // they need them.
  // Update last_tested_at on capabilities we just touched.
  const affectedSlugs = [...new Set(results.map((r) => r.capabilitySlug))];
  if (affectedSlugs.length > 0) {
    await db
      .update(capabilities)
      .set({ lastTestedAt: new Date(), updatedAt: new Date() })
      .where(inArray(capabilities.slug, affectedSlugs));
  }

  // ── Check upstream escalation for capabilities with failures ──────────
  const failedSlugs = [...new Set(results.filter((r) => !r.passed).map((r) => r.capabilitySlug))];
  for (const slug of failedSlugs) {
    try {
      await checkUpstreamEscalation(slug);
    } catch (err) {
      logWarn("test-runner-upstream-escalation-failed", "upstream escalation check failed", {
        capability_slug: slug,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Lifecycle automatic transitions removed (DEC-20260503-B).
  // `affectedSlugs` is no longer evaluated here; manual flips only.

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
      logError("situation-mass-failure-assessment-failed", err);
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
        logWarn("meta-new-failures", check.details);
      }
    }).catch((err) => {
      logError("meta-check-new-failures-failed", err);
    });

    // Check 2: Infrastructure health (systemic failures)
    checkInfrastructureHealth(batchForMeta).then((check) => {
      if (!check.passed) {
        logError("meta-infrastructure-critical", new Error(check.details));
      }
    }).catch((err) => {
      logError("meta-check-infrastructure-failed", err);
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
  outputSchemaMap?: Map<string, Record<string, unknown>>,
  recordFailureFiredForSlugs?: Set<string>,
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
    return runFixtureTest(suite, fieldReliabilityMap, outputSchemaMap);
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
  const outputSchema = outputSchemaMap?.get(suite.capabilitySlug) ?? null;
  const { passed, failureReason } = validateResult(
    suite,
    capResult,
    executionError,
    reliability,
    outputSchema,
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
    fireAndForget(
      () =>
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
        }),
      { label: "health-event-log", context: { slug: suite.capabilitySlug, event: "classification" } },
    );

    // Phase 3 Harden Fix B — feed test failures into the circuit breaker.
    // Throttled to one recordFailure per slug per runTests invocation so a
    // backlog of chronically-failing capabilities doesn't cascade-trip on
    // the first cron tick after deploy (strategy (b) per audit step (f)).
    if (
      shouldRecordFailureFromTest(passed, suite.testType, classification.verdict)
      && !recordFailureFiredForSlugs?.has(suite.capabilitySlug)
    ) {
      recordFailureFiredForSlugs?.add(suite.capabilitySlug);
      fireAndForget(
        async () => {
          const { recordFailure } = await import("./circuit-breaker.js");
          return recordFailure(suite.capabilitySlug, failureReason ?? undefined);
        },
        {
          label: "circuit-breaker-record-failure-from-test",
          context: { slug: suite.capabilitySlug, verdict: classification.verdict },
        },
      );
    }
  } else if (shouldRecordTestEvidence(passed, suite.testType, executionError)) {
    // Test passed with real execution — feed evidence to circuit breaker.
    fireAndForget(
      async () => {
        const { recordTestEvidence } = await import("./circuit-breaker.js");
        return recordTestEvidence(suite.capabilitySlug);
      },
      { label: "circuit-breaker-test-evidence", context: { slug: suite.capabilitySlug } },
    );
  }

  if (!classification && suite.lastClassification) {
    // Test passed — clear last_classification (indicates recovery)
    await db.update(testSuites).set({
      lastClassification: null,
      updatedAt: new Date(),
    }).where(eq(testSuites.id, suite.id));
  }

  // Record quality data for this test execution (fire-and-forget)
  fireAndForget(
    () => recordTestQuality(suite.capabilitySlug, capResult, executionError, responseTimeMs),
    { label: "test-quality-record", context: { slug: suite.capabilitySlug } },
  );

  // Auto-capture example output + baseline from first successful test
  if (passed && capResult?.output) {
    fireAndForget(
      () => captureExampleOutput(suite.capabilitySlug, capResult.output),
      { label: "example-output-capture", context: { slug: suite.capabilitySlug } },
    );
    fireAndForget(
      () => captureBaseline(suite, capResult.output),
      { label: "baseline-capture", context: { slug: suite.capabilitySlug } },
    );
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
  outputSchemaMap?: Map<string, Record<string, unknown>>,
): Promise<SingleTestResult> {
  const db = getDb();
  const baselineOutput = suite.baselineOutput as Record<string, unknown>;

  // Validate baseline against current validation rules
  const reliability = fieldReliabilityMap?.get(suite.capabilitySlug) ?? null;
  const mockResult: CapabilityResult = {
    output: baselineOutput,
    provenance: { source: "fixture", fetched_at: new Date().toISOString() },
  };
  const fixtureOutputSchema = outputSchemaMap?.get(suite.capabilitySlug) ?? null;
  const { passed, failureReason } = validateResult(suite, mockResult, null, reliability, fixtureOutputSchema);

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

// Gate 2: Null-output correctness tier (DEC-20260409-A)
// Feature flag — defaults to disabled; enable with NULL_RATIO_RULE_ENABLED=true
const NULL_RATIO_RULE_ENABLED = process.env.NULL_RATIO_RULE_ENABLED === "true";

function validateResult(
  suite: typeof testSuites.$inferSelect,
  capResult: CapabilityResult | null,
  executionError: string | null,
  fieldReliability?: Record<string, string> | null,
  outputSchema?: Record<string, unknown> | null,
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

  // Gate 2: Null-ratio check (DEC-20260409-A)
  // After structural checks pass, verify that the output isn't mostly empty.
  // Only applies to known_answer tests (correctness tier) with 3+ declared fields.
  if (
    (suite.testType === "known_answer" || suite.testType === "schema_check") &&
    capResult &&
    outputSchema
  ) {
    const nullRatio = calculateNullFieldRatio(
      capResult.output as Record<string, unknown>,
      outputSchema as { properties?: Record<string, unknown> },
      fieldReliability,
    );

    if (nullRatio.wouldFail) {
      const pct = Math.round(nullRatio.ratio * 100);
      const reason = `high_null_ratio: ${pct}% of declared fields returned null (${nullRatio.nullCount}/${nullRatio.totalFields}). Null fields: ${nullRatio.nullFields.join(", ")}`;

      if (NULL_RATIO_RULE_ENABLED) {
        return { passed: false, failureReason: reason };
      }
      // Shadow mode: log but don't fail
      logWarn("null-ratio-shadow-would-fail", reason, { capability_slug: suite.capabilitySlug });
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


// ─── Removed ────────────────────────────────────────────────────────────────
// `computeAdaptiveInterval`, `getLastTestRun`, `runAdaptiveScheduler`,
// `startScheduledTests`, `repairStaleScores`, and `persistDualProfileScores`
// were retired with the SQS engine (DEC-20260503-B). The live test scheduler
// is `startTestScheduler` in jobs/test-scheduler.ts (DB-driven, hourly
// free-only, deploy-resistant).
