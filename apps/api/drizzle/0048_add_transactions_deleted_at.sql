-- F-A-001: support GDPR Article 17 right-to-erasure via
-- DELETE /v1/transactions/:id. Soft-delete marker only — when non-null,
-- the route handler redacts input/output/audit_trail to a
-- { deleted: true, deleted_at: … } marker but preserves integrity_hash
-- and previous_hash so the tamper-evidence chain stays intact. The
-- chain walker trusts the stored integrity_hash for deleted rows
-- rather than recomputing (the originals are gone by design).
--
-- Related code:
--   routes/transactions.ts     DELETE handler + redacted GET response
--   routes/verify.ts           walker handles deleted rows
--   routes/audit.ts            410 Gone on deleted rows
--   lib/schema-validator.ts    adds deleted_at to REQUIRED_COLUMNS

ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;

-- Partial index for filtering deleted rows out of user-facing lists.
-- Most queries don't need deleted rows; a partial index keeps the index
-- small (only a tiny fraction of rows are expected to be deleted).
CREATE INDEX IF NOT EXISTS "transactions_deleted_at_idx"
  ON "transactions" ("deleted_at")
  WHERE "deleted_at" IS NOT NULL;
