import { Hono } from "hono";
import { eq, and, desc, gte, sql, asc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  testSuites,
  testResults,
  solutions,
  solutionSteps,
} from "../db/schema.js";
import { runTests } from "../lib/test-runner.js";
import { apiError } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

// Internal test endpoints — no auth required, called by strale.dev frontend
export const internalTestsRoute = new Hono<AppEnv>();

// POST /v1/internal/tests/run — trigger a test run (optional ?slug= filter)
internalTestsRoute.post("/run", async (c) => {
  const slug = c.req.query("slug");
  const summary = await runTests(slug || undefined);
  return c.json(summary);
});

// GET /v1/internal/tests/capabilities/:slug — latest test results
internalTestsRoute.get("/capabilities/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = getDb();

  // Get all test suites for this capability
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

  // Get latest result for each test suite
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

  return c.json({
    capability_slug: slug,
    last_run: withResults[0]?.executed_at ?? null,
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

  // Look up solution steps
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

  // Get test results for each capability step
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
  const lastRun = stepResults
    .map((r) => r.last_run)
    .filter(Boolean)
    .sort()
    .pop() ?? null;

  return c.json({
    solution_slug: slug,
    last_run: lastRun,
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
