-- Add deactivation_reason column for tracking why capabilities were deactivated
ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS deactivation_reason TEXT DEFAULT NULL;
