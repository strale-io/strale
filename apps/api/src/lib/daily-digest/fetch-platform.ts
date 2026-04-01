import { sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { getAllHealth } from "../circuit-breaker.js";
import type { PlatformActivity, PlatformHealth, Scoreboard } from "./types.js";

function toRows(result: unknown): any[] {
  if (Array.isArray(result)) return result;
  return (result as any)?.rows ?? [];
}

export async function getPlatformActivity(
  yesterday: Partial<Scoreboard> | null,
): Promise<PlatformActivity> {
  const db = getDb();

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
      WHERE status = 'completed' AND created_at >= NOW() - INTERVAL '24 hours'
    `),
    db.execute(sql`
      SELECT COALESCE(SUM(price_cents), 0)::int AS cents
      FROM transactions
      WHERE status = 'completed' AND created_at >= NOW() - INTERVAL '24 hours'
    `),
    db.execute(sql`
      SELECT COUNT(DISTINCT user_id)::int AS cnt
      FROM transactions
      WHERE status = 'completed' AND created_at >= NOW() - INTERVAL '24 hours'
    `),
    db.execute(sql`
      SELECT c.slug, COUNT(*)::int AS cnt
      FROM transactions t
      JOIN capabilities c ON c.id = t.capability_id
      WHERE t.status = 'completed' AND t.created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY c.slug ORDER BY cnt DESC LIMIT 10
    `),
  ]);

  // New signup emails
  const newSignupsRaw = await db.execute(sql`
    SELECT email FROM users WHERE created_at >= NOW() - INTERVAL '24 hours' ORDER BY created_at DESC
  `);

  const signups = toRows(signupsRaw)[0];
  const txnCount = toRows(txnRaw)[0]?.cnt ?? 0;
  const revCents = toRows(revenueRaw)[0]?.cents ?? 0;
  const uniqueCount = toRows(uniqueRaw)[0]?.cnt ?? 0;
  const topCaps = toRows(topCapsRaw).map((r: any) => ({ slug: r.slug, count: r.cnt }));
  const newEmails = toRows(newSignupsRaw).map((r: any) => r.email as string);

  const ySignups = yesterday?.totalUsers ?? signups.total;
  const yApiCalls = yesterday?.totalApiCalls ?? txnCount;

  return {
    signups: { count: signups.last_24h, delta: signups.total - ySignups, emails: newEmails },
    apiCalls: { total: txnCount, delta: 0, byCapability: topCaps },
    uniqueUsers: { count: uniqueCount, delta: 0 },
    transactions: { count: txnCount, delta: 0 },
    revenue: { cents: revCents, delta: 0 },
    zeroActivity: signups.last_24h === 0 && txnCount === 0,
  };
}

export async function getPlatformHealth(): Promise<PlatformHealth> {
  const db = getDb();

  // Circuit breakers
  const allHealth = await getAllHealth();
  const openBreakers = allHealth.filter((h) => h.state !== "closed");

  // Test pass rate (last 24h)
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

  // SQS grade changes: compare current grades to yesterday via sqs_daily_snapshot
  const gradeChangesRaw = await db.execute(sql`
    WITH today AS (
      SELECT slug, qp_grade, rp_grade
      FROM capabilities
      WHERE is_active = true
    ),
    yesterday AS (
      SELECT DISTINCT ON (capability_slug) capability_slug, qp_grade, rp_grade
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
