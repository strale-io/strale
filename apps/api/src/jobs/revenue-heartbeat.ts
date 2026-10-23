/**
 * Revenue heartbeat — notice when the money stops.
 *
 * As of 2026-08-15 one anonymous wallet is ~99% of weekly external revenue.
 * If it stops — because they churned, because we broke, or because settlement
 * failed — the business is at roughly €0.60/week and nobody would find out
 * from a dashboard nobody is watching at 3am. That already happened once: the
 * 21-hour CDP settlement outage stopped this customer completely and was
 * noticed after the fact.
 *
 * This job does not try to predict churn. It answers a simpler question that
 * covers both causes at once: **is money still arriving?** A stop is worth
 * knowing about whether the reason is theirs or ours.
 *
 * Why not "alert when revenue is zero": measured over 60 days, the paying
 * wallet's average gap between calls is 31 minutes, but its longest legitimate
 * gap was 177 hours — more than seven days — after which it resumed normally.
 * A fixed "silent for 24h" rule would have cried wolf; a "silent for 8 days"
 * rule would be useless. So the trigger is *relative*: alert when a customer
 * who was recently busy goes quiet for longer than their own established
 * rhythm. Quiet customers never trigger it, because they have no rhythm to
 * break.
 *
 * One email per silence (2026-10-23). The alert used to repeat every
 * ALERT_COOLDOWN_MS while a silence lasted, and its rhythm was the customer's
 * AVERAGE gap between calls. Both were wrong in production: 78 alerts in the
 * 30 days to 2026-10-23, four customers. Two x402 wallets that simply stopped
 * were re-paged every 12 hours as the silence grew (24h, 36h … 230h); one
 * account that calls in bursts — median gap 0, yet routinely pausing 6–18h —
 * was paged 43 times on ordinary pauses, because its 2.8h average put the bar
 * at ~8h. Now an alert names the silence by the customer's last paid call, so
 * it fires once and re-arms only when they call again; and the rhythm is their
 * usual LONG pause (95th-percentile gap), not the average. Replayed over the
 * same 30 days: 23 alerts. The main wallet still alerts at the 6-hour floor.
 */
import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { alertOnce } from "../lib/alert-once.js";
import { log, logWarn } from "../lib/log.js";
import { externalCustomers } from "../lib/metrics/populations.js";
import { ACTOR_KEY_SQL } from "../lib/metrics/actor-identity.js";
import { registerJobSync } from "../lib/job-coordinator.js";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly — the gap we care about is hours

/**
 * A customer counts as "established" once they have paid on at least this many
 * distinct days in the trailing window. One busy afternoon is not a rhythm, and
 * alerting on it would page us about every passing experimenter.
 */
const MIN_ACTIVE_DAYS = 5;
const TRAILING_DAYS = 14;

/**
 * The alert key carries the silence's start (the last paid call), so the
 * cooldown only has to outlast one silence. After TRAILING_DAYS without a call
 * a customer cannot have MIN_ACTIVE_DAYS in the window and stops matching.
 */
const ALERT_COOLDOWN_MS = (TRAILING_DAYS + 1) * 24 * 60 * 60 * 1000;

/**
 * Their rhythm is their usual LONG pause: this percentile of the gaps between
 * their paid calls in the window. Not the average — a bursty caller averages
 * a few hours yet pauses overnight every day, and the average paged on each
 * of those pauses (2026-10, see the header).
 */
const RHYTHM_GAP_PERCENTILE = 0.95;

/**
 * How many times their usual long pause must elapse before we care: twice
 * the longest pause they normally take is unusual for them, not an ordinary
 * lull. (Was 3 × the average gap; the percentile already sits at the long end.)
 */
const SILENCE_MULTIPLE = 2;

/**
 * Floor, so a very chatty caller does not page us over a brief lull.
 *
 * Was 24, which made the whole job unable to detect the outage in the
 * docstring above. The old cadence estimate was `TRAILING_DAYS × 24 ÷
 * distinct_active_days`; since active days cannot exceed the window's days,
 * that expression cannot return less than ~24 — so the threshold
 * `max(24, cadence × 3)` could never drop below ~72 hours, and the 21-hour
 * settlement outage this job exists to catch would have passed unnoticed. The
 * floor was unreachable dead code for the same reason.
 *
 * Now the cadence is measured in gaps BETWEEN CALLS (below); for the real
 * wallet its usual long gap is under an hour, so the floor is what actually
 * governs chatty callers — 6 hours of silence from someone who normally calls
 * every few minutes is worth a look, and is under the 21-hour bar.
 */
const MIN_SILENCE_HOURS = 6;

export interface HeartbeatFinding {
  actor: string;
  activeDays: number;
  hoursSilent: number;
  /** Their usual long pause between paid calls (RHYTHM_GAP_PERCENTILE). */
  usualLongGapHours: number;
  revenueCents: number;
  /** Their last paid call — the start of this silence, and its identity. */
  lastPaidAt: string;
}

/**
 * Established payers who have now been quiet for longer than their own rhythm.
 * Exported for tests and for the check-in to reuse — no business number is
 * computed twice in this codebase.
 */
