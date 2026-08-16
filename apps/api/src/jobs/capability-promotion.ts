/**
 * Capability-promotion job — publishes capabilities that have earned it.
 *
 * Thin DB glue around the pure core in lib/capability-promotion.ts, which
 * carries the rationale. Mirrors jobs/quality-floor.ts deliberately: same
 * advisory-lock shape, same transactional "flag flip and its audit event
 * commit together" rule (floor review M-2 — a catalog change without its
 * evidence must be impossible), same heartbeat so a zero-decision tick is
 * still provable per DEC-20260504-C.
 *
 * Per tick:
 *   1. Aggregate the trailing 7 days of scheduled + piggyback test results per
 *      delisted-but-active capability, with the known_answer subset broken out
 *      and the circuit-breaker state joined in.
 *   2. evaluatePromotion() → at most maxPromotionsPerRun promotions/tick.
 *   3. Apply: lifecycle_state='active', visible=true, and x402_enabled=true
 *      where the capability has a method and is not free-tier — inside a
 *      transaction with its `capability_promotion` event.
 *   4. Always emit per-decision events plus a tick_complete heartbeat.
 *
 * ENFORCEMENT: enforcing by default, braked by CAPABILITY_PROMOTION_DRY_RUN.
 * This is the opposite default to the quality floor and the asymmetry is
 * intentional — see the pure core's "Direction of risk" section. Briefly:
 * delisting is not self-reversing, promotion is, and the floor's own daily
 * tick catches anything promoted in error. Three months of green capabilities
 * sitting dark is the cost of the cautious default, and it has already been
 * paid once.
 *
 * Bulk-operation note (DEC-20260504-B): the first tick after deploy is a
 * workload-resumption event — a backlog that accumulated since May 2026, not a
 * steady-state run. maxPromotionsPerRun is the self-throttle that makes it one:
 * the backlog drains at 3/day, each batch visible in health_monitor_events
 * before the next runs. Measured backlog at authoring time: 8 capabilities
 * clearing the pass-rate bar, of which the strongest 3 go first.
 */
import postgres from "postgres";
import { getDb } from "../db/index.js";
import { capabilities, healthMonitorEvents } from "../db/schema.js";
import { eq } from "drizzle-orm";
import {
  evaluatePromotion,
  DEFAULT_PROMOTION_CONFIG,
  type PromotionStats,
} from "../lib/capability-promotion.js";
import { logError, logWarn } from "../lib/log.js";

const STARTUP_DELAY_MS = 20 * 60 * 1000; // after the floor's 15min, so the two never race a boot
const INTERVAL_MS = 24 * 60 * 60 * 1000;
const ADVISORY_LOCK_ID = 20260816; // distinct from the floor's 20260812

/** One row per capability, straight from the aggregate query. */
export interface PromotionEvidenceRow {
  slug: string;
  lifecycle_state: string;
  visible: boolean;
  x402_enabled: boolean;
  is_free_tier: boolean;
  maintenance_class: string | null;
  marketplace_eligible: boolean;
  deactivation_reason: string | null;
  has_x402_method: boolean;
  breaker_state: string | null;
  total_tests: number;
  passed_tests: number;
  distinct_test_days: number;
  ka_total: number;
  ka_passed: number;
}

/**
 * Pure mapping from SQL rows to core input. Exported for unit tests: the
 * column-to-field correspondence is the part that silently rots when the
 * query is edited, and a swapped `ka_passed`/`passed_tests` would read as a
 * capability that is green on correctness when it is not.
 */
export function toPromotionStats(rows: PromotionEvidenceRow[]): PromotionStats[] {
  return rows.map((r) => ({
    slug: r.slug,
    lifecycleState: r.lifecycle_state,
    visible: r.visible,
    x402Enabled: r.x402_enabled,
    isFreeTier: r.is_free_tier,
    maintenanceClass: r.maintenance_class,
    marketplaceEligible: r.marketplace_eligible,
    deactivationReason: r.deactivation_reason,
    hasX402Method: r.has_x402_method,
    breakerState: r.breaker_state,
    totalTests: r.total_tests,
    passedTests: r.passed_tests,
    distinctTestDays: r.distinct_test_days,
    knownAnswerTotal: r.ka_total,
    knownAnswerPassed: r.ka_passed,
  }));
}

export function isDryRun(): boolean {
  return process.env.CAPABILITY_PROMOTION_DRY_RUN === "true";
}

