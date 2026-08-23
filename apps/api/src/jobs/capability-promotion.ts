/**
 * Capability-promotion job — publishes capabilities that have earned it.
 *
 * Thin DB glue around the pure core in lib/capability-promotion.ts, which
 * carries the rationale and the cross-provider review findings. Mirrors
 * jobs/quality-floor.ts deliberately: same advisory-lock shape, same
 * transactional "flag flip and its audit event commit together" rule (floor
 * review M-2 — a catalog change without its evidence must be impossible), same
 * heartbeat so a zero-decision tick is still provable per DEC-20260504-C.
 *
 * Per tick:
 *   1. Aggregate the trailing 7 days of test results per delisted-but-active
 *      capability, with the known_answer subset, the piggyback subset, the
 *      trailing-24h subset and the last listing-state event broken out, plus
 *      the circuit-breaker state.
 *   2. evaluatePromotion() → at most maxPromotionsPerRun promotions/tick. A
 *      quality-floor quarantine that clears every gate is auto-reversed here
 *      ("promotion grace" fix, 2026-08-16 — DEC-20260812-A auto-promote-on-
 *      recovery); a human/operator takedown still only ever gets flagged.
 *   3. Apply: lifecycle_state='active', visible=true, x402_enabled set to the
 *      decision's value — inside a transaction with its event.
 *   4. Always emit per-decision events plus a tick_complete heartbeat.
 *
 * ENFORCEMENT GATE: dry-run by default, armed by CAPABILITY_PROMOTION_ENFORCE
 * =true. The first draft enforced by default on the argument that promotion is
 * self-correcting because the floor re-quarantines mistakes. Cross-provider
 * review pointed out that the floor needs ≥10 external calls over 30 days
 * before it can act at all, so a wrongly promoted low-traffic capability may
 * never trip it — which is precisely the population most at risk of being
 * promoted in error. The self-correcting claim does not hold where it is
 * needed, so this is a normal autonomous public-surface write path and it gets
 * the normal brake: dry-run until a human has read a tick's worth of
 * `dry_run_would_promote` events.
 *
 * RACE HANDLING (review finding 5, hardened round-2 2026-08-16 — Codex
 * blocker #3): the evidence query and the write are not atomic — a floor
 * quarantine, an operator unpublish, or a breaker trip can land in between.
 * The UPDATE re-asserts isActive/visible/lifecycle_state/deactivation_reason/
 * maintenance_class exactly as evaluated, AND re-derives "the latest
 * listing-state event for this slug" at write time via the same
 * LISTING_EVENT_MATCH_SQL the evidence query used, requiring it to still be
 * the exact event (by id) this decision was evaluated against. The original
 * version only re-checked isActive/visible/deactivation_reason/breaker —
 * a human suspension, a maintenance_class change, or a fresh floor quarantine
 * landing after evidence collection but before the write would have been
 * silently overwritten back to active/visible. The transaction is rolled
 * back unless exactly one row changed. A promotion recorded against a stale
 * snapshot would silently overwrite a newer safety decision.
 *
 * Bulk-operation note (DEC-20260504-B): the first enforcing tick is a
 * workload-resumption event — a backlog accumulated since May 2026, not a
 * steady-state run. maxPromotionsPerRun is the self-throttle that makes it
 * one: the backlog drains at 3/day, each batch visible in
 * health_monitor_events before the next runs.
 */
import postgres from "postgres";
import { getDb } from "../db/index.js";
import { capabilities, healthMonitorEvents } from "../db/schema.js";
import { and, eq, isNull, sql as dsql } from "drizzle-orm";
import {
  evaluatePromotion,
  DEFAULT_PROMOTION_CONFIG,
  type PromotionStats,
} from "../lib/capability-promotion.js";
import { logError, logWarn } from "../lib/log.js";
import { registerJobSync } from "../lib/job-coordinator.js";

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
  last_listing_event: string | null;
  /** uuid of the matched event, for the write-time TOCTOU re-check (round-2 fix, Codex blocker #3). */
  last_listing_event_id: string | null;
  /** `details->>'mode'` of the matched event — structured provenance (Codex blocker #2), not inferred from the action string alone. */
  last_listing_event_mode: string | null;
  /** How many times the floor has EVER enforce-quarantined this slug (Codex blocker #1b — repeat-bounce refusal). */
  floor_quarantine_count: number;
  total_tests: number;
  passed_tests: number;
  distinct_test_days: number;
  ka_total: number;
  ka_passed: number;
  latest_ka_passed: boolean | null;
  recent_total: number;
  recent_passed: number;
  piggyback_total: number;
  piggyback_passed: number;
}

