-- Phase 1a: Freshness metadata columns on capabilities
ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS freshness_category TEXT;
ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS data_update_cycle_days INTEGER;
ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS dataset_last_updated TIMESTAMPTZ;

-- Phase 2c: Output hash for staleness detection on test_results
ALTER TABLE test_results ADD COLUMN IF NOT EXISTS output_hash TEXT;
