ALTER TABLE capability_health ADD COLUMN IF NOT EXISTS last_failure_category VARCHAR(30) DEFAULT 'unknown';
