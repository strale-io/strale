import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0128: manifest text sync checkpoint ─────────────────────────────
export async function runMigration0128_manifestTextHash(tx: MigrationExecutor): Promise<BlockResult> {
  const startedAt = Date.now();
  await tx.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'capabilities' AND column_name = 'manifest_text_hash'
      ) THEN
        -- Transaction-local even when the runner uses a pooled connection.
        PERFORM set_config('lock_timeout', '3s', true);
        ALTER TABLE capabilities ADD COLUMN manifest_text_hash text;
      END IF;
    END $$
  `);
  return { block: "0128_manifestTextHash", outcome: "ensured nullable manifest text hash", duration_ms: Date.now() - startedAt };
}
