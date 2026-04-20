-- SA.2b (F-A-003, F-A-009): per-capability PII classification.
-- Replaces the fragile output-only `detectPersonalData` heuristic in
-- audit-helpers.ts. Declared in manifests, persisted here, read at
-- runtime by buildFullAudit + buildFailureAudit.
--
-- Columns are nullable during backfill. Post-backfill (after every
-- active capability has been classified), a follow-up migration flips
-- processes_personal_data to NOT NULL. See SA.2b.c plan.

ALTER TABLE "capabilities"
  ADD COLUMN IF NOT EXISTS "processes_personal_data" boolean;

ALTER TABLE "capabilities"
  ADD COLUMN IF NOT EXISTS "personal_data_categories" text[] DEFAULT '{}'::text[];

-- Partial index for analytics: which capabilities advertise PII processing?
-- Cheap (hundreds of rows), useful for compliance reviews.
CREATE INDEX IF NOT EXISTS "capabilities_processes_pii_idx"
  ON "capabilities" ("slug")
  WHERE "processes_personal_data" = true;