/**
 * Pure mapping from SQL rows to core input. Exported for unit tests: the
 * column-to-field correspondence is the part that silently rots when the
 * query is edited, and a swapped `ka_passed`/`passed_tests` would read as a
 * capability that is green on correctness when it is not.
 *
 * `last_listing_event` collapses to the two things the core needs: was this a
 * takedown, and what was it. A capability that has never been listed has no
 * such event and is a dark launch, not a reinstatement.
 *
 * `wasFloorQuarantine` (round-2 fix, 2026-08-16 — Codex blocker #2) requires
 * BOTH the action_taken string AND the matched event's own recorded mode to
 * be 'enforce'. The SQL's `le` lateral already filters the quality_floor
 * branch on `details->>'mode' = 'enforce'`, so `last_listing_event_mode`
 * check here is structured provenance, not the sole gate — defense in depth
 * against a future query edit that drops the WHERE-clause filter, or an
 * ad-hoc/manual health_monitor_events insert with action_taken='quarantined'
 * and no mode field (the real screenshot-url reinstatement event on
 * 2026-08-13 was exactly this shape: 'capability_promoted', no `mode` key —
 * proof this class of row exists in prod, not a hypothetical).
 */
export function toPromotionStats(rows: PromotionEvidenceRow[]): PromotionStats[] {
  return rows.map((r) => {
    const wasDelisted = r.last_listing_event !== null && !r.last_listing_event.startsWith("promoted");
    const wasFloorQuarantine =
      wasDelisted && r.last_listing_event === "quarantined" && r.last_listing_event_mode === "enforce";
    return {
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
      wasDelisted,
      delistingReason: wasDelisted ? r.last_listing_event : null,
      wasFloorQuarantine,
      lastListingEventId: r.last_listing_event_id,
      floorQuarantineCount: r.floor_quarantine_count,
      totalTests: r.total_tests,
      passedTests: r.passed_tests,
      distinctTestDays: r.distinct_test_days,
      knownAnswerTotal: r.ka_total,
      knownAnswerPassed: r.ka_passed,
      latestKnownAnswerPassed: r.latest_ka_passed,
      recentTotal: r.recent_total,
      recentPassed: r.recent_passed,
      piggybackTotal: r.piggyback_total,
      piggybackPassed: r.piggyback_passed,
    };
  });
}

export function isEnforceMode(): boolean {
  return process.env.CAPABILITY_PROMOTION_ENFORCE === "true";
}

/**
 * The event_type/action_taken/mode conditions that identify "a listing-state
 * change" for a capability. Shared VERBATIM between PROMOTION_EVIDENCE_SQL's
 * `le` lateral below (reads the latest such event per candidate) and the
 * promotion write's TOCTOU re-check in runCapabilityPromotionOnce (round-2
 * fix, Codex blocker #3) — the two must never drift, or the write could
 * silently accept a listing-event identity the evidence query would have
 * rejected. Requires `details->>'mode' = 'enforce'` on the quality_floor and
 * capability_promotion branches (Codex blocker #2): the floor also emits
 * dry_run rows with the same action_taken shape, and ad-hoc/manual ops
 * writes with the same shape exist in repo history (screenshot-url's actual
 * 2026-08-13 reinstatement event has no `mode` key at all).
 *
 * The lifecycle_transition branch matches on the arrow ('→') shape, not an
 * enumerated prefix list (round-3 fix, 2026-08-16 — Codex MAJOR): the
 * canonical writer (lib/lifecycle.ts) and four other emit sites
 * (routes/internal-health-monitor.ts ×3, routes/reply-webhook.ts) all write
 * `${fromState} → ${toState}: ${reason}` — none of them start with
 * "Suspended", so the old prefix-only match silently never caught a real
 * suspend/restore transition. `Unpublished%`/`Published%` stay as literal
 * prefixes because those two emit sites (internal-health-monitor.ts publish/
 * unpublish) genuinely write that literal text, not arrow-form. ADDING A NEW
 * EMIT SITE for event_type='lifecycle_transition'? Its action_taken string
 * MUST match one of these four shapes, or extend both this constant AND
 * `isListingStateEvent` below (kept in sync by hand) — the "producer
 * coverage" describe block in capability-promotion.test.ts is fixture-driven
 * from the real strings each site emits and will catch a sixth format that
 * bypasses one but not the other.
 */
