import type { Sql } from "postgres";
import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0125: additional API keys and wallet debit attribution ───────────
export async function runMigration0125_apiKeys(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  // The runner passes the pool, outside a transaction. Reserve one connection:
  // SET on a pooled executor could otherwise affect an unrelated session.
  const client = (tx as MigrationExecutor & { $client?: Sql }).$client;
  const connection = client ? await client.reserve() : null;
  // Every statement here is static text. A reserved postgres-js connection is
  // not a drizzle client (wrapping it fails: it lacks the pool's options), so
  // run the text directly on it.
  const run = (text: string): Promise<unknown> =>
    connection ? connection.unsafe(text) : tx.execute(sql.raw(text));
  try {
    await run(`SET lock_timeout = '3s'`);
    // The pool's 30s statement_timeout could abort a concurrent index build on
    // a large table; lift it on this reserved connection only.
    await run(`SET statement_timeout = 0`);
    await run(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id),
        api_key_hash varchar(255) NOT NULL UNIQUE,
        key_prefix varchar(16) NOT NULL,
        label varchar(100) NOT NULL,
        max_spend_per_hour_cents integer CHECK (max_spend_per_hour_cents >= 0),
        max_spend_total_cents integer CHECK (max_spend_total_cents >= 0),
        created_at timestamptz NOT NULL DEFAULT now(),
        revoked_at timestamptz,
        last_used_at timestamptz
      )
    `);
    await run(`CREATE INDEX IF NOT EXISTS api_keys_prefix_idx ON api_keys(key_prefix)`);
    await run(`CREATE INDEX IF NOT EXISTS api_keys_user_idx ON api_keys(user_id)`);
    // Even ADD COLUMN IF NOT EXISTS takes ACCESS EXCLUSIVE. Avoid the ALTER
    // entirely on later boots, including when the column exists but the FK
    // has not yet been added/validated after an interrupted first boot.
    await run(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'wallet_transactions' AND column_name = 'api_key_id'
        ) THEN
          ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS api_key_id uuid;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'wallet_transactions'::regclass AND conname = 'wallet_transactions_api_key_id_fkey'
        ) THEN
          ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_api_key_id_fkey
            FOREIGN KEY (api_key_id) REFERENCES api_keys(id) NOT VALID;
        END IF;
      END $$
    `);
    // SHARE UPDATE EXCLUSIVE: validation permits ordinary reads and writes.
    await run(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'wallet_transactions'::regclass
            AND conname = 'wallet_transactions_api_key_id_fkey' AND NOT convalidated
        ) THEN
          ALTER TABLE wallet_transactions VALIDATE CONSTRAINT wallet_transactions_api_key_id_fkey;
        END IF;
      END $$
    `);
    // A failed concurrent build can leave an invalid index. Repair only that
    // state before IF NOT EXISTS, otherwise a retry could silently skip it.
    const invalid = await run(`
      SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
      WHERE i.indrelid = 'wallet_transactions'::regclass AND NOT i.indisvalid
        AND c.relname IN ('wallet_transactions_api_key_created_idx', 'wallet_transactions_reference_idx')
    `) as unknown as Array<{ relname: string }>;
    for (const { relname } of invalid) {
      if (relname === "wallet_transactions_api_key_created_idx") {
        await run(`DROP INDEX CONCURRENTLY IF EXISTS wallet_transactions_api_key_created_idx`);
      } else if (relname === "wallet_transactions_reference_idx") {
        await run(`DROP INDEX CONCURRENTLY IF EXISTS wallet_transactions_reference_idx`);
      }
    }
    await run(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS wallet_transactions_api_key_created_idx ON wallet_transactions(api_key_id, created_at)
    `);
    await run(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS wallet_transactions_reference_idx ON wallet_transactions(reference_id)
    `);
  } finally {
    try {
      await run(`RESET statement_timeout`);
      await run(`RESET lock_timeout`);
    } finally {
      connection?.release();
    }
  }
  return { block: "0125_apiKeys", outcome: "ensured additional keys and debit attribution", duration_ms: Date.now() - startedAt };
}
