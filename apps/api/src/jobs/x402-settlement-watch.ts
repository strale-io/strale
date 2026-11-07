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
 * against the daily average of the 7 days before that, with each payer's one-off
 * burst days capped (see "Robust baseline" below). If the baseline is meaningful
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
// buyer ran a single large job on 2026-10-30, many times its normal day, and
// that one day lifted the mean so far that on 2026-11-03 an ordinary day read
// as a drop below half of it, hours after the buyer was back.
//
// So a burst is capped PER PAYER, against that payer's own usual day, and
// only once the payer is seen on both sides of it:
//  - A payer's usual day is the median of its non-zero days over the
//    baseline days and CONTEXT_DAYS older days (context only: they never
//    enter the mean). A job covering up to a third of those active days
//    cannot move it.
//  - A day is capped at max(SPIKE_CAP_FACTOR x usual, SPIKE_CAP_FLOOR). The
//    floor means a small payer's days are never touched, and the cap is
//    never below the floor, so a payer can never be capped away.
//  - A day above the cap is capped only when the same payer had a usual
//    baseline day both BEFORE it and AFTER it. That is what a one-off job
//    looks like: the payer came back to its normal level. The last 24h is
//    never that evidence, because it is what is being judged: a burst
//    yesterday and a ramp that broke today look the same until a full day
//    has followed it, so a burst in the newest baseline day is capped only
//    from the next day on.
//    A payer that went quiet after its busy days (an outage, a degradation,
//    a payer that stopped) has no usual day after them and keeps the plain
//    mean. A payer whose busy days are its newest or its first (a ramp, a
//    new buyer) has no usual day on one side and keeps the plain mean.
//  - Other payers' counts are never touched, so "everyone else" stays their
//    own plain mean; the total baseline is the sum of the per-payer ones, so
//    the top buyers' shares sum to at most 1.
//  - Unattributed rows (payer null) are a mix of payers and are never capped.
//
// Three designs were rejected in review (2026-11-06): the median of the daily
// totals; leaving out any total day above three times the rest; and capping a
// total day that stands above both its sides. All three reshaped the totals,
// so a real outage or a ramp could read as a spike and lower the bar exactly
// when a real drop happened, and the third scaled every payer on a capped day
// (review round 3).
//
// Accepted cost: one payer's own surge that then returns to its usual level
// for a day is treated as a job, even if it was a short-lived ramp. That is
// the incident shape, and comparing the last 24h against the payer's usual
// level is then the right question.
export const BASELINE_DAYS = 7;
export const CONTEXT_DAYS = 7;
export const SPIKE_CAP_FACTOR = 3;
export const SPIKE_CAP_FLOOR = 10;

/**
 * Settled count per payer: the last 24h, each of the BASELINE_DAYS days
 * before it (index 0 = 24–48h ago), and optionally CONTEXT_DAYS older days
 * (index 0 = the day before the oldest baseline day), used only to judge
 * what the payer's usual day is.
 */
export type PayerRow = { payer: string | null; last24h: number; priorDaily: number[]; contextDaily?: number[] };

const sum = (values: number[]) => values.reduce((a, n) => a + n, 0);

