-- Activation funnel tracking for drip email sequence
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_transaction_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS activation_email_stage INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS activation_completed_at TIMESTAMPTZ DEFAULT NULL;
