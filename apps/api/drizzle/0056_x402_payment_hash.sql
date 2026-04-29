-- Cert-audit C9: x402 idempotency double-charge prevention.
--
-- Adds a hash of the X-Payment header on every x402-paid row, with a
-- partial unique index so two requests with the same payment header
-- can't each become a recorded charge.
--
-- The dedup window is the row's lifetime in the table — replays after
-- the row is purged by data-retention will be re-charged. That's
-- acceptable because the facilitator's own nonce-tracking should have
-- the longer window; this index is the second line of defence.

ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "x402_payment_hash" VARCHAR(32);

CREATE UNIQUE INDEX IF NOT EXISTS "transactions_x402_payment_hash_unique"
  ON "transactions" ("x402_payment_hash")
  WHERE "x402_payment_hash" IS NOT NULL;
