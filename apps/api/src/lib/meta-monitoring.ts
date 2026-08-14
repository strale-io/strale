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
import type { LifecycleState } from "./lifecycle.js";
import {
  checkChainPendingBacklog,
  checkChainFailedCount,
  checkChainStuckDeferred,
  checkChainUnhashedLegacyCount,
} from "./chain-health-monitoring.js";

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

// ─── 8D: Daily pipeline health checks ────────────────────────────────────────

// Staleness anchor for lifecycle-state checks. Uses the MAX(created_at) of any
// lifecycle_transition event into the target state (definitive: a transition
// happened then), falling back to capabilities.created_at for rows that
// originated in the target state and have never transitioned. capabilities.
// updated_at is NOT safe here — the test scheduler bumps it on routine
// touches and silently resets the apparent "stuck" age. SI was stuck
// 2026-05-07 → 2026-05-11 but the original updated_at-based query intermittently
// missed it because background updates kept resetting the clock.
// Per DEC-20260511-E.
//
// `targetState` is typed against the lifecycle state union — a typo like
// `"validateing"` would compile against `string` and silently return 0 rows
// forever, exactly the SI-grade silent-failure mode this DEC fixes.
// `ageInterval` is narrowed to known literals because it is interpolated via
// `sql.raw()` (postgres-js cannot bind INTERVAL via parameters); narrowing
// keeps the call site safe-by-construction and prevents future drift toward
// user-controlled values.
type LifecycleAgeInterval = "48 hours" | "7 days";

function lifecycleStateAgeSql(targetState: LifecycleState, ageInterval: LifecycleAgeInterval) {
  const intervalSql = sql.raw(`INTERVAL '${ageInterval}'`);
  return sql`
    WITH cap_state_entry AS (
      SELECT
        c.slug,
        COALESCE(
          (
            SELECT MAX(e.created_at)
            FROM health_monitor_events e
            WHERE e.capability_slug = c.slug
              AND e.event_type = 'lifecycle_transition'
              AND e.details->>'to' = ${targetState}
          ),
          c.created_at
        ) AS state_entered_at
      FROM capabilities c
      WHERE c.lifecycle_state = ${targetState}
        AND c.is_active = true
    )
    SELECT slug, state_entered_at
    FROM cap_state_entry
    WHERE state_entered_at < NOW() - ${intervalSql}
    ORDER BY state_entered_at
  `;
}

/**
 * Check 11: Validation queue stuck (DEC-20260511-E)
 *
 * Capabilities in 'validating' for >48h, anchored on the lifecycle_transition
 * event into 'validating' (not capabilities.updated_at, which is bumped by
 * routine background touches and silently masked the SI incident).
 *
 * On detection, surfaces each stuck row as a [stuck-validating] GitHub Issue
 * in strale-io/strale via the existing GITHUB_TOKEN env var. Issues are
 * idempotent (existing one gets a comment, not a duplicate). When a slug
 * is no longer in the stuck set, its open issue is auto-closed.
 *
 * Surface = GitHub Issues (not the daily digest — pipeline confirmed broken
 * for 27+ days, see DEC-20260511-F).
 */
