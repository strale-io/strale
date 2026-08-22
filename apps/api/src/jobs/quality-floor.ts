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
 *   1. Aggregate external PAID invocations per active/degraded capability over a
 *      window that is 30d, CLAMPED to since-last-promotion when that's more
 *      recent ("promotion grace" fix, 2026-08-16). Without the clamp, a
 *      capability promoted mid-window still carries its pre-promotion
 *      failures in the same 30d completion rate, so the very next tick could
 *      re-quarantine it on stale evidence — observed in prod on
 *      screenshot-url: promoted 2026-08-13 07:34, re-quarantined 07:47 by
 *      contaminated-window arithmetic, even though the underlying bug had
 *      been fixed on 2026-08-05. The clamp reads the latest *enforce-mode*
 *      `capability_promoted`/`promoted_with_x402` event per slug from
 *      `health_monitor_events` (dry_run events never move the window — a
 *      promotion that was never applied must not grant a grace period) and
 *      only counts traffic from that timestamp forward. The existing
 *      `minCalls` (≥10) eligibility gate then acts as the grace period itself:
 *      a freshly promoted capability simply has no verdict until 10 NEW
 *      eligible calls land post-promotion (internal accounts excluded by the
 *      canonical suffix rule; free-tier rows excluded — anonymous €0 traffic
 *      is the cheapest failure-fabrication vector, review H-1; soft-deleted
 *      rows excluded, M-8).
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
 * Promotion/recovery is handled by jobs/capability-promotion.ts, which is
 * explicitly allowed to auto-reverse a floor quarantine on recovery
 * (DEC-20260812-A "auto-promote on recovery" is a platform-acts-alone
 * action) — this clamp is what makes that safe: if an auto-reversal turns
 * out wrong, the floor re-quarantines on fresh post-promotion evidence
 * rather than replaying the same contaminated window that caused the
 * original bounce.
 *
 * WP9: step 1 reads invocation facts rather than joining `transactions ON
 * capability_id`, with a pre-epoch fallback to the old query so the floor is
 * never blind while the facts table fills. Solution-step traffic is in scope
 * for the first time.
 */
import postgres from "postgres";
import { getDb } from "../db/index.js";
import { capabilities, healthMonitorEvents } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { classifyTransactionFailure, CALLER_ATTRIBUTABLE } from "../lib/transaction-failure-taxonomy.js";
import { evaluateFloor, DEFAULT_FLOOR_CONFIG, type FloorStats } from "../lib/quality-floor.js";
import { INTERNAL_EMAIL_LIKE_PATTERNS, EXTRA_EXCLUDED_EMAILS } from "../lib/internal-accounts.js";
import { FACT_WRITE_FAILED_EVENT } from "../lib/invocation-facts.js";
import { logError, logWarn } from "../lib/log.js";

const STARTUP_DELAY_MS = 15 * 60 * 1000; // let boot rush + first traffic settle
const INTERVAL_MS = 24 * 60 * 60 * 1000;
const ADVISORY_LOCK_ID = 20260812; // cross-instance dedup

export interface FloorTrafficRow {
  slug: string;
  lifecycle_state: string;
  visible: boolean;
  x402_enabled: boolean;
  /**
   * Which authority this row came from. 'fact' rows are invocation facts
   * (WP9) and carry a verdict already computed by lib/execution-outcome.ts;
   * 'transaction' rows are pre-epoch billing rows whose failure class still
   * has to be inferred from an error string. The discriminator exists so the
   * fold cannot silently apply one source's rules to the other's data.
   */
  source: "fact" | "transaction";
  /** transaction rows only */
  status: string | null;
  error: string | null;
  /** fact rows only — the canonical WP4 verdict, not re-derived here */
  success: boolean | null;
  counts: boolean | null;
  day: string;
  recent: boolean;
  n: number;
}

/**
 * Pure fold: SQL rows → per-capability FloorStats. Exported for unit tests —
 * this is where eligibility, caller-attribution and the burst-guard inputs
 * are actually computed (review test-gap #1).
 */
