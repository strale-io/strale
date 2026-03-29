-- 0036: x402 scalable gateway — DB-driven capability exposure
-- Adds x402 columns to capabilities, solutions, and transactions tables
-- so adding a new capability to x402 requires only a DB UPDATE, not a deploy.

-- ─── Capabilities: x402 exposure flags ──────────────────────────────────────
ALTER TABLE capabilities
  ADD COLUMN IF NOT EXISTS x402_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE capabilities
  ADD COLUMN IF NOT EXISTS x402_price_usd DECIMAL(10, 4);
ALTER TABLE capabilities
  ADD COLUMN IF NOT EXISTS x402_method VARCHAR(4) NOT NULL DEFAULT 'POST';

-- ─── Solutions: x402 exposure flags ─────────────────────────────────────────
ALTER TABLE solutions
  ADD COLUMN IF NOT EXISTS x402_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE solutions
  ADD COLUMN IF NOT EXISTS x402_price_usd DECIMAL(10, 4);

-- ─── Transactions: x402 payment tracking ────────────────────────────────────
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) NOT NULL DEFAULT 'wallet';
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS x402_settlement_id TEXT;
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS price_usd DECIMAL(10, 4);

-- ─── Partial indexes for fast x402 lookups ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_capabilities_x402
  ON capabilities (slug) WHERE x402_enabled = true AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_solutions_x402
  ON solutions (slug) WHERE x402_enabled = true AND is_active = true;
