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

// ─── All users ──────────────────────────────────────────────────────────────

adminRoute.get("/users", async (c) => {
  const db = getDb();

  const rows = await db.execute(sql`
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
  `);

  const users = toRows(rows).map((row: any) => ({
    email: row.email,
    created_at: row.created_at,
    transaction_count: Number(row.transaction_count),
    balance_cents: Number(row.balance_cents),
  }));

  return c.json({ total: users.length, users });
});

// ─── Wallet health ────────────────────────────────────────────────────────────

adminRoute.get("/wallet-health", async (c) => {
  const db = getDb();

  const rows = await db.execute(sql`
    SELECT
      u.email,
      u.created_at::text AS signed_up,
      COALESCE(w.balance_cents, 0)::int AS balance_cents,
      COUNT(t.id)::int AS completed_transactions,
      MAX(t.created_at)::text AS last_transaction_at
    FROM users u
    LEFT JOIN wallets w ON w.user_id = u.id
    LEFT JOIN transactions t ON t.user_id = u.id AND t.status = 'completed'
    GROUP BY u.id, u.email, u.created_at, w.balance_cents
    ORDER BY w.balance_cents ASC NULLS FIRST
  `);

  const walletRows = toRows(rows).map((row: any) => ({
    email: row.email,
    signed_up: row.signed_up,
    balance_cents: Number(row.balance_cents),
    completed_transactions: Number(row.completed_transactions),
    last_transaction_at: row.last_transaction_at,
  }));

  const exhausted = walletRows.filter((w) => w.balance_cents <= 0).length;
  const low = walletRows.filter((w) => w.balance_cents > 0 && w.balance_cents <= 50).length;
  const healthy = walletRows.filter((w) => w.balance_cents > 50).length;

  return c.json({
    wallets: walletRows,
    summary: {
      total_users: walletRows.length,
      exhausted_credits: exhausted,
      low_credits: low,
      healthy_credits: healthy,
    },
  });
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

// ─── Trigger digest email now ─────────────────────────────────────────────────

adminRoute.post("/digest", async (c) => {
  // Dynamic imports to avoid loading digest module on every API request
  const { gatherDigestData } = await import("../lib/daily-digest/index.js");
  const { analyzeDigest } = await import("../lib/daily-digest/analyze.js");
  const { renderDigestEmail } = await import("../lib/daily-digest/render-email.js");
  const { sendDigestEmail } = await import("../lib/daily-digest/send.js");
  const { saveSnapshot } = await import("../lib/daily-digest/snapshots.js");

  // Fire and forget — respond immediately
  (async () => {
    try {
      console.log("[admin/digest] Generating digest...");
      const data = await gatherDigestData();
      const analysis = await analyzeDigest(data);
      const html = renderDigestEmail(data, analysis);
      await sendDigestEmail(html, new Date());
      await saveSnapshot(data);
      console.log("[admin/digest] Digest sent successfully");
    } catch (err) {
      console.error("[admin/digest] Failed:", err);
    }
  })();

  return c.json({ status: "digest_triggered", note: "Email will arrive in ~30 seconds" });
});

// ─── External transaction log (detailed, for learning) ───────────────────────

adminRoute.get("/external-transactions", async (c) => {
  const days = Math.min(parseInt(c.req.query("days") ?? "7", 10) || 7, 90);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "100", 10) || 100, 500);
  const db = getDb();

  const rows = await db.execute(sql`
    SELECT
      t.id,
      t.status,
      t.created_at::text AS created_at,
      t.completed_at::text AS completed_at,
      c.slug AS capability_slug,
      t.input,
      t.output,
      t.error,
      t.price_cents,
      t.latency_ms,
      t.is_free_tier,
      t.payment_method,
      t.audit_trail->'request_context'->>'userAgent' AS user_agent,
      t.audit_trail->'request_context'->>'mcpClient' AS mcp_client,
      t.audit_trail->'request_context'->>'referer' AS referer,
      t.audit_trail->'request_context'->>'ipHash' AS ip_hash,
      u.email
    FROM transactions t
    LEFT JOIN capabilities c ON c.id = t.capability_id
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.created_at >= NOW() - make_interval(days := ${days})
      AND (u.email IS NULL OR u.email NOT IN ('petter@strale.io', 'test2@strale.io', 'test@strale.io', 'system@strale.internal'))
    ORDER BY t.created_at DESC
    LIMIT ${limit}
  `);

  const external = toRows(rows);

  return c.json({
    period_days: days,
    total: external.length,
    transactions: external.map((r: Record<string, unknown>) => ({
      id: r.id,
      status: r.status,
      created_at: r.created_at,
      completed_at: r.completed_at,
      capability_slug: r.capability_slug,
      input: r.input,
      output: r.output,
      error: r.error,
      price_cents: r.price_cents,
      latency_ms: r.latency_ms,
      is_free_tier: r.is_free_tier,
      payment_method: r.payment_method,
      user_agent: r.user_agent,
      mcp_client: r.mcp_client,
      referer: r.referer,
      ip_hash: r.ip_hash,
    })),
  });
});

