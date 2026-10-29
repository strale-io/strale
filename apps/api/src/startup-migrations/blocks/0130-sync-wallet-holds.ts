import type { Sql } from "postgres";
import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0130: sync holds reuse the durable reservation state machine ────
export async function runMigration0130_syncWalletHolds(tx: MigrationExecutor): Promise<BlockResult> {
  const startedAt = Date.now();
  await tx.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'wallet_reservations' AND column_name = 'mode') THEN
        PERFORM set_config('lock_timeout', '3s', true);
        ALTER TABLE wallet_reservations ADD COLUMN mode varchar(8) NOT NULL DEFAULT 'debit';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'wallet_reservations' AND column_name = 'api_key_id') THEN
        PERFORM set_config('lock_timeout', '3s', true);
        ALTER TABLE wallet_reservations ADD COLUMN api_key_id uuid;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'transactions' AND column_name = 'x402_execution_attempts') THEN
        PERFORM set_config('lock_timeout', '3s', true);
        ALTER TABLE transactions ADD COLUMN x402_execution_attempts jsonb;
      END IF;
    END $$
  `);
  // Inspect the catalogue before any DDL, as block 0127 does: even
  // CREATE INDEX CONCURRENTLY IF NOT EXISTS takes a lock on every boot.
  const check = await tx.execute(sql`
    SELECT i.indisvalid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
    WHERE i.indrelid = 'transactions'::regclass
      AND c.relname = 'transactions_x402_execution_attempt_hash_idx'
  `);
  const checkRows = Array.isArray(check) ? check : (check as { rows?: unknown[] })?.rows ?? [];
  if ((checkRows[0] as { indisvalid: boolean } | undefined)?.indisvalid) {
    return { block: "0130_syncWalletHolds", outcome: "ensured columns; index already valid", duration_ms: Date.now() - startedAt };
  }
  // The runner invokes blocks outside a transaction, as for block 0125.
  // Index only the new nullable metadata; no historical rows are rewritten.
  const client = (tx as MigrationExecutor & { $client?: Sql }).$client;
  const connection = client ? await client.reserve() : null;
  const run = (text: string): Promise<unknown> =>
    connection ? connection.unsafe(text) : tx.execute(sql.raw(text));
  try {
    await run(`SET lock_timeout = '3s'`);
    await run(`SET statement_timeout = 0`);
    const invalid = await run(`
      SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
      WHERE i.indrelid = 'transactions'::regclass AND NOT i.indisvalid
        AND c.relname = 'transactions_x402_execution_attempt_hash_idx'
    `) as unknown as Array<{ relname: string }>;
    if (invalid.length) await run(`DROP INDEX CONCURRENTLY IF EXISTS transactions_x402_execution_attempt_hash_idx`);
    await run(`CREATE INDEX CONCURRENTLY IF NOT EXISTS transactions_x402_execution_attempt_hash_idx
      ON transactions ((x402_execution_attempts->>'paymentHash')) WHERE x402_execution_attempts IS NOT NULL`);
  } finally {
    try {
      await run(`RESET statement_timeout`);
      await run(`RESET lock_timeout`);
    } finally {
      connection?.release();
    }
  }
  return { block: "0130_syncWalletHolds", outcome: "ensured sync reservation hold mode and key attribution", duration_ms: Date.now() - startedAt };
}
