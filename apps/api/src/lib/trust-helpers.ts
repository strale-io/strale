import { eq, and, desc, asc, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { testSuites, testResults } from "../db/schema.js";

// ─── Badge logic ────────────────────────────────────────────────────────────

export function determineBadge(
  testTransactions: number,
  customerTransactions: number,
  successRate: number | null,
): { badge: string; badge_label: string } {
  if (
    customerTransactions > 500 &&
    successRate != null &&
    successRate > 80
  ) {
    return {
      badge: "strale_verified",
      badge_label: "Verified by 500+ customer transactions with sustained >80% success",
    };
  }
  if (customerTransactions > 0) {
    return {
      badge: "strale_monitored",
      badge_label: "Monitored with real customer usage data and automated testing",
    };
  }
  if (testTransactions > 0) {
    return {
      badge: "strale_tested",
      badge_label: "Tested by Strale's automated quality suite",
    };
  }
  return {
    badge: "strale_tested",
    badge_label: "Tested by Strale's automated quality suite",
  };
}

// ─── Test results helper ────────────────────────────────────────────────────

export async function getTestResultsForSlug(slug: string) {
  const db = getDb();

  const suites = await db
    .select()
    .from(testSuites)
    .where(
      and(eq(testSuites.capabilitySlug, slug), eq(testSuites.active, true)),
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
      const ts = latest.executedAt.toISOString();
      if (!lastRun || ts > lastRun) lastRun = ts;
    }
  }

  // 30-day history
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const historyRows = await db.execute(sql`
    SELECT
      DATE(tr.executed_at AT TIME ZONE 'UTC') AS date,
      ROUND(SUM(CASE WHEN tr.passed THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100, 1)::text AS pass_rate,
      ROUND(AVG(tr.response_time_ms))::text AS avg_response_time_ms
    FROM test_results tr
    WHERE tr.capability_slug = ${slug}
      AND tr.executed_at >= ${thirtyDaysAgo.toISOString()}::timestamptz
    GROUP BY DATE(tr.executed_at AT TIME ZONE 'UTC')
    ORDER BY date
  `);
  const history = (Array.isArray(historyRows) ? historyRows : (historyRows as any)?.rows ?? [])
    .map((r: any) => ({
      date: r.date,
      pass_rate: parseFloat(r.pass_rate),
      avg_response_time_ms: parseInt(r.avg_response_time_ms, 10),
    }));

  return {
    last_run: lastRun,
    total_tests: suites.length,
    passed,
    failed,
    pass_rate:
      withResults > 0
        ? parseFloat(((passed / withResults) * 100).toFixed(1))
        : null,
    avg_response_time_ms:
      withResults > 0 ? Math.round(totalResponseTime / withResults) : null,
    history_30d: history,
  };
}
