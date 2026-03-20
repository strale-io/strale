/**
 * Pipeline Phase III: Meta-Monitoring
 *
 * 13 checks across 4 frequencies:
 *   Post-test-run (8A): new failure alert, infrastructure health
 *   Weekly (8B):        orphaned suites, untested caps, stale tests, missing coverage
 *   Weekly (8C):        score without evidence, stuck scores, impossible scores, divergence
 *   Daily (8D):         validation queue stuck, probation timeout, degraded count
 *
 * All results are logged to health_monitor_events (event_type = 'meta_monitoring').
 * Functions never throw — errors are caught and returned as failed checks.
 */

import { and, eq, desc, sql, inArray, lt, lte, isNull } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, solutions, testSuites, testResults, healthMonitorEvents } from "../db/schema.js";
import { logHealthEvent } from "./health-monitor.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MetaCheckResult {
  check: string;
  severity: "critical" | "warning" | "info";
  passed: boolean;
  details: string;
  affected?: string[];
}

/** Minimal shape needed from a test batch result */
export interface BatchTestResult {
  capabilitySlug: string;
  passed: boolean;
  failureClassification?: string | null;
}

// ─── 8A: Post-test-run checks ─────────────────────────────────────────────────

/**
 * Check 1: New failure alert (WARNING)
 * Detects capabilities that were passing in their previous run window
 * and are now failing in this batch (regression).
 *
 * "Passing" = pass rate ≥ 80% over the 10 results before this batch.
 * "Failing" = this batch result is false.
 */