export async function findSilentPayers(): Promise<HeartbeatFinding[]> {
  const rows = (await getDb().execute(sql`
    WITH paid AS (
      SELECT
        ${sql.raw(ACTOR_KEY_SQL)} AS actor,
        t.created_at,
        t.price_cents
      FROM transactions t
      WHERE t.status = 'completed' AND t.price_cents > 0
        AND t.created_at > now() - (${String(TRAILING_DAYS)} || ' days')::interval
        AND ${sql.raw(ACTOR_KEY_SQL)} IS NOT NULL
        AND ${externalCustomers("t")}
    ),
    gaps AS (
      SELECT actor, created_at, price_cents,
             EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (PARTITION BY actor ORDER BY created_at))) / 3600.0 AS gap_hours
      FROM paid
    )
    SELECT actor,
           COUNT(DISTINCT date_trunc('day', created_at))::int AS active_days,
           SUM(price_cents)::int                              AS revenue_cents,
           ROUND(EXTRACT(EPOCH FROM (now() - MAX(created_at))) / 3600.0, 1) AS hours_silent,
           to_char(MAX(created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_paid_at,
           -- Their own rhythm: the usual LONG gap between calls. Measured in
           -- gaps between calls, not in active days — a days-based estimate
           -- is floored at ~24h by construction and made the alert unable to
           -- fire inside a day. The first call's gap is NULL, which the
           -- percentile ignores; a single-call actor cannot reach
           -- MIN_ACTIVE_DAYS, so the COALESCE is belt-and-braces.
           ROUND(COALESCE(percentile_cont(${sql.raw(String(RHYTHM_GAP_PERCENTILE))}) WITHIN GROUP (ORDER BY gap_hours), 0)::numeric, 2)
             AS usual_long_gap_hours
    FROM gaps
    GROUP BY actor
    HAVING COUNT(DISTINCT date_trunc('day', created_at)) >= ${MIN_ACTIVE_DAYS}
  `)) as unknown as Array<{
    actor: string; active_days: number; revenue_cents: number;
    hours_silent: number; usual_long_gap_hours: number; last_paid_at: string;
  }>;

  return rows
    .filter((r) => {
      const threshold = Math.max(
        MIN_SILENCE_HOURS,
        Number(r.usual_long_gap_hours) * SILENCE_MULTIPLE,
      );
      return Number(r.hours_silent) >= threshold;
    })
    .map((r) => ({
      actor: r.actor,
      activeDays: Number(r.active_days),
      hoursSilent: Number(r.hours_silent),
      usualLongGapHours: Number(r.usual_long_gap_hours),
      revenueCents: Number(r.revenue_cents),
      lastPaidAt: String(r.last_paid_at),
    }));
}

/**
 * One alert per silence. The key is the customer plus their last paid call:
 * each customer alerts independently (a cooldown on one never masks another),
 * the same silence never alerts twice, and a new paid call starts a new
 * silence that alerts straight away.
 */
export function silenceAlertKey(f: Pick<HeartbeatFinding, "actor" | "lastPaidAt">): string {
  return `revenue-heartbeat:${f.actor}:${f.lastPaidAt}`;
}

/** One hourly check. Exported for tests. */
export async function tick(): Promise<void> {
  try {
    const silent = await findSilentPayers();
    if (silent.length === 0) {
      log.info({ label: "revenue-heartbeat-ok" }, "revenue-heartbeat-ok");
      return;
    }
    for (const f of silent) {
      await alertOnce(silenceAlertKey(f), ALERT_COOLDOWN_MS, {
        severity: "critical",
        subject: `A paying customer has gone quiet (${f.hoursSilent}h)`,
        body:
          `A customer who paid on ${f.activeDays} of the last ${TRAILING_DAYS} days ` +
          `has made no paid call for ${f.hoursSilent} hours. Their usual longest pause is about ` +
          `${f.usualLongGapHours} hours. You get this once per silence; it re-arms when ` +
          `they make a paid call again. They are worth €${(f.revenueCents / 100).toFixed(2)} ` +
          `over that period.\n\n` +
          `This fires for either cause and does not distinguish them: they may have ` +
          `stopped, or we may be broken. Check first whether payments are going ` +
          `through and whether any data service has switched itself off — a 21-hour ` +
          `payment outage on 2026-08-14 stopped ` +
          `this exact revenue and went unnoticed at the time.\n\n` +
          `Do not contact the customer on the strength of this alert; see the ` +
          `customer-data boundary in docs/company/CHARTER.md.`,
      });
    }
  } catch (err) {
    // A monitoring job must never take the process down, but a silent monitor
    // is worse than none — so the swallow is always logged (DEC-20260504-A).
    logWarn("revenue-heartbeat-failed", "heartbeat check failed", { err: String(err) });
  }
}

export function startRevenueHeartbeat(): void {
  log.info({ label: "revenue-heartbeat-start" }, "revenue-heartbeat-start");
  // WP10 (CR-08): cadence moved into `job_schedule`. This job had no startup
  // delay and an hourly interval, so with a 1.0h median process lifetime it
  // was the starvation case rather than the over-run case: it fired at boot
  // and often never reached its first interval tick.
  registerJobSync({
    name: "revenue-heartbeat",
    intervalMs: CHECK_INTERVAL_MS,
    handler: tick,
  });
}
