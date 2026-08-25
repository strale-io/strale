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
import {
  classifyTransactionFailure,
  countsAgainstCapability,
  UNATTRIBUTED,
} from "../lib/transaction-failure-taxonomy.js";
import { evaluateFloor, DEFAULT_FLOOR_CONFIG, type FloorStats } from "../lib/quality-floor.js";
import { INTERNAL_EMAIL_LIKE_PATTERNS, EXTRA_EXCLUDED_EMAILS } from "../lib/internal-accounts.js";
import { FACT_WRITE_FAILED_EVENT } from "../lib/invocation-facts.js";
import { logError, logWarn } from "../lib/log.js";
import { registerJobSync } from "../lib/job-coordinator.js";

const STARTUP_DELAY_MS = 15 * 60 * 1000; // let boot rush + first traffic settle
const INTERVAL_MS = 24 * 60 * 60 * 1000;
const ADVISORY_LOCK_ID = 20260812; // cross-instance dedup

/**
 * Volume cross-check thresholds. Coarse on purpose — facts and transactions do
 * not correspond one-to-one by design, so a tight ratio would fire on every
 * solution step and every rolled-back wallet transaction, and a check that
 * fires constantly is a check that gets ignored.
 */
export const FACT_SHORTFALL_MIN_TRANSACTIONS = 10;
export const FACT_SHORTFALL_RATIO = 0.5;

/**
 * Does this capability have too few facts for the billed calls it served?
 *
 * Pure, exported and directly tested. The first version buried the comparison
 * in the SQL, so setting the ratio to 0 — which makes the check permanently
 * unable to fire — passed every test. A defence whose threshold can be reduced
 * to nothing without anything noticing is the same defect this whole finding
 * was about, one layer down.
 */