export async function checkNewFailures(
  batchResults: BatchTestResult[],
): Promise<MetaCheckResult> {
  const check = "new_failure_alert";

  try {
    const db = getDb();
    const now = new Date();

    // Only check slugs that failed in this batch
    const failedSlugs = [...new Set(
      batchResults.filter((r) => !r.passed).map((r) => r.capabilitySlug),
    )];

    if (failedSlugs.length === 0) {
      return { check, severity: "warning", passed: true, details: "No failures in this batch" };
    }

    const regressions: string[] = [];

    for (const slug of failedSlugs) {
      // Get the 10 most recent results BEFORE this batch run (older than 1 minute ago)
      const cutoff = new Date(now.getTime() - 60_000);
      const prevResults = await db
        .select({ passed: testResults.passed })
        .from(testResults)
        .where(
          and(
            eq(testResults.capabilitySlug, slug),
            lte(testResults.executedAt, cutoff),
          ),
        )
        .orderBy(sql`${testResults.executedAt} DESC`)
        .limit(10);

      if (prevResults.length < 3) continue; // not enough history to judge

      const prevPassRate = prevResults.filter((r) => r.passed).length / prevResults.length;

      if (prevPassRate >= 0.8) {
        // Was passing, now failing — regression
        regressions.push(slug);

        await logHealthEvent({
          eventType: "regression_detected",
          capabilitySlug: slug,
          tier: 2,
          actionTaken: `Regression: ${slug} was passing (${(prevPassRate * 100).toFixed(0)}% over ${prevResults.length} runs), now failing`,
          details: {
            slug,
            previous_pass_rate: prevPassRate,
            previous_run_count: prevResults.length,
            detected_at: now.toISOString(),
          },
        });
      }
    }

    if (regressions.length === 0) {
      return {
        check,
        severity: "warning",
        passed: true,
        details: `${failedSlugs.length} failures, none are regressions (all were already failing)`,
      };
    }

    return {
      check,
      severity: "warning",
      passed: false,
      details: `${regressions.length} regression(s) detected: ${regressions.join(", ")}`,
      affected: regressions,
    };
  } catch (err) {
    return {
      check,
      severity: "warning",
      passed: false,
      details: `Check error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Check 2: Infrastructure health (CRITICAL)
 * If >5 capabilities in this batch share the same failure_classification,
 * this indicates a systemic infrastructure issue.
 */
export async function checkInfrastructureHealth(
  batchResults: BatchTestResult[],
): Promise<MetaCheckResult> {
  const check = "infrastructure_health";

  try {
    const failures = batchResults.filter((r) => !r.passed);

    if (failures.length <= 5) {
      return {
        check,
        severity: "critical",
        passed: true,
        details: `${failures.length} failures — below infrastructure alert threshold (5)`,
      };
    }

    // Group by failure classification
    const classGroups: Record<string, string[]> = {};
    for (const r of failures) {
      const cls = r.failureClassification ?? "unknown";
      if (!classGroups[cls]) classGroups[cls] = [];
      classGroups[cls].push(r.capabilitySlug);
    }

    const infraAlerts = Object.entries(classGroups).filter(([, slugs]) => slugs.length > 5);

    if (infraAlerts.length === 0) {
      return {
        check,
        severity: "critical",
        passed: true,
        details: `${failures.length} failures spread across ${Object.keys(classGroups).length} classifications — no single cause`,
      };
    }

    const [worstClass, worstSlugs] = infraAlerts.sort((a, b) => b[1].length - a[1].length)[0];
    const affected = [...new Set(worstSlugs)];

    await logHealthEvent({
      eventType: "infrastructure_alert",
      tier: 3,
      actionTaken: `Infrastructure alert: ${affected.length} capabilities failing with classification '${worstClass}'`,
      details: {
        classification: worstClass,
        affected_count: affected.length,
        affected_slugs: affected,
        all_groups: Object.fromEntries(
          Object.entries(classGroups).map(([k, v]) => [k, v.length]),
        ),
        detected_at: new Date().toISOString(),
      },
    });

    return {
      check,
      severity: "critical",
      passed: false,
      details: `INFRASTRUCTURE ALERT: ${affected.length} capabilities failing with '${worstClass}'`,
      affected,
    };
  } catch (err) {
    return {
      check,
      severity: "critical",
      passed: false,
      details: `Check error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── 8B: Weekly test coverage checks ─────────────────────────────────────────

/**
 * Check 3: Orphaned test suites
 * Test suites that reference a capability slug with no active capability record.
 */
export async function checkOrphanedTestSuites(): Promise<MetaCheckResult> {
  const check = "orphaned_test_suites";
  try {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT ts.capability_slug, COUNT(*)::int AS suite_count
      FROM test_suites ts
      LEFT JOIN capabilities c ON c.slug = ts.capability_slug AND c.is_active = true
      WHERE ts.active = true AND c.slug IS NULL
      GROUP BY ts.capability_slug
    `);
    const results = (Array.isArray(rows) ? rows : (rows as any).rows) as Array<{
      capability_slug: string;
      suite_count: number;
    }>;

    if (results.length === 0) {
      return { check, severity: "warning", passed: true, details: "No orphaned test suites" };
    }

    const affected = results.map((r) => `${r.capability_slug}(${r.suite_count})`);
    await _logMetaEvent(check, "warning", `${results.length} capability slug(s) have orphaned test suites`, { orphans: affected });

    return {
      check,
      severity: "warning",
      passed: false,
      details: `${results.length} capability slug(s) with orphaned suites: ${affected.join(", ")}`,
      affected: results.map((r) => r.capability_slug),
    };
  } catch (err) {
    return { check, severity: "warning", passed: false, details: `Check error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Check 4: Untested capabilities
 * Active capabilities with no test suites at all.
 */
export async function checkUntestedCapabilities(): Promise<MetaCheckResult> {
  const check = "untested_capabilities";
  try {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT c.slug
      FROM capabilities c
      LEFT JOIN test_suites ts ON ts.capability_slug = c.slug AND ts.active = true
      WHERE c.is_active = true AND ts.id IS NULL
      ORDER BY c.slug
    `);
    const results = (Array.isArray(rows) ? rows : (rows as any).rows) as Array<{ slug: string }>;

    if (results.length === 0) {
      return { check, severity: "warning", passed: true, details: "All active capabilities have test suites" };
    }

    const affected = results.map((r) => r.slug);
    await _logMetaEvent(check, "warning", `${affected.length} active capability(ies) have no test suites`, { slugs: affected });

    return {
      check,
      severity: "warning",
      passed: false,
      details: `${affected.length} active capabilities with no test suites`,
      affected,
    };
  } catch (err) {
    return { check, severity: "warning", passed: false, details: `Check error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Check 5: Stale tests
 * Test suites whose last result is older than 30 days (or never run).
 */
export async function checkStaleTests(): Promise<MetaCheckResult> {
  const check = "stale_tests";
  try {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT ts.capability_slug, ts.test_name, MAX(tr.executed_at) AS last_run
      FROM test_suites ts
      LEFT JOIN test_results tr ON tr.test_suite_id = ts.id
      WHERE ts.active = true
      GROUP BY ts.id, ts.capability_slug, ts.test_name
      HAVING MAX(tr.executed_at) < NOW() - INTERVAL '30 days'
          OR MAX(tr.executed_at) IS NULL
    `);
    const results = (Array.isArray(rows) ? rows : (rows as any).rows) as Array<{
      capability_slug: string;
      test_name: string;
      last_run: string | null;
    }>;

    if (results.length === 0) {
      return { check, severity: "warning", passed: true, details: "No stale test suites" };
    }

    const affected = [...new Set(results.map((r) => r.capability_slug))];
    await _logMetaEvent(check, "warning", `${results.length} stale test suite(s) across ${affected.length} capabilities`, {
      stale_count: results.length,
      affected_capabilities: affected,
    });

    return {
      check,
      severity: "warning",
      passed: false,
      details: `${results.length} stale test suite(s) across ${affected.length} capability(ies)`,
      affected,
    };
  } catch (err) {
    return { check, severity: "warning", passed: false, details: `Check error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Check 6: Missing test type coverage
 * Active capabilities that don't have all 5 test types.
 */
export async function checkMissingTestCoverage(): Promise<MetaCheckResult> {
  const check = "missing_test_coverage";
  const REQUIRED_COUNT = 5;
  try {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT c.slug,
        array_agg(DISTINCT ts.test_type) AS types,
        COUNT(DISTINCT ts.test_type)::int AS type_count
      FROM capabilities c
      LEFT JOIN test_suites ts ON ts.capability_slug = c.slug AND ts.active = true
      WHERE c.is_active = true
      GROUP BY c.slug
      HAVING COUNT(DISTINCT ts.test_type) < ${REQUIRED_COUNT}
      ORDER BY COUNT(DISTINCT ts.test_type), c.slug
    `);
    const results = (Array.isArray(rows) ? rows : (rows as any).rows) as Array<{
      slug: string;
      types: string[];
      type_count: number;
    }>;

    if (results.length === 0) {
      return { check, severity: "warning", passed: true, details: "All active capabilities have all 5 test types" };
    }

    const affected = results.map((r) => r.slug);
    await _logMetaEvent(check, "warning", `${affected.length} capability(ies) missing test type coverage`, {
      affected: results.map((r) => ({ slug: r.slug, types: r.types, count: r.type_count })),
    });

    return {
      check,
      severity: "warning",
      passed: false,
      details: `${affected.length} capabilities missing full test type coverage (need all 5 types)`,
      affected,
    };
  } catch (err) {
    return { check, severity: "warning", passed: false, details: `Check error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ─── 8C: Weekly SQS integrity checks ─────────────────────────────────────────

/**
 * Check 7: Score without evidence
 * Capabilities with a numeric SQS but fewer than 5 distinct test run results
 * in the last 30 days.
 */
export async function checkScoreWithoutEvidence(): Promise<MetaCheckResult> {
  const check = "score_without_evidence";
  try {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT c.slug, c.matrix_sqs,
        COUNT(tr.id)::int AS result_count
      FROM capabilities c
      LEFT JOIN test_results tr
        ON tr.capability_slug = c.slug
        AND tr.executed_at >= NOW() - INTERVAL '30 days'
      WHERE c.is_active = true
        AND c.matrix_sqs IS NOT NULL
        AND CAST(c.matrix_sqs AS NUMERIC) > 0
      GROUP BY c.slug, c.matrix_sqs
      HAVING COUNT(tr.id) < 5
      ORDER BY COUNT(tr.id), c.slug
    `);
    const results = (Array.isArray(rows) ? rows : (rows as any).rows) as Array<{
      slug: string;
      matrix_sqs: string;
      result_count: number;
    }>;

    if (results.length === 0) {
      return { check, severity: "warning", passed: true, details: "All SQS scores have sufficient evidence (≥5 results in 30d)" };
    }

    const affected = results.map((r) => r.slug);
    await _logMetaEvent(check, "warning", `${affected.length} capability(ies) have SQS scores with insufficient evidence`, {
      affected: results.map((r) => ({ slug: r.slug, sqs: r.matrix_sqs, result_count: r.result_count })),
    });

    return {
      check,
      severity: "warning",
      passed: false,
      details: `${affected.length} capabilities have SQS > 0 but < 5 test results in 30d`,
      affected,
    };
  } catch (err) {
    return { check, severity: "warning", passed: false, details: `Check error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Check 8: Stuck scores
 * Capabilities whose updated_at is older than 14 days but have test_results
 * in the last 14 days — indicates persistDualProfileScores silently failed.
 *
 * Excludes perfectly-stable deterministic capabilities (100% pass rate
 * across all recent results) because a stuck 100.0 score is correct.
 */
export async function checkStuckScores(): Promise<MetaCheckResult> {
  const check = "stuck_scores";
  try {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT c.slug, c.matrix_sqs, c.updated_at,
        COUNT(tr.id)::int AS recent_results,
        SUM(CASE WHEN tr.passed THEN 1 ELSE 0 END)::int AS recent_passes
      FROM capabilities c
      INNER JOIN test_results tr
        ON tr.capability_slug = c.slug
        AND tr.executed_at >= NOW() - INTERVAL '14 days'
      WHERE c.is_active = true
        AND c.matrix_sqs IS NOT NULL
        AND c.updated_at < NOW() - INTERVAL '14 days'
      GROUP BY c.slug, c.matrix_sqs, c.updated_at
      HAVING
        -- Only flag if there's score variation evidence (not a perfect-100 cap)
        SUM(CASE WHEN tr.passed THEN 1 ELSE 0 END)::float / NULLIF(COUNT(tr.id), 0) < 0.99
      ORDER BY c.updated_at
    `);
    const results = (Array.isArray(rows) ? rows : (rows as any).rows) as Array<{
      slug: string;
      matrix_sqs: string;
      updated_at: string;
      recent_results: number;
      recent_passes: number;
    }>;

    if (results.length === 0) {
      return { check, severity: "warning", passed: true, details: "No stuck SQS scores detected" };
    }

    const affected = results.map((r) => r.slug);
    await _logMetaEvent(check, "warning", `${affected.length} capability(ies) may have stuck SQS scores`, {
      affected: results.map((r) => ({
        slug: r.slug,
        matrix_sqs: r.matrix_sqs,
        updated_at: r.updated_at,
        recent_results: r.recent_results,
      })),
    });

    return {
      check,
      severity: "warning",
      passed: false,
      details: `${affected.length} capabilities: SQS not updated in >14d despite recent test results`,
      affected,
    };
  } catch (err) {
    return { check, severity: "warning", passed: false, details: `Check error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Check 9: Impossible scores
 * SQS > 100 or < 0.
 */
export async function checkImpossibleScores(): Promise<MetaCheckResult> {
  const check = "impossible_scores";
  try {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT slug, matrix_sqs
      FROM capabilities
      WHERE is_active = true
        AND matrix_sqs IS NOT NULL
        AND (CAST(matrix_sqs AS NUMERIC) > 100 OR CAST(matrix_sqs AS NUMERIC) < 0)
      ORDER BY slug
    `);
    const results = (Array.isArray(rows) ? rows : (rows as any).rows) as Array<{
      slug: string;
      matrix_sqs: string;
    }>;

    if (results.length === 0) {
      return { check, severity: "critical", passed: true, details: "All SQS scores in valid range [0, 100]" };
    }

    const affected = results.map((r) => r.slug);
    await _logMetaEvent(check, "critical", `IMPOSSIBLE SCORES: ${affected.length} capability(ies) with SQS outside [0, 100]`, {
      affected: results.map((r) => ({ slug: r.slug, matrix_sqs: r.matrix_sqs })),
    });

    return {
      check,
      severity: "critical",
      passed: false,
      details: `${affected.length} capabilities with SQS outside [0, 100]: ${results.map((r) => `${r.slug}=${r.matrix_sqs}`).join(", ")}`,
      affected,
    };
  } catch (err) {
    return { check, severity: "critical", passed: false, details: `Check error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Check 10: Divergence check
 * Capabilities where SQS > 80 but actual 30-day pass rate < 30%.
 * Guards against stale cached SQS or miscalculated scores.
 */
export async function checkSqsPassRateDivergence(): Promise<MetaCheckResult> {
  const check = "sqs_passrate_divergence";
  try {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT c.slug, c.matrix_sqs,
        COUNT(tr.id)::int AS result_count,
        ROUND(SUM(CASE WHEN tr.passed THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(tr.id), 0) * 100, 1) AS pass_rate_pct
      FROM capabilities c
      INNER JOIN test_results tr
        ON tr.capability_slug = c.slug
        AND tr.executed_at >= NOW() - INTERVAL '30 days'
      WHERE c.is_active = true
        AND c.matrix_sqs IS NOT NULL
        AND CAST(c.matrix_sqs AS NUMERIC) > 80
      GROUP BY c.slug, c.matrix_sqs
      HAVING
        COUNT(tr.id) >= 5
        AND SUM(CASE WHEN tr.passed THEN 1 ELSE 0 END)::float / NULLIF(COUNT(tr.id), 0) < 0.30
      ORDER BY c.slug
    `);
    const results = (Array.isArray(rows) ? rows : (rows as any).rows) as Array<{
      slug: string;
      matrix_sqs: string;
      result_count: number;
      pass_rate_pct: string;
    }>;

    if (results.length === 0) {
      return { check, severity: "warning", passed: true, details: "No SQS/pass-rate divergence detected" };
    }

    const affected = results.map((r) => r.slug);
    await _logMetaEvent(check, "warning", `${affected.length} capability(ies) show SQS vs pass-rate divergence`, {
      affected: results.map((r) => ({
        slug: r.slug,
        matrix_sqs: r.matrix_sqs,
        pass_rate_pct: r.pass_rate_pct,
        result_count: r.result_count,
      })),
    });

    return {
      check,
      severity: "warning",
      passed: false,
      details: `${affected.length} capabilities: SQS > 80 but <30% pass rate in 30d — possible stale cache`,
      affected,
    };
  } catch (err) {
    return { check, severity: "warning", passed: false, details: `Check error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ─── 8D: Daily pipeline health checks ────────────────────────────────────────

/**
 * Check 11: Validation queue stuck
 * Capabilities in 'validating' state for more than 48 hours.
 */
export async function checkValidationQueueStuck(): Promise<MetaCheckResult> {
  const check = "validation_queue_stuck";
  try {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT slug, updated_at
      FROM capabilities
      WHERE lifecycle_state = 'validating'
        AND updated_at < NOW() - INTERVAL '48 hours'
      ORDER BY updated_at
    `);
    const results = (Array.isArray(rows) ? rows : (rows as any).rows) as Array<{
      slug: string;
      updated_at: string;
    }>;

    if (results.length === 0) {
      return { check, severity: "warning", passed: true, details: "No capabilities stuck in validating state" };
    }

    const affected = results.map((r) => r.slug);
    await _logMetaEvent(check, "warning", `${affected.length} capability(ies) stuck in validating state >48h`, {
      affected: results.map((r) => ({ slug: r.slug, updated_at: r.updated_at })),
    });

    return {
      check,
      severity: "warning",
      passed: false,
      details: `${affected.length} capabilities stuck in 'validating' for >48h`,
      affected,
    };
  } catch (err) {
    return { check, severity: "warning", passed: false, details: `Check error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Check 12: Probation timeout
 * Capabilities in 'probation' state for more than 7 days without promoting.
 */
export async function checkProbationTimeout(): Promise<MetaCheckResult> {
  const check = "probation_timeout";
  try {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT slug, updated_at
      FROM capabilities
      WHERE lifecycle_state = 'probation'
        AND updated_at < NOW() - INTERVAL '7 days'
      ORDER BY updated_at
    `);
    const results = (Array.isArray(rows) ? rows : (rows as any).rows) as Array<{
      slug: string;
      updated_at: string;
    }>;

    if (results.length === 0) {
      return { check, severity: "warning", passed: true, details: "No capabilities stuck in probation" };
    }

    const affected = results.map((r) => r.slug);
    await _logMetaEvent(check, "warning", `${affected.length} capability(ies) stuck in probation >7d`, {
      affected: results.map((r) => ({ slug: r.slug, updated_at: r.updated_at })),
    });

    return {
      check,
      severity: "warning",
      passed: false,
      details: `${affected.length} capabilities in probation >7d — may not be accumulating test history`,
      affected,
    };
  } catch (err) {
    return { check, severity: "warning", passed: false, details: `Check error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Check 13: Degraded count
 * If >5% of active capabilities are in degraded or suspended state, emit WARNING.
 */
export async function checkDegradedCount(): Promise<MetaCheckResult> {
  const check = "degraded_count";
  const THRESHOLD_PCT = 5;
  try {
    const db = getDb();
    const [row] = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE lifecycle_state IN ('degraded', 'suspended'))::int AS unhealthy,
        COUNT(*)::int AS total,
        ROUND(
          COUNT(*) FILTER (WHERE lifecycle_state IN ('degraded', 'suspended'))::numeric
          / NULLIF(COUNT(*), 0) * 100,
          1
        ) AS pct
      FROM capabilities
      WHERE is_active = true
    `).then((r) => Array.isArray(r) ? r : (r as any).rows);

    const { unhealthy, total, pct } = row as { unhealthy: number; total: number; pct: string };
    const pctNum = parseFloat(pct ?? "0");

    if (pctNum <= THRESHOLD_PCT) {
      return {
        check,
        severity: "warning",
        passed: true,
        details: `${unhealthy}/${total} (${pct}%) degraded/suspended — below ${THRESHOLD_PCT}% threshold`,
      };
    }

    // Get the slugs of degraded/suspended caps for details
    const degradedRows = await db.execute(sql`
      SELECT slug, lifecycle_state
      FROM capabilities
      WHERE is_active = true
        AND lifecycle_state IN ('degraded', 'suspended')
      ORDER BY lifecycle_state, slug
    `);
    const degradedResults = (Array.isArray(degradedRows) ? degradedRows : (degradedRows as any).rows) as Array<{
      slug: string;
      lifecycle_state: string;
    }>;
    const affected = degradedResults.map((r) => r.slug);

    await _logMetaEvent(check, "warning", `Elevated degraded/suspended: ${unhealthy}/${total} (${pct}%) exceeds ${THRESHOLD_PCT}% threshold`, {
      unhealthy,
      total,
      pct,
      threshold_pct: THRESHOLD_PCT,
      affected,
    });

    return {
      check,
      severity: "warning",
      passed: false,
      details: `${unhealthy}/${total} (${pct}%) capabilities degraded/suspended — exceeds ${THRESHOLD_PCT}% threshold`,
      affected,
    };
  } catch (err) {
    return { check, severity: "warning", passed: false, details: `Check error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ─── Check 14: Free-tier showcase protection (CRITICAL, daily) ──────────────

const FREE_TIER_SLUGS = [
  "iban-validate",
  "email-validate",
  "dns-lookup",
  "json-repair",
  "url-to-markdown",
];

/**
 * Check 14: Free-tier health (CRITICAL)
 * The 5 free-tier capabilities are the first thing agents try.
 * All must be Excellent (SQS >= 90), usable, stable/improving, with
 * zero external_service_failures (they're all deterministic).
 */
export async function checkFreeTierHealth(): Promise<MetaCheckResult> {
  const check = "free_tier_health";
  try {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT c.slug, c.matrix_sqs, c.guidance_usable, c.capability_type,
        (
          SELECT COUNT(*)::int
          FROM test_results tr
          WHERE tr.capability_slug = c.slug
            AND tr.passed = false
            AND tr.failure_classification IN ('upstream_transient', 'upstream_degraded')
            AND tr.executed_at >= NOW() - INTERVAL '7 days'
        ) AS external_failures_7d
      FROM capabilities c
      WHERE c.slug = ANY(${FREE_TIER_SLUGS})
        AND c.is_active = true
    `);

    const results = (Array.isArray(rows) ? rows : (rows as any).rows) as Array<{
      slug: string;
      matrix_sqs: string | null;
      guidance_usable: boolean | null;
      capability_type: string;
      external_failures_7d: number;
    }>;

    const issues: string[] = [];
    for (const r of results) {
      const sqs = r.matrix_sqs ? parseFloat(r.matrix_sqs) : 0;
      if (sqs < 90) issues.push(`${r.slug}: SQS ${sqs} < 90`);
      if (r.guidance_usable === false) issues.push(`${r.slug}: usable=false`);
      if (r.external_failures_7d > 0) {
        issues.push(`${r.slug}: ${r.external_failures_7d} external failures in 7d (deterministic capability)`);
      }
    }

    if (issues.length === 0) {
      return { check, severity: "critical", passed: true, details: "All 5 free-tier capabilities healthy (SQS >= 90, usable, no external failures)" };
    }

    await _logMetaEvent(check, "critical", `Free-tier showcase degraded: ${issues.length} issue(s)`, {
      issues,
      affected: results.map((r) => r.slug),
    });

    return {
      check,
      severity: "critical",
      passed: false,
      details: `Free-tier issues: ${issues.join("; ")}`,
      affected: issues,
    };
  } catch (err) {
    return { check, severity: "critical", passed: false, details: `Check error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ─── Check 15: Methodology drift (WARNING, weekly) ──────────────────────────

/**
 * Check 15: Methodology drift
 * Detects when hardcoded counts in documentation diverge from actual database
 * counts by more than 5. Safety net for dynamic count generation.
 */
export async function checkMethodologyDrift(): Promise<MetaCheckResult> {
  const check = "methodology_drift";
  try {
    const db = getDb();
    const [capRow] = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM capabilities WHERE is_active = true
    `);
    const [solRow] = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM solutions WHERE is_active = true
    `);
    const [testRow] = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM test_suites WHERE active = true
    `);

    const capCount = (capRow as any).cnt;
    const solCount = (solRow as any).cnt;
    const testCount = (testRow as any).cnt;
    const estimatedTests = capCount * 5;

    const drifts: string[] = [];
    if (Math.abs(testCount - estimatedTests) > capCount) {
      drifts.push(`Test suites: actual ${testCount} vs estimated ${estimatedTests} (${capCount} caps × 5)`);
    }

    if (drifts.length === 0) {
      return {
        check,
        severity: "warning",
        passed: true,
        details: `Counts aligned: ${capCount} capabilities, ${solCount} solutions, ${testCount} test suites`,
      };
    }

    await _logMetaEvent(check, "warning", `Methodology counts drifted: ${drifts.join("; ")}`, {
      actual: { capabilities: capCount, solutions: solCount, test_suites: testCount },
      estimated_tests: estimatedTests,
    });

    return {
      check,
      severity: "warning",
      passed: false,
      details: `Drift detected: ${drifts.join("; ")}`,
    };
  } catch (err) {
    return { check, severity: "warning", passed: false, details: `Check error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ─── Scheduler heartbeat check (CRITICAL) ─────────────────────────────────

/**
 * Check 16: Scheduler heartbeat (CRITICAL)
 * Verifies the test scheduler has run within the last 2 hours.
 * If not, fires a critical alert — tests may not be executing.
 */
export async function checkSchedulerHeartbeat(): Promise<MetaCheckResult> {
  const check = "scheduler_heartbeat";
  try {
    const db = getDb();
    const [lastHeartbeat] = await db
      .select({ createdAt: healthMonitorEvents.createdAt })
      .from(healthMonitorEvents)
      .where(eq(healthMonitorEvents.eventType, "scheduler_heartbeat"))
      .orderBy(desc(healthMonitorEvents.createdAt))
      .limit(1);

    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

    if (!lastHeartbeat) {
      // No heartbeat ever recorded — might be first startup
      await _logMetaEvent(check, "warning", "No scheduler heartbeat found — scheduler may not have run yet", {});
      return {
        check,
        severity: "warning",
        passed: false,
        details: "No scheduler heartbeat found in health_monitor_events",
      };
    }

    const msSinceHeartbeat = Date.now() - lastHeartbeat.createdAt.getTime();
    if (msSinceHeartbeat > TWO_HOURS_MS) {
      const hoursAgo = Math.round(msSinceHeartbeat / 3600_000 * 10) / 10;
      await _logMetaEvent(check, "critical",
        `Scheduler has not run in ${hoursAgo}h — tests may not be executing`,
        { last_heartbeat: lastHeartbeat.createdAt.toISOString(), hours_ago: hoursAgo },
      );

      // Situation assessment → alert
      try {
        const { assessSchedulerStale } = await import("./situation-assessment.js");
        const { evaluateAndAlert } = await import("./intelligent-alerts.js");
        const assessment = await assessSchedulerStale(lastHeartbeat.createdAt);
        await evaluateAndAlert(assessment);
      } catch { /* best effort */ }

      return {
        check,
        severity: "critical",
        passed: false,
        details: `Last scheduler heartbeat was ${hoursAgo}h ago`,
      };
    }

    return { check, severity: "info", passed: true, details: "Scheduler heartbeat within 2h" };
  } catch (err) {
    return {
      check,
      severity: "warning",
      passed: false,
      details: `Check failed: ${err instanceof Error ? err.message : err}`,
    };
  }
}

// ─── Batch runners ───────────────────────────────────────────────────────────

/** Run all 8D daily checks and log a summary event */
export async function runDailyChecks(): Promise<MetaCheckResult[]> {
  const results = await Promise.all([
    checkValidationQueueStuck(),
    checkProbationTimeout(),
    checkDegradedCount(),
    checkFreeTierHealth(),
    checkSchedulerHeartbeat(),
  ]);
  await _logSummary("daily", results);
  return results;
}

/** Run all 8B + 8C weekly checks and log a summary event */
export async function runWeeklyChecks(): Promise<MetaCheckResult[]> {
  const results: MetaCheckResult[] = [];
  // Run sequentially to avoid DB contention
  for (const fn of [
    checkOrphanedTestSuites,
    checkUntestedCapabilities,
    checkStaleTests,
    checkMissingTestCoverage,
    checkScoreWithoutEvidence,
    checkStuckScores,
    checkImpossibleScores,
    checkSqsPassRateDivergence,
    checkMethodologyDrift,
  ]) {
    results.push(await fn());
  }
  await _logSummary("weekly", results);
  return results;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _logMetaEvent(
  check: string,
  severity: "critical" | "warning" | "info",
  description: string,
  details: Record<string, unknown>,
): Promise<void> {
  await logHealthEvent({
    eventType: "meta_monitoring",
    tier: severity === "critical" ? 3 : 2,
    actionTaken: `[${check}] ${description}`,
    details: { check, severity, ...details },
  });
}

async function _logSummary(
  frequency: "daily" | "weekly",
  results: MetaCheckResult[],
): Promise<void> {
  const passed = results.filter((r) => r.passed).length;
  const warnings = results.filter((r) => !r.passed && r.severity === "warning").length;
  const criticals = results.filter((r) => !r.passed && r.severity === "critical").length;

  await logHealthEvent({
    eventType: "meta_monitoring",
    tier: criticals > 0 ? 3 : warnings > 0 ? 2 : 1,
    actionTaken: `Meta-monitoring ${frequency} run: ${passed} passed, ${warnings} warnings, ${criticals} criticals`,
    details: {
      frequency,
      passed,
      warnings,
      criticals,
      results: results.map((r) => ({
        check: r.check,
        passed: r.passed,
        severity: r.severity,
        affected_count: r.affected?.length ?? 0,
      })),
    },
  });
}
