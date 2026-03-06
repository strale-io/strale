-- Part 2: Regression baseline columns on test_suites
ALTER TABLE test_suites ADD COLUMN IF NOT EXISTS baseline_output JSONB DEFAULT NULL;
ALTER TABLE test_suites ADD COLUMN IF NOT EXISTS baseline_captured_at TIMESTAMPTZ DEFAULT NULL;
