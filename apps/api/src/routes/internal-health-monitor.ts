/**
 * Internal Health Monitor routes.
 *
 * POST /v1/internal/capabilities/:slug/restore
 *   Set lifecycle_state → 'validating', visible=false, log with humanOverride=true.
 *   Admin-only (ADMIN_SECRET).
 *
 * POST /v1/internal/capabilities/:slug/publish
 *   Publish a capability (visible=true) if SQS ≥ 60 and lifecycle_state='active'.
 *   Admin-only (ADMIN_SECRET).
 *
 * POST /v1/internal/capabilities/:slug/unpublish
 *   Unpublish a capability (visible=false). Admin-only (ADMIN_SECRET).
 *
 * POST /v1/internal/capabilities/:slug/suspend
 *   Suspend a capability (lifecycle_state='suspended', visible=false).
 *   Admin-only (ADMIN_SECRET).
 *
 * GET /v1/internal/platform-status
 *   JSON snapshot of the platform: capability counts, SQS distribution,
 *   test health, recent events, and capabilities ready to publish.
 *
 * GET /v1/internal/health-monitor/events
 *   Query recent health_monitor_events with optional filters.
 *   Query params: since, capability_slug, tier, event_type, limit (default 100, max 500)
 *
 * POST /v1/internal/health-sweep
 *   Trigger the weekly health sweep on-demand (admin-only).
 *
 * POST /v1/internal/health-monitor/send-digest
 *   Compile and send the weekly health digest immediately (admin-only).
 */

import { Hono } from "hono";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { getDb } from "../db/index.js";
import { capabilities, testSuites, healthMonitorEvents } from "../db/schema.js";
import { logHealthEvent } from "../lib/health-monitor.js";
import { computeCapabilitySQS } from "../lib/sqs.js";
import { runWeeklyHealthSweep } from "../lib/health-sweep.js";
import { compileWeeklyDigest } from "../lib/digest-compiler.js";
import { formatDigestEmail } from "../lib/digest-formatter.js";
import { sendDigestEmail, isEmailConfigured } from "../lib/digest-sender.js";
import { apiError } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

