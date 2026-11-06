/**
 * x402 settlement-volume watch (task #31, 2026-08-13).
 *
 * Companion guard for the x402 v2 challenge migration. The product-review
 * HIGH on that change: if a pinned-v1 payer population ever receives a v2
 * challenge (misconfiguration, future cutover, client drift), the failure
 * happens inside the payer's process BEFORE any X-PAYMENT retry — from
 * Strale's side it looks like "402 served, then nothing", and the only
 * observable symptom is settlement volume quietly falling off. Nothing in
 * the platform watched that number; this job is the tripwire.
 *
 * Every TICK, compare settled-x402-transaction count over the trailing 24h
 * against the daily average of the 7 days before that, with one-off spike
 * days capped (see "Robust baseline" below). If the baseline is meaningful
 * (≥ MIN_BASELINE_PER_DAY) and the last 24h came in under ALERT_RATIO of it,
 * page via sendAlert — at most once per ALERT_COOLDOWN_MS so a sustained dip
 * doesn't spam. The remedy is in the alert text: check
 * the x402-payment-payload-version log counter, and if v1 payloads stopped
 * arriving right when a challenge-version change deployed, flip
 * X402_CHALLENGE_VERSION back and redeploy.
 *
 * Since 2026-10-29 the count is split by payer, so one big buyer pausing is a
 * warning rather than a CRITICAL page (see "Buyer concentration" below).
 *
 * Read-only on the DB; no advisory lock needed (duplicate alerts from a
 * multi-replica deploy are annoying, not harmful, and we run 1 replica).
 */

import { sql } from "drizzle-orm";
import { getDb, type Database } from "../db/index.js";
import { log } from "../lib/log.js";
import { alertOnce } from "../lib/alert-once.js";
import { registerJobSync } from "../lib/job-coordinator.js";

// This is now the BACKSTOP, not the primary signal. Settle failures page
// immediately from reportSettlementFailure() in lib/x402-gateway.ts; this job
// catches the cases that produce no failure at all — a payer population
// quietly disappearing, or a client that stops sending payments. Because the
// window is a rolling 24h, this can only notice once a full day of good
// traffic has aged out; that latency is inherent and is exactly why the
// direct failure signal exists alongside it.
const TICK_MS = 60 * 60 * 1000; // hourly: cheap query, and the 6h tick added
                                // up to 6h on top of an already-slow signal
const STARTUP_DELAY_MS = 5 * 60 * 1000; // let boot settle
const ALERT_RATIO = 0.5; // alert when 24h volume < 50% of baseline
const MIN_BASELINE_PER_DAY = 10; // below this, a drop is noise, not signal
const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// Buyer concentration (incident 2026-10-28): the CRITICAL page "78 in 24h vs
// ~158/day baseline" sat unseen for 14 hours, and when it was read the rail
// was fine. One payer address made almost all of the volume and had simply
// paused. A total-count tripwire cannot tell a quiet customer from a broken
// rail, so the count is now split by payer (`x402_payer_hash`, the keyed
// pseudonymous hash — never the raw address).
//
// The drop is "concentrated" when removing at most MAX_EXCLUDED_BUYERS of the
// biggest baseline payers leaves everyone else at or near their own baseline,
// AND at least one of them settled in the window: someone else paying end to
// end is what proves the rail works. That downgrades the page to a warning.
// Everything else stays CRITICAL — a broad drop, or nobody else settling at
// all (distinct payers at zero included). Served 402 challenges are not
// recorded anywhere, so "challenges served but nobody pays" is not measurable
// from here; zero settling payers is treated as broken whatever the cause.
//
// The others also need a baseline of their own (MIN_OTHERS_PER_DAY): one small
// payer settling once a day proves little, and a v1-client die-off that takes
// out the big buyer while a lone v2 payer carries on would otherwise read as
// "concentrated" (review finding, 2026-10-29). The warning keeps the rail
// suspects in its text for the same reason.
const MAX_EXCLUDED_BUYERS = 2;
const OTHERS_NEAR_BASELINE_RATIO = 0.7;
const MIN_OTHERS_PER_DAY = 3;