export function isFactVolumeShortfall(
  facts: number,
  transactions: number,
  minTransactions: number = FACT_SHORTFALL_MIN_TRANSACTIONS,
  ratio: number = FACT_SHORTFALL_RATIO,
): boolean {
  if (transactions < minTransactions) return false;
  return facts < transactions * ratio;
}

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
        unattributedFailures: 0,
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
    // Transaction rows only: the class is also needed to tell "not the
    // capability's fault" from "nothing said whose fault it was". Both leave
    // the denominator; only the second is an evidence shortfall the operator
    // has to see (LESSONS.md F1 step 4).
    const txClass = r.source === "transaction" ? classifyTransactionFailure(r.error) : null;
    const countsAsFailure =
      r.source === "fact" ? r.counts === true : countsAgainstCapability(txClass!);

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
    } else if (txClass !== null && UNATTRIBUTED.has(txClass)) {
      // Out of the denominator, but counted here so the decision can say "and
      // N failures I could not attribute to anyone". Silently dropping them
      // would swap a false accusation for a blind spot — the taxonomy failing
      // to recognise 400 errors on one capability is itself a finding.
      s.unattributedFailures += r.n;
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

/**
 * Evidence-completeness check 2: does the fact count look sane next to the
 * billing rows for the same capability and window?
 *
 * This is the check that survives the failure mode check 1 cannot see. A
 * marker event is written to the same database that just refused a fact, so
 * when the cause is "the database was unreachable" there is no marker either,
 * and a holed window is indistinguishable from a quiet one. Comparing volumes
 * needs no cooperation from the writer that failed.
 *
 * The comparison is deliberately COARSE. Facts and transactions do not
 * correspond one-to-one and are not meant to:
 *
 *   - solution steps produce facts with no transaction of their own (the whole
 *     point of WP9), so facts legitimately EXCEED transactions;
 *   - a wallet transaction that rolls back after execution leaves a committed
 *     fact with no transaction row, because the fact is written on a separate
 *     pooled connection;
 *   - the settlement reconciler writes `failed` transactions for crashed
 *     processes that never invoked an executor, so transactions legitimately
 *     exceed facts.
 *
 * So this fires only on gross loss: a capability with real billed traffic in
 * the post-epoch window and almost no facts to match it. A tight ratio would
 * cry wolf on every one of the cases above, and a check that fires constantly
 * is a check that gets ignored.
 */
async function detectFactVolumeShortfall(
  sql: postgres.Sql,
  /**
   * Later of the fact epoch and the floor's own 30-day window.
   *
   * The first version bounded on the epoch alone. Since the epoch is
   * MIN(created_at) over a table retained for 180 days, the comparison window
   * grew to six times the window the floor actually decides on — and a loss
   * confined to the recent 30 days simply disappeared into 150 days of healthy
   * history. It worked on the day it shipped and weakened every day after.
   */
  windowStart: Date,
): Promise<Map<string, string>> {
  const rows = await sql<
    { slug: string; facts: number; txns: number }[]
  >`
    WITH txn AS (
      SELECT c.slug, COUNT(*)::int AS n
      FROM capabilities c
      JOIN transactions t ON t.capability_id = c.id
      WHERE c.is_active = true
        AND t.created_at >= ${windowStart}::timestamptz
        AND t.status IN ('completed', 'failed')
        AND t.deleted_at IS NULL
        AND COALESCE(t.is_free_tier, false) = false
        AND (t.user_id IS NULL OR t.user_id NOT IN (
          SELECT id FROM users
          WHERE email LIKE ANY(${INTERNAL_EMAIL_LIKE_PATTERNS})
             OR email = ANY(${EXTRA_EXCLUDED_EMAILS})
        ))
      GROUP BY c.slug
    ),
    fct AS (
      SELECT capability_slug AS slug, COUNT(*)::int AS n
      FROM capability_invocations
      WHERE created_at >= ${windowStart}::timestamptz
        AND context_kind = 'customer_paid'
        AND is_free_tier = false
        -- Same exclusion as the transaction side. Without it the two CTEs count
        -- different populations: facts inflated relative to transactions, which
        -- biases the check toward SILENCE. That is the unsafe direction, since
        -- silence means the floor proceeds on evidence that may be holed.
        AND (user_id IS NULL OR user_id NOT IN (
          SELECT id FROM users
          WHERE email LIKE ANY(${INTERNAL_EMAIL_LIKE_PATTERNS})
             OR email = ANY(${EXTRA_EXCLUDED_EMAILS})
        ))
      GROUP BY capability_slug
    )
    SELECT txn.slug, COALESCE(fct.n, 0) AS facts, txn.n AS txns
    FROM txn LEFT JOIN fct ON fct.slug = txn.slug
    WHERE txn.n > 0`;

  return new Map(
    rows
      // Thresholding happens HERE, in the pure function, not in the SQL. The
      // SQL only gathers the two counts.
      .filter((r) => isFactVolumeShortfall(r.facts, r.txns))
      .map((r) => [
      r.slug,
        `only ${r.facts} invocation fact(s) recorded against ${r.txns} billed ` +
          `call(s) in the decision window — the evidence for this capability is ` +
          `incomplete, so no delisting decision may rest on it`,
      ]),
  );
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
      // ── Is the fact table there at all? ─────────────────────────────────
      //
      // Asked FIRST, in its own round trip, because block 0101 is
      // defer-not-throw and a deferred block leaves no table. Postgres resolves
      // relations at parse time, so a query merely MENTIONING
      // `capability_invocations` raises `relation does not exist` however it is
      // guarded internally — the whole statement fails before any WHERE clause
      // runs. That error would propagate out of this function, and the floor
      // would record no decisions AND no `tick_complete` heartbeat: the
      // DEC-20260504-C proof that the job ran at all is the very thing that
      // stops being written. The floor is armed in production, not dry-run, so
      // it has to degrade to its previous behaviour rather than die quietly.
      // Both halves matter. A table WITHOUT its append-only trigger is worse
      // than no table at all: `to_regclass` still says non-null, so the floor
      // would treat a mutable table as authoritative evidence for a delisting
      // decision. Block 0101 now verifies the trigger before reporting success,
      // but a block that deferred midway can leave exactly this state, so the
      // consumer checks too rather than trusting the producer.
      //
      // Qualified by relation. pg_trigger is unique on (tgrelid, tgname), not on
      // name alone, so an unqualified probe would be satisfied by a same-named
      // trigger on any other table. The cast form
      // `'public.capability_invocations'::regclass` WOULD raise when the table
      // is absent — the case this probe exists to survive — but to_regclass
      // returns NULL instead, and the same SELECT already calls it.
      const [{ ready: tablePresent, protected: factsProtected }] = await sql<
        { ready: boolean; protected: boolean }[]
      >`
        SELECT
          to_regclass('public.capability_invocations') IS NOT NULL AS ready,
          EXISTS (
            SELECT 1 FROM pg_trigger
            WHERE tgname = 'capability_invocations_immutable_trg'
              AND tgrelid = to_regclass('public.capability_invocations')
          ) AS "protected"`;
      const factsReady = tablePresent && factsProtected;

      // ── The epoch bridge (WP9) ──────────────────────────────────────────
      //
      // The floor reads INVOCATION FACTS, not billing rows. But the facts table
      // starts empty on the deploy that creates it, so a clean swap would blind
      // the floor for thirty days — it would see zero traffic everywhere and
      // quietly do nothing, which is the worst possible failure for a safety
      // mechanism because it looks exactly like "all healthy".
      //
      // So: facts from the instant the first one was written, transactions
      // before it, and the transaction branch contributes nothing once the
      // table is older than the window — at which point it can be deleted. A
      // bridge with an expiry date, not a permanent second authority.
      //
      // Not perfectly disjoint, and the earlier version of this note claimed it
      // was. executeSync inserts the transaction row BEFORE running the
      // executor, so a call in flight at the instant the first fact is written
      // has transaction.created_at < epoch <= fact.created_at and is counted on
      // both branches. That is a handful of rows at one instant, once, and on a
      // rolling deploy the old instance's fact-less transactions after the
      // epoch are dropped from both branches instead. Both effects are
      // negligible in volume; neither is zero.
      //
      // Fail-safe twice over: no table, or an empty one, both put the epoch at
      // NOW() and read transactions for the whole window — exactly today's
      // behaviour.
      const epoch = factsReady
        ? (
            await sql<{ epoch: Date }[]>`
              SELECT COALESCE(MIN(created_at), NOW()) AS epoch
                FROM capability_invocations`
          )[0].epoch
        : new Date();

      // `lp.promoted_at`: the latest ENFORCE-mode promotion for this slug, per
      // the "promotion grace" fix (2026-08-16). Dry-run promotions never wrote a
      // real listing change, so they must never move the window — filtered via
      // `details->>'mode' = 'enforce'`. GREATEST() keeps the window's upper
      // bound at 30d when there is no promotion (or it is older than 30d): the
      // clamp can only ever narrow the window, never widen it past the
      // DEC-20260812-A default.
      //
      // The two sources are read as two queries rather than one UNION ALL so
      // that the fact query can be SKIPPED ENTIRELY when the table is absent.
      // A UNION cannot be conditionally parsed. Both read the same `scope` CTE
      // text, so the clamp and the active-capability filter are identical
      // across them by construction — a grace period that held on one source
      // and not the other would reintroduce the contaminated-window bounce the
      // clamp exists to stop.
      const transactionRows = await sql<FloorTrafficRow[]>`
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
        )
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
          AND (t.user_id IS NULL OR t.user_id NOT IN (
            SELECT id FROM users
            WHERE email LIKE ANY(${INTERNAL_EMAIL_LIKE_PATTERNS})
               OR email = ANY(${EXTRA_EXCLUDED_EMAILS})
          ))
        GROUP BY s.slug, s.lifecycle_state, s.visible, s.x402_enabled,
                 t.status, t.error, day, recent`;

      // Post-epoch: invocation facts. Includes solution steps, which is the
      // whole point — a capability invoked only inside bundles produced no row
      // the old query could see and could never be quarantined.
      const factRows = factsReady
        ? await sql<FloorTrafficRow[]>`
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
            )
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
              AND (f.user_id IS NULL OR f.user_id NOT IN (
                SELECT id FROM users
                WHERE email LIKE ANY(${INTERNAL_EMAIL_LIKE_PATTERNS})
                   OR email = ANY(${EXTRA_EXCLUDED_EMAILS})
              ))
            GROUP BY s.slug, s.lifecycle_state, s.visible, s.x402_enabled,
                     f.success, f.counts_against_capability, day, recent`
        : [];

      const rows = [...transactionRows, ...factRows];

      // Revenue is a BILLING question, so it is asked of the billing table.
      // Facts deliberately carry no price — they answer "did this work", and
      // asking them what a call earned would be the same category error WP9
      // exists to undo. Only consumer: `requiresHuman`, because deactivating a
      // revenue earner is a Petter-only decision under the escalation contract.
      //
      // Carries the SAME filters the fold used to apply, because the fold used
      // to sum `price_cents` over rows that had already passed them. The first
      // version of this query dropped the internal-account exclusion, the
      // free-tier filter and the promotion clamp, and the effect was measured
      // rather than theoretical: 202 active capabilities went from zero
      // external revenue to non-zero purely on `system@strale.internal` and
      // other internal accounts, so `requiresHuman` — the flag that decides
      // whether a deactivation proposal is a Petter-only call — stopped
      // discriminating. lib/internal-accounts.ts names revenue explicitly as a
      // metric internal traffic must be kept out of.
      const revenueRows = await sql<{ slug: string; cents: number }[]>`
        WITH scope AS (
          SELECT c.id, c.slug,
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
        )
        SELECT s.slug, COALESCE(SUM(rt.price_cents), 0)::int AS cents
        FROM scope s
        JOIN transactions rt ON rt.capability_id = s.id
        WHERE rt.created_at > s.win_start
          AND rt.status = 'completed'
          AND rt.deleted_at IS NULL
          AND COALESCE(rt.is_free_tier, false) = false
          AND (rt.user_id IS NULL OR rt.user_id NOT IN (
            SELECT id FROM users
            WHERE email LIKE ANY(${INTERNAL_EMAIL_LIKE_PATTERNS})
               OR email = ANY(${EXTRA_EXCLUDED_EMAILS})
          ))
        GROUP BY s.slug`;
      const revenueBySlug = new Map(revenueRows.map((r) => [r.slug, r.cents]));

      // ── Evidence completeness (WP9) ─────────────────────────────────────
      //
      // Fact writes are best-effort — a bookkeeping failure must never fail a
      // customer's call. But a best-effort write whose losses are invisible
      // makes "this capability had no traffic" and "the recorder is broken" the
      // same observation, and the floor's response to the first is to do nothing
      // while its response to a partial sample could be to delist.
      //
      // Two independent checks, because they fail for different reasons:
      //
      //   1. Marker events. Names the cause, but is written to the same database
      //      that just refused the fact, so it is absent exactly when the cause
      //      is "the database was unreachable".
      //   2. Volume. Compares facts against billing rows for the same slug and
      //      window. Needs no cooperation from the failing writer, so it still
      //      fires when the database was down — but it only says something is
      //      wrong, not what.
      //
      // Both suppress QUARANTINE only, per slug, for this tick. Flagging still
      // happens, so a hole is loud rather than disarming.
      const holedRows = await sql<{ slug: string; n: number }[]>`
        SELECT capability_slug AS slug, COUNT(*)::int AS n
        FROM health_monitor_events
        WHERE event_type = ${FACT_WRITE_FAILED_EVENT}
          AND created_at > NOW() - INTERVAL '30 days'
          AND capability_slug IS NOT NULL
        GROUP BY capability_slug`;
      const holedEvidence = new Map(holedRows.map((r) => [r.slug, r.n]));

      const volumeShortfall = factsReady
        ? await detectFactVolumeShortfall(
            sql,
            new Date(Math.max(epoch.getTime(), Date.now() - 30 * 24 * 60 * 60 * 1000)),
          )
        : new Map<string, string>();

      const stats = foldTrafficRows(rows, revenueBySlug);
      // Suppression is applied INSIDE evaluateFloor so a holed capability never
      // spends a slot of the per-run quarantine budget.
      const incomplete = new Set<string>([...holedEvidence.keys(), ...volumeShortfall.keys()]);
      const decisions = evaluateFloor(stats, DEFAULT_FLOOR_CONFIG, incomplete);
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
        const shortfall = volumeShortfall.get(d.slug) ?? null;
        // The core already withheld the action for these; this is the same
        // condition, kept so the gate below cannot depend solely on the core
        // having done it.
        const evidenceIncomplete =
          d.suppressedForIncompleteEvidence === true || holes > 0 || shortfall !== null;
        const willQuarantine =
          d.action === "quarantine" && mode === "enforce" && !evidenceIncomplete;
        const details = {
          mode,
          completion: Number(d.completion.toFixed(4)),
          eligible_calls_30d: d.eligibleCalls,
          deactivate_proposal: d.deactivateProposal,
          requires_human: d.requiresHuman,
          reason:
            evidenceIncomplete && d.action === "quarantine"
              ? `${d.reason} — SUPPRESSED: ` +
                (holes > 0
                  ? `${holes} invocation fact(s) failed to write for this ` +
                    "capability in the window"
                  : shortfall) +
                ", so the completion rate above is computed from an incomplete " +
                "sample. Fix the recorder, then let a clean window decide."
              : d.reason,
          evidence_holes: holes,
          evidence_shortfall: shortfall,
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
            tier: d.action === "quarantine" || evidenceIncomplete ? 2 : 1,
            // Suppression is its own outcome, not a flag. An operator asking
            // "what did the floor decline to act on, and why" must be able to
            // find it -- and until this branch read the core's own marker,
            // every suppressed slug logged as `flagged_only` at tier 1, which
            // is the vocabulary for "we looked and it is fine".
            actionTaken: evidenceIncomplete
              ? "suppressed_incomplete_evidence"
              : d.action === "quarantine"
                ? "dry_run_would_quarantine"
                : "flagged_only",
            details,
          });
        }
        if (d.deactivateProposal) proposals.push(d.slug);
      }

      // Heartbeat: proves the tick ran even with zero decisions (M-3 /
      // DEC-20260504-C — a log line is not verification).
      //
      // Carries the WP9 fact-source state, because the package's own
      // post-deploy verification asks whether the floor is reading complete
      // evidence — and a zero-decision tick is the expected steady state, so a
      // field that only appears on per-decision events cannot answer it. A
      // proof query that returns nothing is the same as skipping verification.
      await db.insert(healthMonitorEvents).values({
        eventType: "quality_floor",
        capabilitySlug: null,
        tier: 1,
        actionTaken: "tick_complete",
        details: {
          mode,
          evaluated: stats.length,
          decisions: decisions.length,
          quarantined,
          proposals,
          // false => block 0101 has not run; the floor is on the transactions
          // branch for the whole window, i.e. its pre-WP9 behaviour.
          facts_table_present: tablePresent,
          // false with facts_table_present true means the table is MUTABLE and
          // the floor has fallen back to billing rows on purpose.
          facts_table_protected: factsProtected,
          fact_epoch: epoch.toISOString(),
          // Slugs whose evidence is known to be incomplete this tick. Zero is
          // the healthy reading, and it is a reading rather than an absence.
          evidence_holes: holedEvidence.size,
          evidence_shortfalls: volumeShortfall.size,
        },
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
  // WP10 (CR-08): the cadence lives in `job_schedule`, not in a timer. Before
  // this, INTERVAL_MS was aspirational — with a 1.0h median process lifetime
  // the `setInterval` arm never fired, and the floor ran once per deploy: 51
  // ticks in the seven days to 2026-08-23 against a declared 24h period. The
  // floor QUARANTINES capabilities, so that made deploy frequency, not policy,
  // the enforcement window.
  registerJobSync({
    name: "quality-floor",
    intervalMs: INTERVAL_MS,
    startupDelayMs: STARTUP_DELAY_MS,
    handler: runQualityFloorOnce,
  });
  logWarn("quality-floor-scheduled", "daily quality-floor tick scheduled", {
    mode: isEnforceMode() ? "enforce" : "dry_run",
    startup_delay_ms: STARTUP_DELAY_MS,
    interval_ms: INTERVAL_MS,
    config: DEFAULT_FLOOR_CONFIG,
  });
}
