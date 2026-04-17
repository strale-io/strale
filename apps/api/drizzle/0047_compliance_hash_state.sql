-- F-0-009 Stage 2: move integrity hashing off the request hot path.
--
-- Before: storeIntegrityHash was called as a fire-and-forget
-- `.catch(() => {})` at six sites in do.ts. Failures vanished, integrity
-- chain gaps were invisible, and the three DB round-trips it performs
-- added latency to every /v1/do response.
--
-- After: every new transaction lands with compliance_hash_state = 'pending'
-- and NO hash. A background job (jobs/integrity-hash-retry.ts) wakes every
-- 30s, picks up pending rows older than 10s, computes the hash, and sets
-- state = 'complete'. The /v1/audit/:id endpoint refuses to serve a
-- transaction whose state is still 'pending' (returns 202 + Retry-After).
--
-- Column naming: this is NOT `integrity_hash_status`. Another workflow on
-- prod (untracked, Retool/manual) owns `integrity_hash_status` and writes
-- 'customer' / 'test' tags to it for analytics. Using that column would
-- race that workflow and create gaps in Phase C's tamper-evidence chain.
-- See PHASE_C_COLUMN_INVESTIGATION.md for the full trace.
--
-- State values: 'pending' | 'complete' | 'failed'
--   pending:  newly created, hash not yet computed
--   complete: hash computed and chained
--   failed:   retry worker exhausted attempts; alert fires; human intervention

ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "compliance_hash_state" varchar(16) NOT NULL DEFAULT 'pending';

-- Backfill existing rows: the column is brand new; every historical row
-- currently sits at 'pending' from the column default. Mark rows older
-- than 1h as 'complete' so the retry worker doesn't churn over history.
UPDATE "transactions"
  SET "compliance_hash_state" = 'complete'
  WHERE "compliance_hash_state" = 'pending'
    AND "created_at" < NOW() - INTERVAL '1 hour';

-- Index the retry worker's query shape: WHERE state = 'pending' AND created_at < N.
CREATE INDEX IF NOT EXISTS "transactions_compliance_hash_state_idx"
  ON "transactions" ("compliance_hash_state", "created_at")
  WHERE "compliance_hash_state" = 'pending';
