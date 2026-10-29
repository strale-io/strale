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
 * against the daily average of the 7 days before that. If the baseline is
 * meaningful (≥ MIN_BASELINE_PER_DAY) and the last 24h came in under
 * ALERT_RATIO of it, page via sendAlert — at most once per ALERT_COOLDOWN_MS
 * so a sustained dip doesn't spam. The remedy is in the alert text: check
 * the x402-payment-payload-version log counter, and if v1 payloads stopped
 * arriving right when a challenge-version change deployed, flip
 * X402_CHALLENGE_VERSION back and redeploy.
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
const MAX_EXCLUDED_BUYERS = 2;
const OTHERS_NEAR_BASELINE_RATIO = 0.7;

type PayerRow = { payer: string | null; last24h: number; prior7d: number };

export type VolumeVerdict =
  | { kind: "no_baseline" | "healthy"; last24h: number; baselinePerDay: number }
  | {
      kind: "concentrated" | "broad";
      last24h: number;
      baselinePerDay: number;
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
  const baselinePerDay = rows.reduce((a, r) => a + r.prior7d, 0) / 7;
  if (baselinePerDay < MIN_BASELINE_PER_DAY) return { kind: "no_baseline", last24h, baselinePerDay };
  if (last24h >= baselinePerDay * ALERT_RATIO) return { kind: "healthy", last24h, baselinePerDay };

  // Unattributed rows (pre-hash x402 rows, or no payer extracted) are never a
  // "buyer" to exclude; they count with everyone else.
  const known = rows.filter((r) => r.payer !== null);
  const ranked = [...known].sort((a, b) => b.prior7d - a.prior7d || b.last24h - a.last24h);
  const top = ranked.slice(0, MAX_EXCLUDED_BUYERS).filter((r) => r.prior7d > 0);
  const topBuyers = top.map((r) => ({
    payerHashPrefix: (r.payer as string).slice(0, 8),
    baselinePerDay: round1(r.prior7d / 7),
    last24h: r.last24h,
    share: r.prior7d / 7 / baselinePerDay,
  }));

  let excluded = 0;
  let othersLast24h = last24h;
  let othersBaselinePerDay = baselinePerDay;
  for (let k = 1; k <= top.length; k++) {
    const removed = top.slice(0, k);
    const oLast = last24h - removed.reduce((a, r) => a + r.last24h, 0);
    const oBase = baselinePerDay - removed.reduce((a, r) => a + r.prior7d, 0) / 7;
    if (oLast >= 1 && oLast >= oBase * OTHERS_NEAR_BASELINE_RATIO) {
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
    distinctPayers24h: known.filter((r) => r.last24h > 0).length,
    distinctPayers7d: known.filter((r) => r.prior7d > 0).length,
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
  const rows = await db.execute(sql`
    SELECT
      x402_payer_hash AS payer,
      COUNT(*) FILTER (
        WHERE created_at >= now() - interval '24 hours'
      ) AS last_24h,
      COUNT(*) FILTER (
        WHERE created_at >= now() - interval '8 days'
          AND created_at < now() - interval '24 hours'
      ) AS prior_7d
    FROM transactions
    WHERE x402_settlement_id IS NOT NULL
      AND created_at >= now() - interval '8 days'
    GROUP BY x402_payer_hash
  `);
  const verdict = classifyVolume(
    (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
      payer: (r.payer as string | null) ?? null,
      last24h: Number(r.last_24h ?? 0),
      prior7d: Number(r.prior_7d ?? 0),
    })),
  );
  const { last24h, baselinePerDay } = verdict;

  log.info(
    {
      label: "x402-settlement-watch",
      verdict: verdict.kind,
      last_24h: last24h,
      baseline_per_day: round1(baselinePerDay),
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
    `Trailing 7-day baseline: ~${Math.round(baselinePerDay)}/day. `;

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
        `payers are at or near their own baseline, so the rail is settling. This is a customer signal, not ` +
        `an outage. It becomes CRITICAL if the other payers fall off too.`,
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
