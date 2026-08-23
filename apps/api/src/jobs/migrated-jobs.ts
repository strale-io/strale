/**
 * WP10 (CR-08): the jobs whose cadence lives in `job_schedule`.
 *
 * One list, read by two guards that check different halves of the same claim:
 *
 *   - `job-migration.integration.test.ts` asserts each `startX()` really writes
 *     a `job_schedule` row with the period the code declares — that the job IS
 *     on the coordinator.
 *   - `no-boot-relative-timers.test.ts` asserts none of these modules still
 *     contains a timer — that the job is ONLY on the coordinator.
 *
 * The second guard exists because the first cannot see a job that registers
 * with the coordinator *and* keeps its own `setInterval`. That job would run
 * twice, the second time outside any lease, and every coordinator test would
 * stay green.
 *
 * The cut is deliberate: a job is migrated when its period exceeds the observed
 * median production process lifetime (1.0h), because those are exactly the
 * periods a `setInterval` could never reach. The sub-hour tick loops —
 * reservation-reconciler and settlement-reconciler at 60s, integrity-hash-retry
 * at 30s, and the test scheduler's own 60s poll — keep their timers, because
 * for them the poll cadence IS the point and a restart costs at most one tick.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export interface MigratedJob {
  /** Module specifier, relative to src/jobs/. */
  module: string;
  /** Source file name, for the timer lint. */
  file: string;
  /** The exported starter that index.ts calls at boot. */
  start: string;
  /** The `job_schedule.job_name` it registers. */
  job: string;
  /** The period the code declares, which the table must agree with. */
  intervalMs: number;
}

export const MIGRATED_JOBS: readonly MigratedJob[] = [
  { module: "./quality-floor.js", file: "quality-floor.ts", start: "startQualityFloor", job: "quality-floor", intervalMs: DAY },
  { module: "./capability-promotion.js", file: "capability-promotion.ts", start: "startCapabilityPromotion", job: "capability-promotion", intervalMs: DAY },
  { module: "./db-retention.js", file: "db-retention.ts", start: "startDbRetention", job: "db-retention", intervalMs: DAY },
  { module: "./activation-drip.js", file: "activation-drip.ts", start: "startActivationDrip", job: "activation-drip", intervalMs: 6 * HOUR },
  { module: "./invariant-checker.js", file: "invariant-checker.ts", start: "startInvariantChecker", job: "invariant-checker", intervalMs: 2 * HOUR },
  { module: "./ingest-cy-directors.js", file: "ingest-cy-directors.ts", start: "startCyDirectorsIngest", job: "ingest-cy-directors", intervalMs: 7 * DAY },
  { module: "./ingest-ee-directors.js", file: "ingest-ee-directors.ts", start: "startEeDirectorsIngest", job: "ingest-ee-directors", intervalMs: DAY },
  { module: "./reindex-transactions.js", file: "reindex-transactions.ts", start: "startReindexTransactions", job: "reindex-transactions", intervalMs: DAY },
  { module: "./x402-settlement-watch.js", file: "x402-settlement-watch.ts", start: "startX402SettlementWatch", job: "x402-settlement-watch", intervalMs: HOUR },
  { module: "./revenue-heartbeat.js", file: "revenue-heartbeat.ts", start: "startRevenueHeartbeat", job: "revenue-heartbeat", intervalMs: HOUR },
  { module: "./onboarding-retry.js", file: "onboarding-retry.ts", start: "startOnboardingRetry", job: "onboarding-retry", intervalMs: HOUR },
];
