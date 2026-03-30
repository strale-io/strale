import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { getDb } from "../db/index.js";
import { apiError } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cachedStats: Record<string, unknown> | null = null;
let cachedAt = 0;

/** Constant-time comparison for admin auth to prevent timing attacks. */
function isValidAdminAuth(auth: string | undefined): boolean {
  if (!auth || !ADMIN_SECRET) return false;
  const expected = Buffer.from(`Bearer ${ADMIN_SECRET}`, "utf-8");
  const provided = Buffer.from(auth, "utf-8");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

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
  if (!isValidAdminAuth(auth)) {
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

  // Cache only non-PII stats — recent_signups with emails is never cached.
  // Each request re-fetches from DB to prevent stale PII leaks.
  const { recent_signups: _, ...cacheable } = stats;
  cachedStats = { ...cacheable, recent_signups: [] as typeof stats.recent_signups };
  cachedAt = now;

  c.header("Cache-Control", "private, max-age=300");
  return c.json(stats);
});

// ─── Request analytics (aggregate, no PII) ──────────────────────────────────

adminRoute.get("/request-analytics", async (c) => {
  const days = Math.min(parseInt(c.req.query("days") ?? "7", 10) || 7, 90);
  const db = getDb();

  const rows = await db.execute(sql`
    SELECT
      t.audit_trail->'request_context'->>'userAgent' AS user_agent,
      t.audit_trail->'request_context'->>'mcpClient' AS mcp_client,
      t.audit_trail->'request_context'->>'referer' AS referer,
      t.audit_trail->'request_context'->>'ipHash' AS ip_hash,
      t.audit_trail->'request_context'->>'acceptLanguage' AS accept_language,
      c.slug AS capability_slug,
      t.is_free_tier,
      t.payment_method,
      u.email
    FROM transactions t
    LEFT JOIN capabilities c ON c.id = t.capability_id
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.created_at >= NOW() - make_interval(days := ${days})
    ORDER BY t.created_at DESC
    LIMIT 10000
  `);

  const data = (Array.isArray(rows) ? rows : (rows as any).rows ?? []) as any[];
  const internal = new Set(["petter@strale.io", "test2@strale.io", "test@strale.io", "system@strale.internal"]);
  const external = data.filter((r) => !r.email || !internal.has(r.email));

  // Aggregate by mcp_client
  const byMcpClient: Record<string, number> = {};
  for (const r of external) {
    const key = r.mcp_client || "unknown";
    byMcpClient[key] = (byMcpClient[key] ?? 0) + 1;
  }

  // Aggregate by referer (top 10)
  const byReferer: Record<string, number> = {};
  for (const r of external) {
    const key = r.referer || "direct";
    byReferer[key] = (byReferer[key] ?? 0) + 1;
  }

  // Aggregate by user_agent (top 10)
  const byUserAgent: Record<string, number> = {};
  for (const r of external) {
    const ua = r.user_agent ? String(r.user_agent).slice(0, 60) : "none";
    byUserAgent[ua] = (byUserAgent[ua] ?? 0) + 1;
  }

  // Unique IP hashes
  const uniqueIpHashes = new Set(external.map((r: any) => r.ip_hash).filter(Boolean));

  // Top capabilities
  const byCap: Record<string, number> = {};
  for (const r of external) {
    if (r.capability_slug) byCap[r.capability_slug] = (byCap[r.capability_slug] ?? 0) + 1;
  }
  const topCapabilities = Object.entries(byCap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([slug, count]) => ({ slug, count }));

  // By payment method
  const byPayment: Record<string, number> = {};
  for (const r of external) {
    const method = r.is_free_tier ? "free_tier" : (r.payment_method ?? "wallet");
    byPayment[method] = (byPayment[method] ?? 0) + 1;
  }

  // Accept-Language distribution
  const byLanguage: Record<string, number> = {};
  for (const r of external) {
    const lang = r.accept_language || "unknown";
    byLanguage[lang] = (byLanguage[lang] ?? 0) + 1;
  }

  return c.json({
    period_days: days,
    total_requests: data.length,
    external_requests: external.length,
    unique_sources: uniqueIpHashes.size,
    by_mcp_client: byMcpClient,
    by_referer: Object.fromEntries(
      Object.entries(byReferer).sort((a, b) => b[1] - a[1]).slice(0, 10),
    ),
    by_user_agent: Object.fromEntries(
      Object.entries(byUserAgent).sort((a, b) => b[1] - a[1]).slice(0, 10),
    ),
    by_payment_method: byPayment,
    by_language: Object.fromEntries(
      Object.entries(byLanguage).sort((a, b) => b[1] - a[1]).slice(0, 10),
    ),
    top_capabilities: topCapabilities,
  });
});