// ─── Platform status (comprehensive) ─────────────────────────────────────────

adminRoute.get("/platform-status", async (c) => {
  const db = getDb();

  // Visibility expectations per lifecycle state
  const EXPECTED_VISIBLE: Record<string, boolean> = {
    draft: false, validating: false, probation: false,
    active: true, degraded: true, suspended: false, deactivated: false,
  };

  // Run all queries in parallel
  const [
    lifecycleRaw, inactiveRaw, solutionRaw, breakerRaw,
    freeTierRaw, suspendedRaw, validatingRaw, transitionsRaw, suiteCountRaw,
  ] = await Promise.all([
    // Lifecycle breakdown
    db.execute(sql`
      SELECT is_active, visible, lifecycle_state, COUNT(*)::int AS cnt
      FROM capabilities GROUP BY is_active, visible, lifecycle_state
    `),
    // Inactive count
    db.execute(sql`SELECT COUNT(*)::int AS cnt FROM capabilities WHERE is_active = false`),
    // Solutions
    db.execute(sql`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE is_active = true)::int AS active,
        COUNT(*) FILTER (WHERE is_active = false)::int AS inactive
      FROM solutions
    `),
    // Circuit breakers
    db.execute(sql`
      SELECT ch.state, ch.capability_slug AS slug, ch.opened_at, ch.consecutive_failures, ch.next_retry_at
      FROM capability_health ch
    `),
    // Free tier with breaker state
    db.execute(sql`
      SELECT c.slug, ch.state, ch.opened_at
      FROM capabilities c
      LEFT JOIN capability_health ch ON ch.capability_slug = c.slug
      WHERE c.is_active = true AND c.is_free_tier = true
    `),
    // Suspended details
    db.execute(sql`
      SELECT slug, updated_at, deactivation_reason FROM capabilities WHERE lifecycle_state = 'suspended'
    `),
    // Validating details
    db.execute(sql`
      SELECT c.slug, c.qp_score,
        (SELECT COUNT(*)::int FROM test_results tr WHERE tr.capability_slug = c.slug) AS run_count
      FROM capabilities c WHERE c.lifecycle_state = 'validating'
    `),
    // Recent transitions from health events
    db.execute(sql`
      SELECT capability_slug AS slug, details->>'from' AS from_state, details->>'to' AS to_state,
        details->>'triggered_by' AS trigger, created_at
      FROM health_monitor_events
      WHERE event_type = 'lifecycle_transition'
      ORDER BY created_at DESC LIMIT 20
    `),
    // Test suite count
    db.execute(sql`SELECT COUNT(*)::int AS cnt FROM test_suites WHERE active = true`),
  ]);

  const rows = (r: unknown) => Array.isArray(r) ? r : (r as any)?.rows ?? [];

  // Build lifecycle state counts
  const byState: Record<string, number> = { draft: 0, validating: 0, probation: 0, active: 0, degraded: 0, suspended: 0, deactivated: 0 };
  let total = 0;
  let apiVisible = 0;
  const anomalies: Array<{ slug?: string; is_active: boolean; visible: boolean; lifecycle_state: string; issue: string }> = [];

  for (const row of rows(lifecycleRaw)) {
    const state = row.lifecycle_state as string;
    const cnt = row.cnt as number;
    byState[state] = (byState[state] ?? 0) + cnt;
    total += cnt;
    if (row.is_active && row.visible && (state === "active" || state === "degraded")) apiVisible += cnt;

    // Anomaly detection
    const expectedVisible = EXPECTED_VISIBLE[state];
    if (expectedVisible !== undefined) {
      if (!row.is_active && state !== "deactivated") {
        anomalies.push({ is_active: false, visible: row.visible, lifecycle_state: state, issue: `is_active=false but lifecycle_state=${state}` });
      }
      if (row.visible !== expectedVisible && cnt > 0) {
        anomalies.push({ is_active: row.is_active, visible: row.visible, lifecycle_state: state, issue: `visible=${row.visible} but expected ${expectedVisible} for ${state}` });
      }
    }
  }

  // Circuit breakers
  const breakerCounts = { closed: 0, open: 0, half_open: 0 };
  const openCaps: Array<{ slug: string; opened_at: string | null; consecutive_failures: number; next_retry_at: string | null }> = [];
  for (const row of rows(breakerRaw)) {
    const state = row.state as "closed" | "open" | "half_open";
    breakerCounts[state] = (breakerCounts[state] ?? 0) + 1;
    if (state === "open" || state === "half_open") {
      openCaps.push({
        slug: row.slug,
        opened_at: row.opened_at?.toISOString?.() ?? row.opened_at ?? null,
        consecutive_failures: row.consecutive_failures ?? 0,
        next_retry_at: row.next_retry_at?.toISOString?.() ?? row.next_retry_at ?? null,
      });
    }
  }

  // Free tier
  const freeTierRows = rows(freeTierRaw);
  const freeDegraded = freeTierRows
    .filter((r: any) => r.state === "open" || r.state === "half_open")
    .map((r: any) => ({ slug: r.slug, breaker_state: r.state, opened_at: r.opened_at?.toISOString?.() ?? r.opened_at ?? null }));

  // Suspended
  const now = Date.now();
  const suspendedDetails = rows(suspendedRaw).map((r: any) => ({
    slug: r.slug,
    updated_at: r.updated_at?.toISOString?.() ?? r.updated_at,
    days_suspended: Math.floor((now - new Date(r.updated_at).getTime()) / (1000 * 60 * 60 * 24)),
    deactivation_reason: r.deactivation_reason ?? null,
  }));

  // Validating
  const validatingDetails = rows(validatingRaw).map((r: any) => ({
    slug: r.slug,
    sqs_quality_profile: r.qp_score ? parseFloat(r.qp_score) : null,
    test_run_count: r.run_count ?? 0,
  }));

  // Transitions
  const recentTransitions = rows(transitionsRaw).map((r: any) => ({
    slug: r.slug,
    from_state: r.from_state,
    to_state: r.to_state,
    trigger: r.trigger,
    created_at: r.created_at?.toISOString?.() ?? r.created_at,
  }));

  const solRow = rows(solutionRaw)[0] ?? {};

  return c.json({
    capabilities: {
      total,
      by_lifecycle_state: byState,
      api_visible: apiVisible,
      inactive: rows(inactiveRaw)[0]?.cnt ?? 0,
      anomalies,
    },
    solutions: {
      total: solRow.total ?? 0,
      active: solRow.active ?? 0,
      inactive: solRow.inactive ?? 0,
    },
    circuit_breakers: {
      ...breakerCounts,
      open_capabilities: openCaps,
    },
    free_tier: {
      total: freeTierRows.length,
      healthy: freeTierRows.length - freeDegraded.length,
      degraded: freeDegraded,
    },
    suspended_details: suspendedDetails,
    validating_details: validatingDetails,
    recent_transitions: recentTransitions,
    meta: {
      generated_at: new Date().toISOString(),
      test_suites_count: rows(suiteCountRaw)[0]?.cnt ?? 0,
    },
  });
});

