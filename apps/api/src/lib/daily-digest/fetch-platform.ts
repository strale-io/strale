import { sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { getAllHealth } from "../circuit-breaker.js";
import type { PlatformActivity, PlatformHealth, Scoreboard } from "./types.js";

function toRows(result: unknown): any[] {
  if (Array.isArray(result)) return result;
  return (result as any)?.rows ?? [];
}

const INTERNAL_EMAIL_SUFFIXES = ["@strale.io", "@strale.internal", "@example.com"];

export async function getPlatformActivity(
  yesterday: Partial<Scoreboard> | null,
): Promise<PlatformActivity> {
  const db = getDb();

  // Look up system test user to exclude from transaction counts
  const sysRows = await db.execute(sql`
    SELECT id FROM users WHERE email = 'system@strale.internal' LIMIT 1
  `);
  const systemUserId = toRows(sysRows)[0]?.id ?? "00000000-0000-0000-0000-000000000000";

  const [signupsRaw, txnRaw, revenueRaw, uniqueRaw, topCapsRaw] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS last_24h
      FROM users
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM transactions
      WHERE status = 'completed'
        AND created_at >= NOW() - INTERVAL '24 hours'
        AND (user_id IS NULL OR user_id != ${systemUserId})
    `),
    db.execute(sql`
      SELECT COALESCE(SUM(price_cents), 0)::int AS cents
      FROM transactions
      WHERE status = 'completed'
        AND created_at >= NOW() - INTERVAL '24 hours'
        AND (user_id IS NULL OR user_id != ${systemUserId})
    `),
    db.execute(sql`
      SELECT COUNT(DISTINCT user_id)::int AS cnt
      FROM transactions
      WHERE status = 'completed'
        AND created_at >= NOW() - INTERVAL '24 hours'
        AND (user_id IS NULL OR user_id != ${systemUserId})
    `),
    db.execute(sql`
      SELECT c.slug, COUNT(*)::int AS cnt
      FROM transactions t
      JOIN capabilities c ON c.id = t.capability_id
      WHERE t.status = 'completed'
        AND t.created_at >= NOW() - INTERVAL '24 hours'
        AND (t.user_id IS NULL OR t.user_id != ${systemUserId})
      GROUP BY c.slug ORDER BY cnt DESC LIMIT 10
    `),
  ]);

  // Solution executions (last 24h)
  const solExecRaw = await db.execute(sql`
    SELECT solution_slug AS slug,
           COUNT(*)::int AS cnt,
           COUNT(*) FILTER (WHERE status = 'completed')::int AS succeeded,
           COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
    FROM transactions
    WHERE solution_slug IS NOT NULL
      AND created_at >= NOW() - INTERVAL '24 hours'
      AND (user_id IS NULL OR user_id != ${systemUserId})
    GROUP BY solution_slug ORDER BY cnt DESC LIMIT 5
  `);
  const solutionExecutions = toRows(solExecRaw).map((r: any) => ({
    slug: r.slug as string,
    count: r.cnt as number,
    succeeded: r.succeeded as number,
    failed: r.failed as number,
  }));

  // New signup emails — split into external and internal
  const newSignupsRaw = await db.execute(sql`
    SELECT email FROM users WHERE created_at >= NOW() - INTERVAL '24 hours' ORDER BY created_at DESC
  `);

  const signups = toRows(signupsRaw)[0];
  const txnCount = toRows(txnRaw)[0]?.cnt ?? 0;
  const revCents = toRows(revenueRaw)[0]?.cents ?? 0;
  const uniqueCount = toRows(uniqueRaw)[0]?.cnt ?? 0;
  const topCaps = toRows(topCapsRaw).map((r: any) => ({ slug: r.slug, count: r.cnt }));

  const allNewEmails = toRows(newSignupsRaw).map((r: any) => r.email as string);
  const externalEmails = allNewEmails.filter((e) => !INTERNAL_EMAIL_SUFFIXES.some((s) => e.endsWith(s)));
  const internalEmails = allNewEmails.filter((e) => INTERNAL_EMAIL_SUFFIXES.some((s) => e.endsWith(s)));

  const ySignups = yesterday?.totalUsers ?? signups.total;

  return {
    signups: { count: signups.last_24h, delta: signups.total - ySignups, emails: externalEmails, internalEmails },
    apiCalls: { total: txnCount, delta: 0, byCapability: topCaps },
    uniqueUsers: { count: uniqueCount, delta: 0 },
    transactions: { count: txnCount, delta: 0 },
    revenue: { cents: revCents, delta: 0 },
    solutionExecutions,
    zeroActivity: signups.last_24h === 0 && txnCount === 0,
  };
}

export async function getPlatformHealth(): Promise<PlatformHealth> {
  const db = getDb();

  const allHealth = await getAllHealth();
  const openBreakers = allHealth.filter((h) => h.state !== "closed");

  const testRaw = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE passed = true)::int AS passed,
      COUNT(*) FILTER (WHERE passed = false)::int AS failed,
      COUNT(*)::int AS total
    FROM test_results
    WHERE executed_at >= NOW() - INTERVAL '24 hours'
  `);
  const testRow = toRows(testRaw)[0] ?? { passed: 0, failed: 0, total: 0 };
  const testTotal = testRow.total || 1;

  const gradeChangesRaw = await db.execute(sql`
    WITH today AS (
      SELECT slug,
        CASE
          WHEN qp_score >= 90 THEN 'A'
          WHEN qp_score >= 75 THEN 'B'
          WHEN qp_score >= 50 THEN 'C'
          WHEN qp_score >= 25 THEN 'D'
          ELSE 'F'
        END AS qp_grade
      FROM capabilities
      WHERE is_active = true AND qp_score IS NOT NULL
    ),
    yesterday AS (
      SELECT DISTINCT ON (capability_slug) capability_slug, qp_grade
      FROM sqs_daily_snapshot
      WHERE snapshot_date = CURRENT_DATE - 1
      ORDER BY capability_slug, created_at DESC
    )
    SELECT t.slug, y.qp_grade AS old_grade, t.qp_grade AS new_grade
    FROM today t
    JOIN yesterday y ON y.capability_slug = t.slug
    WHERE t.qp_grade IS DISTINCT FROM y.qp_grade
  `);
  const gradeOrder = ["A", "B", "C", "D", "F"];
  const sqsChanges = toRows(gradeChangesRaw).map((r: any) => ({
    slug: r.slug as string,
    oldGrade: (r.old_grade ?? "?") as string,
    newGrade: (r.new_grade ?? "?") as string,
    direction: (gradeOrder.indexOf(r.new_grade) < gradeOrder.indexOf(r.old_grade) ? "up" : "down") as "up" | "down",
  }));

  return {
    circuitBreakers: openBreakers.map((h) => ({
      slug: h.capability_slug,
      state: h.state,
      consecutiveFailures: h.consecutive_failures,
      lastFailureAt: h.last_failure_at,
    })),
    testPassRate: {
      passed: testRow.passed,
      failed: testRow.failed,
      total: testRow.total,
      rate: Math.round((testRow.passed / testTotal) * 100),
    },
    sqsChanges,
  };
}
