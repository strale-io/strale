/**
 * Quality-floor job — applies the DEC-20260812-A floor on a daily tick
 * (Readiness P3). Thin DB glue around the pure core in lib/quality-floor.ts.
 *
 * ENFORCEMENT GATE (review H-4): dry-run by default. Until the env var
 * QUALITY_FLOOR_ENFORCE=true is set (a human decision, made after reviewing
 * dry-run events), NO catalog flags are written — every would-be action is
 * recorded to health_monitor_events as 'dry_run_would_quarantine'. This is
 * the kill switch and the brake: an autonomous, non-self-reversing,
 * public-surface write path does not get to start enforcing on its first
 * boot.
 *
 * Per tick:
 *   1. Aggregate 30d external PAID traffic per active/degraded capability
 *      (internal accounts excluded by the canonical suffix rule; free-tier
 *      rows excluded — anonymous €0 traffic is the cheapest failure-
 *      fabrication vector, review H-1; soft-deleted rows excluded, M-8).
 *   2. Classify failures (lib/transaction-failure-taxonomy.ts); caller-
 *      attributable ones don't count. Distinct failure days feed the pure
 *      core's burst guard.
 *   3. evaluateFloor() → at most maxQuarantinesPerRun quarantines/tick.
 *   4. Apply (enforce mode only): visible=false + x402_enabled=false inside
 *      a transaction WITH its audit event (M-2) — a delisting without its
 *      evidence must be impossible. updated_at bumped.
 *   5. Always: per-decision events + a tick_complete heartbeat event, so
 *      "SELECT max(created_at) FROM health_monitor_events WHERE
 *      event_type='quality_floor'" is a real DEC-20260504-C proof query
 *      even on a zero-decision tick (M-3).
 *
 * Deactivation is NEVER applied here — proposals only (escalation contract).
 * Promotion/recovery is doctor-driven in v1. Solution-step traffic is out of
 * scope (M-6; see lib/quality-floor.ts header).
 */
import postgres from "postgres";
import { getDb } from "../db/index.js";
import { capabilities, healthMonitorEvents } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { classifyTransactionFailure, CALLER_ATTRIBUTABLE } from "../lib/transaction-failure-taxonomy.js";
import { evaluateFloor, DEFAULT_FLOOR_CONFIG, type FloorStats } from "../lib/quality-floor.js";
import { INTERNAL_EMAIL_LIKE_PATTERNS, EXTRA_EXCLUDED_EMAILS } from "../lib/internal-accounts.js";
import { logError, logWarn } from "../lib/log.js";

const STARTUP_DELAY_MS = 15 * 60 * 1000; // let boot rush + first traffic settle
const INTERVAL_MS = 24 * 60 * 60 * 1000;
const ADVISORY_LOCK_ID = 20260812; // cross-instance dedup

export interface FloorTrafficRow {
  slug: string;
  lifecycle_state: string;
  visible: boolean;
  x402_enabled: boolean;
  status: string;
  error: string | null;
  price_cents: number;
  day: string;
  recent: boolean;
  n: number;
}

/**
 * Pure fold: SQL rows → per-capability FloorStats. Exported for unit tests —
 * this is where eligibility, caller-attribution and the burst-guard inputs
 * are actually computed (review test-gap #1).
 */
export function foldTrafficRows(rows: FloorTrafficRow[]): FloorStats[] {
  const bySlug = new Map<string, FloorStats & { failureDays: Set<string> }>();
  for (const r of rows) {
    let s = bySlug.get(r.slug);
    if (!s) {
      s = {
        slug: r.slug,
        lifecycleState: r.lifecycle_state,
        visible: r.visible,
        x402Enabled: r.x402_enabled,
        eligibleCalls: 0,
        completedCalls: 0,
        revenueCents: 0,
        distinctFailureDays: 0,
        recentEligibleCalls: 0,
        recentCompletedCalls: 0,
        failureDays: new Set<string>(),
      };
      bySlug.set(r.slug, s);
    }
    if (r.status === "completed") {
      s.eligibleCalls += r.n;
      s.completedCalls += r.n;
      s.revenueCents += r.price_cents * r.n;
      if (r.recent) {
        s.recentEligibleCalls += r.n;
        s.recentCompletedCalls += r.n;
      }
    } else if (!CALLER_ATTRIBUTABLE.has(classifyTransactionFailure(r.error))) {
      s.eligibleCalls += r.n;
      s.failureDays.add(r.day);
      if (r.recent) s.recentEligibleCalls += r.n;
    }
  }
  return [...bySlug.values()].map((s) => {
    const { failureDays, ...stats } = s;
    return { ...stats, distinctFailureDays: failureDays.size };
  });
}

export function isEnforceMode(): boolean {
  return process.env.QUALITY_FLOOR_ENFORCE === "true";
}

