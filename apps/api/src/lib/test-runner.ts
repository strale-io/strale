import { eq, and, not, sql, desc, inArray } from "drizzle-orm";
import { deployCommitOrNull } from "./receipt/deploy-identity.js";
import { settleExecutionReceipt } from "./receipt/settle.js";
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
import {
  assertGuardedAllow,
  CapabilityInvocationRefusedError,
  CapabilityNotClassifiedError,
  BudgetExhaustedError,
  isBudgetExhausted,
} from "../capabilities/guarded-executor.js";
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
// chromium-health.ts's isChromiumHealthy/isBrowserlessCapability/
// probeChromiumHealth used to be imported here but had zero call sites in
// this file (2026-08-18 finding) — the Browserless-outage skip below is
// findUnhealthyUpstream(), not anything from chromium-health.ts. See
// chromium-health.ts's header comment for the full account of why that
// module's test-runner-facing exports were removed instead of wired in.
import { findUnhealthyUpstream } from "./upstream-health-gate.js";
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
  /**
   * Scope execution to exactly one test_suites row (by id). Additive to
   * capabilitySlug/testType, not a replacement for them — existing callers
   * that omit it keep loading every active suite matching (capabilitySlug,
   * testType) exactly as before.
   *
   * Added for the scheduler's per-suite batch entries (Codex review,
   * 2026-08-18): findOverdueSuites() emits one row per due SUITE, but
   * runTests({capabilitySlug, testType}) without this field reloads and
   * re-executes EVERY active suite sharing that (slug, testType) pair.
   * With N same-type suites, a batch of N due rows produced N x N
   * executions per cadence (danish-company-data's 4 duplicate
   * known_answer suites: 4 batch entries x 4 suites reloaded each = 16
   * attempts against a 100/day budget). PR #318's isBudgetExhausted
   * re-checks stopped the redundant calls from writing failed
   * test_results rows once the budget ran out, but did nothing to stop
   * the redundant *executions* themselves before that point — this field
   * is the actual fix: the scheduler now passes the specific overdue
   * suite's id, so one batch entry runs exactly its own suite.
   *
   * Fail-closed, not fail-open (Codex closing-pass HIGH, 2026-08-18): when
   * this key is present (`!== undefined`), its value MUST be a non-empty
   * string or runTests() throws. A falsy value silently ignored here would
   * widen scope back to every suite matching (capabilitySlug, testType) —
   * the exact bug this field exists to close — so "present but malformed"
   * fails loudly instead of degrading into the old quadratic behavior.
   */
  suiteId?: string;
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
  /**
   * The verdict already written to `test_results.failure_classification`,
   * carried back to the caller so post-run meta-monitoring can group by cause.
   *
   * Added 2026-08-19. Every consumer read it as `(r as any).failureClassification`
   * against an interface that never declared it, so it was `undefined` at every
   * call site: `checkInfrastructureHealth` bucketed 14 of 14 production
   * infrastructure alerts as `{"unknown": 6}` and the mass-failure
   * situation assessment always reported `commonClassification: "unknown"`.
   * The cast silenced the type error that would have caught this.
   */
  failureClassification?: string | null;
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
  // Codex closing-pass HIGH: `if (opts.suiteId)` was fail-open — a falsy
  // suiteId (null, "", or undefined-by-bug) from the scheduler silently
  // dropped the id predicate and widened execution back to every suite
  // matching (capabilitySlug, testType), which is the exact quadratic
  // failure this parameter exists to close. The scheduler's OverdueSuite
  // rows come off a raw `any`-typed SQL result (test-scheduler.ts's
  // findOverdueSuites), so a NULL `suiteId` column reaching here would be
  // typed as `string` by TypeScript but actually be `null` at runtime —
  // exactly the class of bug this closes against. suiteId presence is
  // detected by `!== undefined` (the scheduler ALWAYS supplies it; every
  // other caller never passes the key at all, so it stays genuinely
  // undefined for them and the field remains optional/backward-compatible)
  // — once present, it must be a non-empty string or this throws instead
  // of silently widening scope.
  if (opts.suiteId !== undefined) {
    if (typeof opts.suiteId !== "string" || opts.suiteId.length === 0) {
      throw new Error(
        `runTests: suiteId was supplied but is not a non-empty string (got ${JSON.stringify(opts.suiteId)}). ` +
          "A falsy/malformed suiteId must never silently widen execution back to every suite matching " +
          "(capabilitySlug, testType) — that is the exact N x N quadratic failure this parameter exists " +
          "to close. test-scheduler.ts always supplies a real suite id from findOverdueSuites; a falsy " +
          "value reaching here means the caller has a bug and must fail loudly, not silently widen scope.",
      );
    }
    conditions.push(eq(testSuites.id, opts.suiteId));
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

    // Skip capabilities whose upstream dependency is unhealthy (prevents
    // timeout failures from polluting the test window). findUnhealthyUpstream
    // is a synchronous Map read today and shouldn't throw, but this is the
    // gate a Browserless-platform outage flows through — fail OPEN (run the
    // suite) rather than let an unexpected error here silently abort the
    // rest of the batch.
    let unhealthyUpstream: string | null = null;
    try {
      unhealthyUpstream = findUnhealthyUpstream(suite.capabilitySlug);
    } catch (err) {
      logWarn("test-runner-upstream-check-failed", "upstream health check threw; failing open", {
        capability_slug: suite.capabilitySlug,
        err: err instanceof Error ? err.message : String(err),
      });
    }
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
    );

    // Phase-4 tail fix (HIGH-1, 2026-08-17 review): runSingleTest returns
    // null when it hit a per-suite budget-exhaustion skip (see its own
    // comment for why the once-per-batch scheduler check isn't enough —
    // this call can carry several suites for the same capability). No
    // test_results row was written; nothing to push, no self-heal to run.
    if (result === null) continue;

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
      if (!r.passed && r.failureClassification) {
        const c = String(r.failureClassification);
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
      failureClassification: r.failureClassification,
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
): Promise<SingleTestResult | null> {
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
  //
  // A baseline captured BEFORE the suite was last edited describes an input
  // that is no longer the one under test, so replaying it answers a question
  // nobody asked. Because `captureBaseline` refuses to overwrite an existing
  // baseline, that state is permanent: the executor is never called again and
  // the verdict never changes. Measured 2026-08-17 — six capabilities had been
  // failing continuously since 2026-03-20 on baselines captured 2026-03-13/19
  // with a different suite's input, 81 runs each without one live execution.
  // `iso-country-lookup`'s known-answer suite stores `{"query":"Sweden"}` and
  // every recorded result echoed `"land"`.
  // Staleness has two independent axes (Codex review, 2026-08-18 — HIGH-1):
  // edit-invalidation (suite input changed since capture — see above) and
  // max-age (the baseline just got old, regardless of edits). See
  // `checkBaselineStaleness`'s doc comment for the full rationale, including
  // why the age axis reads `fixture_last_refreshed` and not `updated_at`.
  const staleness = checkBaselineStaleness(suite);
  if (suite.testMode === "fixture" && suite.baselineOutput && !staleness.stale) {
    return runFixtureTest(suite, fieldReliabilityMap, outputSchemaMap);
  }

  // Stale baseline on a suite we cannot re-run for free: do not guess. Report
  // it as an instrument problem under its own name rather than manufacturing a
  // pass or a failure about the capability — the same rule the correctness
  // invariant learned on 2026-08-17.
  //
  // EXCEPTION (HIGH-1): `max_age_exceeded` never routes here, even for a
  // paid suite. Edit-invalidation is a suite-authoring accident — refusing
  // and asking a human is correct, because we don't know whether the new
  // input is even valid. Max-age is a deliberate, designed, bounded refresh
  // cycle (one live call per suite per 30 days) — the whole point of adding
  // it was to make that periodic spend automatic, not to gate it behind a
  // human every time. See browserless-suite-migration.ts's projection table
  // for the accepted monthly cost this represents.
  if (
    suite.testMode === "fixture" &&
    suite.baselineOutput &&
    staleness.reason !== "max_age_exceeded" &&
    (suite.externalCostCents ?? 0) > 0
  ) {
    return recordStaleFixture(suite);
  }

  // Quarantined after MAX_FIXTURE_RECAPTURE_FAILURES consecutive failed
  // recapture attempts (Codex closing-pass review, round 2 — "unbounded
  // recapture" re-verification): refuse to attempt another live call at
  // all, rather than merely dispatching less often. Before this gate,
  // reaching MAX_FIXTURE_RECAPTURE_FAILURES only slowed the retry cadence
  // to the scheduler's 168h quarantine floor (minRetestIntervalHours) — a
  // real reduction, but not termination; a direct runTests({suiteId}) call
  // (admin trigger, manual re-run) would still reach the executor with no
  // cap at all. This gate makes the cap airtight at the one chokepoint
  // every execution path shares: any test_mode='fixture' suite whose
  // quarantine reason carries the FIXTURE_RECAPTURE_QUARANTINE_MARKER
  // refuses here, unconditionally, until a human resets test_status (the
  // reason string says so explicitly). Scoped to THIS specific quarantine
  // cause via the marker prefix — not a blanket "any quarantined fixture
  // suite refuses" — so it doesn't change behavior for suites quarantined
  // by unrelated mechanisms (health-sweep's own escalation, upstream
  // breakage) that still want their normal weekly live probe to detect
  // recovery.
  //
  // Recovery interaction: health-sweep.ts's checkQuarantineRecovery
  // requires 3 consecutive PASSING results in the trailing 7 days to
  // release quarantine. Every refusal recorded here is `passed: false`,
  // so it can never manufacture a false recovery — but it also means
  // recovery can never happen automatically for this specific cause: a
  // human must actually intervene (reset the suite, its baseline, or the
  // underlying issue AND clear test_status) to get a passing result again.
  // That is the intended, not accidental, consequence of "needs human".
  // Round 3 correction: round 2's tests asserted "exactly 3" executor
  // calls. The actual property this gate exists to guarantee is BOUNDED —
  // a permanently-failing recapture stops consuming Browserless calls
  // after a finite, small number of attempts (MAX_FIXTURE_RECAPTURE_FAILURES
  // real attempts, up to ×2 raw calls each when withRetry's single retry
  // fires) and ZERO after that. The precise count is incidental; unbounded
  // is the only unacceptable outcome. See recordFixtureRecaptureFailure's
  // doc comment below for the accepted (documented, not locked) concurrency
  // window on the counter itself.
  if (
    suite.testMode === "fixture" &&
    suite.testStatus === "quarantined" &&
    suite.quarantineReason?.startsWith(FIXTURE_RECAPTURE_QUARANTINE_MARKER)
  ) {
    return recordQuarantinedRecaptureRefusal(suite);
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

    // Fixture recapture failure tracking (HIGH-2b + round-2 gap fix): this
    // early return used to bypass the failure-tracking block near the end
    // of the "real execution" path entirely — a fixture-mode suite whose
    // executor is missing would retry forever with zero cap, the one gap
    // in "increments on EVERY failed recapture attempt". getExecutor()
    // failures are rare (a genuine registration bug, not a real runtime
    // scenario for the 12 target capabilities — all have registered
    // executors), but the cap must be airtight regardless of cause.
    if (suite.testMode === "fixture") {
      await recordFixtureRecaptureFailure(suite).catch((err) =>
        logError("fixture-recapture-failure-tracking-failed", err, {
          capability_slug: suite.capabilitySlug,
        }),
      );
    }

    return {
      testName: suite.testName,
      testType: suite.testType,
      capabilitySlug: suite.capabilitySlug,
      passed: false,
      failureReason,
      responseTimeMs: 0,
      failureClassification: classification.verdict,
    };
  }

  // Phase-4 tail fix (HIGH-1, 2026-08-17 review): re-check the live budget
  // counter per suite, immediately before the call that would otherwise
  // run straight into assertBudgetAvailable's BudgetExhaustedError.
  //
  // test-scheduler.ts's shouldSkipForBudget is a once-per-BATCH pre-check
  // (before calling runTests()) — not enough on its own, because a single
  // runTests({capabilitySlug, testType}) call reloads ALL suites matching
  // that (slug, testType) pair, and this per-suite loop then runs them
  // sequentially. danish-company-data has 4 duplicate known_answer test
  // suites; a single runTests() call for it ran all 4 in one pass — the
  // scheduler's outer check saw "budget available" once, the first 2
  // suites here spent it, and the other 2 used to run straight into
  // BudgetExhaustedError anyway, each writing a FAILED test_results row.
  // This is the check that actually closes the gap; the scheduler's
  // pre-check stays as a cheap early-out that avoids the runTests() call
  // (and its DB query + per-suite loop startup) entirely when the whole
  // batch is already known to be spent.
  if (await isBudgetExhausted(suite.capabilitySlug)) {
    log.info(
      {
        label: "test-runner-skip-budget-exhausted",
        capability_slug: suite.capabilitySlug,
        test_suite_id: suite.id,
        test_type: suite.testType,
      },
      "test-runner-skip-budget-exhausted",
    );
    return null;
  }

  let capResult: CapabilityResult | null = null;
  let executionError: string | null = null;
  let responseTimeMs: number;

  // Skip retry for deterministic capabilities (no external calls — failure is permanent)
  const capType = capabilityTypeMap?.get(suite.capabilitySlug);
  const shouldRetry = capType !== "deterministic";

  // Phase A0b dispatcher gate. Scheduler-driven test execution runs under
  // internal_test context — paid_prepaid / paid_subscription / unclassified
  // capabilities will refuse here and free_quota / paid_with_free_tier
  // capabilities will go through a budget reservation before the executor.
  try {
    await assertGuardedAllow(suite.capabilitySlug, {
      kind: "internal_test",
      suiteId: suite.id,
      reason: "scheduled",
    });
  } catch (err) {
    if (
      err instanceof CapabilityInvocationRefusedError ||
      err instanceof CapabilityNotClassifiedError ||
      err instanceof BudgetExhaustedError
    ) {
      executionError = err.message;
      responseTimeMs = 0;
      // Fall through to validateResult; null capResult + executionError
      // yields a failed result row with the gate's reason as failure_reason.
    } else {
      throw err;
    }
  }

  if (!executionError) {
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
  } else {
    responseTimeMs = 0;
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

    // Phase 3 Harden Fix B — feeding test failures into the circuit breaker
    // — is deliberately NOT wired here. The original PR routed a failing
    // known_answer/dependency_health suite with an unknown/upstream_transient
    // verdict into recordFailure, throttled to one call per slug per run.
    //
    // The throttle bounds a single tick, not successive ones: three
    // consecutive hourly ticks still open the breaker. Measured against
    // production, that would have suspended 32 capabilities in a week — and
    // most of them are healthy for customers. vat-validate succeeded on 7 of
    // 7 real calls while failing tests because a member state's tax authority
    // was down; weather-lookup succeeded on 35 of 37 while failing on an
    // Open-Meteo 429 our own scheduler provoked.
    //
    // The breaker is a customer-facing, immediate actuator and should be
    // driven by customer traffic. Test signal already has one built for it —
    // the quality floor (DEC-20260812-A), with a >=10-real-call minimum,
    // thresholds, dry-run and reversibility. Route it there instead.
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

  // Fixture recapture failure tracking (Codex review 2026-08-18 — HIGH-2b).
  // A test_mode='fixture' suite only ever reaches this "real execution"
  // branch because its baseline was missing or stale (see the two guards
  // above) — so every arrival here is an attempted recapture. A passing
  // attempt is handled above: captureBaseline resets the counter to 0 on
  // success. A failing attempt must be bounded — without this, a fixture
  // suite whose upstream permanently broke would attempt a live call on
  // every dispatch tick forever (doubled by the executor's own retry),
  // burning exactly the Browserless budget this migration exists to
  // reclaim. Awaited (not fire-and-forget): the cap's correctness depends
  // on the counter actually landing before the next dispatch can race it.
  if (suite.testMode === "fixture" && !(passed && capResult?.output)) {
    await recordFixtureRecaptureFailure(suite).catch((err) =>
      logError("fixture-recapture-failure-tracking-failed", err, {
        capability_slug: suite.capabilitySlug,
      }),
    );
  }

  return {
    testName: suite.testName,
    testType: suite.testType,
    capabilitySlug: suite.capabilitySlug,
    passed,
    failureReason,
    responseTimeMs,
    failureClassification: classification?.verdict ?? null,
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
    failureClassification: classification?.verdict ?? null,
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
      failureClassification: cls.verdict,
    };
  }

  let currentOutput: Record<string, unknown> | null = null;
  let executionError: string | null = null;
  let responseTimeMs: number;

  // Phase A0b dispatcher gate. Same internal_test context as the per-suite
  // path above. Regression-runner is the second scheduler entry point.
  try {
    await assertGuardedAllow(suite.capabilitySlug, {
      kind: "internal_test",
      suiteId: suite.id,
      reason: "scheduled",
    });
  } catch (err) {
    if (
      err instanceof CapabilityInvocationRefusedError ||
      err instanceof CapabilityNotClassifiedError ||
      err instanceof BudgetExhaustedError
    ) {
      executionError = err.message;
    } else {
      throw err;
    }
  }

  if (executionError) {
    responseTimeMs = 0;
  } else {
    try {
      const result = await executor(suite.input as Record<string, unknown>);
      responseTimeMs = Date.now() - startTime;
      currentOutput = result?.output ?? null;
    } catch (err) {
      responseTimeMs = Date.now() - startTime;
      executionError = err instanceof Error ? err.message : String(err);
    }
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
      failureClassification: cls.verdict,
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
    failureClassification: regressionCls?.verdict ?? null,
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

/** Max age (ms) a fixture baseline may reach before it's treated as stale by age alone. */
export const FIXTURE_MAX_AGE_DAYS = 30;
const FIXTURE_MAX_AGE_MS = FIXTURE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

export type BaselineStalenessReason =
  | "not_stale"
  | "no_capture_timestamp"
  | "edited_since_capture"
  | "max_age_exceeded";

export interface BaselineStalenessInput {
  baselineOutput?: unknown;
  baselineCapturedAt?: Date | null;
  updatedAt?: Date | null;
  /**
   * Deliberately three-valued at the call site, not just nullable:
   *   - a `Date`               → the real "last (re)captured" timestamp; age is measured from it
   *   - `null`                 → column exists and reads NULL (never (re)captured under this
   *                              check — a pre-existing baseline, or a suite just converted to
   *                              fixture mode). Treated as maximally stale by age: one live
   *                              recapture away from starting its own clock, same posture as
   *                              `no_capture_timestamp` below for baselineCapturedAt.
   *   - `undefined` (omitted)  → the caller is deliberately not evaluating the age axis at all
   *                              (used by callers/tests that predate this field and only care
   *                              about edit-invalidation). A real DB row select always includes
   *                              the column, so production callers can only ever pass a Date or
   *                              `null`, never omit it — `undefined` is exclusively a test/caller
   *                              opt-out, not a value that can appear in prod.
   */
  fixtureLastRefreshed?: Date | null;
}

/**
 * Is this suite's stored fixture baseline stale, and why?
 *
 * Two independent axes (Codex review, 2026-08-18 — HIGH-1):
 *
 * 1. **Edit-invalidation.** `updated_at` moves on any edit to the suite —
 *    including the input change that makes a baseline meaningless. Using it
 *    is deliberately conservative: the worst case for a false positive is
 *    one live execution followed by a fresh capture, which for a zero-cost
 *    capability costs nothing. The worst case for a false negative is what
 *    shipped 2026-08-17 — a permanently wrong verdict that no amount of
 *    re-running can correct (see the six-capability incident below).
 *
 * 2. **Max age.** A baseline can be perfectly valid for its input and still
 *    silently drift behind whatever the live upstream now returns — nothing
 *    about "the suite was never edited" bounds how long a fixture replay
 *    can run unchecked. `fixture_last_refreshed` is the dedicated timestamp
 *    for this axis specifically because `updated_at` is not trustworthy for
 *    it: `updated_at` gets bumped by unrelated suite edits (auto-remediation,
 *    classification updates, or this migration's own test_mode flip), which
 *    would silently reset an age clock that has nothing to do with the
 *    baseline's actual freshness. `fixture_last_refreshed` is written ONLY
 *    by `captureBaseline` on an actual (re)capture — see that function.
 *
 * A suite with no baseline output at all is not stale; it has simply never
 * been captured, and the live path handles it.
 */
export function checkBaselineStaleness(
  suite: BaselineStalenessInput,
  now: Date = new Date(),
): { stale: boolean; reason: BaselineStalenessReason } {
  if (!suite.baselineOutput) return { stale: false, reason: "not_stale" };
  if (!suite.baselineCapturedAt) {
    return { stale: true, reason: "no_capture_timestamp" }; // a baseline we cannot date is not one we can trust
  }
  if (suite.updatedAt && suite.baselineCapturedAt.getTime() < suite.updatedAt.getTime()) {
    return { stale: true, reason: "edited_since_capture" };
  }
  if (suite.fixtureLastRefreshed === undefined) {
    // Caller opted out of the age axis entirely — see the field's doc above.
    return { stale: false, reason: "not_stale" };
  }
  if (
    !suite.fixtureLastRefreshed ||
    now.getTime() - suite.fixtureLastRefreshed.getTime() > FIXTURE_MAX_AGE_MS
  ) {
    return { stale: true, reason: "max_age_exceeded" };
  }
  return { stale: false, reason: "not_stale" };
}

/**
 * Boolean convenience wrapper over `checkBaselineStaleness`. Kept because
 * `test-runner.stale-baseline.test.ts` (2026-08-17 incident regression
 * suite) pins the two-argument boolean shape and deliberately never sets
 * `fixtureLastRefreshed` on its fixtures — by omitting that field, those
 * calls opt out of the age axis and continue exercising exactly the
 * edit-invalidation behavior they were written to pin, unaffected by this
 * addition.
 */
export function isBaselineStale(suite: BaselineStalenessInput, now?: Date): boolean {
  return checkBaselineStaleness(suite, now).stale;
}

/**
 * Record a stale fixture on a suite that costs money to re-run.
 *
 * Deliberately `passed: false` with a reason naming the instrument, not the
 * capability. `transaction-failure-taxonomy` classifies this as `config`
 * (ours to fix, not the capability's logic), so the correctness invariant
 * excludes it from the denominator rather than reporting a code defect.
 */
/**
 * The verdict written for a stale fixture. One constant so the persisted row
 * and the in-memory result returned to meta-monitoring cannot drift apart.
 */
const STALE_FIXTURE_CLASSIFICATION = "stale_input";

async function recordStaleFixture(
  suite: typeof testSuites.$inferSelect,
): Promise<SingleTestResult> {
  const db = getDb();
  const failureReason =
    `fixture_refresh_required: baseline captured ${suite.baselineCapturedAt?.toISOString() ?? "at an unknown time"} ` +
    `predates the suite's last edit ${suite.updatedAt?.toISOString() ?? ""} and the suite is not free to re-run ` +
    `(external_cost_cents=${suite.externalCostCents ?? 0}). Not evidence about the capability.`;

  await db.insert(testResults).values({
    testSuiteId: suite.id,
    capabilitySlug: suite.capabilitySlug,
    passed: false,
    failureReason,
    responseTimeMs: 0,
    failureClassification: STALE_FIXTURE_CLASSIFICATION,
  });

  return {
    testName: suite.testName,
    testType: suite.testType,
    capabilitySlug: suite.capabilitySlug,
    passed: false,
    failureReason,
    responseTimeMs: 0,
    failureClassification: STALE_FIXTURE_CLASSIFICATION,
  };
}

/**
 * Capture baseline output on first successful real execution — or refresh one
 * that has gone stale (by edit OR by age — see `checkBaselineStaleness`).
 *
 * The early return used to be unconditional, which is what made a stale
 * baseline permanent: the fixture path replayed it forever and the capture
 * path declined to replace it.
 *
 * `fixture_last_refreshed` is written here and ONLY here — the single
 * writer for the age axis's reference timestamp (HIGH-1, Codex review
 * 2026-08-18). `fixture_recapture_failures` resets to 0 on every successful
 * capture (HIGH-2b) — "successful recapture resets the [failure] counter",
 * paired with `recordFixtureRecaptureFailure`'s increment-and-quarantine
 * path below for the failure case.
 */
export async function captureBaseline(
  suite: typeof testSuites.$inferSelect,
  output: Record<string, unknown>,
): Promise<void> {
  if (suite.baselineOutput && !isBaselineStale(suite)) return; // already captured and still current
  const db = getDb();
  const capturedAt = new Date();
  await db
    .update(testSuites)
    .set({
      baselineOutput: output,
      // ONE timestamp for both columns. Two `new Date()` calls can differ by a
      // millisecond, and `capturedAt < updatedAt` by a millisecond is exactly
      // the staleness predicate — every freshly captured baseline would be born
      // stale, and the suite would re-execute live forever instead of ever
      // using fixture mode again.
      baselineCapturedAt: capturedAt,
      updatedAt: capturedAt,
      fixtureLastRefreshed: capturedAt,
      fixtureRecaptureFailures: 0,
    })
    .where(eq(testSuites.id, suite.id));
}

/** Consecutive failed fixture-recapture attempts before a suite is quarantined. */
export const MAX_FIXTURE_RECAPTURE_FAILURES = 3;

/**
 * Stable prefix on `quarantine_reason` identifying THIS specific quarantine
 * cause (exhausted fixture-recapture retries), so the runtime refusal gate
 * above (`test-runner.ts`'s "Quarantined after MAX_FIXTURE_RECAPTURE_FAILURES"
 * block) can distinguish it from suites quarantined by unrelated mechanisms
 * (health-sweep's own escalation, upstream breakage) that should keep their
 * normal weekly live probe.
 */
export const FIXTURE_RECAPTURE_QUARANTINE_MARKER = "fixture_recapture_exhausted:";

/**
 * Bound a fixture suite's failing recapture attempts (Codex review,
 * 2026-08-18 round 1 — HIGH-2b; termination hardened round 2).
 *
 * A `test_mode = 'fixture'` suite reaches the "real execution" branch in
 * `runSingleTest` only because its baseline was missing or stale — every
 * arrival there is an attempted recapture. Without a cap, a suite whose
 * upstream permanently broke would attempt (and fail) a live call on every
 * dispatch tick forever: the exact Browserless-burn pattern this whole
 * migration exists to close, just relocated from "always live" to "always
 * failing-and-retrying".
 *
 * Increments `fixture_recapture_failures`; at `MAX_FIXTURE_RECAPTURE_FAILURES`
 * consecutive failures, sets `test_status = 'quarantined'` with a reason
 * carrying `FIXTURE_RECAPTURE_QUARANTINE_MARKER`. Round-2 fix: reaching the
 * cap used to only slow the retry cadence to `minRetestIntervalHours`'s 168h
 * quarantine floor — real, but not termination; a direct `runTests({suiteId})`
 * call (admin trigger, manual re-run) still reached the executor uncapped.
 * The runtime gate in `runSingleTest` (immediately before this function's
 * call site) now checks for the marker and refuses to attempt ANY further
 * live call once quarantined for this cause, regardless of how or how often
 * the suite is dispatched — genuine termination, not just a slower retry.
 *
 * A subsequent successful recapture resets the counter to 0 via
 * `captureBaseline` — but with the runtime gate active, that can only
 * happen after a human clears `test_status`/`quarantine_reason` (the
 * refusal path never calls the executor, so it can never self-heal into a
 * pass). `health-sweep.ts`'s `checkQuarantineRecovery` sweep is now also
 * explicitly excluded for this cause (round 3) rather than relying on that
 * as an implicit consequence.
 *
 * Concurrency (Codex round 3, "non-atomic cap" finding — accepted,
 * documented, deliberately NOT fixed with locking): the increment
 * (`UPDATE ... SET fixture_recapture_failures = fixture_recapture_failures
 * + 1 ... RETURNING`) and the conditional quarantine transition below are
 * two separate statements, not one atomic UPDATE. Two overlapping
 * `runSingleTest()` calls for the SAME suite (rare in practice — the
 * scheduler's per-suite hourly cadence and suiteId-scoped dispatch mean
 * this needs a manual re-run to actually overlap a scheduled tick) could
 * each read a stale pre-quarantine count and both issue the quarantine
 * UPDATE. Traced through: Postgres row-locks each individual UPDATE, so
 * the increment itself never loses a count (two overlapping callers get
 * distinct, correct post-increment values, e.g. 3 and 4, never both 3) —
 * the only possible outcome of the gap is a harmless duplicate quarantine
 * write (same `test_status`, a `quarantine_reason` string differing only
 * in which count it names). It cannot produce an incorrect final state or
 * reopen the executor to unbounded calls; the counter is monotonic, so the
 * worst case is that a concurrent overlap costs a small, still-bounded
 * number of extra live attempts (at most one extra per overlapping call),
 * never unbounded. A session-scoped advisory lock or `SELECT ... FOR
 * UPDATE` spanning the executor call would close this narrow window
 * completely, but is out of proportion for a test-infra cost guard whose
 * failure mode, even unaddressed, stays bounded — this file accepts the
 * window rather than building it.
 */
export async function recordFixtureRecaptureFailure(
  suite: typeof testSuites.$inferSelect,
): Promise<void> {
  const db = getDb();
  const [updated] = await db
    .update(testSuites)
    .set({
      fixtureRecaptureFailures: sql`${testSuites.fixtureRecaptureFailures} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(testSuites.id, suite.id))
    .returning({ count: testSuites.fixtureRecaptureFailures });

  const newCount = updated?.count ?? 0;
  if (newCount >= MAX_FIXTURE_RECAPTURE_FAILURES) {
    await db
      .update(testSuites)
      .set({
        testStatus: "quarantined",
        quarantineReason:
          `${FIXTURE_RECAPTURE_QUARANTINE_MARKER} ${newCount} consecutive failed live recapture ` +
          `attempts — needs human. Further live calls refused until test_status is reset.`,
        updatedAt: new Date(),
      })
      .where(eq(testSuites.id, suite.id));
  }
}

/**
 * Record the refusal itself when a fixture suite is quarantined for
 * exhausted recapture attempts (Codex review, 2026-08-18 round 2). Same
 * "name the instrument, not the capability" posture as `recordStaleFixture`
 * — `passed: false` so the failure stays visible in `test_results`, with a
 * `failureClassification` the correctness invariant can key off, but never
 * pretending to have evidence about the capability's actual behavior since
 * the executor was never called.
 */
async function recordQuarantinedRecaptureRefusal(
  suite: typeof testSuites.$inferSelect,
): Promise<SingleTestResult> {
  const db = getDb();
  const failureReason =
    `fixture_recapture_quarantined: ${suite.quarantineReason ?? "repeated recapture failures"} ` +
    `Refusing further live calls until a human resets test_status. Not evidence about the capability.`;

  await db.insert(testResults).values({
    testSuiteId: suite.id,
    capabilitySlug: suite.capabilitySlug,
    passed: false,
    failureReason,
    responseTimeMs: 0,
    failureClassification: "test_infrastructure",
  });

  return {
    testName: suite.testName,
    testType: suite.testType,
    capabilitySlug: suite.capabilitySlug,
    passed: false,
    failureReason,
    responseTimeMs: 0,
    failureClassification: "test_infrastructure",
  };
}

// ─── Validation logic ───────────────────────────────────────────────────────

// Gate 2: Null-output correctness tier (DEC-20260409-A)
// Feature flag — defaults to disabled; enable with NULL_RATIO_RULE_ENABLED=true
const NULL_RATIO_RULE_ENABLED = process.env.NULL_RATIO_RULE_ENABLED === "true";

// Gate 3: Canonical-input sentinel (DEC-20260513-B + DEC-20260513-C).
// See ./guaranteed-fields-sentinel.ts for the rationale + strict-missing semantics.
import { checkGuaranteedFieldsPresent } from "./guaranteed-fields-sentinel.js";
import { SYSTEM_ACCOUNT_EMAIL } from "./internal-accounts.js";

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

  // Gate 3: Canonical-input sentinel — strict-missing-only on guaranteed
  // fields (DEC-20260513-B + DEC-20260513-C, Phase 3 Harden).
  // Applies only to known_answer. See checkGuaranteedFieldsPresent docs.
  if (suite.testType === "known_answer") {
    const sentinel = checkGuaranteedFieldsPresent(capResult?.output, fieldReliability);
    if (!sentinel.passed) {
      return { passed: false, failureReason: sentinel.failureReason ?? null };
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
      // Captured at INSERT because neither is recoverable later:
      // the rail is not a property of the row, and the deploy commit
      // drifts the moment anything redeploys (block 0110).
      receiptRail: "internal",
      receiptDeployCommit: deployCommitOrNull(),
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

  // The internal harness is roughly 98% of all platform traffic, so leaving it
  // unwired would have meant the overwhelming majority of post-epoch rows
  // sitting `pending` forever and the chain backlog growing without bound. It
  // is a real execution of a real capability; it gets a real receipt, on its
  // own rail so it can be told apart from customer traffic.
  if (txn?.id) {
    await settleExecutionReceipt(db, { transactionId: txn.id, rail: "internal" });
  }

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
    .where(eq(users.email, SYSTEM_ACCOUNT_EMAIL))
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
      email: SYSTEM_ACCOUNT_EMAIL,
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
