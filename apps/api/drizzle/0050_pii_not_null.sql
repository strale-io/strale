-- SA.2b.d: flip capabilities.processes_personal_data to NOT NULL after
-- full backfill across SA.2b.b (top 15), SA.2b.c (260 non-orphan slugs),
-- and SA.2b.d Phase 1 (32 orphans). All 307 rows have a non-NULL value
-- at migration time.
--
-- Adds DEFAULT false for direct-SQL insert paths (seed.ts, admin create,
-- tests) that don't explicitly declare PII status. The manifest-driven
-- onboard pipeline still REQUIRES processes_personal_data via the gate
-- in scripts/onboard.ts:validateManifest() — the DB default is a
-- belt-and-suspenders safety net for non-manifest inserts, not a bypass
-- of the onboarding contract.
--
-- After this migration, the runtime fallback to detectPersonalData() in
-- audit-helpers.ts is dead code — removed in the paired commit (SA.2b.d
-- C2). F-A-003 + F-A-009 are closed.

ALTER TABLE "capabilities"
  ALTER COLUMN "processes_personal_data" SET DEFAULT false;

ALTER TABLE "capabilities"
  ALTER COLUMN "processes_personal_data" SET NOT NULL;
