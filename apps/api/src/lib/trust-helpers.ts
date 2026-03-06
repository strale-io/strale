import { eq, and, desc, asc, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { testSuites, testResults } from "../db/schema.js";

// ─── Solution complete-run helpers ───────────────────────────────────────────

/**
 * Get the most recent complete solution run (where all steps were tested).
 * Uses 30-minute time windows to group cross-step capability tests.
 * Returns timestamp, passed, failed, total, avg_response_time_ms, by_type, failures.
 */
export async function getLatestCompleteRunForSolution(
  capabilitySlugs: string[],
  stepCount: number,
): Promise<{
  last_run: string | null;
  total_tests: number;
  passed: number;
  failed: number;
  pass_rate: number | null;
  avg_response_time_ms: number | null;
  by_type: Record<string, { total: number; passed: number; failed: number }>;
  failures: Array<{ test_name: string; test_type: string; failure_reason: string; failure_category: "upstream" | "internal" | "unknown"; capability_slug: string }>;
} | null> {
  const db = getDb();
  const slugList = sql.join(capabilitySlugs.map((s) => sql`${s}`), sql`, `);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString();
  const bucket = sql`TO_TIMESTAMP(FLOOR(EXTRACT(EPOCH FROM tr.executed_at) / 1800) * 1800)`;

  // Find the most recent 30-min window where all steps were tested
  const windowRows = await db.execute(sql`
    SELECT
      ${bucket} AS run_window,
      MAX(tr.executed_at) AS window_end,
      COUNT(*)::text AS total,
      SUM(CASE WHEN tr.passed THEN 1 ELSE 0 END)::text AS passed,
      SUM(CASE WHEN NOT tr.passed THEN 1 ELSE 0 END)::text AS failed,
      ROUND(AVG(tr.response_time_ms))::text AS avg_response_time_ms
    FROM test_results tr
    WHERE tr.capability_slug IN (${slugList})
      AND tr.executed_at >= ${cutoff}::timestamptz
    GROUP BY ${bucket}
    HAVING COUNT(DISTINCT tr.capability_slug) >= ${stepCount}
    ORDER BY run_window DESC
    LIMIT 1
  `);

  const rows = (Array.isArray(windowRows) ? windowRows : (windowRows as any)?.rows ?? []) as any[];
  if (rows.length === 0) return null;

  const row = rows[0];
  const total = parseInt(row.total, 10);
  const passed = parseInt(row.passed, 10);
  const failed = parseInt(row.failed, 10);
  const withResults = passed + failed;

  // Get by_type breakdown for this window
  const typeRows = await db.execute(sql`
    SELECT
      ts.test_type,
      COUNT(*)::text AS total,
      SUM(CASE WHEN tr.passed THEN 1 ELSE 0 END)::text AS passed,
      SUM(CASE WHEN NOT tr.passed THEN 1 ELSE 0 END)::text AS failed
    FROM test_results tr
    INNER JOIN test_suites ts ON ts.id = tr.test_suite_id
    WHERE tr.capability_slug IN (${slugList})
      AND ${bucket} = ${row.run_window}::timestamptz
    GROUP BY ts.test_type
  `);
  const typeData = (Array.isArray(typeRows) ? typeRows : (typeRows as any)?.rows ?? []) as any[];
  const by_type: Record<string, { total: number; passed: number; failed: number }> = {};
  for (const t of typeData) {
    by_type[t.test_type ?? "unknown"] = {
      total: parseInt(t.total, 10),
      passed: parseInt(t.passed, 10),
      failed: parseInt(t.failed, 10),
    };
  }

  // Get failures for this window
  const failures: Array<{ test_name: string; test_type: string; failure_reason: string; failure_category: "upstream" | "internal" | "unknown"; capability_slug: string }> = [];
  if (failed > 0) {
    const failRows = await db.execute(sql`
      SELECT
        ts.test_name,
        ts.test_type,
        tr.capability_slug,
        tr.failure_reason
      FROM test_results tr
      INNER JOIN test_suites ts ON ts.id = tr.test_suite_id
      WHERE tr.capability_slug IN (${slugList})
        AND ${bucket} = ${row.run_window}::timestamptz
        AND tr.passed = false
    `);
    const failData = (Array.isArray(failRows) ? failRows : (failRows as any)?.rows ?? []) as any[];
    for (const f of failData) {
      failures.push({
        test_name: f.test_name,
        test_type: f.test_type ?? "unknown",
        failure_reason: sanitizeErrorMessage(f.failure_reason) ?? "Unknown",
        failure_category: categorizeFailureReason(f.failure_reason),
        capability_slug: f.capability_slug,
      });
    }
  }

  return {
    last_run: row.window_end instanceof Date ? row.window_end.toISOString() : String(row.window_end),
    total_tests: total,
    passed,
    failed,
    pass_rate: withResults > 0 ? parseFloat(((passed / withResults) * 100).toFixed(1)) : null,
    avg_response_time_ms: withResults > 0 ? parseInt(row.avg_response_time_ms, 10) : null,
    by_type,
    failures,
  };
}

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

// ─── Failure sanitization ────────────────────────────────────────────────────

/** Strip HTML tags and collapse whitespace from error messages */
export function sanitizeErrorMessage(msg: string | null): string | null {
  if (!msg) return msg;
  let clean = msg.replace(/<[^>]*>/g, "");
  clean = clean.replace(/\s+/g, " ").trim();
  if (clean.length > 500) clean = clean.slice(0, 497) + "...";
  return clean;
}

// ─── Failure categorization ─────────────────────────────────────────────────

export function categorizeFailureReason(reason: string | null): "upstream" | "internal" | "unknown" {
  if (!reason) return "unknown";
  const lower = reason.toLowerCase();
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("etimedout")) return "upstream";
  if (lower.includes("rate limit") || lower.includes("429") || lower.includes("too many")) return "upstream";
  if (lower.includes("econnrefused") || lower.includes("enotfound") || lower.includes("502") ||
      lower.includes("503") || lower.includes("504") || lower.includes("fetch failed")) return "upstream";
  if (lower.includes("ms_max_concurrent")) return "upstream";
  return "internal";
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
  const byType: Record<string, { total: number; passed: number; failed: number }> = {};
  const failures: Array<{
    test_name: string;
    test_type: string;
    failure_reason: string;
    failure_category: "upstream" | "internal" | "unknown";
  }> = [];

  for (const suite of suites) {
    const testType = suite.testType ?? "unknown";
    if (!byType[testType]) byType[testType] = { total: 0, passed: 0, failed: 0 };
    byType[testType].total++;

    const [latest] = await db
      .select()
      .from(testResults)
      .where(eq(testResults.testSuiteId, suite.id))
      .orderBy(desc(testResults.executedAt))
      .limit(1);

    if (latest) {
      withResults++;
      if (latest.passed) {
        passed++;
        byType[testType].passed++;
      } else {
        failed++;
        byType[testType].failed++;
        if (latest.failureReason) {
          failures.push({
            test_name: suite.testName,
            test_type: testType,
            failure_reason: sanitizeErrorMessage(latest.failureReason) ?? latest.failureReason,
            failure_category: categorizeFailureReason(latest.failureReason),
          });
        }
      }
      totalResponseTime += latest.responseTimeMs;
      const ts = latest.executedAt.toISOString();
      if (!lastRun || ts > lastRun) lastRun = ts;
    }
  }

  // 30-day history — latest result per test suite per day (not daily average)
  // so the chart matches the hero metric which shows latest state
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const historyRows = await db.execute(sql`
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
      ROUND(SUM(CASE WHEN passed THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100, 1)::text AS pass_rate,
      ROUND(AVG(response_time_ms))::text AS avg_response_time_ms
    FROM latest_per_suite_per_day
    GROUP BY date
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
    by_type: byType,
    ...(failures.length > 0 ? { failures } : {}),
    history_30d: history,
  };
}
