import { Hono } from "hono";
import { eq, and, desc, sql, asc } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { getDb } from "../db/index.js";
import {
  testSuites,
  testResults,
  testRunLog,
  solutions,
  solutionSteps,
  capabilities,
  healthMonitorEvents,
} from "../db/schema.js";
import { runTests } from "../lib/test-runner.js";
import type { ScheduleTier } from "../lib/test-runner.js";
import { getExecutor } from "../capabilities/index.js";
import { generateTestInput } from "../lib/test-input-generator.js";
import { categorizeFailureReason, sanitizeErrorMessage } from "../lib/trust-helpers.js";
import { sanitizeFailureReason } from "../lib/sanitize.js";
import { runDependencyHealthChecks } from "../lib/dependency-health.js";
import { getCredentialStatus } from "../lib/credential-health.js";
import { classifyFieldVolatility, makeVolatilityAwareCheck } from "../lib/field-volatility.js";
import { apiError } from "../lib/errors.js";
import { rateLimitByIp } from "../lib/rate-limit.js";
import type { AppEnv } from "../types.js";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

// ─── In-memory cache (5-min TTL) ────────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { data: unknown; expiresAt: number }>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Constant-time comparison for admin auth to prevent timing attacks. */
function isValidAdminAuth(auth: string | undefined): boolean {
  if (!auth || !ADMIN_SECRET) return false;
  const expected = Buffer.from(`Bearer ${ADMIN_SECRET}`, "utf-8");
  const provided = Buffer.from(auth, "utf-8");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

// ─── Schedule intervals for next_scheduled_run computation ──────────────────
const TIER_INTERVAL_MS: Record<string, number> = {
  A: 6 * 60 * 60 * 1000,
  B: 24 * 60 * 60 * 1000,
  C: 72 * 60 * 60 * 1000,
};

function computeNextRun(
  tier: string,
  lastRun: string | null,
): string | null {
  if (!lastRun) return null;
  const interval = TIER_INTERVAL_MS[tier];
  if (!interval) return null;
  return new Date(new Date(lastRun).getTime() + interval).toISOString();
}

// Internal test endpoints — no auth required, called by strale.dev frontend
export const internalTestsRoute = new Hono<AppEnv>();

// POST /v1/internal/tests/run — trigger a test run (admin-only)
// Query params: ?slug= (capability), ?tier=A|B|C
// No IP rate limit here — ADMIN_SECRET is the sole access control. The secret
// requirement already prevents abuse; a rate limit would block bulk test runs.
internalTestsRoute.post("/run", async (c) => {
  // Require ADMIN_SECRET — test runs call external APIs costing real money
  if (!ADMIN_SECRET) {
    return c.json(apiError("unauthorized", "Admin endpoint is not configured."), 503);
  }
  const auth = c.req.header("Authorization");
  if (!isValidAdminAuth(auth)) {
    return c.json(apiError("unauthorized", "Invalid admin secret."), 401);
  }

  const slug = c.req.query("slug");
  const tier = c.req.query("tier") as ScheduleTier | undefined;
  const summary = await runTests({
    capabilitySlug: slug || undefined,
    tier: tier || undefined,
  });
  return c.json(summary);
});

// GET /v1/internal/tests/capabilities/:slug — latest test results
internalTestsRoute.get("/capabilities/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = getDb();

  const suites = await db
    .select()
    .from(testSuites)
    .where(
      and(eq(testSuites.capabilitySlug, slug), eq(testSuites.active, true)),
    );

  if (suites.length === 0) {
    return c.json(
      apiError("not_found", `No test suites found for capability '${slug}'.`),
      404,
    );
  }

  // All suites for a capability share the same tier
  const scheduleTier = suites[0].scheduleTier;

  const tests = await Promise.all(
    suites.map(async (suite) => {
      const [latest] = await db
        .select()
        .from(testResults)
        .where(eq(testResults.testSuiteId, suite.id))
        .orderBy(desc(testResults.executedAt))
        .limit(1);

      return {
        test_name: suite.testName,
        test_type: suite.testType,
        passed: latest?.passed ?? null,
        failure_reason: latest?.failureReason ? sanitizeFailureReason(latest.failureReason) : null,
        response_time_ms: latest?.responseTimeMs ?? null,
        executed_at: latest?.executedAt?.toISOString() ?? null,
      };
    }),
  );

  const withResults = tests.filter((t) => t.passed !== null);
  const passed = withResults.filter((t) => t.passed === true).length;
  const failed = withResults.filter((t) => t.passed === false).length;
  const totalResponseTime = withResults.reduce(
    (sum, t) => sum + (t.response_time_ms ?? 0),
    0,
  );
  const lastRun =
    withResults
      .map((t) => t.executed_at)
      .filter(Boolean)
      .sort()
      .pop() ?? null;

  // Group by test_type
  const byType: Record<string, { total: number; passed: number; failed: number }> = {};
  for (const t of tests) {
    const type = t.test_type ?? "unknown";
    if (!byType[type]) byType[type] = { total: 0, passed: 0, failed: 0 };
    byType[type].total++;
    if (t.passed === true) byType[type].passed++;
    if (t.passed === false) byType[type].failed++;
  }

  // Collect failures with categorization
  const failures = tests
    .filter((t) => t.passed === false && t.failure_reason)
    .map((t) => ({
      test_name: t.test_name,
      test_type: t.test_type,
      failure_reason: sanitizeFailureReason(t.failure_reason),
      failure_category: categorizeFailureReason(t.failure_reason),
    }));

  return c.json({
    capability_slug: slug,
    schedule_tier: scheduleTier,
    last_run: lastRun,
    next_scheduled_run: computeNextRun(scheduleTier, lastRun),
    total_tests: suites.length,
    passed,
    failed,
    pass_rate:
      withResults.length > 0
        ? parseFloat(((passed / withResults.length) * 100).toFixed(1))
        : null,
    avg_response_time_ms:
      withResults.length > 0
        ? Math.round(totalResponseTime / withResults.length)
        : null,
    by_type: byType,
    ...(failures.length > 0 ? { failures } : {}),
    tests,
  });
});

