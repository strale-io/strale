-- Cert-audit G1 (GDPR Art. 17 right to erasure):
-- deleted_at + deletion_reason on users. The DELETE /v1/auth/me handler
-- redacts the row in place rather than physically deleting it, because
-- transactions reference the user_id and participate in the audit hash
-- chain (DEC-20260428-B). Anonymisation in place satisfies Art. 17 while
-- preserving Art. 30 records-of-processing.
--
-- Cert-audit G7 (ToS acceptance proof):
-- tos_accepted_at + tos_version capture which Terms revision the user
-- agreed to at signup, so we can rebut disputes about contract formation.
-- Backfilled to the user's createdAt for legacy rows; new rows must
-- supply both at INSERT.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS "deletion_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "tos_accepted_at" TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS "tos_version" VARCHAR(32);

-- Backfill ToS acceptance to createdAt for existing accounts (treat
-- continued use as implicit acceptance of the in-force version at signup).
-- New signups will set these columns explicitly via the auth handler.
UPDATE "users"
   SET "tos_accepted_at" = "created_at",
       "tos_version" = 'pre-2026-04-30-implicit'
 WHERE "tos_accepted_at" IS NULL;

-- Index erasures so retention/reporting jobs can find them quickly.
CREATE INDEX IF NOT EXISTS "users_deleted_at_idx"
  ON "users" ("deleted_at")
  WHERE "deleted_at" IS NOT NULL;