function isValidAdminAuth(auth: string | undefined): boolean {
  if (!auth || !ADMIN_SECRET) return false;
  const expected = Buffer.from(`Bearer ${ADMIN_SECRET}`, "utf-8");
  const provided = Buffer.from(auth, "utf-8");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

export const internalHealthMonitorRoute = new Hono<AppEnv>();

// ─── POST /v1/internal/capabilities/:slug/restore (A3) ─────────────────────
// Resets a capability back to 'validating' for re-validation after a fix.
// Sets visible=false so it doesn't appear in public listings until re-activated.

internalHealthMonitorRoute.post("/capabilities/:slug/restore", async (c) => {
  const auth = c.req.header("Authorization");
  if (!isValidAdminAuth(auth)) {
    return c.json(apiError("unauthorized", "Admin credentials required."), 401);
  }

  const slug = c.req.param("slug");
  const db = getDb();

  const [cap] = await db
    .select({ slug: capabilities.slug, lifecycleState: capabilities.lifecycleState })
    .from(capabilities)
    .where(eq(capabilities.slug, slug))
    .limit(1);

  if (!cap) {
    return c.json(apiError("not_found", `Capability '${slug}' not found.`), 404);
  }

  const fromState = cap.lifecycleState;

  await db
    .update(capabilities)
    .set({ lifecycleState: "validating", visible: false, updatedAt: new Date() })
    .where(eq(capabilities.slug, slug));

  await logHealthEvent({
    eventType: "lifecycle_transition",
    capabilitySlug: slug,
    tier: 1,
    actionTaken: `${fromState} → validating: restored for re-validation`,
    details: {
      from: fromState,
      to: "validating",
      reason: "restored for re-validation",
      triggered_by: "admin",
    },
    humanOverride: true,
  });

  return c.json({
    slug,
    from: fromState,
    to: "validating",
    visible: false,
    message: `Capability '${slug}' restored to validating state. Run validate-capability.ts to re-validate.`,
  });
});

// ─── GET /v1/internal/health-monitor/events (B6) ───────────────────────────
// Returns recent health_monitor_events with optional filters.

internalHealthMonitorRoute.get("/events", async (c) => {
  const db = getDb();

  const since = c.req.query("since");
  const capabilitySlugFilter = c.req.query("capability_slug");
  const tierFilter = c.req.query("tier");
  const eventTypeFilter = c.req.query("event_type");
  const limitParam = c.req.query("limit");

  const limit = Math.min(500, Math.max(1, parseInt(limitParam ?? "100", 10) || 100));

  // Build filters
  const filters: ReturnType<typeof eq>[] = [];

  if (since) {
    const sinceDate = new Date(since);
    if (!isNaN(sinceDate.getTime())) {
      filters.push(gte(healthMonitorEvents.createdAt, sinceDate) as any);
    }
  }

  if (capabilitySlugFilter) {
    filters.push(eq(healthMonitorEvents.capabilitySlug, capabilitySlugFilter) as any);
  }

  if (tierFilter) {
    const tierNum = parseInt(tierFilter, 10);
    if (tierNum === 1 || tierNum === 2 || tierNum === 3) {
      filters.push(eq(healthMonitorEvents.tier, tierNum) as any);
    }
  }

  if (eventTypeFilter) {
    filters.push(eq(healthMonitorEvents.eventType, eventTypeFilter) as any);
  }

  const events = await db
    .select()
    .from(healthMonitorEvents)
    .where(filters.length > 0 ? and(...(filters as [any, ...any[]])) : undefined)
    .orderBy(desc(healthMonitorEvents.createdAt))
    .limit(limit);

  return c.json({
    count: events.length,
    events: events.map((e) => ({
      id: e.id,
      event_type: e.eventType,
      capability_slug: e.capabilitySlug,
      tier: e.tier,
      action_taken: e.actionTaken,
      details: e.details,
      human_override: e.humanOverride,
      created_at: e.createdAt,
    })),
  });
});

// ─── POST /v1/internal/health-sweep (B8) ───────────────────────────────────
// Triggers the weekly health sweep on-demand.

internalHealthMonitorRoute.post("/health-sweep", async (c) => {
  const auth = c.req.header("Authorization");
  if (!isValidAdminAuth(auth)) {
    return c.json(apiError("unauthorized", "Admin credentials required."), 401);
  }

  const report = await runWeeklyHealthSweep();

  return c.json({
    timestamp: report.timestamp,
    suites_scanned: report.totalSuitesScanned,
    remediations_applied: report.remediationsApplied,
    remediations_proposed: report.remediationsProposed,
    stale_date_fixes: report.staleDateFixes,
    dead_urls_found: report.deadUrlsFound,
    quarantine_released: report.quarantineReleased,
    upstream_recovered: report.upstreamRecovered,
    classification_summary: report.classificationSummary,
  });
});

// ─── POST /v1/internal/health-monitor/send-digest (HM-2) ─────────────────
// Compile and send the weekly health digest immediately.
// Optional body: { "preview_only": true } — returns HTML without sending.

internalHealthMonitorRoute.post("/health-monitor/send-digest", async (c) => {
  const auth = c.req.header("Authorization");
  if (!isValidAdminAuth(auth)) {
    return c.json(apiError("unauthorized", "Admin credentials required."), 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const previewOnly = body?.preview_only === true;

  if (!previewOnly && !isEmailConfigured()) {
    return c.json(
      { error_code: "configuration_error", message: "RESEND_API_KEY is not configured. Set it to enable email sending, or pass { preview_only: true } to get the HTML without sending." },
      503,
    );
  }

  const data = await compileWeeklyDigest();
  const { html, subject } = formatDigestEmail(data);

  if (previewOnly) {
    return c.json({
      preview_only: true,
      subject,
      html,
      digest_summary: {
        snapshot: data.snapshot,
        tier3_proposals: data.tier3Proposals.length,
        tier2_actions: data.tier2Actions.length,
        demand_signals: data.demandSignals.length,
        qualification_entries: data.qualification.length,
      },
    });
  }

  await sendDigestEmail(html, subject);

  return c.json({
    sent: true,
    subject,
    to: process.env.HEALTH_DIGEST_EMAIL ?? "admin@strale.io",
    digest_summary: {
      snapshot: data.snapshot,
      tier3_proposals: data.tier3Proposals.length,
      tier2_actions: data.tier2Actions.length,
      demand_signals: data.demandSignals.length,
      qualification_entries: data.qualification.length,
    },
  });
});

// ─── POST /v1/internal/capabilities/:slug/publish ──────────────────────────
// Publish a capability (set visible=true) if SQS ≥ 60 and state='active'.

const PUBLISH_SQS_THRESHOLD = 60;

internalHealthMonitorRoute.post("/capabilities/:slug/publish", async (c) => {
  const auth = c.req.header("Authorization");
  if (!isValidAdminAuth(auth)) {
    return c.json(apiError("unauthorized", "Admin credentials required."), 401);
  }

  const slug = c.req.param("slug");
  const db = getDb();

  const [cap] = await db
    .select({
      slug: capabilities.slug,
      lifecycleState: capabilities.lifecycleState,
      visible: capabilities.visible,
      isActive: capabilities.isActive,
    })
    .from(capabilities)
    .where(eq(capabilities.slug, slug))
    .limit(1);

  if (!cap) {
    return c.json(apiError("not_found", `Capability '${slug}' not found.`), 404);
  }

  if (!cap.isActive) {
    return c.json(apiError("invalid_request", `Capability '${slug}' is inactive.`), 422);
  }

  if (cap.lifecycleState !== "active") {
    return c.json(
      apiError("invalid_request", `Cannot publish: lifecycle_state is '${cap.lifecycleState}' (must be 'active').`),
      422,
    );
  }

  if (cap.visible) {
    return c.json({ slug, already_visible: true, message: `Capability '${slug}' is already visible.` });
  }

  const sqs = await computeCapabilitySQS(slug);

  if (sqs.pending) {
    return c.json(
      apiError("invalid_request", `SQS pending — not enough test runs yet.`),
      422,
    );
  }

  if (sqs.score < PUBLISH_SQS_THRESHOLD) {
    return c.json(
      apiError(
        "invalid_request",
        `SQS ${sqs.score.toFixed(1)} is below publication threshold of ${PUBLISH_SQS_THRESHOLD}.`,
      ),
      422,
    );
  }

  await db
    .update(capabilities)
    .set({ visible: true, updatedAt: new Date() })
    .where(eq(capabilities.slug, slug));

  await logHealthEvent({
    eventType: "lifecycle_transition",
    capabilitySlug: slug,
    tier: 2,
    actionTaken: `Published: now visible in catalog (SQS ${sqs.score.toFixed(1)})`,
    details: { action: "publish", sqs_score: sqs.score, triggered_by: "admin" },
    humanOverride: true,
  });

  return c.json({
    slug,
    published: true,
    sqs: Math.round(sqs.score),
    message: `Capability '${slug}' is now visible in the catalog.`,
  });
});

// ─── POST /v1/internal/capabilities/:slug/unpublish ────────────────────────
// Unpublish a capability (set visible=false) without changing lifecycle state.

internalHealthMonitorRoute.post("/capabilities/:slug/unpublish", async (c) => {
  const auth = c.req.header("Authorization");
  if (!isValidAdminAuth(auth)) {
    return c.json(apiError("unauthorized", "Admin credentials required."), 401);
  }

  const slug = c.req.param("slug");
  const db = getDb();

  const [cap] = await db
    .select({ slug: capabilities.slug, visible: capabilities.visible, lifecycleState: capabilities.lifecycleState })
    .from(capabilities)
    .where(eq(capabilities.slug, slug))
    .limit(1);

  if (!cap) {
    return c.json(apiError("not_found", `Capability '${slug}' not found.`), 404);
  }

  if (!cap.visible) {
    return c.json({ slug, already_hidden: true, message: `Capability '${slug}' is already hidden.` });
  }

  await db
    .update(capabilities)
    .set({ visible: false, updatedAt: new Date() })
    .where(eq(capabilities.slug, slug));

  await logHealthEvent({
    eventType: "lifecycle_transition",
    capabilitySlug: slug,
    tier: 2,
    actionTaken: `Unpublished: removed from catalog (lifecycle_state remains '${cap.lifecycleState}')`,
    details: { action: "unpublish", triggered_by: "admin" },
    humanOverride: true,
  });

  return c.json({
    slug,
    unpublished: true,
    message: `Capability '${slug}' is now hidden from the catalog.`,
  });
});

// ─── POST /v1/internal/capabilities/:slug/suspend ──────────────────────────
// Suspend a capability: lifecycle_state='suspended', visible=false.

internalHealthMonitorRoute.post("/capabilities/:slug/suspend", async (c) => {
  const auth = c.req.header("Authorization");
  if (!isValidAdminAuth(auth)) {
    return c.json(apiError("unauthorized", "Admin credentials required."), 401);
  }

  const slug = c.req.param("slug");
  const db = getDb();

  const [cap] = await db
    .select({ slug: capabilities.slug, lifecycleState: capabilities.lifecycleState })
    .from(capabilities)
    .where(eq(capabilities.slug, slug))
    .limit(1);

  if (!cap) {
    return c.json(apiError("not_found", `Capability '${slug}' not found.`), 404);
  }

  if (cap.lifecycleState === "suspended") {
    return c.json({ slug, already_suspended: true, message: `Capability '${slug}' is already suspended.` });
  }

  const fromState = cap.lifecycleState;

  const body = await c.req.json().catch(() => ({}));
  const reason: string = body?.reason ?? "manually suspended by admin";

  await db
    .update(capabilities)
    .set({ lifecycleState: "suspended", visible: false, updatedAt: new Date() })
    .where(eq(capabilities.slug, slug));

  await logHealthEvent({
    eventType: "lifecycle_transition",
    capabilitySlug: slug,
    tier: 2,
    actionTaken: `${fromState} → suspended: ${reason}`,
    details: { from: fromState, to: "suspended", reason, triggered_by: "admin" },
    humanOverride: true,
  });

  return c.json({
    slug,
    suspended: true,
    from: fromState,
    reason,
    message: `Capability '${slug}' is now suspended and hidden from the catalog.`,
  });
});

// ─── GET /v1/internal/platform-status ──────────────────────────────────────
// JSON snapshot: capability counts, SQS distribution, test health,
// recent events (last 7d), and capabilities ready to publish.

internalHealthMonitorRoute.get("/platform-status", async (c) => {
  const auth = c.req.header("Authorization");
  if (!isValidAdminAuth(auth)) {
    return c.json(apiError("unauthorized", "Admin credentials required."), 401);
  }

  const db = getDb();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600_000);

  const [capRows, sqsRows, testRows, eventRows, hiddenActive] = await Promise.all([
    // Capability counts by lifecycle_state + visibility
    db
      .select({
        lifecycleState: capabilities.lifecycleState,
        visible: capabilities.visible,
        count: sql<string>`COUNT(*)`,
      })
      .from(capabilities)
      .where(eq(capabilities.isActive, true))
      .groupBy(capabilities.lifecycleState, capabilities.visible),

    // SQS distribution (cached)
    db
      .select({ matrixSqs: capabilities.matrixSqs })
      .from(capabilities)
      .where(and(eq(capabilities.isActive, true), eq(capabilities.lifecycleState, "active"))),

    // Test health counts
    db
      .select({
        testStatus: testSuites.testStatus,
        count: sql<string>`COUNT(*)`,
      })
      .from(testSuites)
      .where(eq(testSuites.active, true))
      .groupBy(testSuites.testStatus),

    // Recent event counts
    db
      .select({
        eventType: healthMonitorEvents.eventType,
        count: sql<string>`COUNT(*)`,
      })
      .from(healthMonitorEvents)
      .where(gte(healthMonitorEvents.createdAt, weekAgo))
      .groupBy(healthMonitorEvents.eventType),

    // Hidden active capabilities (ready to publish)
    db
      .select({ slug: capabilities.slug, name: capabilities.name, matrixSqs: capabilities.matrixSqs })
      .from(capabilities)
      .where(
        and(
          eq(capabilities.isActive, true),
          eq(capabilities.lifecycleState, "active"),
          eq(capabilities.visible, false),
        ),
      ),
  ]);

  // Capability counts
  const capCounts: Record<string, { visible: number; hidden: number }> = {};
  for (const row of capRows) {
    const state = row.lifecycleState;
    if (!capCounts[state]) capCounts[state] = { visible: 0, hidden: 0 };
    if (row.visible) capCounts[state].visible += Number(row.count);
    else capCounts[state].hidden += Number(row.count);
  }
  const totalCaps = capRows.reduce((s, r) => s + Number(r.count), 0);

  // SQS distribution
  const sqsDist = { excellent: 0, good: 0, fair: 0, poor: 0, building: 0 };
  for (const row of sqsRows) {
    if (row.matrixSqs === null) { sqsDist.building++; continue; }
    const s = Number(row.matrixSqs);
    if (s >= 90) sqsDist.excellent++;
    else if (s >= 75) sqsDist.good++;
    else if (s >= 60) sqsDist.fair++;
    else sqsDist.poor++;
  }

  // Test health
  const testCounts: Record<string, number> = {};
  for (const row of testRows) testCounts[row.testStatus] = Number(row.count);

  // Event counts
  const eventCounts: Record<string, number> = {};
  for (const row of eventRows) eventCounts[row.eventType] = Number(row.count);

  // Ready to publish
  const readyToPublish = hiddenActive
    .map((cap) => {
      const sqs = cap.matrixSqs !== null ? Number(cap.matrixSqs) : null;
      return { slug: cap.slug, name: cap.name, sqs, below_threshold: sqs !== null && sqs < PUBLISH_SQS_THRESHOLD };
    })
    .sort((a, b) => (b.sqs ?? -1) - (a.sqs ?? -1));

  return c.json({
    generated_at: now.toISOString(),
    capabilities: {
      active_visible: capCounts["active"]?.visible ?? 0,
      active_hidden: capCounts["active"]?.hidden ?? 0,
      probation: (capCounts["probation"]?.visible ?? 0) + (capCounts["probation"]?.hidden ?? 0),
      validating: (capCounts["validating"]?.visible ?? 0) + (capCounts["validating"]?.hidden ?? 0),
      degraded: (capCounts["degraded"]?.visible ?? 0) + (capCounts["degraded"]?.hidden ?? 0),
      suspended: (capCounts["suspended"]?.visible ?? 0) + (capCounts["suspended"]?.hidden ?? 0),
      draft: (capCounts["draft"]?.visible ?? 0) + (capCounts["draft"]?.hidden ?? 0),
      total: totalCaps,
    },
    sqs_distribution: sqsDist,
    test_health: testCounts,
    recent_events: eventCounts,
    ready_to_publish: readyToPublish,
  });
});