export const LISTING_EVENT_MATCH_SQL = `(   (e.event_type = 'quality_floor'        AND e.action_taken = 'quarantined' AND e.details->>'mode' = 'enforce')
        OR (e.event_type = 'capability_promotion' AND e.action_taken LIKE 'promoted%' AND e.details->>'mode' = 'enforce')
        OR (e.event_type = 'lifecycle_transition' AND (e.action_taken LIKE 'Unpublished%'
                                                    OR e.action_taken LIKE 'Suspended%'
                                                    OR e.action_taken LIKE 'Published%'
                                                    OR e.action_taken LIKE '%→%')))`;

/**
 * Pure JS mirror of LISTING_EVENT_MATCH_SQL's boolean logic. Exists ONLY to
 * make the matcher's actual behavior testable against real producer output
 * (round-3 fix — Codex's critique of round 2 was that the tests asserted the
 * SQL's own text, which proves the pattern exists, not that it matches what
 * the real emit sites actually write). There is no shared runtime between
 * Postgres LIKE and JS string matching, so this MUST be kept in exact sync
 * with LISTING_EVENT_MATCH_SQL by hand — see the comment there. Not used by
 * the actual query (Postgres evaluates LISTING_EVENT_MATCH_SQL server-side);
 * used only by capability-promotion.test.ts's producer-coverage suite.
 */
export function isListingStateEvent(
  eventType: string,
  actionTaken: string,
  detailsMode: string | null,
): boolean {
  if (eventType === "quality_floor") {
    return actionTaken === "quarantined" && detailsMode === "enforce";
  }
  if (eventType === "capability_promotion") {
    return actionTaken.startsWith("promoted") && detailsMode === "enforce";
  }
  if (eventType === "lifecycle_transition") {
    return (
      actionTaken.startsWith("Unpublished")
      || actionTaken.startsWith("Suspended")
      || actionTaken.startsWith("Published")
      || actionTaken.includes("→")
    );
  }
  return false;
}

/**
 * The evidence query, shared with scripts/preview-promotions.ts so the preview
 * cannot drift from what the job will actually decide.
 *
 * Two joins are worth naming. `capability_health` is safe to join directly:
 * `capability_health_capability_slug_unique` guarantees one row per slug, so
 * it cannot fan the aggregate out or split a capability across grouped rows
 * (verified against prod 2026-08-16 — max 1 row/slug over 298 rows).
 * `test_suites` joins on the result's own suite id, one-to-one by primary key.
 *
 * Round-2 fix (2026-08-16, external review of the "promotion grace" fix —
 * Codex blockers #1 and #2):
 *   - `le` now filters on `LISTING_EVENT_MATCH_SQL` (enforce-mode only) and
 *     exposes the matched event's id and mode as structured provenance.
 *   - `le.quarantined_at` — the matched event's timestamp, but ONLY when it
 *     resolved to the floor's own quarantine — clamps the `tr` join and the
 *     `lk` lateral to evidence dated AFTER that quarantine. Without this, a
 *     capability that was harness-green WHILE customer traffic was failing
 *     (the exact pre-quarantine state) could supply its own "recovery"
 *     evidence from before it was ever quarantined, oscillating forever:
 *     quarantine -> promote on stale-but-in-window evidence -> new customer
 *     failures -> quarantine -> promote again on the same leftover evidence.
 *   - `fq` counts every enforce-mode quarantine this slug has ever had. A
 *     second quarantine can only happen after an intervening re-list —
 *     whether this job's own auto-reversal or a manual/admin publish (the
 *     floor's candidate filter requires visible=true) — so
 *     floor_quarantine_count >= 2 proves the capability was re-listed and
 *     re-quarantined, without asserting the re-list was automatic.
 *     evaluatePromotion refuses to auto-retry and flags for human review
 *     (see lib/capability-promotion.ts).
 */
