-- F-0-009 Stage 2: move integrity hashing off the request hot path.
--
-- Before: storeIntegrityHash was called as a fire-and-forget
-- `.catch(() => {})` at six sites in do.ts. Failures vanished, integrity
-- chain gaps were invisible, and the three DB round-trips it performs
-- added latency to every /v1/do response.
--
-- After: every new transaction lands with integrity_hash_status = 'pending'
-- and NO hash. A background job (jobs/integrity-hash-retry.ts) wakes every
-- 30s, picks up pending rows older than 10s, computes the hash, and sets
-- status = 'complete'. The /v1/audit/:id endpoint refuses to serve a
-- transaction whose status is still 'pending' (returns 202 + Retry-After).
--
-- Status values: 'pending' | 'complete' | 'failed'
--   pending:  newly created, hash not yet computed
--   complete: hash computed and chained
--   failed:   retry worker exhausted attempts; alert fires; human intervention

ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "integrity_hash_status" varchar(16) NOT NULL DEFAULT 'pending';

-- Backfill existing rows: anything with an existing integrity_hash is
-- 'complete'; everything else was implicitly fire-and-forget and may or may
-- not have a hash. We mark them 'complete' even if integrity_hash is NULL
-- so the retry worker doesn't try to process historical rows (it would
-- churn against transactions that are too old to still be in any realistic
-- retry window).
UPDATE "transactions"
  SET "integrity_hash_status" = 'complete'
  WHERE "integrity_hash_status" = 'pending'
    AND "created_at" < NOW() - INTERVAL '1 hour';

-- Index the retry worker's query shape: WHERE status = 'pending' AND created_at < N.
CREATE INDEX IF NOT EXISTS "transactions_integrity_hash_status_idx"
  ON "transactions" ("integrity_hash_status", "created_at")
  WHERE "integrity_hash_status" = 'pending';
