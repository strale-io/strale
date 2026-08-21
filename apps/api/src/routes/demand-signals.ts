/**
 * Demand signals — what callers asked for that the catalog could not serve.
 *
 * MIXED AUTH (changed by WP0 §3, CR-14 / N2):
 *   - GET /categories is aggregate-only and stays PUBLIC.
 *   - GET / returns `task_normalized`, which is the caller's VERBATIM request
 *     text, and now requires admin auth.
 *
 * Why: `failed_requests.task` is free text submitted by the caller. It logs
 * genuine unmet demand ("check a Latvian VAT number") but equally logs input
 * fumbles, where the text is the real payload the caller meant to send — a
 * company name, a person's name, an email, a document URL. Serving that
 * verbatim over an unauthenticated, publicly-cached endpoint republishes
 * customer input. At re-audit time the table held 3,426 rows and the endpoint
 * had no consumer anywhere in either repo.
 *
 * WP14 (Legal & Data Policy Authority) decides whether a public demand surface
 * returns to strale.dev in curated/derived form. Until then this is an
 * internal business-intelligence surface. Do NOT re-open GET / to anonymous
 * callers without a redaction or classification step in front of `task`.
 */

import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { rateLimitByIp } from "../lib/rate-limit.js";
import { adminOnly } from "../lib/admin-auth.js";

export const demandSignalsRoute = new Hono();
demandSignalsRoute.get(
  "/",
  adminOnly,
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