export const PROMOTION_EVIDENCE_SQL = `
  SELECT c.slug,
         c.lifecycle_state,
         c.visible,
         c.x402_enabled,
         COALESCE(c.is_free_tier, false)         AS is_free_tier,
         c.maintenance_class,
         COALESCE(c.marketplace_eligible, false) AS marketplace_eligible,
         c.deactivation_reason,
         (c.x402_method IS NOT NULL)             AS has_x402_method,
         h.state                                 AS breaker_state,
         le.action_taken                         AS last_listing_event,
         le.id                                   AS last_listing_event_id,
         le.mode                                 AS last_listing_event_mode,
         COALESCE(fq.n, 0)::int                  AS floor_quarantine_count,
         COUNT(tr.id)::int                                          AS total_tests,
         COUNT(tr.id) FILTER (WHERE tr.passed)::int                 AS passed_tests,
         COUNT(DISTINCT date_trunc('day', tr.executed_at))::int     AS distinct_test_days,
         COUNT(tr.id) FILTER (WHERE ts.test_type = 'known_answer')::int               AS ka_total,
         COUNT(tr.id) FILTER (WHERE ts.test_type = 'known_answer' AND tr.passed)::int AS ka_passed,
         lk.passed                                                                    AS latest_ka_passed,
         COUNT(tr.id) FILTER (WHERE tr.executed_at > NOW() - INTERVAL '24 hours')::int                AS recent_total,
         COUNT(tr.id) FILTER (WHERE tr.executed_at > NOW() - INTERVAL '24 hours' AND tr.passed)::int  AS recent_passed,
         COUNT(tr.id) FILTER (WHERE ts.test_type = 'piggyback')::int                  AS piggyback_total,
         COUNT(tr.id) FILTER (WHERE ts.test_type = 'piggyback' AND tr.passed)::int    AS piggyback_passed
  FROM capabilities c
  LEFT JOIN capability_health h ON h.capability_slug = c.slug
  -- The most recent event that changed whether this capability was listed.
  -- Distinguishes "never listed" (dark launch) from "taken down".
  LEFT JOIN LATERAL (
    SELECT e.id, e.action_taken, e.details->>'mode' AS mode,
           CASE WHEN e.event_type = 'quality_floor' AND e.action_taken = 'quarantined'
                THEN e.created_at END AS quarantined_at
    FROM health_monitor_events e
    WHERE e.capability_slug = c.slug
      AND ${LISTING_EVENT_MATCH_SQL}
    ORDER BY e.created_at DESC
    LIMIT 1
  ) le ON true
  -- How many times the floor has EVER enforce-quarantined this slug — see
  -- floor_quarantine_count doc above.
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS n
    FROM health_monitor_events e
    WHERE e.capability_slug = c.slug
      AND e.event_type = 'quality_floor'
      AND e.action_taken = 'quarantined'
      AND e.details->>'mode' = 'enforce'
  ) fq ON true
  LEFT JOIN test_results tr
         ON tr.capability_slug = c.slug
        AND tr.executed_at > GREATEST(
              NOW() - INTERVAL '7 days',
              COALESCE(le.quarantined_at, '-infinity'::timestamptz)
            )
  LEFT JOIN test_suites ts ON ts.id = tr.test_suite_id
  -- Did the single most recent known_answer result pass? An average survives
  -- a fresh break; this does not. Also bounded to since-quarantine, same
  -- reason as the tr join above — a stale pre-quarantine pass must not stand
  -- in for "broken now".
  LEFT JOIN LATERAL (
    SELECT tr2.passed
    FROM test_results tr2
    JOIN test_suites ts2 ON ts2.id = tr2.test_suite_id
    WHERE tr2.capability_slug = c.slug AND ts2.test_type = 'known_answer'
      AND tr2.executed_at > COALESCE(le.quarantined_at, '-infinity'::timestamptz)
    ORDER BY tr2.executed_at DESC
    LIMIT 1
  ) lk ON true
  WHERE c.is_active = true
    AND c.visible = false
  GROUP BY c.slug, c.lifecycle_state, c.visible, c.x402_enabled, c.is_free_tier,
           c.maintenance_class, c.marketplace_eligible, c.deactivation_reason,
           c.x402_method, h.state, le.id, le.action_taken, le.mode, fq.n, lk.passed`;

