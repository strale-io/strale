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
import { getDb } from "../db/index.js";
import { log, logError } from "../lib/log.js";
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

export async function checkX402SettlementVolume(): Promise<void> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT
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
  `);
  const row = (rows as unknown as Array<Record<string, unknown>>)[0] ?? {};
  const last24h = Number(row.last_24h ?? 0);
  const baselinePerDay = Number(row.prior_7d ?? 0) / 7;

  log.info(
    {
      label: "x402-settlement-watch",
      last_24h: last24h,
      baseline_per_day: Math.round(baselinePerDay * 10) / 10,
    },
    "x402-settlement-watch",
  );

  if (baselinePerDay < MIN_BASELINE_PER_DAY) return;
  if (last24h >= baselinePerDay * ALERT_RATIO) return;

  // Cooldown lives in the DB, not module memory: redeploys used to reset it,
  // which sent five identical pages in 90 minutes on 2026-08-14.
  await alertOnce("x402-settlement-volume-drop", ALERT_COOLDOWN_MS, {
    severity: "critical",
    subject: `x402 settlement volume dropped: ${last24h} in 24h vs ~${Math.round(baselinePerDay)}/day baseline`,
    body:
      `Settled x402 transactions in the last 24h: ${last24h}. ` +
      `Trailing 7-day baseline: ~${Math.round(baselinePerDay)}/day. ` +
      `If a challenge-version change deployed recently, suspect v1-client die-off: ` +
      `check the x402-payment-payload-version log counter, and if v1 payloads ` +
      `disappeared at the deploy boundary, set X402_CHALLENGE_VERSION=1 on Railway ` +
      `and redeploy (see x402ChallengeVersion() in lib/x402-gateway.ts). ` +
      `Other suspects: facilitator billing/auth (a settle-failure page would ` +
      `have fired separately), facilitator outage, or Base network issues.`,
  });
}

export function startX402SettlementWatch(): void {
  // WP10 (CR-08): cadence moved into `job_schedule`.
  registerJobSync({
    name: "x402-settlement-watch",
    intervalMs: TICK_MS,
    startupDelayMs: STARTUP_DELAY_MS,
    handler: checkX402SettlementVolume,
  });
  log.info(
    { label: "x402-settlement-watch", tick_ms: TICK_MS },
    "x402-settlement-watch: started",
  );
}
