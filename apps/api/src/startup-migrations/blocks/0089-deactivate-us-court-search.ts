import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0089 — take `us-court-search` off the shelf.
 *
 * DQ-4 (2026-08-15) recorded the decision to switch this capability off: its
 * CourtListener token had expired and it was returning errors to every caller.
 * Only the x402 flag was ever cleared, so the capability stayed `is_active`
 * and `visible` — on the public `/v1/capabilities` catalogue, priced at €0.15,
 * returning HTTP 500 to anyone who called it. Verified against production
 * 2026-08-17: `CourtListener rejected the token (HTTP 403)`, and the harness
 * has been failing its known-answer suite continuously for at least 48 hours.
 *
 * This block is the decision actually executing. Reversal is a fresh
 * COURTLISTENER_API_TOKEN plus flipping the flags back; the row, its suites
 * and its history are all left intact so that is a one-step change.
 *
 * Idempotent via `WHERE is_active = true` — a re-run on a healthy DB is a
 * no-op, and it deliberately does NOT re-deactivate a capability an operator
 * has since switched back on, because it only matches rows still carrying the
 * broken state.
 */
export const US_COURT_SEARCH_DEACTIVATION_REASON =
  "CourtListener API token rejected (HTTP 403) — deactivated per DQ-4; reversible by restoring COURTLISTENER_API_TOKEN";

export async function runMigration0089_deactivateUsCourtSearch(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  const res = await tx.execute(sql`
    UPDATE capabilities
    SET is_active = false,
        visible = false,
        x402_enabled = false,
        deactivation_reason = ${US_COURT_SEARCH_DEACTIVATION_REASON}
    WHERE slug = 'us-court-search'
      AND is_active = true
  `);
  const affected = (res as { count?: number }).count ?? 0;

  return {
    block: "0089_deactivateUsCourtSearch",
    outcome:
      affected === 0
        ? "no change (us-court-search already inactive)"
        : "us-court-search deactivated — was serving HTTP 500 on an expired CourtListener token",
    rows_affected: affected,
    duration_ms: Date.now() - startedAt,
  };
}