// ─── Capability schema patch (admin-only) ───────────────────────────────────
// PATCH /v1/admin/capability-schema — update input_schema and/or description
// for a capability. Used when the handler changes input requirements but the
// DB schema needs a manual patch (e.g., adding court to german-company-data).

adminRoute.patch("/capability-schema", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.slug || typeof body.slug !== "string") {
    return c.json(apiError("invalid_request", "slug is required"), 400);
  }
  if (!body.input_schema && !body.description && !body.lifecycle_state && body.visible == null && body.is_active == null) {
    return c.json(apiError("invalid_request", "Provide input_schema, description, lifecycle_state, visible, or is_active"), 400);
  }

  const db = getDb();
  const slug = body.slug;
  const inputSchema = body.input_schema ? JSON.stringify(body.input_schema) : null;
  const description = body.description ?? null;
  const lifecycleState = body.lifecycle_state ?? null;
  const visible = body.visible ?? null;
  const isActive = body.is_active ?? null;

  const result = await db.execute(sql`
    UPDATE capabilities
    SET
      input_schema = COALESCE(${inputSchema}::jsonb, input_schema),
      description = COALESCE(${description}, description),
      lifecycle_state = COALESCE(${lifecycleState}, lifecycle_state),
      visible = COALESCE(${visible}, visible),
      is_active = COALESCE(${isActive}, is_active)
    WHERE slug = ${slug}
    RETURNING slug, input_schema, description, lifecycle_state, visible, is_active
  `);

  const rows2 = toRows(result);
  if (rows2.length === 0) {
    return c.json(apiError("not_found", `Capability '${slug}' not found`), 404);
  }

  return c.json({ updated: rows2[0] });
});

