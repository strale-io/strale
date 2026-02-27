import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { failedRequests } from "../db/schema.js";
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
    const cutoff = new Date(Date.now() - days * 86_400_000);

    // Normalize tasks: lowercase, trim, collapse whitespace for grouping
    // Then aggregate by normalized task with count, unique users, avg max_price
    const categoryFilter = category
      ? sql`AND ${failedRequests.category} = ${category}`
      : sql``;

    const rows = await db.execute(sql`
      SELECT
        lower(trim(regexp_replace(${failedRequests.task}, '\\s+', ' ', 'g'))) AS task_normalized,
        count(*)::int AS request_count,
        count(DISTINCT ${failedRequests.userId})::int AS unique_users,
        round(avg(${failedRequests.maxPriceCents}))::int AS avg_max_price_cents,
        max(${failedRequests.maxPriceCents})::int AS max_price_cents_highest,
        min(${failedRequests.createdAt})::text AS first_requested_at,
        max(${failedRequests.createdAt})::text AS last_requested_at
      FROM ${failedRequests}
      WHERE ${failedRequests.createdAt} >= ${cutoff}
        ${categoryFilter}
      GROUP BY task_normalized
      ORDER BY request_count DESC, unique_users DESC
      LIMIT ${limit}
    `);

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
    const cutoff = new Date(Date.now() - days * 86_400_000);

    const rows = await db.execute(sql`
      SELECT
        coalesce(${failedRequests.category}, 'uncategorized') AS category,
        count(*)::int AS request_count,
        count(DISTINCT ${failedRequests.userId})::int AS unique_users,
        round(avg(${failedRequests.maxPriceCents}))::int AS avg_max_price_cents,
        count(DISTINCT lower(trim(regexp_replace(${failedRequests.task}, '\\s+', ' ', 'g'))))::int AS unique_tasks
      FROM ${failedRequests}
      WHERE ${failedRequests.createdAt} >= ${cutoff}
      GROUP BY coalesce(${failedRequests.category}, 'uncategorized')
      ORDER BY request_count DESC
    `);

    c.header("Cache-Control", "public, max-age=3600");

    return c.json({
      days,
      categories: rows,
    });
  },
);
