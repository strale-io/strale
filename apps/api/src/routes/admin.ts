import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { apiError } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cachedStats: Record<string, unknown> | null = null;
let cachedAt = 0;

export const adminRoute = new Hono<AppEnv>();

// Admin auth middleware — requires ADMIN_SECRET
adminRoute.use("*", async (c, next) => {
  if (!ADMIN_SECRET) {
    return c.json(
      apiError("unauthorized", "Admin endpoint is not configured."),
      503,
    );
  }
  const auth = c.req.header("Authorization");
  if (!auth || auth !== `Bearer ${ADMIN_SECRET}`) {
    return c.json(apiError("unauthorized", "Invalid admin secret."), 401);
  }
  await next();
});

function toRows(result: unknown): any[] {
  if (Array.isArray(result)) return result;
  return (result as any)?.rows ?? [];
}

// GET /v1/admin/stats — Comprehensive usage dashboard
adminRoute.get("/stats", async (c) => {
  const now = Date.now();
  if (cachedStats && now - cachedAt < CACHE_TTL_MS) {
    c.header("Cache-Control", "private, max-age=300");
    return c.json(cachedStats);
  }

  const db = getDb();

  // Run all queries in parallel
  const [
    userStatsRaw,
    transactionStatsRaw,
    revenueStatsRaw,
    topCapabilitiesRaw,
    recentSignupsRaw,
    dailyVolumeRaw,
  ] = await Promise.all([
    // ── User stats ────────────────────────────────────────────────────
    db.execute(sql`
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE u.created_at >= NOW() - INTERVAL '7 days')::text AS last_7d,
        COUNT(*) FILTER (WHERE u.created_at >= NOW() - INTERVAL '30 days')::text AS last_30d,
        (SELECT COUNT(DISTINCT user_id) FROM transactions WHERE status = 'completed')::text AS with_transactions
      FROM users u
    `),

    // ── Transaction stats ─────────────────────────────────────────────
    db.execute(sql`
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::text AS last_24h,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::text AS last_7d,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::text AS last_30d
      FROM transactions
      WHERE status = 'completed'
    `),

    // ── Revenue stats ─────────────────────────────────────────────────
    db.execute(sql`
      SELECT
        COALESCE(SUM(price_cents), 0)::text AS total_cents,
        COALESCE(SUM(price_cents) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours'), 0)::text AS last_24h_cents,
        COALESCE(SUM(price_cents) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'), 0)::text AS last_7d_cents,
        COALESCE(SUM(price_cents) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days'), 0)::text AS last_30d_cents
      FROM transactions
      WHERE status = 'completed'
    `),

    // ── Top capabilities (last 30 days) ───────────────────────────────
    db.execute(sql`
      SELECT
        c.slug,
        COUNT(*)::text AS calls,
        SUM(t.price_cents)::text AS revenue_cents
      FROM transactions t
      JOIN capabilities c ON c.id = t.capability_id
      WHERE t.status = 'completed'
        AND t.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY c.slug
      ORDER BY COUNT(*) DESC
      LIMIT 10
    `),

    // ── Recent signups (last 10) ──────────────────────────────────────
    db.execute(sql`
      SELECT
        u.email,
        u.created_at::text AS created_at,
        COUNT(t.id)::text AS transaction_count,
        COALESCE(w.balance_cents, 0)::text AS balance_cents
      FROM users u
      LEFT JOIN wallets w ON w.user_id = u.id
      LEFT JOIN transactions t ON t.user_id = u.id AND t.status = 'completed'
      GROUP BY u.id, u.email, u.created_at, w.balance_cents
      ORDER BY u.created_at DESC
      LIMIT 10
    `),

    // ── Daily volume (last 30 days) ───────────────────────────────────
    db.execute(sql`
      SELECT
        DATE(created_at AT TIME ZONE 'UTC')::text AS date,
        COUNT(*)::text AS transactions,
        SUM(price_cents)::text AS revenue_cents,
        COUNT(DISTINCT user_id)::text AS unique_users
      FROM transactions
      WHERE status = 'completed'
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at AT TIME ZONE 'UTC')
      ORDER BY date DESC
    `),
  ]);

  const userStats = toRows(userStatsRaw);
  const transactionStats = toRows(transactionStatsRaw);
  const revenueStats = toRows(revenueStatsRaw);
  const topCapabilities = toRows(topCapabilitiesRaw);
  const recentSignups = toRows(recentSignupsRaw);
  const dailyVolume = toRows(dailyVolumeRaw);

  const u = userStats[0] ?? {};
  const t = transactionStats[0] ?? {};
  const r = revenueStats[0] ?? {};

  const stats = {
    users: {
      total: Number(u.total ?? 0),
      signed_up_last_7d: Number(u.last_7d ?? 0),
      signed_up_last_30d: Number(u.last_30d ?? 0),
      with_transactions: Number(u.with_transactions ?? 0),
    },
    transactions: {
      total: Number(t.total ?? 0),
      last_24h: Number(t.last_24h ?? 0),
      last_7d: Number(t.last_7d ?? 0),
      last_30d: Number(t.last_30d ?? 0),
    },
    revenue: {
      total_cents: Number(r.total_cents ?? 0),
      last_24h_cents: Number(r.last_24h_cents ?? 0),
      last_7d_cents: Number(r.last_7d_cents ?? 0),
      last_30d_cents: Number(r.last_30d_cents ?? 0),
    },
    top_capabilities: topCapabilities.map((row: any) => ({
      slug: row.slug,
      calls: Number(row.calls),
      revenue_cents: Number(row.revenue_cents),
    })),
    recent_signups: recentSignups.map((row: any) => ({
      email: row.email,
      created_at: row.created_at,
      transaction_count: Number(row.transaction_count),
      balance_cents: Number(row.balance_cents),
    })),
    daily_volume: dailyVolume.map((row: any) => ({
      date: row.date,
      transactions: Number(row.transactions),
      revenue_cents: Number(row.revenue_cents),
      unique_users: Number(row.unique_users),
    })),
  };

  cachedStats = stats;
  cachedAt = now;

  c.header("Cache-Control", "private, max-age=300");
  return c.json(stats);
});