function median(sorted: number[]): number {
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * One payer's baseline days with that payer's own bursts capped (see
 * "Robust baseline"). Returns the days unchanged when nothing qualifies.
 */
export function capPayerSpikes(row: PayerRow): number[] {
  const days = row.priorDaily;
  const context = row.contextDaily ?? [];
  const active = [...days, ...context].filter((n) => n > 0).sort((a, b) => a - b);
  if (active.length === 0) return [...days];
  const usual = median(active);
  const cap = Math.max(SPIKE_CAP_FACTOR * usual, SPIKE_CAP_FLOOR);
  const isUsual = (n: number) => n > 0 && n <= cap && n * SPIKE_CAP_FACTOR >= usual;
  return days.map((n, d) => {
    if (n <= cap) return n;
    const after = days.slice(0, d).some(isUsual);
    const before = days.slice(d + 1).some(isUsual) || context.some(isUsual);
    return after && before ? cap : n;
  });
}

const BUCKET_LIMIT = BASELINE_DAYS + CONTEXT_DAYS;

/**
 * Fold (payer, days-ago, count) buckets into per-payer rows. Bucket 0 is the
 * last 24h (a row a little in the future from clock skew counts there too);
 * 1..BASELINE_DAYS fill priorDaily, the next CONTEXT_DAYS fill contextDaily;
 * anything older is ignored. A bucket that is not a whole day or a whole,
 * non-negative count is a broken query, not data to drop quietly.
 */
export function rowsFromBuckets(buckets: Array<{ payer: string | null; dayAgo: number; n: number }>): PayerRow[] {
  const byPayer = new Map<string | null, PayerRow>();
  for (const b of buckets) {
    if (!Number.isInteger(b.dayAgo) || !Number.isInteger(b.n) || b.n < 0) {
      throw new Error(`x402-settlement-watch: malformed bucket (day_ago ${String(b.dayAgo)}, n ${String(b.n)})`);
    }
    if (b.dayAgo > BUCKET_LIMIT) continue;
    let row = byPayer.get(b.payer);
    if (!row) {
      row = {
        payer: b.payer,
        last24h: 0,
        priorDaily: new Array<number>(BASELINE_DAYS).fill(0),
        contextDaily: new Array<number>(CONTEXT_DAYS).fill(0),
      };
      byPayer.set(b.payer, row);
    }
    if (b.dayAgo <= 0) row.last24h += b.n;
    else if (b.dayAgo <= BASELINE_DAYS) row.priorDaily[b.dayAgo - 1]! += b.n;
    else row.contextDaily![b.dayAgo - BASELINE_DAYS - 1]! += b.n;
  }
  return [...byPayer.values()];
}

/** A numeric column from the driver: a number or a numeric string, never a missing value read as 0. */
function column(r: Record<string, unknown>, name: string): number {
  const v = r[name];
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") return Number(v);
  return Number.NaN;
}

/** The raw query rows as buckets; a missing day_ago or n column is refused by rowsFromBuckets. */
export function bucketsFromQueryRows(rows: Array<Record<string, unknown>>) {
  return rows.map((r) => ({
    payer: (r.payer as string | null | undefined) ?? null,
    dayAgo: column(r, "day_ago"),
    n: column(r, "n"),
  }));
}

export type VolumeVerdict =
  | { kind: "no_baseline" | "healthy"; last24h: number; baselinePerDay: number; cappedPayerDays: number }
  | {
      kind: "concentrated" | "broad";
      last24h: number;
      baselinePerDay: number;
      /** (payer, baseline day) pairs capped as that payer's one-off burst. */
      cappedPayerDays: number;
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
  const payers = rows.map((row) => {
    const capped = row.payer === null ? row.priorDaily : capPayerSpikes(row);
    return {
      row,
      baseline: sum(capped) / BASELINE_DAYS,
      raw: sum(row.priorDaily),
      cappedDays: capped.filter((n, d) => n < row.priorDaily[d]!).length,
    };
  });
  const last24h = sum(rows.map((r) => r.last24h));
  const baselinePerDay = sum(payers.map((p) => p.baseline));
  const cappedPayerDays = sum(payers.map((p) => p.cappedDays));
  if (baselinePerDay < MIN_BASELINE_PER_DAY) return { kind: "no_baseline", last24h, baselinePerDay, cappedPayerDays };
  if (last24h >= baselinePerDay * ALERT_RATIO) return { kind: "healthy", last24h, baselinePerDay, cappedPayerDays };

  // Unattributed rows (pre-hash x402 rows, or no payer extracted) are never a
  // "buyer" to exclude; they count with everyone else.
  const known = payers.filter((p) => p.row.payer !== null);
  const ranked = [...known].sort((a, b) =>
    b.baseline - a.baseline || b.raw - a.raw || b.row.last24h - a.row.last24h);
  const top = ranked.slice(0, MAX_EXCLUDED_BUYERS).filter((p) => p.baseline > 0);
  const topBuyers = top.map((p) => ({
    payerHashPrefix: (p.row.payer as string).slice(0, 8),
    baselinePerDay: round1(p.baseline),
    last24h: p.row.last24h,
    share: p.baseline / baselinePerDay,
  }));

  let excluded = 0;
  let othersLast24h = last24h;
  let othersBaselinePerDay = baselinePerDay;
  for (let k = 1; k <= top.length; k++) {
    const removed = top.slice(0, k);
    const oLast = last24h - sum(removed.map((p) => p.row.last24h));
    const oBase = baselinePerDay - sum(removed.map((p) => p.baseline));
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
    cappedPayerDays,
    distinctPayers24h: known.filter((p) => p.row.last24h > 0).length,
    // Same basis as the baseline: a payer with baseline volume.
    distinctPayers7d: known.filter((p) => p.baseline > 0).length,
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
  // days, each (now - (k+1)·24h, now - k·24h], then CONTEXT_DAYS older days
  // that only inform each payer's usual day. Epoch arithmetic, so a DST
  // change cannot stretch a bucket, and the bucket count follows the constants.
  const rows = await db.execute(sql`
    SELECT
      x402_payer_hash AS payer,
      (CEIL(EXTRACT(EPOCH FROM (now() - created_at)) / 86400) - 1)::int AS day_ago,
      COUNT(*)::int AS n
    FROM transactions
    WHERE x402_settlement_id IS NOT NULL
      AND created_at >= now() - make_interval(hours => ${(BUCKET_LIMIT + 1) * 24})
    GROUP BY 1, 2
  `);
  const verdict = classifyVolume(
    rowsFromBuckets(bucketsFromQueryRows(rows as unknown as Array<Record<string, unknown>>)),
  );
  const { last24h, baselinePerDay } = verdict;

  log.info(
    {
      label: "x402-settlement-watch",
      verdict: verdict.kind,
      last_24h: last24h,
      baseline_per_day: round1(baselinePerDay),
      capped_payer_days: verdict.cappedPayerDays,
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
    (verdict.cappedPayerDays > 0
      ? ` (${verdict.cappedPayerDays} one-off burst day${verdict.cappedPayerDays === 1 ? "" : "s"} capped at ` +
        `${SPIKE_CAP_FACTOR}x that payer's usual day). `
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
