import { Hono } from "hono";
import { eq, and, desc, sql, asc } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { getDb } from "../db/index.js";
import {
  testSuites,
  testResults,
  solutions,
  solutionSteps,
} from "../db/schema.js";
import { runTests } from "../lib/test-runner.js";
import type { ScheduleTier } from "../lib/test-runner.js";
import { categorizeFailureReason } from "../lib/trust-helpers.js";
import { apiError } from "../lib/errors.js";
import { rateLimitByIp } from "../lib/rate-limit.js";
import type { AppEnv } from "../types.js";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

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
internalTestsRoute.post("/run", rateLimitByIp(1, 60_000), async (c) => {
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
        failure_reason: latest?.failureReason ?? null,
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
      failure_reason: t.failure_reason!,
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

  const rows = await db.execute<{
    date: string;
    total: string;
    passed: string;
    failed: string;
    avg_response_time_ms: string;
  }>(sql`
    SELECT
      DATE(tr.executed_at AT TIME ZONE 'UTC') AS date,
      COUNT(*)::text AS total,
      SUM(CASE WHEN tr.passed THEN 1 ELSE 0 END)::text AS passed,
      SUM(CASE WHEN NOT tr.passed THEN 1 ELSE 0 END)::text AS failed,
      ROUND(AVG(tr.response_time_ms))::text AS avg_response_time_ms
    FROM test_results tr
    WHERE tr.capability_slug = ${slug}
      AND tr.executed_at >= ${thirtyDaysAgo.toISOString()}::timestamptz
    GROUP BY DATE(tr.executed_at AT TIME ZONE 'UTC')
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