// ─── Circuit breaker reset (admin-only) ─────────────────────────────────────
// POST /v1/admin/reset-circuit-breaker — reset a capability's circuit breaker
// to closed state. Used when VIES or other external services recover.

adminRoute.post("/reset-circuit-breaker", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.slug || typeof body.slug !== "string") {
    return c.json(apiError("invalid_request", "slug is required"), 400);
  }

  const db = getDb();
  const result = await db.execute(sql`
    UPDATE capability_health
    SET state = 'closed', consecutive_failures = 0, updated_at = NOW()
    WHERE capability_slug = ${body.slug}
    RETURNING capability_slug, state, consecutive_failures
  `);

  const rows2 = toRows(result);
  if (rows2.length === 0) {
    return c.json(apiError("not_found", `No circuit breaker found for '${body.slug}'`), 404);
  }

  return c.json({ reset: rows2[0] });
});

// ─── Capability reprice (admin-only) ────────────────────────────────────────
// POST /v1/admin/reprice — update a capability's price_cents

// ─── Capability creation (admin-only) ───────────────────────────────────────
// POST /v1/admin/create-capability — insert a new capability row

adminRoute.post("/create-capability", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.slug || !body?.name || !body?.description || !body?.input_schema || !body?.output_schema) {
    return c.json(apiError("invalid_request", "slug, name, description, input_schema, and output_schema are required"), 400);
  }

  const db = getDb();
  const result = await db.execute(sql`
    INSERT INTO capabilities (slug, name, description, category, price_cents, is_free_tier, input_schema, output_schema, data_source, transparency_tag, is_active, visible, lifecycle_state)
    VALUES (
      ${body.slug},
      ${body.name},
      ${body.description},
      ${body.category ?? "company-data"},
      ${body.price_cents ?? 80},
      ${body.is_free_tier ?? false},
      ${JSON.stringify(body.input_schema)}::jsonb,
      ${JSON.stringify(body.output_schema)}::jsonb,
      ${body.data_source ?? ""},
      ${body.transparency_tag ?? "ai_generated"},
      true,
      true,
      'active'
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING slug, name
  `);

  const rows2 = toRows(result);
  if (rows2.length === 0) {
    return c.json({ message: `Capability '${body.slug}' already exists` });
  }
  return c.json({ created: rows2[0] }, 201);
});

// ─── Test fixture insertion (admin-only) ────────────────────────────────────
// POST /v1/admin/add-fixture — insert a test suite row directly

adminRoute.post("/add-fixture", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.capability_slug || !body?.test_name || !body?.input || !body?.checks) {
    return c.json(apiError("invalid_request", "capability_slug, test_name, input, and checks are required"), 400);
  }

  const db = getDb();
  const result = await db.execute(sql`
    INSERT INTO test_suites (capability_slug, test_name, test_type, input, validation_rules, active, schedule_tier, estimated_cost_cents, test_mode)
    VALUES (
      ${body.capability_slug},
      ${body.test_name},
      ${body.test_type ?? "known_answer"},
      ${JSON.stringify(body.input)}::jsonb,
      ${JSON.stringify({ checks: body.checks })}::jsonb,
      true,
      ${body.schedule_tier ?? "B"},
      ${body.cost_cents ?? 0},
      'live'
    )
    RETURNING id, capability_slug, test_name
  `);

  return c.json({ inserted: toRows(result)[0] });
});