// GET /v1/internal/tests/capabilities/:slug/history — 30-day daily aggregates
internalTestsRoute.get("/capabilities/:slug/history", async (c) => {
  const slug = c.req.param("slug");
  const db = getDb();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Use the latest result per test suite per day (not daily average)
  // so the chart matches the hero metric which shows latest state
  const rows = await db.execute<{
    date: string;
    total: string;
    passed: string;
    failed: string;
    avg_response_time_ms: string;
  }>(sql`
    WITH latest_per_suite_per_day AS (
      SELECT DISTINCT ON (tr.test_suite_id, DATE(tr.executed_at AT TIME ZONE 'UTC'))
        DATE(tr.executed_at AT TIME ZONE 'UTC') AS date,
        tr.passed,
        tr.response_time_ms
      FROM test_results tr
      WHERE tr.capability_slug = ${slug}
        AND tr.executed_at >= ${thirtyDaysAgo.toISOString()}::timestamptz
      ORDER BY tr.test_suite_id, DATE(tr.executed_at AT TIME ZONE 'UTC'), tr.executed_at DESC
    )
    SELECT
      date,
      COUNT(*)::text AS total,
      SUM(CASE WHEN passed THEN 1 ELSE 0 END)::text AS passed,
      SUM(CASE WHEN NOT passed THEN 1 ELSE 0 END)::text AS failed,
      ROUND(AVG(response_time_ms))::text AS avg_response_time_ms
    FROM latest_per_suite_per_day
    GROUP BY date
    ORDER BY date
  `);

  const data = Array.isArray(rows) ? rows : (rows as any)?.rows ?? [];

  return c.json({
    capability_slug: slug,
    history: data.map((row: any) => ({
      date: row.date,
      total: parseInt(row.total, 10),
      passed: parseInt(row.passed, 10),
      failed: parseInt(row.failed, 10),
      pass_rate: parseFloat(
        (
          (parseInt(row.passed, 10) / parseInt(row.total, 10)) *
          100
        ).toFixed(1),
      ),
      avg_response_time_ms: parseInt(row.avg_response_time_ms, 10),
    })),
  });
});

