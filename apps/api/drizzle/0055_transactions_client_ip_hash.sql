-- MED-10: Free-tier rate-limit reads from audit_trail->'request_context'->>'ipHash'
-- (do.ts:1022). The audit recommended promoting to a top-level column for
-- atomicity (the audit_trail UPDATE on async paths can lag the INSERT, leaving
-- a window where the row exists but the rate-limit query can't see its IP) and
-- query-planner sanity (JSONB extract → varchar comparison can't use a native
-- index efficiently; a bare column with a partial index is order-of-magnitude
-- cheaper).
--
-- This migration:
--   1. Adds client_ip_hash varchar(16) NULL to transactions.
--   2. Backfills it from audit_trail->'request_context'->>'ipHash' for free-tier
--      rows from today (CURRENT_DATE → NOW()). The rate-limit query window is
--      `created_at >= CURRENT_DATE`, so backfilling exactly that window keeps
--      the deploy seamless — pre-deploy free-tier rows from today still count
--      toward the per-IP daily limit.
--   3. Adds a partial index matching the rate-limit query's WHERE shape.
--
-- After this migration ships and the corresponding code change lands, the
-- rate-limit query reads from the column. The JSONB write at audit-build time
-- continues so the audit body remains complete; the column is the canonical
-- source for the rate-limit decision only.

ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "client_ip_hash" varchar(16);

-- Backfill today's free-tier rows so the per-day rate-limit window stays
-- accurate across deploy. Only touches rows where the column would otherwise
-- be NULL and the JSONB has the value.
UPDATE "transactions"
   SET "client_ip_hash" = "audit_trail"->'request_context'->>'ipHash'
 WHERE "created_at" >= CURRENT_DATE
   AND "is_free_tier" = true
   AND "user_id" IS NULL
   AND "client_ip_hash" IS NULL
   AND "audit_trail"->'request_context'->>'ipHash' IS NOT NULL;

-- Partial index matching the rate-limit query shape:
--   WHERE created_at >= CURRENT_DATE
--     AND user_id IS NULL
--     AND is_free_tier = true
--     AND client_ip_hash = $1
-- The index is (client_ip_hash, created_at) WHERE is_free_tier AND user_id IS NULL.
-- The created_at filter is then a range scan within the IP's bucket — cheaper
-- than the prior JSONB-extract Seq Scan with no usable index.
CREATE INDEX IF NOT EXISTS "transactions_free_tier_ip_hash_idx"
  ON "transactions" ("client_ip_hash", "created_at")
  WHERE "is_free_tier" = true AND "user_id" IS NULL;