adminRoute.post("/reprice", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.slug || typeof body.slug !== "string" || typeof body.price_cents !== "number") {
    return c.json(apiError("invalid_request", "slug and price_cents are required"), 400);
  }

  const db = getDb();
  const result = await db.execute(sql`
    UPDATE capabilities
    SET price_cents = ${body.price_cents}
    WHERE slug = ${body.slug}
    RETURNING slug, price_cents
  `);

  const rows2 = toRows(result);
  if (rows2.length === 0) {
    return c.json(apiError("not_found", `Capability '${body.slug}' not found`), 404);
  }

  // Recompute prices for all solutions that include this capability
  let solutionUpdates: Array<{ slug: string; oldPrice: number; newPrice: number }> = [];
  try {
    const { recomputeAffectedSolutions } = await import("../lib/solution-pricing.js");
    const updates = await recomputeAffectedSolutions(body.slug);
    solutionUpdates = updates.filter((u) => u.changed).map((u) => ({
      slug: u.slug, oldPrice: u.oldPrice, newPrice: u.newPrice,
    }));
    if (solutionUpdates.length > 0) {
      console.log(`[admin] Repriced ${body.slug} → recomputed ${solutionUpdates.length} solution(s)`);
    }
  } catch (err) {
    console.error("[admin] Solution recomputation failed:", err instanceof Error ? err.message : err);
  }

  return c.json({ updated: rows2[0], solutions_recomputed: solutionUpdates });
});

// ─── Solution creation (admin-only) ─────────────────────────────────────────
// POST /v1/admin/create-solution — insert a new solution with steps

adminRoute.post("/create-solution", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.slug || !body?.name || !body?.description || !Array.isArray(body?.steps)) {
    return c.json(apiError("invalid_request", "slug, name, description, and steps[] are required"), 400);
  }

  const db = getDb();

  // Insert solution
  const solResult = await db.execute(sql`
    INSERT INTO solutions (slug, name, marketing_name, description, long_description, agent_description, category, price_cents, component_sum_cents, value_tier, maintenance_level, geography, is_active, input_schema, transparency_tag)
    VALUES (
      ${body.slug},
      ${body.name},
      ${body.marketing_name ?? body.name},
      ${body.description},
      ${body.long_description ?? body.description},
      ${body.agent_description ?? ""},
      ${body.category ?? "sales-outreach"},
      ${body.price_cents ?? 250},
      ${body.component_sum_cents ?? body.price_cents ?? 200},
      ${body.value_tier ?? "data-lookup"},
      ${body.maintenance_level ?? "low"},
      ${body.geography ?? "global"},
      true,
      ${JSON.stringify(body.input_schema ?? {})}::jsonb,
      ${body.transparency_tag ?? "mixed"}
    )
    ON CONFLICT (slug) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      price_cents = EXCLUDED.price_cents,
      is_active = true,
      input_schema = EXCLUDED.input_schema
    RETURNING id, slug, name
  `);

  const solRows = toRows(solResult);
  if (solRows.length === 0) {
    return c.json(apiError("invalid_request", "Failed to create solution"), 400);
  }

  const solutionId = solRows[0].id;

  // Delete existing steps and re-insert
  await db.execute(sql`DELETE FROM solution_steps WHERE solution_id = ${solutionId}`);

  // Insert steps
  let stepsInserted = 0;
  for (const step of body.steps) {
    // Verify capability exists
    const capResult = await db.execute(sql`SELECT slug FROM capabilities WHERE slug = ${step.capability_slug}`);
    const capRows = toRows(capResult);
    if (capRows.length === 0) {
      console.warn(`[create-solution] Capability '${step.capability_slug}' not found — skipping step`);
      continue;
    }
    await db.execute(sql`
      INSERT INTO solution_steps (solution_id, capability_slug, step_order, can_parallel, parallel_group, input_map)
      VALUES (${solutionId}, ${step.capability_slug}, ${step.step_order}, ${step.can_parallel ?? false}, ${step.parallel_group ?? null}, ${JSON.stringify(step.input_map ?? {})}::jsonb)
    `);
    stepsInserted++;
  }

  return c.json({ created: solRows[0], steps_inserted: stepsInserted }, 201);
});