// GET /v1/internal/tests/capabilities/:slug/runs — individual test runs, newest first
internalTestsRoute.get("/capabilities/:slug/runs", async (c) => {
  const slug = c.req.param("slug");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "10", 10), 50);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  const cacheKey = `test-runs:cap:${slug}:${limit}:${offset}`;
  const cached = getCached<any>(cacheKey);
  if (cached) return c.json(cached);

  const db = getDb();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString();

  // Get total number of distinct runs (last 30 days)
  const countRows = await db.execute(sql`
    SELECT COUNT(DISTINCT DATE_TRUNC('minute', tr.executed_at))::text AS total_runs
    FROM test_results tr
    WHERE tr.capability_slug = ${slug}
      AND tr.executed_at >= ${cutoff}::timestamptz
  `);
  const countData = (Array.isArray(countRows) ? countRows : (countRows as any)?.rows ?? []) as any[];
  const totalRuns = parseInt(countData[0]?.total_runs ?? "0", 10);

  // Get distinct run timestamps (grouped by executed_at rounded to the minute)
  const runRows = await db.execute(sql`
    SELECT
      DATE_TRUNC('minute', tr.executed_at) AS executed_at,
      COUNT(*)::text AS total,
      SUM(CASE WHEN tr.passed THEN 1 ELSE 0 END)::text AS passed,
      SUM(CASE WHEN NOT tr.passed THEN 1 ELSE 0 END)::text AS failed,
      ROUND(AVG(tr.response_time_ms))::text AS avg_response_time_ms
    FROM test_results tr
    WHERE tr.capability_slug = ${slug}
      AND tr.executed_at >= ${cutoff}::timestamptz
    GROUP BY DATE_TRUNC('minute', tr.executed_at)
    ORDER BY executed_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  const runs = (Array.isArray(runRows) ? runRows : (runRows as any)?.rows ?? []) as any[];

  // For each run, get failure details
  const runsWithDetails = await Promise.all(
    runs.map(async (run: any) => {
      const total = parseInt(run.total, 10);
      const passedCount = parseInt(run.passed, 10);
      const failedCount = parseInt(run.failed, 10);
      const passRate = total > 0
        ? parseFloat(((passedCount / total) * 100).toFixed(1))
        : null;

      let failures: Array<{
        test_name: string;
        test_type: string;
        failure_reason: string;
        failure_category: string;
      }> = [];

      if (failedCount > 0) {
        const failRows = await db.execute(sql`
          SELECT
            ts.test_name,
            ts.test_type,
            tr.failure_reason
          FROM test_results tr
          INNER JOIN test_suites ts ON ts.id = tr.test_suite_id
          WHERE tr.capability_slug = ${slug}
            AND DATE_TRUNC('minute', tr.executed_at) = ${run.executed_at}::timestamptz
            AND tr.passed = false
        `);
        const failData = (Array.isArray(failRows) ? failRows : (failRows as any)?.rows ?? []) as any[];
        failures = failData.map((f: any) => ({
          test_name: f.test_name,
          test_type: f.test_type,
          failure_reason: sanitizeFailureReason(f.failure_reason),
          failure_category: categorizeFailureReason(f.failure_reason),
        }));
      }

      return {
        executed_at: run.executed_at,
        total,
        passed: passedCount,
        failed: failedCount,
        pass_rate: passRate,
        avg_response_time_ms: parseInt(run.avg_response_time_ms, 10),
        failures,
      };
    }),
  );

  const result = {
    capability_slug: slug,
    total_runs: totalRuns,
    runs: runsWithDetails,
    has_more: offset + runs.length < totalRuns,
  };
  setCache(cacheKey, result);
  return c.json(result);
});

// GET /v1/internal/tests/solutions/:slug — aggregated across solution steps
internalTestsRoute.get("/solutions/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = getDb();

  const steps = await db
    .select({ capabilitySlug: solutionSteps.capabilitySlug })
    .from(solutionSteps)
    .innerJoin(solutions, eq(solutionSteps.solutionId, solutions.id))
    .where(eq(solutions.slug, slug))
    .orderBy(asc(solutionSteps.stepOrder));

  if (steps.length === 0) {
    return c.json(
      apiError("not_found", `Solution '${slug}' not found.`),
      404,
    );
  }

  const stepResults = await Promise.all(
    steps.map(async (step) => {
      const suites = await db
        .select()
        .from(testSuites)
        .where(
          and(
            eq(testSuites.capabilitySlug, step.capabilitySlug),
            eq(testSuites.active, true),
          ),
        );

      const scheduleTier = suites[0]?.scheduleTier ?? "B";
      let passed = 0;
      let failed = 0;
      let totalResponseTime = 0;
      let withResults = 0;
      let lastRun: string | null = null;

      for (const suite of suites) {
        const [latest] = await db
          .select()
          .from(testResults)
          .where(eq(testResults.testSuiteId, suite.id))
          .orderBy(desc(testResults.executedAt))
          .limit(1);

        if (latest) {
          withResults++;
          if (latest.passed) passed++;
          else failed++;
          totalResponseTime += latest.responseTimeMs;
          if (!lastRun || latest.executedAt.toISOString() > lastRun) {
            lastRun = latest.executedAt.toISOString();
          }
        }
      }

      return {
        capability_slug: step.capabilitySlug,
        schedule_tier: scheduleTier,
        total_tests: suites.length,
        passed,
        failed,
        pass_rate:
          withResults > 0
            ? parseFloat(((passed / withResults) * 100).toFixed(1))
            : null,
        avg_response_time_ms:
          withResults > 0
            ? Math.round(totalResponseTime / withResults)
            : null,
        last_run: lastRun,
      };
    }),
  );

  // Aggregate across all steps
  const allPassed = stepResults.reduce((s, r) => s + r.passed, 0);
  const allFailed = stepResults.reduce((s, r) => s + r.failed, 0);
  const allTotal = stepResults.reduce((s, r) => s + r.total_tests, 0);
  const allWithResults = allPassed + allFailed;
  const allResponseTime = stepResults.reduce(
    (s, r) => s + (r.avg_response_time_ms ?? 0) * (r.passed + r.failed),
    0,
  );

  // Freshness: find newest and oldest test timestamps
  const allRunTimes = stepResults
    .map((r) => r.last_run)
    .filter((t): t is string => t !== null);
  const sortedTimes = allRunTimes.sort();
  const freshestTest = sortedTimes[sortedTimes.length - 1] ?? null;
  const stalestTest = sortedTimes[0] ?? null;

  return c.json({
    solution_slug: slug,
    last_run: freshestTest,
    freshest_test: freshestTest,
    stalest_test: stalestTest,
    total_tests: allTotal,
    passed: allPassed,
    failed: allFailed,
    pass_rate:
      allWithResults > 0
        ? parseFloat(((allPassed / allWithResults) * 100).toFixed(1))
        : null,
    avg_response_time_ms:
      allWithResults > 0
        ? Math.round(allResponseTime / allWithResults)
        : null,
    steps: stepResults,
  });
});

// GET /v1/internal/tests/solutions/:slug/runs — test runs aggregated across solution steps
// Uses 30-minute time windows to group cross-step capability tests into single solution runs
internalTestsRoute.get("/solutions/:slug/runs", async (c) => {
  const slug = c.req.param("slug");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "10", 10), 50);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  const cacheKey = `test-runs:sol:${slug}:${limit}:${offset}`;
  const cached = getCached<any>(cacheKey);
  if (cached) return c.json(cached);

  const db = getDb();

  // Get capability slugs for this solution
  const steps = await db
    .select({ capabilitySlug: solutionSteps.capabilitySlug })
    .from(solutionSteps)
    .innerJoin(solutions, eq(solutionSteps.solutionId, solutions.id))
    .where(eq(solutions.slug, slug))
    .orderBy(asc(solutionSteps.stepOrder));

  if (steps.length === 0) {
    return c.json(
      apiError("not_found", `Solution '${slug}' not found.`),
      404,
    );
  }

  const capSlugs = steps.map((s) => s.capabilitySlug);
  const stepCount = capSlugs.length;
  const slugList = sql.join(capSlugs.map((s) => sql`${s}`), sql`, `);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString();

  // 30-minute bucket expression: groups cross-step tests into single solution runs
  // floor(epoch / 1800) * 1800 gives the start of each 30-min window
  const bucket = sql`TO_TIMESTAMP(FLOOR(EXTRACT(EPOCH FROM tr.executed_at) / 1800) * 1800)`;

  // Count only complete runs (all solution steps tested in the window)
  const countRows = await db.execute(sql`
    SELECT COUNT(*)::text AS total_runs FROM (
      SELECT ${bucket} AS run_window
      FROM test_results tr
      WHERE tr.capability_slug IN (${slugList})
        AND tr.executed_at >= ${cutoff}::timestamptz
      GROUP BY ${bucket}
      HAVING COUNT(DISTINCT tr.capability_slug) >= ${stepCount}
    ) complete_runs
  `);
  const countData = (Array.isArray(countRows) ? countRows : (countRows as any)?.rows ?? []) as any[];
  const totalRuns = parseInt(countData[0]?.total_runs ?? "0", 10);

  // Get aggregated solution runs — only complete runs where all steps were tested
  const runRows = await db.execute(sql`
    SELECT
      ${bucket} AS run_window,
      MIN(tr.executed_at) AS window_start,
      MAX(tr.executed_at) AS window_end,
      COUNT(*)::text AS total,
      SUM(CASE WHEN tr.passed THEN 1 ELSE 0 END)::text AS passed,
      SUM(CASE WHEN NOT tr.passed THEN 1 ELSE 0 END)::text AS failed,
      ROUND(AVG(tr.response_time_ms))::text AS avg_response_time_ms,
      COUNT(DISTINCT tr.capability_slug)::text AS capabilities_tested
    FROM test_results tr
    WHERE tr.capability_slug IN (${slugList})
      AND tr.executed_at >= ${cutoff}::timestamptz
    GROUP BY ${bucket}
    HAVING COUNT(DISTINCT tr.capability_slug) >= ${stepCount}
    ORDER BY run_window DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  const runs = (Array.isArray(runRows) ? runRows : (runRows as any)?.rows ?? []) as any[];

  // For each run window, get failure details with capability info
  const runsWithDetails = await Promise.all(
    runs.map(async (run: any) => {
      const total = parseInt(run.total, 10);
      const passedCount = parseInt(run.passed, 10);
      const failedCount = parseInt(run.failed, 10);
      const passRate = total > 0
        ? parseFloat(((passedCount / total) * 100).toFixed(1))
        : null;

      let failures: Array<{
        test_name: string;
        test_type: string;
        capability_slug: string;
        capability_name: string;
        failure_reason: string;
        failure_category: string;
      }> = [];

      if (failedCount > 0) {
        const failRows = await db.execute(sql`
          SELECT
            ts.test_name,
            ts.test_type,
            tr.capability_slug,
            c.name AS capability_name,
            tr.failure_reason
          FROM test_results tr
          INNER JOIN test_suites ts ON ts.id = tr.test_suite_id
          LEFT JOIN capabilities c ON c.slug = tr.capability_slug
          WHERE tr.capability_slug IN (${slugList})
            AND ${bucket} = ${run.run_window}::timestamptz
            AND tr.passed = false
        `);
        const failData = (Array.isArray(failRows) ? failRows : (failRows as any)?.rows ?? []) as any[];
        failures = failData.map((f: any) => ({
          test_name: f.test_name,
          test_type: f.test_type,
          capability_slug: f.capability_slug,
          capability_name: f.capability_name ?? f.capability_slug,
          failure_reason: sanitizeFailureReason(f.failure_reason),
          failure_category: categorizeFailureReason(f.failure_reason),
        }));
      }

      return {
        executed_at: run.window_end,
        total,
        passed: passedCount,
        failed: failedCount,
        pass_rate: passRate,
        avg_response_time_ms: parseInt(run.avg_response_time_ms, 10),
        capabilities_tested: parseInt(run.capabilities_tested, 10),
        failures,
      };
    }),
  );

  const result = {
    solution_slug: slug,
    total_runs: totalRuns,
    runs: runsWithDetails,
    has_more: offset + runs.length < totalRuns,
  };
  setCache(cacheKey, result);
  return c.json(result);
});