export async function runQualityFloorOnce(): Promise<{
  outcome: string;
  mode?: "enforce" | "dry_run";
  quarantined?: string[];
  proposals?: string[];
}> {
  const connStr = process.env.DATABASE_URL;
  if (!connStr) return { outcome: "skipped-no-db" };
  // No idle_timeout: the advisory lock lives on this session, and the apply
  // loop runs elsewhere — an idle-closed connection would drop the lock
  // mid-run (review M-1; matches test-scheduler / reindex-transactions).
  const sql = postgres(connStr, { max: 1 });

  try {
    const [{ acquired }] = await sql<{ acquired: boolean }[]>`
      SELECT pg_try_advisory_lock(${ADVISORY_LOCK_ID}) AS acquired`;
    if (!acquired) return { outcome: "skipped-lock-busy" };

    const mode = isEnforceMode() ? "enforce" : "dry_run";
    try {
      const rows = await sql<FloorTrafficRow[]>`
        SELECT c.slug, c.lifecycle_state, c.visible, c.x402_enabled,
               t.status, t.error, t.price_cents,
               date_trunc('day', t.created_at)::date::text AS day,
               (t.created_at > NOW() - INTERVAL '7 days') AS recent,
               COUNT(*)::int AS n
        FROM capabilities c
        JOIN transactions t ON t.capability_id = c.id
        WHERE c.is_active = true
          AND t.created_at > NOW() - INTERVAL '30 days'
          AND t.status IN ('completed', 'failed')
          AND t.deleted_at IS NULL
          AND COALESCE(t.is_free_tier, false) = false
          AND (t.user_id IS NULL OR t.user_id NOT IN (
            SELECT id FROM users
            WHERE email LIKE ANY(${INTERNAL_EMAIL_LIKE_PATTERNS})
               OR email = ANY(${EXTRA_EXCLUDED_EMAILS})
          ))
        GROUP BY c.slug, c.lifecycle_state, c.visible, c.x402_enabled,
                 t.status, t.error, t.price_cents, day, recent`;

      const stats = foldTrafficRows(rows);
      const decisions = evaluateFloor(stats, DEFAULT_FLOOR_CONFIG);
      const quarantined: string[] = [];
      const proposals: string[] = [];
      const db = getDb();

      for (const d of decisions) {
        const willQuarantine = d.action === "quarantine" && mode === "enforce";
        const details = {
          mode,
          completion: Number(d.completion.toFixed(4)),
          eligible_calls_30d: d.eligibleCalls,
          deactivate_proposal: d.deactivateProposal,
          requires_human: d.requiresHuman,
          reason: d.reason,
          dec: "DEC-20260812-A",
        };
        if (willQuarantine) {
          // Event and flag flip commit together (M-2): a delisting without
          // its evidence must be impossible.
          await db.transaction(async (tx) => {
            await tx.insert(healthMonitorEvents).values({
              eventType: "quality_floor",
              capabilitySlug: d.slug,
              tier: 2,
              actionTaken: "quarantined",
              details,
            });
            await tx
              .update(capabilities)
              .set({ visible: false, x402Enabled: false, updatedAt: new Date() })
              .where(eq(capabilities.slug, d.slug));
          });
          quarantined.push(d.slug);
        } else {
          await db.insert(healthMonitorEvents).values({
            eventType: "quality_floor",
            capabilitySlug: d.slug,
            tier: d.action === "quarantine" ? 2 : 1,
            actionTaken: d.action === "quarantine" ? "dry_run_would_quarantine" : "flagged_only",
            details,
          });
        }
        if (d.deactivateProposal) proposals.push(d.slug);
      }

      // Heartbeat: proves the tick ran even with zero decisions (M-3 /
      // DEC-20260504-C — a log line is not verification).
      await db.insert(healthMonitorEvents).values({
        eventType: "quality_floor",
        capabilitySlug: null,
        tier: 1,
        actionTaken: "tick_complete",
        details: { mode, evaluated: stats.length, decisions: decisions.length, quarantined, proposals },
      });

      logWarn("quality-floor-tick", "floor evaluation complete", {
        mode,
        evaluated: stats.length,
        decisions: decisions.length,
        quarantined,
        proposals,
      });
      return { outcome: "ok", mode, quarantined, proposals };
    } finally {
      await sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_ID})`.catch((err) => logError("quality-floor-unlock-failed", err));
    }
  } catch (err) {
    logError("quality-floor-failed", err);
    return { outcome: "error" };
  } finally {
    await sql.end({ timeout: 5 }).catch((err) => logError("quality-floor-sql-end-failed", err));
  }
}

export function startQualityFloor(): void {
  setTimeout(() => {
    void runQualityFloorOnce();
    setInterval(() => void runQualityFloorOnce(), INTERVAL_MS);
  }, STARTUP_DELAY_MS);
  logWarn("quality-floor-scheduled", "daily quality-floor tick scheduled", {
    mode: isEnforceMode() ? "enforce" : "dry_run",
    startup_delay_ms: STARTUP_DELAY_MS,
    interval_ms: INTERVAL_MS,
    config: DEFAULT_FLOOR_CONFIG,
  });
}
