/**
 * Internal Health Monitor routes.
 *
 * POST /v1/internal/capabilities/:slug/restore
 *   Set lifecycle_state → 'validating', visible=false, log with humanOverride=true.
 *   Admin-only (ADMIN_SECRET).
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
import { eq, and, gte, desc } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { getDb } from "../db/index.js";
import { capabilities, healthMonitorEvents } from "../db/schema.js";
import { logHealthEvent } from "../lib/health-monitor.js";
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