export function foldTrafficRows(
  rows: FloorTrafficRow[],
  revenueBySlug: Map<string, number>,
): FloorStats[] {
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
    // A fact already carries the verdict. `counts_against_capability` is the
    // WP4 authority on whether a failure is the capability's fault, so the
    // string-matching taxonomy is deliberately NOT applied to fact rows —
    // re-deriving a classification that has already been decided is how two
    // answers to one question get created, which is the defect this whole
    // program exists to remove.
    const completed = r.source === "fact" ? r.success === true : r.status === "completed";
    const countsAsFailure =
      r.source === "fact"
        ? r.counts === true
        : !CALLER_ATTRIBUTABLE.has(classifyTransactionFailure(r.error));

    if (completed) {
      s.eligibleCalls += r.n;
      s.completedCalls += r.n;
      if (r.recent) {
        s.recentEligibleCalls += r.n;
        s.recentCompletedCalls += r.n;
      }
    } else if (countsAsFailure) {
      s.eligibleCalls += r.n;
      s.failureDays.add(r.day);
      if (r.recent) s.recentEligibleCalls += r.n;
    }
  }
  return [...bySlug.values()].map((s) => {
    const { failureDays, ...stats } = s;
    return {
      ...stats,
      // Revenue comes from the billing table, not from the fold. Facts carry
      // no price by design.
      revenueCents: revenueBySlug.get(s.slug) ?? 0,
      distinctFailureDays: failureDays.size,
    };
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
      // ── The epoch bridge (WP9) ──────────────────────────────────────────
      //
      // The floor now reads INVOCATION FACTS, not billing rows. But the facts
      // table starts empty on the deploy that creates it, so a clean swap would
      // blind the floor for thirty days — it would see zero traffic everywhere
      // and quietly do nothing, which is the worst possible failure for a
      // safety mechanism because it looks exactly like "all healthy".
      //
      // So: facts from the instant the first one was written, transactions
      // before it. The two never overlap, so nothing is double-counted, and the
      // transaction branch contributes nothing once the table is older than the
      // window — at which point it can be deleted. This is a bridge with an
      // expiry date, not a permanent second authority.
      //
      // Fail-safe by construction: if the fact writer is broken and the table
      // is empty, MIN() is NULL, the epoch is NOW(), and the floor reads
      // transactions for the whole window — exactly today's behaviour.
      const [{ epoch }] = await sql<{ epoch: Date }[]>`
        SELECT COALESCE(MIN(created_at), NOW()) AS epoch FROM capability_invocations`;

      // `lp.promoted_at`: the latest ENFORCE-mode promotion for this slug,
      // per the "promotion grace" fix (2026-08-16). Dry-run promotions never
      // wrote a real listing change, so they must never move the window —
      // filtered via `details->>'mode' = 'enforce'`. GREATEST() keeps the
      // window's upper bound at 30d when there is no promotion (or it is
      // older than 30d): the clamp can only ever narrow the window, never
      // widen it past the DEC-20260812-A default.
      //
      // Both branches below read `scope`, so the clamp applies identically to
      // facts and to transactions. A promotion grace that held on one source
      // and not the other would reintroduce the contaminated-window bounce the
      // clamp exists to stop.
      const rows = await sql<FloorTrafficRow[]>`
        WITH scope AS (
          SELECT c.id, c.slug, c.lifecycle_state, c.visible, c.x402_enabled,
                 GREATEST(
                   NOW() - INTERVAL '30 days',
                   COALESCE(lp.promoted_at, '-infinity'::timestamptz)
                 ) AS win_start
          FROM capabilities c
          LEFT JOIN LATERAL (
            SELECT MAX(e.created_at) AS promoted_at
            FROM health_monitor_events e
            WHERE e.capability_slug = c.slug
              AND e.event_type = 'capability_promotion'
              AND e.action_taken LIKE 'promoted%'
              AND e.details->>'mode' = 'enforce'
          ) lp ON true
          WHERE c.is_active = true
        ),
        internal AS (
          SELECT id FROM users
          WHERE email LIKE ANY(${INTERNAL_EMAIL_LIKE_PATTERNS})
             OR email = ANY(${EXTRA_EXCLUDED_EMAILS})
        )
        -- Post-epoch: invocation facts. Includes solution steps, which is the
        -- whole point — a capability invoked only inside bundles produced no
        -- row the old query could see and could never be quarantined.
        SELECT s.slug, s.lifecycle_state, s.visible, s.x402_enabled,
               'fact'::text AS source,
               NULL::text AS status, NULL::text AS error,
               f.success, f.counts_against_capability AS counts,
               date_trunc('day', f.created_at)::date::text AS day,
               (f.created_at > NOW() - INTERVAL '7 days') AS recent,
               COUNT(*)::int AS n
        FROM scope s
        JOIN capability_invocations f ON f.capability_slug = s.slug
        WHERE f.created_at >= GREATEST(s.win_start, ${epoch}::timestamptz)
          AND f.context_kind = 'customer_paid'
          AND f.is_free_tier = false
          AND (f.user_id IS NULL OR f.user_id NOT IN (SELECT id FROM internal))
        GROUP BY s.slug, s.lifecycle_state, s.visible, s.x402_enabled,
                 f.success, f.counts_against_capability, day, recent

        UNION ALL

        -- Pre-epoch: the billing rows, exactly as the floor read them before
        -- WP9. Bounded above by the epoch so the two sources cannot overlap.
        SELECT s.slug, s.lifecycle_state, s.visible, s.x402_enabled,
               'transaction'::text AS source,
               t.status, t.error,
               NULL::boolean AS success, NULL::boolean AS counts,
               date_trunc('day', t.created_at)::date::text AS day,
               (t.created_at > NOW() - INTERVAL '7 days') AS recent,
               COUNT(*)::int AS n
        FROM scope s
        JOIN transactions t ON t.capability_id = s.id
        WHERE t.created_at > s.win_start
          AND t.created_at < ${epoch}::timestamptz
          AND t.status IN ('completed', 'failed')
          AND t.deleted_at IS NULL
          AND COALESCE(t.is_free_tier, false) = false
          AND (t.user_id IS NULL OR t.user_id NOT IN (SELECT id FROM internal))
        GROUP BY s.slug, s.lifecycle_state, s.visible, s.x402_enabled,
                 t.status, t.error, day, recent`;

      // Revenue is a BILLING question, so it is asked of the billing table
      // across the whole window regardless of the epoch. Facts deliberately
      // carry no price — they answer "did this work", and asking them what a
      // call earned would be the same category error WP9 exists to undo. Only
      // consumer: `requiresHuman`, because deactivating a revenue earner is a
      // Petter-only decision under the escalation contract.
      const revenueRows = await sql<{ slug: string; cents: number }[]>`
        SELECT c.slug, COALESCE(SUM(t.price_cents), 0)::int AS cents
        FROM capabilities c
        JOIN transactions t ON t.capability_id = c.id
        WHERE c.is_active = true
          AND t.created_at > NOW() - INTERVAL '30 days'
          AND t.status = 'completed'
          AND t.deleted_at IS NULL
        GROUP BY c.slug`;
      const revenueBySlug = new Map(revenueRows.map((r) => [r.slug, r.cents]));

      // ── Evidence completeness (WP9) ─────────────────────────────────────
      //
      // Fact writes are best-effort — a bookkeeping failure must never fail a
      // customer's call. But a best-effort write whose losses are invisible
      // makes "this capability had no traffic" and "the recorder is broken"
      // the same observation, and the floor's response to the first is to do
      // nothing while its response to a partial sample could be to delist.
      //
      // Any slug with a recorded fact-write failure inside the window has holed
      // evidence, so it is flagged but never quarantined this tick. Suppression
      // is per-slug and per-window, so one bad night does not disarm the floor
      // for a month.
      const holedRows = await sql<{ slug: string; n: number }[]>`
        SELECT capability_slug AS slug, COUNT(*)::int AS n
        FROM health_monitor_events
        WHERE event_type = ${FACT_WRITE_FAILED_EVENT}
          AND created_at > NOW() - INTERVAL '30 days'
          AND capability_slug IS NOT NULL
        GROUP BY capability_slug`;
      const holedEvidence = new Map(holedRows.map((r) => [r.slug, r.n]));

      const stats = foldTrafficRows(rows, revenueBySlug);
      const decisions = evaluateFloor(stats, DEFAULT_FLOOR_CONFIG);
      const quarantined: string[] = [];
      const proposals: string[] = [];
      const db = getDb();

      for (const d of decisions) {
        // WP9: a slug whose invocation facts failed to write inside the window
        // has holed evidence. Flag it, never delist on it — a completion rate
        // computed from an unknown fraction of the calls is not a basis for
        // withdrawing something from sale, and the losses correlate with the
        // outages that would produce failures in the first place.
        const holes = holedEvidence.get(d.slug) ?? 0;
        const willQuarantine =
          d.action === "quarantine" && mode === "enforce" && holes === 0;
        const details = {
          mode,
          completion: Number(d.completion.toFixed(4)),
          eligible_calls_30d: d.eligibleCalls,
          deactivate_proposal: d.deactivateProposal,
          requires_human: d.requiresHuman,
          reason:
            holes > 0 && d.action === "quarantine"
              ? `${d.reason} — SUPPRESSED: ${holes} invocation fact(s) failed to ` +
                "write for this capability in the window, so the completion rate " +
                "above is computed from an incomplete sample. Fix the recorder, " +
                "then let a clean window decide."
              : d.reason,
          evidence_holes: holes,
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
            actionTaken:
              d.action === "quarantine"
                ? holes > 0
                  ? "suppressed_incomplete_evidence"
                  : "dry_run_would_quarantine"
                : "flagged_only",
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
