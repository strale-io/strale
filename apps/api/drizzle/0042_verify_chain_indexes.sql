-- Index for hash chain verification walk (follow previous_hash backward)
CREATE INDEX IF NOT EXISTS idx_transactions_previous_hash ON transactions (previous_hash);
