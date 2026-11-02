import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0136: async jobs with file output (portfolio plan 2.11) ──────────
//
// Two new, empty tables hanging off `transactions`; no existing table is
// altered, so nothing here takes a lock a request could be waiting on.
//
// - job_files: bytes an async execution produced, served only by a signed,
//   expiring URL and deleted under the 90-day content redaction rule.
// - job_callbacks: one signed completion callback per async execution that
//   asked for one, retried with bounded backoff.
//
// DEC-20260504-B: both tables start empty, so the retention purge's first run
// has no backlog; the purge is bounded per tick regardless (jobs/async-jobs.ts).
export async function runMigration0136_asyncJobFiles(tx: MigrationExecutor): Promise<BlockResult> {
  const startedAt = Date.now();
  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS job_files (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      transaction_id uuid NOT NULL REFERENCES transactions(id),
      user_id uuid NOT NULL REFERENCES users(id),
      name text NOT NULL,
      content_type text NOT NULL,
      size_bytes integer NOT NULL CHECK (size_bytes >= 0),
      sha256 text NOT NULL,
      data bytea NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await tx.execute(sql`CREATE INDEX IF NOT EXISTS job_files_transaction_id_idx ON job_files(transaction_id)`);
  await tx.execute(sql`CREATE INDEX IF NOT EXISTS job_files_created_at_idx ON job_files(created_at)`);
  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS job_callbacks (
      transaction_id uuid PRIMARY KEY REFERENCES transactions(id),
      user_id uuid NOT NULL REFERENCES users(id),
      url text NOT NULL,
      state varchar(16) NOT NULL DEFAULT 'pending'
        CHECK (state IN ('pending', 'delivered', 'failed')),
      attempts integer NOT NULL DEFAULT 0,
      next_attempt_at timestamptz,
      last_status_code integer,
      last_error text,
      created_at timestamptz NOT NULL DEFAULT now(),
      delivered_at timestamptz
    )
  `);
  await tx.execute(sql`CREATE INDEX IF NOT EXISTS job_callbacks_due_idx ON job_callbacks(state, next_attempt_at)`);
  return { block: "0136_asyncJobFiles", outcome: "ensured job_files, job_callbacks", duration_ms: Date.now() - startedAt };
}