// GET /v1/internal/capabilities/:slug/example-output — latest successful test output
internalTestsRoute.get("/capabilities/:slug/example-output", async (c) => {
  const slug = c.req.param("slug");

  const cacheKey = `example-output:${slug}`;
  const cached = getCached<any>(cacheKey);
  if (cached) return c.json(cached);

  const db = getDb();
  const rows = await db.execute(sql`
    SELECT actual_output, executed_at
    FROM test_results
    WHERE capability_slug = ${slug}
      AND passed = true
      AND actual_output IS NOT NULL
    ORDER BY executed_at DESC
    LIMIT 1
  `);

  const data = (Array.isArray(rows) ? rows : (rows as any)?.rows ?? []) as any[];
  if (data.length === 0) {
    return c.json(apiError("not_found", `No successful test output found for '${slug}'.`), 404);
  }

  const row = data[0];
  const result = {
    capability_slug: slug,
    example_output: row.actual_output,
    captured_at: row.executed_at instanceof Date ? row.executed_at.toISOString() : String(row.executed_at),
  };
  setCache(cacheKey, result);
  return c.json(result);
});

// GET /v1/internal/tests/health — dependency health checks (free HTTP pings)
internalTestsRoute.get("/health", async (c) => {
  const results = await runDependencyHealthChecks();
  const allHealthy = Object.values(results).every((r) => r.healthy);
  const credentials = getCredentialStatus();
  const missingCreds = credentials.filter((c) => !c.isConfigured && c.capabilities.length > 0);
  return c.json({
    status: allHealthy && missingCreds.length === 0 ? "healthy" : "degraded",
    dependencies: results,
    credentials: credentials.map((c) => ({
      provider: c.provider,
      configured: c.isConfigured,
      affected_capabilities: c.isConfigured ? undefined : c.capabilities.length,
    })),
  });
});

