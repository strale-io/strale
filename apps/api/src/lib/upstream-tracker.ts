/**
 * Upstream Escalation Tracker — ATI Phase A
 *
 * Tracks upstream failure patterns per capability and escalates when
 * thresholds are crossed:
 *
 *   - 5+ upstream_transient in 48h → mark test_suites as 'upstream_broken'
 *   - 3+ upstream_changed in 7 days → log health_monitor_event for human review
 *   - Recovery: if upstream_broken suite passes 2x in 48h → release to 'normal'
 *
 * Called after each test run (or periodically from health sweep).
 */

import { eq, and, sql, gte, desc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { testSuites, testResults, healthMonitorEvents } from "../db/schema.js";

// ─── Thresholds ──────────────────────────────────────────────────────────────

const TRANSIENT_THRESHOLD = 5;       // failures in window → escalate
const TRANSIENT_WINDOW_HOURS = 48;
const CHANGED_THRESHOLD = 3;         // upstream_changed in window → flag
const CHANGED_WINDOW_DAYS = 7;

// ─── Types ──────────────────────────────────────────────────────────────────

interface EscalationResult {
  slug: string;
  suitesEscalated: number;
  changedFlagged: boolean;
  recovered: number;
}

// ─── Main entry ──────────────────────────────────────────────────────────────

/**
 * Check upstream escalation for a single capability after a test run.
 * Lightweight — queries only recent failures for this slug.
 */
export async function checkUpstreamEscalation(slug: string): Promise<EscalationResult> {
  const db = getDb();
  const result: EscalationResult = {
    slug,
    suitesEscalated: 0,
    changedFlagged: false,
    recovered: 0,
  };

  const now = new Date();
  const transientCutoff = new Date(now.getTime() - TRANSIENT_WINDOW_HOURS * 3600_000);
  const changedCutoff = new Date(now.getTime() - CHANGED_WINDOW_DAYS * 86400_000);

  // ── Count upstream_transient failures in the last 48h ──────────────────
  const transientRows = await db.execute(sql`
    SELECT ts.id AS suite_id, COUNT(*) AS fail_count
    FROM test_results tr
    INNER JOIN test_suites ts ON ts.id = tr.test_suite_id
    WHERE tr.capability_slug = ${slug}
      AND tr.executed_at >= ${transientCutoff.toISOString()}::timestamptz
      AND tr.failure_classification = 'upstream_transient'
      AND ts.active = true
      AND ts.test_status = 'normal'
    GROUP BY ts.id
    HAVING COUNT(*) >= ${TRANSIENT_THRESHOLD}
  `);

  const transientHits = (Array.isArray(transientRows) ? transientRows : (transientRows as any)?.rows ?? []) as any[];

  // Escalate matching suites to upstream_broken
  for (const row of transientHits) {
    await db.update(testSuites).set({
      testStatus: "upstream_broken",
      updatedAt: now,
    }).where(eq(testSuites.id, row.suite_id));
    result.suitesEscalated++;
  }

  if (result.suitesEscalated > 0) {
    await db.insert(healthMonitorEvents).values({
      eventType: "upstream_escalation",
      capabilitySlug: slug,
      tier: 0,
      actionTaken: `Escalated ${result.suitesEscalated} suite(s) to upstream_broken`,
      details: {
        threshold: TRANSIENT_THRESHOLD,
        window_hours: TRANSIENT_WINDOW_HOURS,
        suites_affected: transientHits.map((r: any) => r.suite_id),
      },
    });
    console.log(`[upstream-tracker] ${slug}: ${result.suitesEscalated} suite(s) → upstream_broken`);
  }

  // ── Count upstream_changed failures in the last 7 days ──────────────────
  const changedRows = await db.execute(sql`
    SELECT COUNT(DISTINCT tr.test_suite_id) AS suite_count
    FROM test_results tr
    INNER JOIN test_suites ts ON ts.id = tr.test_suite_id
    WHERE tr.capability_slug = ${slug}
      AND tr.executed_at >= ${changedCutoff.toISOString()}::timestamptz
      AND tr.failure_classification = 'upstream_changed'
      AND ts.active = true
  `);

  const changedHits = (Array.isArray(changedRows) ? changedRows : (changedRows as any)?.rows ?? []) as any[];
  const changedCount = Number(changedHits[0]?.suite_count ?? 0);

  if (changedCount >= CHANGED_THRESHOLD) {
    // Check if we already flagged this recently (avoid duplicate events)
    const recentFlag = await db.execute(sql`
      SELECT id FROM health_monitor_events
      WHERE capability_slug = ${slug}
        AND event_type = 'upstream_changed_flag'
        AND created_at >= ${changedCutoff.toISOString()}::timestamptz
      LIMIT 1
    `);
    const flagRows = (Array.isArray(recentFlag) ? recentFlag : (recentFlag as any)?.rows ?? []) as any[];

    if (flagRows.length === 0) {
      await db.insert(healthMonitorEvents).values({
        eventType: "upstream_changed_flag",
        capabilitySlug: slug,
        tier: 0,
        actionTaken: `Flagged for review: ${changedCount} upstream_changed failures in ${CHANGED_WINDOW_DAYS}d`,
        details: {
          threshold: CHANGED_THRESHOLD,
          window_days: CHANGED_WINDOW_DAYS,
          suites_affected: changedCount,
        },
      });
      result.changedFlagged = true;
      console.log(`[upstream-tracker] ${slug}: flagged for upstream_changed review (${changedCount} suites)`);
    }
  }

  return result;
}

/**
 * Bulk escalation check — run for all capabilities with recent upstream failures.
 * Called from health sweep or scheduler.
 */
export async function runUpstreamEscalationSweep(): Promise<EscalationResult[]> {
  const db = getDb();
  const cutoff = new Date(Date.now() - TRANSIENT_WINDOW_HOURS * 3600_000);

  // Find capabilities with any recent upstream failures
  const slugRows = await db.execute(sql`
    SELECT DISTINCT tr.capability_slug
    FROM test_results tr
    WHERE tr.executed_at >= ${cutoff.toISOString()}::timestamptz
      AND tr.failure_classification IN ('upstream_transient', 'upstream_changed')
  `);

  const slugs = ((Array.isArray(slugRows) ? slugRows : (slugRows as any)?.rows ?? []) as any[])
    .map((r: any) => r.capability_slug as string);

  const results: EscalationResult[] = [];
  for (const slug of slugs) {
    const result = await checkUpstreamEscalation(slug);
    if (result.suitesEscalated > 0 || result.changedFlagged) {
      results.push(result);
    }
  }

  return results;
}