export async function runCapabilityPromotionOnce(): Promise<{
  outcome: string;
  mode?: "enforce" | "dry_run";
  promoted?: string[];
  flagged?: string[];
}> {
  const connStr = process.env.DATABASE_URL;
  if (!connStr) return { outcome: "skipped-no-db" };
  // No idle_timeout: the advisory lock lives on this session while the apply
  // loop runs on the drizzle pool (same reasoning as quality-floor M-1).
  const sql = postgres(connStr, { max: 1 });

  try {
    const [{ acquired }] = await sql<{ acquired: boolean }[]>`
      SELECT pg_try_advisory_lock(${ADVISORY_LOCK_ID}) AS acquired`;
    if (!acquired) return { outcome: "skipped-lock-busy" };

    const mode = isDryRun() ? "dry_run" : "enforce";
    try {
      // LEFT JOIN on test_results: a capability with zero results must still
      // appear, as a zero-evidence row the core rejects — an INNER JOIN would
      // make "never tested" indistinguishable from "not a candidate".
      const rows = await sql<PromotionEvidenceRow[]>`
        SELECT c.slug,
               c.lifecycle_state,
               c.visible,
               c.x402_enabled,
               COALESCE(c.is_free_tier, false)        AS is_free_tier,
               c.maintenance_class,
               COALESCE(c.marketplace_eligible, false) AS marketplace_eligible,
               c.deactivation_reason,
               (c.x402_method IS NOT NULL)             AS has_x402_method,
               h.state                                 AS breaker_state,
               COUNT(tr.id)::int                                            AS total_tests,
               COUNT(tr.id) FILTER (WHERE tr.passed)::int                   AS passed_tests,
               COUNT(DISTINCT date_trunc('day', tr.executed_at))::int       AS distinct_test_days,
               COUNT(tr.id) FILTER (WHERE ts.test_type = 'known_answer')::int                 AS ka_total,
               COUNT(tr.id) FILTER (WHERE ts.test_type = 'known_answer' AND tr.passed)::int   AS ka_passed
        FROM capabilities c
        LEFT JOIN capability_health h ON h.capability_slug = c.slug
        LEFT JOIN test_results tr
               ON tr.capability_slug = c.slug
              AND tr.executed_at > NOW() - INTERVAL '7 days'
        LEFT JOIN test_suites ts ON ts.id = tr.test_suite_id
        WHERE c.is_active = true
          AND c.visible = false
        GROUP BY c.slug, c.lifecycle_state, c.visible, c.x402_enabled, c.is_free_tier,
                 c.maintenance_class, c.marketplace_eligible, c.deactivation_reason,
                 c.x402_method, h.state`;

      const decisions = evaluatePromotion(toPromotionStats(rows), DEFAULT_PROMOTION_CONFIG);
      const promoted: string[] = [];
      const flagged: string[] = [];
      const db = getDb();

      for (const d of decisions) {
        const details = {
          mode,
          pass_rate: Number(d.passRate.toFixed(4)),
          tests_7d: d.totalTests,
          enable_x402: d.enableX402,
          reason: d.reason,
          dec: "DEC-20260812-A",
        };

        if (d.action === "promote" && mode === "enforce") {
          await db.transaction(async (tx) => {
            await tx.insert(healthMonitorEvents).values({
              eventType: "capability_promotion",
              capabilitySlug: d.slug,
              tier: 2,
              actionTaken: d.enableX402 ? "promoted_with_x402" : "promoted",
              details,
            });
            await tx
              .update(capabilities)
              .set({
                lifecycleState: "active",
                visible: true,
                ...(d.enableX402 ? { x402Enabled: true } : {}),
                updatedAt: new Date(),
              })
              .where(eq(capabilities.slug, d.slug));
          });
          promoted.push(d.slug);
          continue;
        }

        await db.insert(healthMonitorEvents).values({
          eventType: "capability_promotion",
          capabilitySlug: d.slug,
          tier: d.action === "promote" ? 2 : 1,
          actionTaken:
            d.action === "promote" ? "dry_run_would_promote"
            : d.action === "flag" ? "flagged_for_human"
            : "held",
          details,
        });
        if (d.action === "flag") flagged.push(d.slug);
      }

      await db.insert(healthMonitorEvents).values({
        eventType: "capability_promotion",
        capabilitySlug: null,
        tier: 1,
        actionTaken: "tick_complete",
        details: { mode, evaluated: rows.length, decisions: decisions.length, promoted, flagged },
      });

      logWarn("capability-promotion-tick", "promotion evaluation complete", {
        mode,
        evaluated: rows.length,
        decisions: decisions.length,
        promoted,
        flagged,
      });
      return { outcome: "ok", mode, promoted, flagged };
    } finally {
      await sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_ID})`.catch((err) =>
        logError("capability-promotion-unlock-failed", err),
      );
    }
  } catch (err) {
    logError("capability-promotion-failed", err);
    return { outcome: "error" };
  } finally {
    await sql.end({ timeout: 5 }).catch((err) => logError("capability-promotion-sql-end-failed", err));
  }
}

export function startCapabilityPromotion(): void {
  setTimeout(() => {
    void runCapabilityPromotionOnce();
    setInterval(() => void runCapabilityPromotionOnce(), INTERVAL_MS);
  }, STARTUP_DELAY_MS);
  logWarn("capability-promotion-scheduled", "daily capability-promotion tick scheduled", {
    mode: isDryRun() ? "dry_run" : "enforce",
    startup_delay_ms: STARTUP_DELAY_MS,
    interval_ms: INTERVAL_MS,
    config: DEFAULT_PROMOTION_CONFIG,
  });
}
