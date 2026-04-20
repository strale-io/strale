-- SA.2a (DEC-20260420-A): soft-delete infrastructure for the transactions table.
--
-- Adds four additive, NULL-permissive columns so DELETE /v1/transactions/:id
-- (implemented in SA.2a.2 on top of this migration) can soft-delete a row
-- without breaking the integrity-hash chain or the retention window.
--
-- Columns:
--   transactions.deleted_at       — soft-delete marker. NULL = live row.
--                                   When set, the row is hidden from
--                                   standard read paths (enforced by
--                                   SA.2a.2a/2b, not this migration).
--   transactions.redacted_at      — set when input/output/audit_trail
--                                   have been zeroed in-place. Always
--                                   ≥ deleted_at. Two-step deletion:
--                                   mark → redact.
--   transactions.deletion_reason  — short string tag. Expected values:
--                                   'user_request' | 'retention_expired'
--                                   | 'admin'. No CHECK constraint —
--                                   future tags must not require
--                                   another migration; validation lives
--                                   in app code.
--   transaction_quality.deleted_at — cascade marker. When the parent
--                                    transaction is soft-deleted, the
--                                    matching child row inherits the
--                                    same timestamp. Kept on the child
--                                    rather than cascade-deleting so
--                                    quality aggregates remain
--                                    reproducible.
--
-- Does NOT add legal_hold — already exists from an earlier migration
-- (declared at schema.ts:209). SA.2a.2 reads the existing column to
-- short-circuit DELETE with 423 on held rows.
--
-- Partial indexes on (id) WHERE deleted_at IS NULL give the planner a
-- smaller index for the common live-rows-only scan. Marginal value
-- today (deletions expected to be <1% of rows) but cheap to add now
-- and avoids a future ALTER under load.
--
-- No data migration. All existing rows keep NULL for every new column.
-- Safe to apply before SA.2a.2 ships because the columns are additive
-- and reads don't enumerate them until that commit.

ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;

ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "redacted_at" timestamp with time zone;

ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "deletion_reason" text;

ALTER TABLE "transaction_quality"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "transactions_deleted_at_null_idx"
  ON "transactions" ("id")
  WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "transaction_quality_deleted_at_null_idx"
  ON "transaction_quality" ("transaction_id")
  WHERE "deleted_at" IS NULL;