export async function runCapabilityPromotionOnce(): Promise<{
  outcome: string;
  mode?: "enforce" | "dry_run";
  promoted?: string[];
  flagged?: string[];
  raced?: string[];
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

    const mode = isEnforceMode() ? "enforce" : "dry_run";
    try {
      // LEFT JOIN on test_results: a capability with zero results must still
      // appear, as a zero-evidence row the core rejects — an INNER JOIN would
      // make "never tested" indistinguishable from "not a candidate".
      const rows = await sql.unsafe<PromotionEvidenceRow[]>(PROMOTION_EVIDENCE_SQL);

      const decisions = evaluatePromotion(toPromotionStats(rows), DEFAULT_PROMOTION_CONFIG);
      const promoted: string[] = [];
      const flagged: string[] = [];
      const raced: string[] = [];
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
          // Conditional write (review finding 5, hardened round-2 — Codex
          // blocker #3). Every precondition the decision rested on is
          // re-asserted here, including lifecycle_state and maintenance_class
          // (exact match to what was evaluated — IS NOT DISTINCT FROM handles
          // the null case) and the listing-event identity check below, so a
          // quarantine, an unpublish, a maintenance_class change, or a fresh
          // takedown that landed after the evidence query wins the race
          // rather than being silently overwritten. Anything other than
          // exactly one affected row rolls the event back with it.
          let applied = false;
          await db.transaction(async (tx) => {
            const res = await tx
              .update(capabilities)
              .set({
                lifecycleState: "active",
                visible: true,
                // Always written, never conditionally omitted: `false` has to
                // clear a stale `true` on a capability that cannot serve the
                // paid rail, or promotion leaves an unusable route open.
                x402Enabled: d.enableX402,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(capabilities.slug, d.slug),
                  eq(capabilities.isActive, true),
                  eq(capabilities.visible, false),
                  eq(capabilities.lifecycleState, d.lifecycleState),
                  isNull(capabilities.deactivationReason),
                  dsql`${capabilities.maintenanceClass} IS NOT DISTINCT FROM ${d.maintenanceClass}`,
                  dsql`NOT EXISTS (
                    SELECT 1 FROM capability_health h
                    WHERE h.capability_slug = ${d.slug} AND h.state <> 'closed'
                  )`,
                  // Listing-event identity (Codex blocker #3): re-derive "the
                  // latest listing-state event for this slug" using the exact
                  // same match the evidence query used, and require it to
                  // still be the event (by id) this decision was evaluated
                  // against. A human suspension or a fresh floor quarantine
                  // inserted between evidence collection and this write
                  // changes the answer, so the write is rejected (raced)
                  // instead of overwriting a decision made after ours.
                  dsql`(
                    SELECT e.id
                    FROM health_monitor_events e
                    WHERE e.capability_slug = ${d.slug}
                      AND ${dsql.raw(LISTING_EVENT_MATCH_SQL)}
                    ORDER BY e.created_at DESC
                    LIMIT 1
                  ) IS NOT DISTINCT FROM ${d.lastListingEventId}::uuid`,
                ),
              );
            const affected = (res as unknown as { count?: number; rowCount?: number }).count
              ?? (res as unknown as { rowCount?: number }).rowCount
              ?? 0;
            if (affected !== 1) {
              // Roll the event back with the write: recording a promotion that
              // did not happen is worse than recording nothing.
              throw new PromotionRaced(d.slug, affected);
            }
            await tx.insert(healthMonitorEvents).values({
              eventType: "capability_promotion",
              capabilitySlug: d.slug,
              tier: 2,
              actionTaken: d.enableX402 ? "promoted_with_x402" : "promoted",
              details,
            });
            applied = true;
          }).catch(async (err) => {
            if (!(err instanceof PromotionRaced)) throw err;
            logWarn("capability-promotion-raced", "eligibility changed between evidence and write", {
              slug: d.slug, affected_rows: err.affected,
            });
            await db.insert(healthMonitorEvents).values({
              eventType: "capability_promotion",
              capabilitySlug: d.slug,
              tier: 1,
              actionTaken: "raced_not_applied",
              details: { ...details, affected_rows: err.affected },
            });
            raced.push(d.slug);
          });
          if (applied) promoted.push(d.slug);
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
        details: { mode, evaluated: rows.length, decisions: decisions.length, promoted, flagged, raced },
      });

      logWarn("capability-promotion-tick", "promotion evaluation complete", {
        mode, evaluated: rows.length, decisions: decisions.length, promoted, flagged, raced,
      });
      return { outcome: "ok", mode, promoted, flagged, raced };
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

/** Thrown to roll back a promotion whose preconditions changed mid-flight. */
class PromotionRaced extends Error {
  constructor(readonly slug: string, readonly affected: number) {
    super(`promotion of '${slug}' affected ${affected} rows, expected 1`);
    this.name = "PromotionRaced";
  }
}

export function startCapabilityPromotion(): void {
  // WP10 (CR-08): cadence moved into `job_schedule`. Declared 24h; measured
  // 45 completed ticks in the seven days to 2026-08-23, because the interval
  // arm never survived to fire and every deploy re-ran the startup arm. This
  // job PUBLISHES capabilities onto the paid catalog, so its real cadence
  // being deploy frequency was a policy fact nobody could read off the code.
  registerJobSync({
    name: "capability-promotion",
    intervalMs: INTERVAL_MS,
    startupDelayMs: STARTUP_DELAY_MS,
    handler: runCapabilityPromotionOnce,
  });
  logWarn("capability-promotion-scheduled", "daily capability-promotion tick scheduled", {
    mode: isEnforceMode() ? "enforce" : "dry_run",
    startup_delay_ms: STARTUP_DELAY_MS,
    interval_ms: INTERVAL_MS,
    config: DEFAULT_PROMOTION_CONFIG,
  });
}
