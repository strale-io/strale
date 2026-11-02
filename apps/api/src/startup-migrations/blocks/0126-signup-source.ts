import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0126: signup channel attribution ────────────────────────────────
export async function runMigration0126_signupSource(tx: MigrationExecutor): Promise<BlockResult> {
  const startedAt = Date.now();
  await tx.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'signup_src'
      ) THEN
        ALTER TABLE users ADD COLUMN signup_src text;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'users'::regclass AND conname = 'users_signup_src_format'
      ) THEN
        ALTER TABLE users ADD CONSTRAINT users_signup_src_format
          CHECK (signup_src ~ '^[a-z0-9-]{1,64}$') NOT VALID;
      END IF;
    END $$
  `);
  return { block: "0126_signupSource", outcome: "ensured nullable signup channel", duration_ms: Date.now() - startedAt };
}