// GET /v1/internal/tests/dependency-health/summary — 7-day uptime for all dependencies
internalTestsRoute.get("/dependency-health/summary", async (c) => {
  const cacheKey = "dep-health:summary";
  const cached = getCached(cacheKey);
  if (cached) return c.json(cached);

  const db = getDb();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const rows = await db
    .select({
      details: healthMonitorEvents.details,
      createdAt: healthMonitorEvents.createdAt,
    })
    .from(healthMonitorEvents)
    .where(
      and(
        eq(healthMonitorEvents.eventType, "dependency_probe"),
        sql`${healthMonitorEvents.createdAt} >= ${sevenDaysAgo.toISOString()}::timestamptz`,
      ),
    )
    .orderBy(desc(healthMonitorEvents.createdAt));

  const byDep = new Map<string, Array<{ healthy: boolean; latency_ms: number; checked_at: string; error?: string }>>();

  for (const row of rows) {
    const d = row.details as { dependency: string; healthy: boolean; latency_ms: number; error?: string | null };
    if (!d?.dependency) continue;
    if (!byDep.has(d.dependency)) byDep.set(d.dependency, []);
    byDep.get(d.dependency)!.push({
      healthy: d.healthy,
      latency_ms: d.latency_ms,
      checked_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      ...(d.error ? { error: d.error } : {}),
    });
  }

  const dependencies: Record<string, unknown> = {};
  for (const [name, probes] of byDep) {
    const healthyCount = probes.filter((p) => p.healthy).length;
    const healthyProbes = probes.filter((p) => p.healthy && p.latency_ms > 0);
    const avgLatency = healthyProbes.length > 0
      ? Math.round(healthyProbes.reduce((s, p) => s + p.latency_ms, 0) / healthyProbes.length)
      : 0;

    dependencies[name] = {
      current: probes[0]?.healthy ? "healthy" : "unhealthy",
      latency_ms: probes[0]?.latency_ms ?? 0,
      uptime_7d_pct: probes.length > 0 ? Math.round((healthyCount / probes.length) * 1000) / 10 : null,
      avg_latency_ms: avgLatency,
      total_probes_7d: probes.length,
      last_checked: probes[0]?.checked_at ?? null,
    };
  }

  const result = { dependencies };
  setCache(cacheKey, result);
  return c.json(result);
});

// GET /v1/internal/tests/dependency-health/history?dependency=vies&days=7
internalTestsRoute.get("/dependency-health/history", async (c) => {
  const dependency = c.req.query("dependency");
  if (!dependency) {
    return c.json(apiError("invalid_request", "dependency query parameter is required"), 400);
  }

  const days = Math.min(Math.max(parseInt(c.req.query("days") ?? "7", 10) || 7, 1), 90);
  const cacheKey = `dep-health:history:${dependency}:${days}`;
  const cached = getCached(cacheKey);
  if (cached) return c.json(cached);

  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const rows = await db
    .select({
      details: healthMonitorEvents.details,
      createdAt: healthMonitorEvents.createdAt,
    })
    .from(healthMonitorEvents)
    .where(
      and(
        eq(healthMonitorEvents.eventType, "dependency_probe"),
        sql`${healthMonitorEvents.details}->>'dependency' = ${dependency}`,
        sql`${healthMonitorEvents.createdAt} >= ${cutoff.toISOString()}::timestamptz`,
      ),
    )
    .orderBy(desc(healthMonitorEvents.createdAt));

  const probes = rows.map((row) => {
    const d = row.details as { healthy: boolean; latency_ms: number; error?: string | null };
    return {
      checked_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      healthy: d.healthy,
      latency_ms: d.latency_ms,
      ...(d.error ? { error: d.error } : {}),
    };
  });

  const healthyCount = probes.filter((p) => p.healthy).length;
  const healthyProbes = probes.filter((p) => p.healthy && p.latency_ms > 0);
  const avgLatency = healthyProbes.length > 0
    ? Math.round(healthyProbes.reduce((s, p) => s + p.latency_ms, 0) / healthyProbes.length)
    : 0;

  const result = {
    dependency,
    period_days: days,
    probes,
    uptime_pct: probes.length > 0 ? Math.round((healthyCount / probes.length) * 1000) / 10 : null,
    avg_latency_ms: avgLatency,
  };

  setCache(cacheKey, result);
  return c.json(result);
});

// ─── Recalibration endpoint ──────────────────────────────────────────────────

const GENERIC_VALUES = new Set([
  "test_value", "test", "test_item", "Google", "556703-7485",
]);

function isGenericInput(input: Record<string, unknown>): boolean {
  const values = Object.values(input);
  if (values.length === 0) return true;
  return values.every((v) => typeof v === "string" && GENERIC_VALUES.has(v));
}

function resolveRecalInput(
  suiteInput: Record<string, unknown>,
  cap: { inputSchema: unknown; onboardingManifest: unknown },
): { input: Record<string, unknown>; source: string; upgraded: boolean } {
  const manifest = cap.onboardingManifest as Record<string, unknown> | null;
  const testFixtures = (manifest?.test_fixtures ?? null) as Record<string, unknown> | null;

  // Priority: health_check_input → existing non-generic → heuristic.
  // known_answer.input is deliberately excluded — it's designed for correctness
  // testing and may trigger special code paths (e.g., email-validate "clearly-invalid"
  // returns a `reason` field absent in normal output, causing stale assertions).
  if (testFixtures?.health_check_input && typeof testFixtures.health_check_input === "object") {
    const hci = testFixtures.health_check_input as Record<string, unknown>;
    if (Object.keys(hci).length > 0) {
      return { input: hci, source: "manifest_health_check", upgraded: true };
    }
  }

  if (Object.keys(suiteInput).length > 0 && !isGenericInput(suiteInput)) {
    return { input: suiteInput, source: "existing", upgraded: false };
  }

  const generated = generateTestInput(cap.inputSchema as Record<string, unknown>);
  if (Object.keys(generated).length > 0) {
    return { input: generated, source: "heuristic", upgraded: true };
  }

  return { input: suiteInput, source: "existing", upgraded: false };
}

