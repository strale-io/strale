-- Trust metadata columns: raw score, trend, freshness, and timestamps
-- These columns enable "one score everywhere" by caching all trust data
-- that was previously computed only at request time by trust endpoints.

ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS matrix_sqs_raw NUMERIC(5,1);
ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS trend VARCHAR(20) DEFAULT 'stable';
ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS freshness_level VARCHAR(20) DEFAULT 'fresh';
ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMPTZ;
ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS freshness_decayed_at TIMESTAMPTZ;
