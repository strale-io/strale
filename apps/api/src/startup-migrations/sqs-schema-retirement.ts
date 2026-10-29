import { sql } from "drizzle-orm";
import type { MigrationExecutor } from "./types.js";

/**
 * Expand/contract guard for block 0132 (H7d). Code deployed before that block
 * selects whole capability rows through drizzle, which names the SQS columns
 * explicitly; dropping them while such an instance serves breaks its
 * catalogue and /v1/do queries. So the drop waits for proof that a build
 * without those fields is the live one right now, not merely one that booted:
 *
 * - Listening is not proof: Railway cuts over only after /health/deep passes
 *   (its healthcheck retry window is 20 s, see index.ts) and stops a
 *   deployment that fails it. So the first beat is written
 *   FIRST_BEAT_DELAY_MS after listen, which only a deployment that went live
 *   survives to.
 * - A build that went live can be stopped, for a rollback to old code among
 *   other reasons. So beats repeat every BEAT_INTERVAL_MS, block 0132 needs
 *   one within SQS_RETIREMENT_BEAT_FRESHNESS, and a graceful shutdown deletes
 *   the latest beat (clearSqsRetirementBeat) and stops beating. A stopped
 *   build therefore never vouches for the present; a killed one stops
 *   vouching within the freshness window.
 *
 * startup_migration_ledger is created by block 0092 and checked by schema
 * validation. MARKER holds the first live beat (inserted once); LAST_BEAT the
 * latest one. Once nothing is left to drop, the heartbeat stops itself.
 */
export const SQS_RETIREMENT_MARKER = "0132_sqs_fields_removed_and_serving";
export const SQS_RETIREMENT_LAST_BEAT = "0132_sqs_fields_removed_last_beat";
/** The first live beat must be at least this old before the drop. */
export const SQS_RETIREMENT_DROP_DELAY = "10 minutes";
/** The latest beat must be at most this old before the drop. */
export const SQS_RETIREMENT_BEAT_FRESHNESS = "3 minutes";
export const FIRST_BEAT_DELAY_MS = 5 * 60_000;
export const BEAT_INTERVAL_MS = 60_000;

/**
 * One heartbeat from a live build without the SQS fields. Idempotent.
 * Returns false, writing nothing, once the columns and the table are gone.
 */
export async function recordSqsFieldsRemovedAndServing(db: MigrationExecutor): Promise<boolean> {
  const rows = (await db.execute(sql`
    SELECT
      EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'capabilities'
          AND column_name IN ('qp_score', 'rp_score', 'matrix_sqs', 'matrix_sqs_raw', 'trend',
            'guidance_usable', 'guidance_strategy', 'guidance_confidence'))
      OR to_regclass('sqs_daily_snapshot') IS NOT NULL AS remaining
  `)) as unknown as Array<{ remaining: boolean }>;
  if (!rows[0]?.remaining) return false;
  await db.execute(sql`
    INSERT INTO startup_migration_ledger (block, rows_affected)
    VALUES (${SQS_RETIREMENT_MARKER}, 0)
    ON CONFLICT (block) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO startup_migration_ledger (block, rows_affected)
    VALUES (${SQS_RETIREMENT_LAST_BEAT}, 0)
    ON CONFLICT (block) DO UPDATE SET applied_at = now()
  `);
  return true;
}

/** Withdraws this build's latest beat; run on graceful shutdown, before the DB pool closes. */
export async function clearSqsRetirementBeat(db: MigrationExecutor): Promise<void> {
  await db.execute(sql`DELETE FROM startup_migration_ledger WHERE block = ${SQS_RETIREMENT_LAST_BEAT}`);
}

/**
 * Starts the heartbeat after listen: the first beat after FIRST_BEAT_DELAY_MS,
 * then every BEAT_INTERVAL_MS, until stop() or until a beat reports that
 * nothing is left to drop. No beat runs once shuttingDown() is true. Timers
 * are unref'd, so they never hold the process open, and a failed beat is
 * reported, never thrown.
 */
export function startSqsRetirementHeartbeat(opts: {
  beat: () => Promise<boolean>;
  onError: (err: unknown) => void;
  shuttingDown: () => boolean;
  timers?: Pick<typeof globalThis, "setTimeout" | "setInterval" | "clearTimeout" | "clearInterval">;
}): { stop: () => void } {
  const timers = opts.timers ?? globalThis;
  let stopped = false;
  let every: ReturnType<typeof setInterval> | undefined;
  const stop = () => {
    stopped = true;
    timers.clearTimeout(first);
    if (every !== undefined) timers.clearInterval(every);
  };
  const safeBeat = () => {
    if (stopped || opts.shuttingDown()) return;
    opts.beat().then((stillNeeded) => { if (!stillNeeded) stop(); }, opts.onError);
  };
  const first = timers.setTimeout(() => {
    if (stopped) return;
    safeBeat();
    every = timers.setInterval(safeBeat, BEAT_INTERVAL_MS);
    every.unref?.();
  }, FIRST_BEAT_DELAY_MS);
  first.unref?.();
  return { stop };
}