interface RecalValidationCheck {
  field: string;
  operator: string;
  value?: unknown;
  values?: unknown[];
}

function calibrateChecks(
  testType: string,
  existingRules: { checks?: RecalValidationCheck[] },
  realOutput: Record<string, unknown>,
  fieldReliability?: Record<string, string> | null,
  fieldVolatilityOverrides?: Record<string, "stable" | "volatile" | "computed"> | null,
): { checks: RecalValidationCheck[] } {
  const checks: RecalValidationCheck[] = [];

  // Only assert not_null on fields marked 'guaranteed' in output_field_reliability.
  // Fields marked 'common'/'rare' or absent from the map are skipped (DEC-20260319-D).
  for (const [key, value] of Object.entries(realOutput)) {
    if (value !== null && value !== undefined) {
      const reliability = fieldReliability?.[key];
      if (reliability === "guaranteed") {
        checks.push({ field: key, operator: "not_null" });
      }
    }
  }

  // For known_answer: apply volatility filtering (DEC-20260319-E).
  // Volatile/computed fields get type checks instead of equals.
  if (testType === "known_answer") {
    for (const check of existingRules.checks ?? []) {
      if (check.operator === "not_null") continue;
      if (!(check.field in realOutput)) continue;
      if (checks.some((c) => c.field === check.field && c.operator === check.operator)) continue;

      const volatility = classifyFieldVolatility(check.field, realOutput[check.field], fieldVolatilityOverrides);
      if (volatility === "stable") {
        checks.push(check);
      } else {
        const typeCheck = makeVolatilityAwareCheck(check.field, realOutput[check.field], volatility);
        if (typeCheck && !checks.some((c) => c.field === typeCheck.field && c.operator === typeCheck.operator)) {
          checks.push(typeCheck as RecalValidationCheck);
        }
      }
    }
  }

  return { checks };
}

// POST /v1/internal/tests/recalibrate — recalibrate test suites against real output
// Query params: ?slug= (optional, recalibrate specific capability), ?dry-run (preview only)
// Long-running: ~25min for all capabilities. Returns JSON report when done.
internalTestsRoute.post("/recalibrate", async (c) => {
  if (!ADMIN_SECRET) {
    return c.json(apiError("unauthorized", "Admin endpoint is not configured."), 503);
  }
  const auth = c.req.header("Authorization");
  if (!isValidAdminAuth(auth)) {
    return c.json(apiError("unauthorized", "Invalid admin secret."), 401);
  }

  const targetSlug = c.req.query("slug") || undefined;
  const dryRun = c.req.query("dry-run") !== undefined;
  const db = getDb();

  const conditions = [eq(testSuites.active, true)];
  if (targetSlug) conditions.push(eq(testSuites.capabilitySlug, targetSlug));

  const allSuites = await db
    .select()
    .from(testSuites)
    .where(and(...conditions));

  const slugs = [...new Set(allSuites.map((s) => s.capabilitySlug))];
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

  const report = {
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
    statusAssertionRemoved: 0,
    newFieldsDiscovered: 0,
    manualReview: [] as Array<{ slug: string; testType: string; reason: string }>,
    dryRun,
  };

  // Group by slug
  const bySlug = new Map<string, typeof allSuites>();
  for (const s of allSuites) {
    const list = bySlug.get(s.capabilitySlug) ?? [];
    list.push(s);
    bySlug.set(s.capabilitySlug, list);
  }

  for (const [slug, slugSuites] of bySlug) {
    const cap = capMap.get(slug);
    if (!cap) continue;

    const executor = getExecutor(slug);
    let realOutput: Record<string, unknown> | null = null;
    let executionError: string | null = null;

    if (executor) {
      const calibratable = slugSuites.filter(
        (s) => s.testType === "known_answer" || s.testType === "schema_check" || s.testType === "dependency_health",
      );
      const bestSuite = calibratable[0] ?? slugSuites[0];
      const resolution = resolveRecalInput(bestSuite.input as Record<string, unknown>, cap);

      try {
        const result = await executor(resolution.input);
        if (result?.output && Object.keys(result.output).length > 0) {
          realOutput = result.output;
        }
      } catch (err: any) {
        executionError = err.message?.slice(0, 200) ?? "Unknown error";
      }

      // 2s delay between capabilities
      await new Promise((r) => setTimeout(r, 2000));
    }

    for (const suite of slugSuites) {
      report.totalProcessed++;

      if (suite.testType === "negative") { report.skippedNegative++; continue; }
      if (suite.testType === "edge_case") { report.skippedEdgeCase++; continue; }
      if (suite.testType === "piggyback") { report.skippedPiggyback++; continue; }

      if (!executor) {
        report.failedNoExecutor++;
        report.manualReview.push({ slug, testType: suite.testType, reason: "No executor" });
        continue;
      }
      if (executionError) {
        report.failedExecution++;
        report.manualReview.push({ slug, testType: suite.testType, reason: executionError });
        continue;
      }
      if (!realOutput) {
        report.failedNoOutput++;
        report.manualReview.push({ slug, testType: suite.testType, reason: "No output" });
        continue;
      }

      const resolution = resolveRecalInput(suite.input as Record<string, unknown>, cap);
      if (resolution.upgraded) report.inputUpgraded++;

      const oldRules = suite.validationRules as { checks?: RecalValidationCheck[] };
      const oldChecks = oldRules?.checks ?? [];
      const reliability = (cap.outputFieldReliability ?? null) as Record<string, string> | null;
      const manifest = cap.onboardingManifest as Record<string, unknown> | null;
      const volOverrides = (manifest?.field_volatility ?? null) as Record<string, "stable" | "volatile" | "computed"> | null;
      const newRules = calibrateChecks(suite.testType, oldRules, realOutput, reliability, volOverrides);

      const hadStatus = oldChecks.some((c) => c.field === "status" && c.operator === "not_null");
      if (hadStatus && !("status" in realOutput)) report.statusAssertionRemoved++;

      const oldFields = new Set(oldChecks.map((c) => c.field));
      report.newFieldsDiscovered += newRules.checks.filter((c) => !oldFields.has(c.field)).length;

      const changed = JSON.stringify(oldRules) !== JSON.stringify(newRules);
      if (changed) report.assertionsRegenerated++;

      if (!dryRun && (resolution.upgraded || changed)) {
        const updates: Record<string, unknown> = { updatedAt: new Date() };
        if (resolution.upgraded) updates.input = resolution.input;
        if (changed) updates.validationRules = newRules;
        updates.baselineOutput = realOutput;
        updates.baselineCapturedAt = new Date();
        await db.update(testSuites).set(updates).where(eq(testSuites.id, suite.id));
      }

      report.calibrated++;
    }
  }

  return c.json(report);
});

