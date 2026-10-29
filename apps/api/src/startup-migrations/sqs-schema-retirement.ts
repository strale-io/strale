import { sql } from "drizzle-orm";
import type { MigrationExecutor } from "./types.js";

/**
 * Expand/contract guard for block 0132 (H7d). Code deployed before that block
 * selects whole capability rows through drizzle, which names the SQS columns
 * explicitly; dropping them while such an instance serves breaks its
 * catalogue and /v1/do queries. So the drop waits for proof that a build
 * without those fields is the live one, not merely one that booted:
 *
 * - Listening is not proof: Railway cuts over only after /health/deep
 *   passes, and stops a deployment that fails it within its healthcheck
 *   window (seconds). So the first heartbeat is written FIRST_BEAT_DELAY_MS
 *   after listen, which only a deployment that went live survives to.
 * - A build that went live can later be rolled back to old code. So the
 *   heartbeat repeats every BEAT_INTERVAL_MS and block 0132 also requires a
 *   recent one: after a rollback the beats stop and the drop defers.
 *
 * startup_migration_ledger is created by block 0092 and checked by schema
 * validation. MARKER holds the first live beat (inserted once); LAST_BEAT the
 * latest one.
 */
export const SQS_RETIREMENT_MARKER = "0132_sqs_fields_removed_and_serving";
export const SQS_RETIREMENT_LAST_BEAT = "0132_sqs_fields_removed_last_beat";
/** The first live beat must be at least this old before the drop. */
export const SQS_RETIREMENT_DROP_DELAY = "10 minutes";
/** The latest beat must be at most this old before the drop. */
export const SQS_RETIREMENT_BEAT_FRESHNESS = "7 minutes";
export const FIRST_BEAT_DELAY_MS = 5 * 60_000;
export const BEAT_INTERVAL_MS = 2 * 60_000;

/** One heartbeat from a live build without the SQS fields. Idempotent. */
export async function recordSqsFieldsRemovedAndServing(db: MigrationExecutor): Promise<void> {
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
}

/**
 * Starts the heartbeat after listen: the first beat after FIRST_BEAT_DELAY_MS,
 * then every BEAT_INTERVAL_MS. Timers are unref'd, so they never hold the
 * process open, and a failed beat is reported, never thrown.
 */
export function startSqsRetirementHeartbeat(
  beat: () => Promise<void>,
  onError: (err: unknown) => void,
  timers: Pick<typeof globalThis, "setTimeout" | "setInterval"> = globalThis,
): void {
  const safeBeat = () => { beat().catch(onError); };
  const first = timers.setTimeout(() => {
    safeBeat();
    timers.setInterval(safeBeat, BEAT_INTERVAL_MS).unref?.();
  }, FIRST_BEAT_DELAY_MS);
  first.unref?.();
}
