-- Decouple scheduled-testing eligibility from external_cost_cents.
--
-- Before this PR, the test scheduler's dispatch query filtered on
-- `test_suites.external_cost_cents = 0` to decide what to run hourly.
-- That coupled billing data (per-call cost) to a scheduling signal,
-- which made the May 2026 Haiku token spike (PRs #84/#85/#86/#87)
-- structurally possible: a compound-PR pattern (cadence flip + deferred
-- cost-bump) silently turned billing-data lag into a scheduling
-- regression.
--
-- PR A: introduce `test_suites.scheduled_testing_eligible BOOLEAN NOT
-- NULL DEFAULT FALSE`. The hourly dispatch filters on this column going
-- forward. `external_cost_cents` is billing-only. Backfill preserves
-- current behavior exactly: every row with cost = 0 today gets
-- eligible = TRUE; every row with cost > 0 stays at the default FALSE
-- (matches DEC-20260503-B doctrine: paid caps have no scheduled
-- testing). Same cap set tested before and after the migration.
--
-- Startup block 0066 (in startup-migrations.ts) re-derives eligibility
-- from cost at every boot as an interim bridge. PR B will force
-- explicit declarations at INSERT sites and remove 0066.

-- Add scheduled_testing_eligible column
ALTER TABLE test_suites
  ADD COLUMN scheduled_testing_eligible BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: preserve current behavior exactly
UPDATE test_suites
   SET scheduled_testing_eligible = TRUE
 WHERE external_cost_cents = 0;

-- Post-condition: backfill produced the same set the old dispatch would select
DO $$
DECLARE
  free_count INT;
  eligible_count INT;
BEGIN
  SELECT COUNT(*) INTO free_count FROM test_suites WHERE external_cost_cents = 0;
  SELECT COUNT(*) INTO eligible_count FROM test_suites WHERE scheduled_testing_eligible = TRUE;
  IF free_count != eligible_count THEN
    RAISE EXCEPTION 'Backfill mismatch: % free caps but % eligible (expected equal)', free_count, eligible_count;
  END IF;
END $$;