// Robust baseline (incident 2026-11-03): the baseline is the daily mean of
// the 7 days before the last 24h (24h buckets counted back from now). One
// buyer ran a single large job on 2026-10-30, many times a normal day, and
// that one day lifted the mean so far that on 2026-11-03 an ordinary day read
// as a drop below half of it, hours after the buyer was back.
//
// So an ISOLATED SPIKE is capped before averaging: a day is capped at
// SPIKE_CAP_FACTOR times its reference level, where the reference is the
// larger of the average of the newer baseline days and the average of the
// older ones. A day is only touched when it stands far above BOTH sides,
// which is what tells a one-off job apart from the shapes that must keep the
// plain mean:
//  - a ramp: the busy days are the newest, so there is no quieter newer side.
//    The newest baseline day is never capped, which also means a burst is
//    recognised only once a normal day has followed it (a burst yesterday and
//    a ramp yesterday are the same data until then);
//  - an outage or slow degradation: the healthy days are the oldest, so the
//    days older than a healthy day are healthy too (and the oldest day is
//    never capped), and none of them stands above its older side;
//  - quiet weekends and every-other-day buyers: no day is three times the
//    days around it.
// Each side leaves out the day right next to the one being judged when it
// has others, so a job that straddles a bucket boundary caps both of its
// days. Capping rather than dropping keeps the baseline continuous: one more
// call on a busy day can never move the baseline down.
//
// Two designs were rejected in review (2026-11-06): the median of the daily
// totals (quiet weekends page; a degraded level becomes the baseline after
// four days; buyers active on three or fewer days vanish), and leaving out
// any day above three times the rest (it dropped the last healthy days of a
// deep outage and the first days of a ramp, lowering the bar exactly when a
// real drop happens). Medians on each side were also ruled out: with an
// every-other-day buyer both side medians are 0 and every active day would
// be capped away.
//
// The cap is applied to the day's total and every payer's count that day is
// scaled by the same factor, so per-payer baselines still add up to the
// total, "everyone else" is still the total minus the excluded buyers, and
// the top buyers' shares sum to at most 1.
export const BASELINE_DAYS = 7;
export const SPIKE_CAP_FACTOR = 3;

/** Settled count per payer: the last 24h, and each of the BASELINE_DAYS days before it (index 0 = 24–48h ago). */
export type PayerRow = { payer: string | null; last24h: number; priorDaily: number[] };

/** Day-by-day totals across rows, always BASELINE_DAYS long (missing days are 0). */
function dailyTotals(rows: PayerRow[]): number[] {
  const totals = new Array<number>(BASELINE_DAYS).fill(0);
  for (const r of rows) for (let d = 0; d < BASELINE_DAYS; d++) totals[d]! += r.priorDaily[d] ?? 0;
  return totals;
}

const mean = (values: number[]) => values.reduce((a, n) => a + n, 0) / values.length;

/**
 * The daily totals with isolated spikes capped (see "Robust baseline"). Index
 * 0 is the newest baseline day, the last index the oldest; those two are
 * never capped because one side of them is unseen.
 */
export function capSpikes(totals: number[]): number[] {
  const last = totals.length - 1;
  return totals.map((n, d) => {
    if (d === 0 || d === last) return n;
    const newer = totals.slice(0, d >= 2 ? d - 1 : d);
    const older = totals.slice(d <= last - 2 ? d + 2 : d + 1);
    return Math.min(n, SPIKE_CAP_FACTOR * Math.max(mean(newer), mean(older)));
  });
}

const priorSum = (r: PayerRow) => r.priorDaily.reduce((a, n) => a + n, 0);

/**
 * Fold (payer, days-ago, count) buckets into per-payer rows. Bucket 0 is the
 * last 24h (a row a little in the future from clock skew counts there too);
 * 1..BASELINE_DAYS fill priorDaily; anything older is ignored. A bucket that
 * is not a whole number is a broken query, not data to drop quietly.
 */
export function rowsFromBuckets(buckets: Array<{ payer: string | null; dayAgo: number; n: number }>): PayerRow[] {
  const byPayer = new Map<string | null, PayerRow>();
  for (const b of buckets) {
    if (!Number.isInteger(b.dayAgo) || !Number.isFinite(b.n)) {
      throw new Error(`x402-settlement-watch: malformed bucket (day_ago ${String(b.dayAgo)}, n ${String(b.n)})`);
    }
    if (b.dayAgo > BASELINE_DAYS) continue;
    let row = byPayer.get(b.payer);
    if (!row) {
      row = { payer: b.payer, last24h: 0, priorDaily: new Array<number>(BASELINE_DAYS).fill(0) };
      byPayer.set(b.payer, row);
    }
    if (b.dayAgo <= 0) row.last24h += b.n;
    else row.priorDaily[b.dayAgo - 1]! += b.n;
  }
  return [...byPayer.values()];
}

