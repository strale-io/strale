import type { Sql } from "postgres";
import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0127: repair integrity index after schema bootstrap ─────────────
// Block 0030 skips when integrity_hash already exists (as after drizzle push).
// Ensure the index independently, including on partially restored databases.
export async function runMigration0127_integrityHashIndex(tx: MigrationExecutor): Promise<BlockResult> {
  const startedAt = Date.now();
  // Inspect the catalogue before any DDL: even IF NOT EXISTS takes SHARE.
  const check = await tx.execute(sql`
    SELECT i.indisvalid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
    WHERE i.indrelid = 'transactions'::regclass
      AND c.relname = 'transactions_integrity_hash_idx'
  `);
  const rows = Array.isArray(check) ? check : (check as { rows?: unknown[] })?.rows ?? [];
  const index = rows[0] as { indisvalid: boolean } | undefined;
  if (index?.indisvalid) {
    return { block: "0127_integrityHashIndex", outcome: "skipped (index already valid)", duration_ms: Date.now() - startedAt };
  }
  // Match 0125's reserved-session pattern; it has no shared helper.
  const client = (tx as MigrationExecutor & { $client?: Sql }).$client;
  const connection = client ? await client.reserve() : null;
  const run = (text: string): Promise<unknown> =>
    connection ? connection.unsafe(text) : tx.execute(sql.raw(text));
  try {
    await run(`SET lock_timeout = '3s'`);
    await run(`SET statement_timeout = 0`);
    if (index) await run(`DROP INDEX CONCURRENTLY IF EXISTS "transactions_integrity_hash_idx"`);
    await run(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "transactions_integrity_hash_idx" ON "transactions" ("integrity_hash")`);
  } finally {
    try {
      try { await run(`RESET statement_timeout`); }
      finally { await run(`RESET lock_timeout`); }
    } finally {
      connection?.release();
    }
  }
  return {
    block: "0127_integrityHashIndex",
    outcome: "ensured transactions integrity hash index",
    duration_ms: Date.now() - startedAt,
  };
}
