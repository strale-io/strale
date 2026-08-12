/**
 * Quality-floor job — applies the DEC-20260812-A floor on a daily tick
 * (Readiness P3). Thin DB glue around the pure core in lib/quality-floor.ts.
 *
 * Per tick:
 *   1. Aggregate 30d external traffic per active capability (internal
 *      accounts excluded — same canonical list the analytics use).
 *   2. Classify every failure (lib/transaction-failure-taxonomy.ts); failures the
 *      caller caused don't count against the capability.
 *   3. evaluateFloor() → at most maxQuarantinesPerRun quarantines/tick
 *      (DEC-20260504-B self-throttle).
 *   4. Apply: visible=false, x402_enabled=false (the danish-company-data
 *      precedent — explicit-slug /v1/do stays reachable and unbilled on
 *      failure). Every action and every proposal lands in
 *      health_monitor_events (event_type 'quality_floor') for the doctor
 *      report; nothing is silent.
 *
 * Deactivation is NEVER applied here — proposals only (escalation contract).
 * Promotion/recovery is doctor-driven in v1 (see lib/quality-floor.ts header).
 */
import postgres from "postgres";
import { getDb } from "../db/index.js";
import { capabilities, healthMonitorEvents } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { classifyTransactionFailure, CALLER_ATTRIBUTABLE } from "../lib/transaction-failure-taxonomy.js";
import { evaluateFloor, DEFAULT_FLOOR_CONFIG, type FloorStats } from "../lib/quality-floor.js";
import { EXCLUDED_INTERNAL_EMAILS } from "../lib/internal-accounts.js";
import { logError, logWarn } from "../lib/log.js";

const STARTUP_DELAY_MS = 15 * 60 * 1000; // let boot rush + first traffic settle
const INTERVAL_MS = 24 * 60 * 60 * 1000;
const ADVISORY_LOCK_ID = 20260812; // cross-instance dedup

export async function runQualityFloorOnce(): Promise<{
  outcome: string;
  quarantined?: string[];
  proposals?: string[];
}> {
  const connStr = process.env.DATABASE_URL;
  if (!connStr) return { outcome: "skipped-no-db" };
  const sql = postgres(connStr, { max: 1, idle_timeout: 30 });

  try {
    const [{ acquired }] = await sql<{ acquired: boolean }[]>`
      SELECT pg_try_advisory_lock(${ADVISORY_LOCK_ID}) AS acquired`;
    if (!acquired) return { outcome: "skipped-lock-busy" };

    try {
      // Per-capability 30d external rows. Failures carry their error text so
      // the classifier can rule caller-attributable ones out of the
      // denominator in JS (the taxonomy is deliberately not SQL).
      const rows = await sql<{
        slug: string;
        lifecycle_state: string;
        visible: boolean;
        x402_enabled: boolean;
        status: string;
        error: string | null;
        price_cents: number;
        recent: boolean;
        n: number;
      }[]>`
        SELECT c.slug, c.lifecycle_state, c.visible, c.x402_enabled,
               t.status, t.error, COALESCE(t.price_cents, 0) AS price_cents,
               (t.created_at > NOW() - INTERVAL '7 days') AS recent,
               COUNT(*)::int AS n
        FROM capabilities c
        JOIN transactions t ON t.capability_id = c.id
        WHERE c.is_active = true
          AND t.created_at > NOW() - INTERVAL '30 days'
          AND t.status IN ('completed', 'failed')
          AND (t.user_id IS NULL OR t.user_id NOT IN (
            SELECT id FROM users WHERE email = ANY(${EXCLUDED_INTERNAL_EMAILS})
          ))
        GROUP BY c.slug, c.lifecycle_state, c.visible, c.x402_enabled,
                 t.status, t.error, t.price_cents, recent`;

      const bySlug = new Map<string, FloorStats>();
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
            recentEligibleCalls: 0,
            recentCompletedCalls: 0,
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
          if (r.recent) s.recentEligibleCalls += r.n;
        }
      }

      const decisions = evaluateFloor([...bySlug.values()], DEFAULT_FLOOR_CONFIG);
      const quarantined: string[] = [];
      const proposals: string[] = [];
      const db = getDb();

      for (const d of decisions) {
        if (d.action === "quarantine") {
          await db
            .update(capabilities)
            .set({ visible: false, x402Enabled: false })
            .where(eq(capabilities.slug, d.slug));
          quarantined.push(d.slug);
        }
        if (d.deactivateProposal) proposals.push(d.slug);
        await db.insert(healthMonitorEvents).values({
          eventType: "quality_floor",
          capabilitySlug: d.slug,
          tier: 1,
          actionTaken: d.action === "quarantine" ? "quarantined" : "flagged_only",
          details: {
            completion: Number(d.completion.toFixed(4)),
            eligible_calls_30d: d.eligibleCalls,
            deactivate_proposal: d.deactivateProposal,
            requires_human: d.requiresHuman,
            reason: d.reason,
            dec: "DEC-20260812-A",
          },
        });
      }

      logWarn("quality-floor-tick", "floor evaluation complete", {
        evaluated: bySlug.size,
        decisions: decisions.length,
        quarantined,
        proposals,
      });
      return { outcome: "ok", quarantined, proposals };
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
    startup_delay_ms: STARTUP_DELAY_MS,
    interval_ms: INTERVAL_MS,
    config: DEFAULT_FLOOR_CONFIG,
  });
}