// ─── Patch validation rules ──────────────────────────────────────────────────
// Surgical update: directly replace a test suite's validation_rules by slug+name.
// Useful for fixing stale value assertions that the recalibrate endpoint preserves.
//
// Body: { slug: string, test_name: string, checks: Array<{field, operator, value?}> }
internalTestsRoute.post("/patch-suite-rules", async (c) => {
  if (!ADMIN_SECRET) {
    return c.json(apiError("unauthorized", "Admin endpoint is not configured."), 503);
  }
  if (!isValidAdminAuth(c.req.header("Authorization"))) {
    return c.json(apiError("unauthorized", "Invalid admin secret."), 401);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || !body.slug || !body.test_name || !Array.isArray(body.checks)) {
    return c.json(apiError("invalid_request", "slug, test_name, and checks[] are required"), 400);
  }

  const { slug, test_name, checks } = body;
  const db = getDb();

  const result = await db
    .update(testSuites)
    .set({ validationRules: { checks }, updatedAt: new Date() })
    .where(and(eq(testSuites.capabilitySlug, slug), eq(testSuites.testName, test_name)))
    .returning({ id: testSuites.id, testName: testSuites.testName });

  if (result.length === 0) {
    return c.json(apiError("not_found", `No active test suite found for slug=${slug} test_name=${test_name}`), 404);
  }

  return c.json({ patched: true, slug, test_name, updated_checks: checks });
});

// GET /v1/internal/tests/cost-summary — Test execution cost breakdown
internalTestsRoute.get("/cost-summary", async (c) => {
  const days = Math.min(Math.max(parseInt(c.req.query("days") ?? "30", 10) || 30, 1), 365);
  const cacheKey = `test-cost:${days}`;
  const cached = getCached(cacheKey);
  if (cached) return c.json(cached);

  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  // Aggregate from test_run_log
  const runLogRows = await db.execute(sql`
    SELECT
      COALESCE(SUM(actual_cost_cents), 0)::integer AS total_actual,
      COALESCE(SUM(estimated_cost_cents), 0)::integer AS total_estimated,
      COUNT(*)::integer AS total_runs,
      COALESCE(SUM(total_tests), 0)::integer AS total_tests,
      COALESCE(SUM(passed), 0)::integer AS total_passed,
      COALESCE(SUM(failed), 0)::integer AS total_failed
    FROM test_run_log
    WHERE started_at >= ${cutoff.toISOString()}::timestamptz
  `);
  const runLog = ((Array.isArray(runLogRows) ? runLogRows : (runLogRows as any)?.rows ?? [])[0] ?? {}) as any;

  // Cost by capability_type (from external_cost_cents on test_suites)
  const byTypeRows = await db.execute(sql`
    SELECT
      c.capability_type,
      COUNT(DISTINCT ts.capability_slug)::integer AS capability_count,
      COUNT(ts.id)::integer AS suite_count,
      COALESCE(SUM(ts.external_cost_cents), 0)::integer AS total_external_cost
    FROM test_suites ts
    JOIN capabilities c ON c.slug = ts.capability_slug
    WHERE ts.active = true
    GROUP BY c.capability_type
    ORDER BY total_external_cost DESC
  `);
  const byType = (Array.isArray(byTypeRows) ? byTypeRows : (byTypeRows as any)?.rows ?? []) as any[];

  // Cost by test_mode (fixture = free, live = real cost)
  const byModeRows = await db.execute(sql`
    SELECT
      ts.test_mode,
      COUNT(ts.id)::integer AS suite_count,
      COALESCE(SUM(ts.external_cost_cents), 0)::integer AS total_external_cost
    FROM test_suites ts
    WHERE ts.active = true
    GROUP BY ts.test_mode
    ORDER BY suite_count DESC
  `);
  const byMode = (Array.isArray(byModeRows) ? byModeRows : (byModeRows as any)?.rows ?? []) as any[];

  // Fixture savings estimate: fixture suites that would have cost money if live
  const fixtureSavingsRows = await db.execute(sql`
    SELECT COUNT(*)::integer AS fixture_suites
    FROM test_suites ts
    JOIN capabilities c ON c.slug = ts.capability_slug
    WHERE ts.active = true
      AND ts.test_mode = 'fixture'
      AND c.capability_type != 'deterministic'
  `);
  const fixtureSavings = ((Array.isArray(fixtureSavingsRows) ? fixtureSavingsRows : (fixtureSavingsRows as any)?.rows ?? [])[0] as any)?.fixture_suites ?? 0;

  // Piggyback savings: count of piggyback results (free correctness data)
  const piggybackRows = await db.execute(sql`
    SELECT COUNT(*)::integer AS piggyback_results
    FROM test_results tr
    JOIN test_suites ts ON ts.id = tr.test_suite_id
    WHERE ts.test_type = 'piggyback'
      AND tr.executed_at >= ${cutoff.toISOString()}::timestamptz
  `);
  const piggybackResults = ((Array.isArray(piggybackRows) ? piggybackRows : (piggybackRows as any)?.rows ?? [])[0] as any)?.piggyback_results ?? 0;

  const result = {
    period_days: days,
    total_cost_cents: runLog.total_actual ?? 0,
    total_estimated_cents: runLog.total_estimated ?? 0,
    total_test_runs: runLog.total_runs ?? 0,
    total_tests_executed: runLog.total_tests ?? 0,
    total_passed: runLog.total_passed ?? 0,
    total_failed: runLog.total_failed ?? 0,
    by_capability_type: Object.fromEntries(
      byType.map((r: any) => [r.capability_type, {
        capability_count: r.capability_count,
        suite_count: r.suite_count,
        accumulated_cost_cents: r.total_external_cost,
      }]),
    ),
    by_test_mode: Object.fromEntries(
      byMode.map((r: any) => [r.test_mode ?? "live", {
        suite_count: r.suite_count,
        accumulated_cost_cents: r.total_external_cost,
      }]),
    ),
    savings: {
      fixture_suites_avoiding_live_calls: fixtureSavings,
      piggyback_free_correctness_results: piggybackResults,
    },
  };

  setCache(cacheKey, result);
  return c.json(result);
});

