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
 */
import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { alertOnce } from "../lib/alert-once.js";
import { log, logWarn } from "../lib/log.js";
import { externalCustomers } from "../lib/metrics/populations.js";
import { ACTOR_KEY_SQL } from "../lib/metrics/actor-identity.js";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly — the gap we care about is hours
const ALERT_COOLDOWN_MS = 12 * 60 * 60 * 1000;

/**
 * A customer counts as "established" once they have paid on at least this many
 * distinct days in the trailing window. One busy afternoon is not a rhythm, and
 * alerting on it would page us about every passing experimenter.
 */
const MIN_ACTIVE_DAYS = 5;
const TRAILING_DAYS = 14;

/**
 * How many times their own typical gap must elapse before we care. Set from
 * the observed 177-hour legitimate gap: a caller silent for ~3× their normal
 * cadence is unusual enough to look at, without firing on an ordinary lull.
 */
const SILENCE_MULTIPLE = 3;

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
 * Now the cadence is the mean gap BETWEEN CALLS (below), which for the real
 * wallet is ~0.5h rather than ~22h, so the floor is what actually governs
 * chatty callers — 6 hours of silence from someone who normally calls every
 * half hour is worth a look, and is under the 21-hour bar.
 */
const MIN_SILENCE_HOURS = 6;

export interface HeartbeatFinding {
  actor: string;
  activeDays: number;
  hoursSilent: number;
  expectedGapHours: number;
  revenueCents: number;
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
    )
    SELECT actor,
           COUNT(DISTINCT date_trunc('day', created_at))::int AS active_days,
           SUM(price_cents)::int                              AS revenue_cents,
           ROUND(EXTRACT(EPOCH FROM (now() - MAX(created_at))) / 3600.0, 1) AS hours_silent,
           -- Their own rhythm: the mean gap BETWEEN CALLS — the span from
           -- their first to their last call divided by the number of gaps in
           -- it. A wallet calling every 31 minutes reports ~0.5, which is the
           -- point: a days-based estimate is floored at ~24h by construction
           -- and made the alert unable to fire inside a day. Single-call
           -- actors cannot reach MIN_ACTIVE_DAYS, so the GREATEST guard is
           -- belt-and-braces against a divide-by-zero, not a real case.
           ROUND((EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) / 3600.0)
                 / GREATEST(COUNT(*) - 1, 1), 2) AS expected_gap_hours
    FROM paid
    GROUP BY actor
    HAVING COUNT(DISTINCT date_trunc('day', created_at)) >= ${MIN_ACTIVE_DAYS}
  `)) as unknown as Array<{
    actor: string; active_days: number; revenue_cents: number;
    hours_silent: number; expected_gap_hours: number;
  }>;

  return rows
    .filter((r) => {
      const threshold = Math.max(
        MIN_SILENCE_HOURS,
        Number(r.expected_gap_hours) * SILENCE_MULTIPLE,
      );
      return Number(r.hours_silent) >= threshold;
    })
    .map((r) => ({
      actor: r.actor,
      activeDays: Number(r.active_days),
      hoursSilent: Number(r.hours_silent),
      expectedGapHours: Number(r.expected_gap_hours),
      revenueCents: Number(r.revenue_cents),
    }));
}

async function tick(): Promise<void> {
  try {
    const silent = await findSilentPayers();
    if (silent.length === 0) {
      log.info({ label: "revenue-heartbeat-ok" }, "revenue-heartbeat-ok");
      return;
    }
    for (const f of silent) {
      // The alert key is the actor, so each customer alerts independently and
      // a cooldown on one never masks another going quiet.
      await alertOnce(`revenue-heartbeat:${f.actor}`, ALERT_COOLDOWN_MS, {
        severity: "critical",
        subject: `A paying customer has gone quiet (${f.hoursSilent}h)`,
        body:
          `A customer who paid on ${f.activeDays} of the last ${TRAILING_DAYS} days ` +
          `has made no paid call for ${f.hoursSilent} hours. Their normal gap is about ` +
          `${f.expectedGapHours} hours. They are worth €${(f.revenueCents / 100).toFixed(2)} ` +
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
  void tick();
  setInterval(() => void tick(), CHECK_INTERVAL_MS).unref();
}
