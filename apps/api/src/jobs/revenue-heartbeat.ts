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
 * How many times their own typical daily gap must elapse before we care.
 * Set from the observed 177-hour legitimate gap: an established daily caller
 * silent for ~3× their normal cadence is unusual enough to look at, without
 * firing on the ordinary weekend lull.
 */
const SILENCE_MULTIPLE = 3;
const MIN_SILENCE_HOURS = 24;

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
        COALESCE(t.user_id::text, 'x402:' || t.x402_payer_hash) AS actor,
        t.created_at,
        t.price_cents
      FROM transactions t
      WHERE t.status = 'completed' AND t.price_cents > 0
        AND t.created_at > now() - (${String(TRAILING_DAYS)} || ' days')::interval
        AND COALESCE(t.user_id::text, t.x402_payer_hash) IS NOT NULL
        AND ${externalCustomers("t")}
    )
    SELECT actor,
           COUNT(DISTINCT date_trunc('day', created_at))::int AS active_days,
           SUM(price_cents)::int                              AS revenue_cents,
           ROUND(EXTRACT(EPOCH FROM (now() - MAX(created_at))) / 3600.0, 1) AS hours_silent,
           -- Their own rhythm: the trailing window divided by the days they
           -- actually used us. A five-day-a-week caller expects ~a day.
           ROUND((${String(TRAILING_DAYS)} * 24.0)
                 / GREATEST(COUNT(DISTINCT date_trunc('day', created_at)), 1), 1) AS expected_gap_hours
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
          `stopped, or we may be broken. Check x402 settlement health and the ` +
          `circuit breakers first — a 21-hour settlement outage on 2026-08-14 stopped ` +
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
