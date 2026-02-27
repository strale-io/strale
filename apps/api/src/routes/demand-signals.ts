import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { rateLimitByIp } from "../lib/rate-limit.js";

export const demandSignalsRoute = new Hono();

// GET /v1/demand-signals — Aggregated demand signals from failed requests
// Public endpoint, no auth required. Rate limited by IP (10 req/min).
demandSignalsRoute.get(
  "/",
  rateLimitByIp(10, 60_000),
  async (c) => {
    const days = Math.min(
      Math.max(parseInt(c.req.query("days") ?? "30", 10) || 30, 1),
      365,
    );
    const limit = Math.min(
      Math.max(parseInt(c.req.query("limit") ?? "50", 10) || 50, 1),
      200,
    );
    const category = c.req.query("category") || null;

    const db = getDb();
    const cutoffStr = new Date(Date.now() - days * 86_400_000).toISOString();

    // Build query with optional category filter
    const categoryClause = category
      ? sql`AND category = ${category}`
      : sql``;

    const result = await db.execute(sql`
      SELECT
        lower(trim(regexp_replace(task, '\s+', ' ', 'g'))) AS task_normalized,
        count(*)::int AS request_count,
        count(DISTINCT user_id)::int AS unique_users,
        round(avg(max_price_cents))::int AS avg_max_price_cents,
        max(max_price_cents)::int AS max_price_cents_highest,
        min(created_at)::text AS first_requested_at,
        max(created_at)::text AS last_requested_at
      FROM failed_requests
      WHERE created_at >= ${cutoffStr}::timestamptz
        ${categoryClause}
      GROUP BY task_normalized
      ORDER BY request_count DESC, unique_users DESC
      LIMIT ${limit}
    `);

    const rows = Array.isArray(result) ? result : (result as any).rows ?? [];

    c.header("Cache-Control", "public, max-age=3600");

    return c.json({
      days,
      total_signals: rows.length,
      signals: rows,
    });
  },
);

// GET /v1/demand-signals/categories — Category-level aggregates
demandSignalsRoute.get(
  "/categories",
  rateLimitByIp(10, 60_000),
  async (c) => {
    const days = Math.min(
      Math.max(parseInt(c.req.query("days") ?? "30", 10) || 30, 1),
      365,
    );

    const db = getDb();
    const cutoffStr = new Date(Date.now() - days * 86_400_000).toISOString();

    const result = await db.execute(sql`
      SELECT
        coalesce(category, 'uncategorized') AS category,
        count(*)::int AS request_count,
        count(DISTINCT user_id)::int AS unique_users,
        round(avg(max_price_cents))::int AS avg_max_price_cents,
        count(DISTINCT lower(trim(regexp_replace(task, '\s+', ' ', 'g'))))::int AS unique_tasks
      FROM failed_requests
      WHERE created_at >= ${cutoffStr}::timestamptz
      GROUP BY coalesce(category, 'uncategorized')
      ORDER BY request_count DESC
    `);

    const rows = Array.isArray(result) ? result : (result as any).rows ?? [];

    c.header("Cache-Control", "public, max-age=3600");

    return c.json({
      days,
      categories: rows,
    });
  },
);
