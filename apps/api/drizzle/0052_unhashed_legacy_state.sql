-- CCO P0 #5: identify the rows migration 0047 marked 'complete' without
-- ever computing a hash for them.
--
-- Migration 0047 backfilled every transaction older than 1 hour with
-- compliance_hash_state = 'complete' on the basis that "the retry worker
-- shouldn't churn over history." But those rows have integrity_hash IS NULL
-- and previous_hash IS NULL — they have no chain link at all. The state
-- name 'complete' is a lie for them: there is nothing to verify against.
--
-- The audit endpoint serves rows in 'complete' state on the assumption a
-- hash exists; verify reports hash_valid: false. Both surfaces leak the
-- inconsistency to anyone who hits a pre-2026 transaction's audit URL.
--
-- This migration introduces a fourth state, 'unhashed_legacy', and moves
-- every affected row to it. Application code (audit.ts, verify.ts) is
-- updated in the same change to:
--
--   audit.ts:  serve the row but stamp the response with audit_chain_state:
--              "unhashed_legacy" + a disclaimer that this row predates the
--              cryptographic chain. Customers with existing 90-day audit
--              URLs continue to resolve, just with honest framing.
--
--   verify.ts: report hash_valid: null + legacy: true + reason. Treated
--              like redacted rows (legitimate state, not tampering).
--
-- The retry worker is unaffected — it already filters strictly on state =
-- 'pending', so it neither picks up legacy rows nor will pick them up after
-- this migration.
--
-- Forward path: when v1.1 ships an explicit "pre-chain history" methodology
-- page, this state will be referenced as the marker for those rows.

-- Update the constraint comment to reflect the new state value. The column
-- is varchar(16) — current values 'pending' / 'complete' / 'failed' /
-- 'unhashed_legacy' all fit.

UPDATE "transactions"
  SET "compliance_hash_state" = 'unhashed_legacy'
  WHERE "compliance_hash_state" = 'complete'
    AND "integrity_hash" IS NULL;

-- Index update: the existing partial index on (state, created_at) WHERE
-- state = 'pending' is unaffected. Add a small partial index on
-- 'unhashed_legacy' so audit.ts can short-circuit-check this state cheaply
-- when serving an audit request.

CREATE INDEX IF NOT EXISTS "transactions_unhashed_legacy_idx"
  ON "transactions" ("compliance_hash_state")
  WHERE "compliance_hash_state" = 'unhashed_legacy';