export type VolumeVerdict =
  | { kind: "no_baseline" | "healthy"; last24h: number; baselinePerDay: number; cappedDays: number }
  | {
      kind: "concentrated" | "broad";
      last24h: number;
      baselinePerDay: number;
      /** Baseline days whose total was capped as an isolated spike. */
      cappedDays: number;
      distinctPayers24h: number;
      distinctPayers7d: number;
      /** The biggest baseline payers, largest first, with their share of baseline volume. */
      topBuyers: Array<{ payerHashPrefix: string; baselinePerDay: number; last24h: number; share: number }>;
      /** How many of topBuyers the concentrated verdict excluded (0 when broad). */
      excluded: number;
      othersLast24h: number;
      othersBaselinePerDay: number;
    };

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Pure decision over per-payer counts. Exported for unit tests. */
export function classifyVolume(rows: PayerRow[]): VolumeVerdict {
  const last24h = rows.reduce((a, r) => a + r.last24h, 0);
  const totals = dailyTotals(rows);
  const capped = capSpikes(totals);
  const cappedDays = capped.filter((n, d) => n < totals[d]!).length;
  // Each payer's day is scaled by the same factor as the day's total.
  const scale = totals.map((n, d) => (n > 0 ? capped[d]! / n : 0));
  const baseline = new Map(rows.map((r) => [
    r,
    r.priorDaily.reduce((a, n, d) => a + n * (scale[d] ?? 0), 0) / BASELINE_DAYS,
  ]));
  const baselinePerDay = capped.reduce((a, n) => a + n, 0) / BASELINE_DAYS;
  if (baselinePerDay < MIN_BASELINE_PER_DAY) return { kind: "no_baseline", last24h, baselinePerDay, cappedDays };
  if (last24h >= baselinePerDay * ALERT_RATIO) return { kind: "healthy", last24h, baselinePerDay, cappedDays };

  // Unattributed rows (pre-hash x402 rows, or no payer extracted) are never a
  // "buyer" to exclude; they count with everyone else.
  const known = rows.filter((r) => r.payer !== null);
  const ranked = [...known].sort((a, b) =>
    baseline.get(b)! - baseline.get(a)! || priorSum(b) - priorSum(a) || b.last24h - a.last24h);
  const top = ranked.slice(0, MAX_EXCLUDED_BUYERS).filter((r) => baseline.get(r)! > 0);
  const topBuyers = top.map((r) => ({
    payerHashPrefix: (r.payer as string).slice(0, 8),
    baselinePerDay: round1(baseline.get(r)!),
    last24h: r.last24h,
    share: baseline.get(r)! / baselinePerDay,
  }));

  let excluded = 0;
  let othersLast24h = last24h;
  let othersBaselinePerDay = baselinePerDay;
  for (let k = 1; k <= top.length; k++) {
    const removed = top.slice(0, k);
    const oLast = last24h - removed.reduce((a, r) => a + r.last24h, 0);
    const oBase = baselinePerDay - removed.reduce((a, r) => a + baseline.get(r)!, 0);
    if (oBase >= MIN_OTHERS_PER_DAY && oLast >= 1 && oLast >= oBase * OTHERS_NEAR_BASELINE_RATIO) {
      excluded = k;
      othersLast24h = oLast;
      othersBaselinePerDay = oBase;
      break;
    }
  }

  return {
    kind: excluded > 0 ? "concentrated" : "broad",
    last24h,
    baselinePerDay,
    cappedDays,
    distinctPayers24h: known.filter((r) => r.last24h > 0).length,
    distinctPayers7d: known.filter((r) => priorSum(r) > 0).length,
    topBuyers,
    excluded,
    othersLast24h,
    othersBaselinePerDay,
  };
}

function describeBuyers(v: Extract<VolumeVerdict, { kind: "concentrated" | "broad" }>): string {
  const buyers = v.topBuyers
    .map((b, i) =>
      `#${i + 1} payer ${b.payerHashPrefix} (keyed hash): ${Math.round(b.share * 100)}% of baseline, ` +
      `~${b.baselinePerDay}/day before, ${b.last24h} in the last 24h`)
    .join("; ");
  return (
    `Distinct paying wallets: ${v.distinctPayers24h} in the last 24h, ${v.distinctPayers7d} in the 7 days before. ` +
    `Top buyers by baseline volume: ${buyers || "none attributed"}. ` +
    `Everyone else: ${v.othersLast24h} in the last 24h vs ~${round1(v.othersBaselinePerDay)}/day baseline` +
    (v.excluded > 0 ? ` (excluding the top ${v.excluded}). ` : ". ")
  );
}

