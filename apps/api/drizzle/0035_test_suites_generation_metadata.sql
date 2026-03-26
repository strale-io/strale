-- Temporal contamination detection for auto-generated regression tests.
-- Records when ground truth was captured relative to capability changes,
-- enabling detection of tests generated with buggy output.
ALTER TABLE "test_suites"
  ADD COLUMN IF NOT EXISTS "generation_capability_updated_at" TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE "test_suites"
  ADD COLUMN IF NOT EXISTS "ground_truth_verified_at" TIMESTAMPTZ DEFAULT NULL;