// POST /v1/internal/tests/admin/apply-migrations — Apply pending DB migrations
// Admin-only, secured with ADMIN_SECRET
internalTestsRoute.post("/admin/apply-migrations", async (c) => {
  if (!isValidAdminAuth(c.req.header("Authorization"))) {
    return c.json(apiError("unauthorized", "Admin authentication required"), 401);
  }

  const db = getDb();
  const results: string[] = [];

  // Migration 0028: sqs_daily_snapshot
  try {
    const check1 = await db.execute(sql`
      SELECT count(*)::text as cnt FROM information_schema.tables
      WHERE table_name = 'sqs_daily_snapshot'
    `);
    const rows1 = Array.isArray(check1) ? check1 : (check1 as any)?.rows ?? [];
    if (rows1[0]?.cnt === "0") {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "sqs_daily_snapshot" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
          "capability_slug" text NOT NULL,
          "snapshot_date" date NOT NULL,
          "matrix_sqs" numeric(5, 2) NOT NULL,
          "qp_score" numeric(5, 2),
          "rp_score" numeric(5, 2),
          "qp_grade" varchar(2),
          "rp_grade" varchar(2),
          "trend" varchar(20),
          "health_state" varchar(20),
          "runs_analyzed" integer,
          "created_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `);
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS "sqs_daily_snapshot_slug_date_unique"
        ON "sqs_daily_snapshot" ("capability_slug", "snapshot_date")
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS "sqs_daily_snapshot_slug_date_desc_idx"
        ON "sqs_daily_snapshot" ("capability_slug", "snapshot_date" DESC)
      `);
      results.push("0028: sqs_daily_snapshot created");
    } else {
      results.push("0028: sqs_daily_snapshot already exists");
    }
  } catch (err) {
    results.push(`0028: FAILED — ${err instanceof Error ? err.message : err}`);
  }

  // Migration 0029: actual_cost_cents on test_run_log
  try {
    const check2 = await db.execute(sql`
      SELECT count(*)::text as cnt FROM information_schema.columns
      WHERE table_name = 'test_run_log' AND column_name = 'actual_cost_cents'
    `);
    const rows2 = Array.isArray(check2) ? check2 : (check2 as any)?.rows ?? [];
    if (rows2[0]?.cnt === "0") {
      await db.execute(sql`
        ALTER TABLE "test_run_log" ADD COLUMN "actual_cost_cents" integer DEFAULT 0 NOT NULL
      `);
      results.push("0029: actual_cost_cents added");
    } else {
      results.push("0029: actual_cost_cents already exists");
    }
  } catch (err) {
    results.push(`0029: FAILED — ${err instanceof Error ? err.message : err}`);
  }

  return c.json({ migrations: results });
});

// POST /v1/internal/tests/admin/run-script — Run a post-deploy script
// Admin-only, secured with ADMIN_SECRET
internalTestsRoute.post("/admin/run-script", async (c) => {
  if (!isValidAdminAuth(c.req.header("Authorization"))) {
    return c.json(apiError("unauthorized", "Admin authentication required"), 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const script = body.script as string | undefined;

  if (!script) {
    return c.json(apiError("invalid_request", "script field required: seed-snapshot"), 400);
  }

  try {
    switch (script) {
      case "seed-snapshot": {
        const { captureDailySnapshots } = await import("../lib/sqs-snapshots.js");
        await captureDailySnapshots();
        return c.json({ script, status: "completed", message: "SQS snapshots captured" });
      }
      default:
        return c.json(apiError("invalid_request", `Unknown script: ${script}. Use: seed-snapshot`), 400);
    }
  } catch (err) {
    return c.json(apiError("execution_failed", `Script failed: ${err instanceof Error ? err.message : err}`), 500);
  }
});