export async function checkX402SettlementVolume(opts: { db?: Database } = {}): Promise<VolumeVerdict> {
  const db = opts.db ?? getDb();
  // One bucket per (payer, 24h periods back from now): 0 is the last 24h
  // (created_at >= now() - 24h, as before), 1..BASELINE_DAYS the baseline
  // days, each (now - (k+1)·24h, now - k·24h]. Epoch arithmetic, so a DST
  // change cannot stretch a bucket, and the bucket count follows BASELINE_DAYS.
  const rows = await db.execute(sql`
    SELECT
      x402_payer_hash AS payer,
      (CEIL(EXTRACT(EPOCH FROM (now() - created_at)) / 86400) - 1)::int AS day_ago,
      COUNT(*)::int AS n
    FROM transactions
    WHERE x402_settlement_id IS NOT NULL
      AND created_at >= now() - make_interval(hours => ${(BASELINE_DAYS + 1) * 24})
    GROUP BY 1, 2
  `);
  const verdict = classifyVolume(
    rowsFromBuckets(
      (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
        payer: (r.payer as string | null) ?? null,
        dayAgo: Number(r.day_ago ?? 0),
        n: Number(r.n ?? 0),
      })),
    ),
  );
  const { last24h, baselinePerDay } = verdict;

  log.info(
    {
      label: "x402-settlement-watch",
      verdict: verdict.kind,
      last_24h: last24h,
      baseline_per_day: round1(baselinePerDay),
      capped_spike_days: verdict.cappedDays,
      ...(verdict.kind === "concentrated" || verdict.kind === "broad"
        ? {
            distinct_payers_24h: verdict.distinctPayers24h,
            distinct_payers_7d: verdict.distinctPayers7d,
            top_buyer_share: verdict.topBuyers[0] ? round1(verdict.topBuyers[0].share * 100) : null,
          }
        : {}),
    },
    "x402-settlement-watch",
  );

  if (verdict.kind !== "concentrated" && verdict.kind !== "broad") return verdict;

  const totals =
    `Settled x402 transactions in the last 24h: ${last24h}. ` +
    `Trailing 7-day baseline: ~${Math.round(baselinePerDay)}/day` +
    (verdict.cappedDays > 0
      ? ` (${verdict.cappedDays} one-off spike day${verdict.cappedDays === 1 ? "" : "s"} capped at ${SPIKE_CAP_FACTOR}x the days around ${verdict.cappedDays === 1 ? "it" : "them"}). `
      : ". ");

  if (verdict.kind === "concentrated") {
    const share = Math.round(
      verdict.topBuyers.slice(0, verdict.excluded).reduce((a, b) => a + b.share, 0) * 100,
    );
    // Its own key: a warning inside the cooldown must not swallow a CRITICAL
    // that follows it once the drop turns broad.
    await alertOnce("x402-settlement-volume-drop-concentrated", ALERT_COOLDOWN_MS, {
      severity: "warning",
      db: opts.db,
      subject:
        `x402 volume down to ${last24h} in 24h vs ~${Math.round(baselinePerDay)}/day, ` +
        `explained by the top ${verdict.excluded === 1 ? "buyer" : `${verdict.excluded} buyers`} (${share}% of baseline)`,
      body:
        totals +
        describeBuyers(verdict) +
        `The drop is explained by the top buyer${verdict.excluded === 1 ? "" : "s"} pausing; the rest of the ` +
        `payers are at or near their own baseline, so the rail is settling and this is most likely a customer ` +
        `signal. It becomes CRITICAL if the other payers fall off too. If a challenge-version change deployed ` +
        `just before the drop, check the x402-payment-payload-version log counter anyway: a v1-only buyer ` +
        `stops paying on a v2 challenge while v2 payers carry on.`,
    });
    return verdict;
  }

  // Cooldown lives in the DB, not module memory: redeploys used to reset it,
  // which sent five identical pages in 90 minutes on 2026-08-14.
  await alertOnce("x402-settlement-volume-drop", ALERT_COOLDOWN_MS, {
    severity: "critical",
    db: opts.db,
    subject: `x402 settlement volume dropped: ${last24h} in 24h vs ~${Math.round(baselinePerDay)}/day baseline`,
    body:
      totals +
      describeBuyers(verdict) +
      `The drop is broad: excluding the top buyers does not leave the other payers near baseline. ` +
      `If a challenge-version change deployed recently, suspect v1-client die-off: ` +
      `check the x402-payment-payload-version log counter, and if v1 payloads ` +
      `disappeared at the deploy boundary, set X402_CHALLENGE_VERSION=1 on Railway ` +
      `and redeploy (see x402ChallengeVersion() in lib/x402-gateway.ts). ` +
      `Other suspects: facilitator billing/auth (a settle-failure page would ` +
      `have fired separately), facilitator outage, or Base network issues.`,
  });
  return verdict;
}

export function startX402SettlementWatch(): void {
  // WP10 (CR-08): cadence moved into `job_schedule`.
  registerJobSync({
    name: "x402-settlement-watch",
    intervalMs: TICK_MS,
    startupDelayMs: STARTUP_DELAY_MS,
    handler: () => checkX402SettlementVolume(),
  });
  log.info(
    { label: "x402-settlement-watch", tick_ms: TICK_MS },
    "x402-settlement-watch: started",
  );
}
