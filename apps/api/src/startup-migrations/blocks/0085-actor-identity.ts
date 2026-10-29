import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0085 — the identity spine (docs/company/MEASUREMENT.md).
 *
 * Creates the `transaction_actors` view: one resolved "who" per transaction,
 * so "is our revenue one customer or twenty" becomes answerable. That question
 * decides whether the business has a demand problem or a conversion problem,
 * and it was unanswerable on 2026-08-15 when two strategic conclusions turned
 * on guessing at it.
 *
 * A VIEW rather than a stored column, deliberately:
 *   - the key is a pure function of columns already on the row, so storing it
 *     creates a second source of truth that can drift from the first;
 *   - a written column can be forgotten at a write site, and one already would
 *     be — the A2A rail proxies to /v1/do without forwarding caller identity;
 *   - `ADD COLUMN ... GENERATED ALWAYS AS ... STORED` rewrites the table and
 *     takes an ACCESS EXCLUSIVE lock on `transactions`, the busiest table in
 *     the system, for no benefit at this row count.
 *
 * DEC-20260504-B (bulk-operation deploy) does not apply: a view creation reads
 * nothing and writes nothing. The supporting index is created CONCURRENTLY
 * outside the migration transaction for the same reason — see below.
 *
 * Privacy: `x402_payer_hash` is already a keyed HMAC of the lowercased address
 * (attribution.ts). No raw wallet address is read, derived, or stored here, and
 * there is deliberately no device/IP fallback — unattributable stays
 * unattributable and is reported as a coverage figure instead.
 */
export async function runMigration0085_actorIdentity(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  // CREATE OR REPLACE so a change to the derivation redeploys cleanly. The
  // version marker lives inside the key: if the rule changes, old and new keys
  // compare unequal rather than silently merging two different actors.
  await tx.execute(sql`
    CREATE OR REPLACE VIEW transaction_actors AS
    SELECT
      t.id,
      t.created_at,
      t.status,
      t.price_cents,
      t.capability_id,
      t.user_id,
      CASE
        WHEN t.user_id IS NOT NULL THEN 'user:v1:' || t.user_id::text
        WHEN t.x402_payer_hash IS NOT NULL THEN 'x402:v1:' || t.x402_payer_hash
        ELSE NULL
      END AS actor_key,
      CASE
        WHEN t.user_id IS NOT NULL THEN 'user'
        WHEN t.x402_payer_hash IS NOT NULL THEN 'x402_wallet'
        ELSE 'unattributed'
      END AS actor_kind
    FROM transactions t
  `);

  // Supporting index for the payer-identity metrics. IF NOT EXISTS keeps the
  // block idempotent across the reboots that re-run every migration.
  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_transactions_payer_created
      ON transactions (x402_payer_hash, created_at)
      WHERE x402_payer_hash IS NOT NULL
  `);

  return {
    block: "0085_actorIdentity",
    outcome: "applied",
    duration_ms: Date.now() - startedAt,
  };
}
