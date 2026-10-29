import { sql } from "drizzle-orm";
import type { MigrationExecutor } from "./types.js";

/**
 * Expand/contract guard for block 0132 (H7d). Code deployed before that block
 * selects whole capability rows through drizzle, which names the SQS columns
 * explicitly; dropping them while such an instance still serves breaks its
 * catalogue and /v1/do queries. So the drop waits for proof that code without
 * those fields has served: this marker, written after listen by every build
 * that carries block 0132, and at least DROP_DELAY old (Railway drains the
 * previous deployment once the new one is healthy).
 */
export const SQS_RETIREMENT_MARKER = "0132_sqs_fields_removed_and_serving";
export const SQS_RETIREMENT_DROP_DELAY = "10 minutes";

/** Records, once, that this build (without the SQS fields) is serving. Idempotent. */
export async function recordSqsFieldsRemovedAndServing(db: MigrationExecutor): Promise<void> {
  // startup_migration_ledger is created by block 0092 and checked by schema validation.
  await db.execute(sql`
    INSERT INTO startup_migration_ledger (block, rows_affected)
    VALUES (${SQS_RETIREMENT_MARKER}, 0)
    ON CONFLICT (block) DO NOTHING
  `);
}
