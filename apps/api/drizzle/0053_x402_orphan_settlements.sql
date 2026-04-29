-- CCO P0 #12: x402 settlement-without-record orphan log.
--
-- Problem: x402-gateway-v2 settles the customer's USDC payment on Base
-- (irreversible) BEFORE attempting to insert the transaction row. The
-- insert was fire-and-forget — if it failed (DB blip, schema constraint,
-- briefly-offline DB), the customer paid us, the on-chain settlement
-- happened, and we had zero record. No alarm, no record to reconcile,
-- no path to manual recovery without parsing the Base mempool.
--
-- Fix in code: recordX402Transaction is now awaited. When the primary
-- INSERT into transactions fails, the route handler writes to this
-- orphan table instead, capturing enough state for manual or worker
-- reconciliation. A row in this table means: "we received a paid
-- request, the on-chain settlement succeeded, but the transactions
-- INSERT failed."
--
-- Reconciliation playbook (operator):
--   1. SELECT * FROM x402_orphan_settlements WHERE reconciled_at IS NULL.
--   2. For each row, verify on-chain via Base block explorer using
--      settlement_id.
--   3. Manually re-create the transactions row with the captured args,
--      OR refund the customer at the original payer_address.
--   4. UPDATE x402_orphan_settlements SET reconciled_at = NOW(),
--      reconciliation_status = '<chosen_action>'.
--
-- v1.1: add a worker that auto-reconciles obvious cases (recreate the
-- transactions row from raw_args JSONB).

CREATE TABLE IF NOT EXISTS "x402_orphan_settlements" (
  "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The on-chain settlement identifier returned by the x402 facilitator.
  -- Should always be present — settlement preceded our INSERT attempt.
  "settlement_id"         text NOT NULL,
  -- What the customer paid for. Either capability or solution. Both
  -- nullable because the failed INSERT may have left us without slug
  -- resolution (e.g., cache miss + DB unavailable). raw_args is the
  -- ground truth.
  "capability_slug"       text,
  "solution_slug"         text,
  -- Payer address (Base wallet) and price for refund flow if we can't
  -- recreate the transactions row.
  "payer_address"         text,
  "price_usd"             decimal(10, 4) NOT NULL,
  "price_cents"           integer NOT NULL,
  -- Full RecordX402Args payload as it was at the time of failure, so
  -- a worker (or operator) can recreate the transactions row exactly.
  "raw_args"              jsonb NOT NULL,
  -- Why the primary INSERT failed (logError captured upstream; this is
  -- a short summary for operator visibility).
  "failure_reason"        text NOT NULL,
  "created_at"            timestamp with time zone NOT NULL DEFAULT NOW(),
  -- Reconciliation lifecycle.
  "reconciled_at"         timestamp with time zone,
  "reconciliation_status" text -- 'recreated' | 'refunded' | 'duplicate' | 'no_action'
);

-- Operator queries: WHERE reconciled_at IS NULL ORDER BY created_at.
CREATE INDEX IF NOT EXISTS "x402_orphan_settlements_unreconciled_idx"
  ON "x402_orphan_settlements" ("created_at")
  WHERE "reconciled_at" IS NULL;

-- Reconciliation by settlement_id (operator looks up "did we record this
-- on-chain settlement at all?").
CREATE INDEX IF NOT EXISTS "x402_orphan_settlements_settlement_id_idx"
  ON "x402_orphan_settlements" ("settlement_id");