export async function checkValidationQueueStuck(): Promise<MetaCheckResult> {
  const check = "validation_queue_stuck";
  try {
    const db = getDb();
    const rows = await db.execute(lifecycleStateAgeSql("validating", "48 hours"));
    const results = (Array.isArray(rows) ? rows : (rows as any).rows) as Array<{
      slug: string;
      state_entered_at: string;
    }>;

    // Sync GitHub Issues regardless of stuck-count: empty set = close any leftovers.
    const { syncStuckValidatingIssues } = await import("./github-issues.js");

    if (results.length === 0) {
      await syncStuckValidatingIssues([]);
      return { check, severity: "warning", passed: true, details: "No capabilities stuck in validating state" };
    }

    const now = new Date();
    const issuePayloads = results.map((r) => {
      const enteredAt = new Date(r.state_entered_at);
      const totalHours = Math.floor((now.getTime() - enteredAt.getTime()) / 3_600_000);
      const days = Math.floor(totalHours / 24);
      const hours = totalHours % 24;
      const age = days > 0 ? `${days}d ${hours}h` : `${totalHours}h`;
      const body = [
        `**Capability:** \`${r.slug}\``,
        `**Stuck for:** ${age} (since ${enteredAt.toISOString()})`,
        ``,
        `**Action:** run \`cd apps/api && npx tsx scripts/validate-capability.ts --slug ${r.slug} --apply\` once gate failures are addressed. Read-only sanity check first: omit \`--apply\` to see which Gate 1 checks fail.`,
        ``,
        `**Why this is open:** DEC-20260511-E surfaces capabilities sitting in lifecycle_state='validating' beyond 48h. Auto-closes when the row leaves 'validating'.`,
      ].join("\n");
      return { slug: r.slug, body };
    });

    await syncStuckValidatingIssues(issuePayloads);

    const affected = results.map((r) => r.slug);
    await _logMetaEvent(check, "warning", `${affected.length} capability(ies) stuck in validating state >48h`, {
      affected: results.map((r) => ({ slug: r.slug, state_entered_at: r.state_entered_at })),
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
 *
 * Capabilities in 'probation' for >7d. Same staleness-anchor fix as
 * validation_queue_stuck — anchored on lifecycle_transition into 'probation',
 * not capabilities.updated_at. Per DEC-20260511-E.
 */
export async function checkProbationTimeout(): Promise<MetaCheckResult> {
  const check = "probation_timeout";
  try {
    const db = getDb();
    const rows = await db.execute(lifecycleStateAgeSql("probation", "7 days"));
    const results = (Array.isArray(rows) ? rows : (rows as any).rows) as Array<{
      slug: string;
      state_entered_at: string;
    }>;

    if (results.length === 0) {
      return { check, severity: "warning", passed: true, details: "No capabilities stuck in probation" };
    }

    const affected = results.map((r) => r.slug);
    await _logMetaEvent(check, "warning", `${affected.length} capability(ies) stuck in probation >7d`, {
      affected: results.map((r) => ({ slug: r.slug, state_entered_at: r.state_entered_at })),
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
 * All deterministic — zero external_service_failures expected.
 */
export async function checkFreeTierHealth(): Promise<MetaCheckResult> {
  const check = "free_tier_health";
  try {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT c.slug, c.capability_type,
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
      capability_type: string;
      external_failures_7d: number;
    }>;

    const issues: string[] = [];
    for (const r of results) {
      if (r.external_failures_7d > 0) {
        issues.push(`${r.slug}: ${r.external_failures_7d} external failures in 7d (deterministic capability)`);
      }
    }

    if (issues.length === 0) {
      return { check, severity: "critical", passed: true, details: "All 5 free-tier capabilities healthy (no external failures)" };
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

// ─── Check 17: Capability test-staleness fleet count (CRITICAL, hourly) ────

/**
 * Check 17: Capability staleness (CRITICAL)
 * Counts active capabilities whose last_tested_at exceeds 4× their tier
 * interval (the "aging → stale" boundary in lib/freshness-decay.ts). The
 * scheduler-heartbeat check answers "did the scheduler tick?", which can be
 * true while individual caps go untested for weeks (the 2026-04-26 incident).
 * This check answers the right invariant: "are caps actually getting tested
 * at expected cadence?".
 *
 * Threshold: alert when more than STALE_THRESHOLD caps are stale, or when
 * never-tested active caps exist.
 */
const STALE_THRESHOLD = 5;

export async function checkCapabilityStaleness(): Promise<MetaCheckResult> {
  const check = "capability_staleness";
  try {
    const db = getDb();
    const rows = await db.execute(sql`
      WITH cap_tier AS (
        SELECT
          c.slug,
          c.last_tested_at,
          MIN(ts.schedule_tier) AS tier
        FROM capabilities c
        INNER JOIN test_suites ts
          ON ts.capability_slug = c.slug AND ts.active = true
        WHERE c.is_active = true
        GROUP BY c.slug, c.last_tested_at
      )
      SELECT
        slug,
        last_tested_at,
        tier,
        CASE
          WHEN last_tested_at IS NULL THEN NULL
          ELSE EXTRACT(EPOCH FROM (NOW() - last_tested_at)) / 3600
        END AS hours_since
      FROM cap_tier
      WHERE
        last_tested_at IS NULL
        OR last_tested_at < NOW() - (
          CASE tier
            WHEN 'A' THEN INTERVAL '24 hours'
            WHEN 'B' THEN INTERVAL '96 hours'
            WHEN 'C' THEN INTERVAL '288 hours'
            ELSE INTERVAL '96 hours'
          END
        )
      ORDER BY last_tested_at ASC NULLS FIRST
    `);
    const stale = (Array.isArray(rows) ? rows : (rows as any).rows) as Array<{
      slug: string;
      last_tested_at: Date | null;
      tier: string;
      hours_since: string | null;
    }>;

    const neverTested = stale.filter((s) => s.last_tested_at === null);
    const overdueCount = stale.length;
    const affected = stale.slice(0, 20).map((s) => s.slug);

    if (overdueCount === 0) {
      return {
        check,
        severity: "info",
        passed: true,
        details: "All active capabilities tested within 4× tier interval",
      };
    }

    if (overdueCount <= STALE_THRESHOLD && neverTested.length === 0) {
      return {
        check,
        severity: "warning",
        passed: true,
        details: `${overdueCount} capabilities stale (within tolerance of ${STALE_THRESHOLD})`,
        affected,
      };
    }

    const severity: "critical" | "warning" =
      overdueCount > STALE_THRESHOLD * 4 || neverTested.length > 0 ? "critical" : "warning";

    await _logMetaEvent(
      check,
      severity,
      `${overdueCount} active capabilities stale beyond 4× tier interval (${neverTested.length} never tested)`,
      { stale_count: overdueCount, never_tested_count: neverTested.length, affected },
    );

    return {
      check,
      severity,
      passed: false,
      details: `${overdueCount} capabilities stale (${neverTested.length} never tested) — scheduler may be falling behind or skipping these`,
      affected,
    };
  } catch (err) {
    return {
      check,
      severity: "warning",
      passed: false,
      details: `Check failed: ${err instanceof Error ? err.message : err}`,
    };
  }
}

// ─── Check registry ──────────────────────────────────────────────────────────
//
// Single source of truth for which checks run on which schedule. The runner
// functions below (runHourlyChecks / runDailyChecks / runWeeklyChecks) all
// derive their work from this registry — adding a new check means adding a
// row here, not editing three call sites.
//
// `meta-monitoring.test.ts` asserts that every exported `check*` function in
// this module is either listed below OR present in CHECKS_EXEMPT_FROM_AUTO_RUN.
// That assertion is what closes the "wrote a watchdog, never wired it" gap
// that hid the 2026-04-26 scheduler staleness for 9 days.

export type CheckSchedule = "post_test_run" | "hourly" | "daily" | "weekly";

export interface CheckRegistration {
  name: string;
  fn: () => Promise<MetaCheckResult>;
  schedule: Exclude<CheckSchedule, "post_test_run">;
}

export const CHECK_REGISTRY: CheckRegistration[] = [
  // Hourly — fast critical-path checks of the platform's own pulse
  { name: "scheduler_heartbeat",   fn: checkSchedulerHeartbeat,   schedule: "hourly" },
  { name: "capability_staleness",  fn: checkCapabilityStaleness,  schedule: "hourly" },
  // CCO P0 #14 / CRIT-11: integrity-hash chain health. The audit subsystem
  // is the platform's central trust promise — none of the prior 17 checks
  // touched it. A silent retry-worker stall = pending rows pile up =
  // /v1/audit/:id 202s indefinitely = customers can't get compliance
  // records and the brand promise fails silently. See chain-health-monitoring.ts.
  { name: "chain_pending_backlog",       fn: checkChainPendingBacklog,       schedule: "hourly" },
  { name: "chain_failed_count",          fn: checkChainFailedCount,          schedule: "hourly" },
  { name: "chain_stuck_deferred",        fn: checkChainStuckDeferred,        schedule: "hourly" },

  // Daily — pipeline + free-tier health
  { name: "validation_queue_stuck", fn: checkValidationQueueStuck, schedule: "daily" },
  { name: "probation_timeout",     fn: checkProbationTimeout,     schedule: "daily" },
  { name: "degraded_count",        fn: checkDegradedCount,        schedule: "daily" },
  { name: "free_tier_health",      fn: checkFreeTierHealth,       schedule: "daily" },
  // Daily — informational count of pre-chain rows from migration 0047/0052.
  // Stable count; not an alert; verifies methodology page disclosure.
  { name: "chain_unhashed_legacy_count", fn: checkChainUnhashedLegacyCount, schedule: "daily" },

  // Weekly — coverage sweeps (DB-heavy). SQS integrity checks retired
  // (DEC-20260503-B): score_without_evidence / stuck_scores /
  // impossible_scores / sqs_pass_rate_divergence.
  { name: "orphaned_test_suites",  fn: checkOrphanedTestSuites,   schedule: "weekly" },
  { name: "untested_capabilities", fn: checkUntestedCapabilities, schedule: "weekly" },
  { name: "stale_tests",           fn: checkStaleTests,           schedule: "weekly" },
  { name: "missing_test_coverage", fn: checkMissingTestCoverage,  schedule: "weekly" },
  { name: "methodology_drift",     fn: checkMethodologyDrift,     schedule: "weekly" },
];

/**
 * Names of `check*` exports that are intentionally NOT in the registry.
 * Each entry must explain why; the registry assertion test reads these
 * comments when a maintainer is debugging a failure.
 *
 *   - check_new_failure_alert / check_infrastructure_health: take a
 *     `BatchTestResult[]` argument and are invoked per-test-batch from
 *     test-runner.ts (not on a fixed cadence).
 */
export const CHECKS_EXEMPT_FROM_AUTO_RUN: ReadonlySet<string> = new Set([
  "checkNewFailures",
  "checkInfrastructureHealth",
]);

// ─── Batch runners ───────────────────────────────────────────────────────────

async function runScheduled(
  schedule: CheckRegistration["schedule"],
  parallel: boolean,
): Promise<MetaCheckResult[]> {
  const checks = CHECK_REGISTRY.filter((c) => c.schedule === schedule);
  let results: MetaCheckResult[];
  if (parallel) {
    results = await Promise.all(checks.map((c) => c.fn()));
  } else {
    results = [];
    for (const c of checks) {
      results.push(await c.fn());
    }
  }
  await _logSummary(schedule, results);
  return results;
}

/** Hourly checks: scheduler heartbeat + capability staleness */
export async function runHourlyChecks(): Promise<MetaCheckResult[]> {
  return runScheduled("hourly", true);
}

/** Daily checks: pipeline + free-tier health */
export async function runDailyChecks(): Promise<MetaCheckResult[]> {
  return runScheduled("daily", true);
}

/** Weekly checks: coverage + SQS integrity (sequential — DB contention) */
export async function runWeeklyChecks(): Promise<MetaCheckResult[]> {
  return runScheduled("weekly", false);
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
  frequency: "hourly" | "daily" | "weekly",
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
