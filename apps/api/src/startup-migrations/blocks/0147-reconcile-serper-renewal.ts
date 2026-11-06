import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0147 — reconcile the Serper renewal into the vendor control tower
 * (2026-11-06).
 *
 * Petter renewed Serper on 2026-11-05 (DQ-44, BUDGET.md): USD 62.50, 50,000
 * credits valid six months, to about 2027-05-05; the vendor dashboard read a
 * balance of 97,487 right after the top-up. The tower's row was never told:
 * it still carries the May 2026 pack seeded by block 0111 (expires
 * 2026-11-08), so the morning report raises "CRITICAL serper: prepaid
 * allowance expires in 2 day(s)" and, from 8 November, would report a lapsed
 * allowance every morning for a vendor that is paid up. Serper exposes no
 * balance API (vendor-morning-status.ts: reconcile a top-up from its
 * dashboard; synthetic paid probes are prohibited), so the dashboard reading
 * recorded in the decision queue is the evidence and this block is the
 * explicit operator reconciliation.
 *
 * What is written, conservatively:
 * - only the new pack is counted (50,000). Whether the 47,487 left from the
 *   May pack carry past 8 November is not known; counting them would let the
 *   counter overstate the balance if they lapse;
 * - 1,000 queries are charged up front as a margin for the usage between the
 *   purchase and this deploy, which the local counter attributed to the old
 *   pack and nobody measured against the new one. Real Serper use is a few
 *   hundred queries a week, so the margin errs low on the balance;
 * - expiry 2027-05-05, the six-month validity stated at purchase.
 *
 * Run policy "once", and guarded on the old expiry: if a later
 * reconciliation (or another top-up) has already moved the row, this is a
 * no-op. One row; no bulk operation (DEC-20260504-B). Only strings and
 * integers are bound; the timestamps are cast in SQL (DEC-20260504-A).
 */
export const SERPER_RENEWAL = {
  provider: "serper",
  oldExpiresAt: "2026-11-08T00:00:00Z",
  newExpiresAt: "2027-05-05T00:00:00Z",
  includedUnits: 50000,
  marginUnits: 1000,
  purchaseDate: "2026-11-05",
} as const;

export async function runMigration0147_reconcileSerperRenewal(tx: MigrationExecutor): Promise<BlockResult> {
  const startedAt = Date.now();
  const r = SERPER_RENEWAL;
  const metadata = JSON.stringify({
    counter_is_estimate: true,
    purchase_date: r.purchaseDate,
    reconciled_by: "startup-migration 0147",
    evidence: "DQ-44 answer: Serper billing page 2026-11-05, balance 97,487 after top-up",
    prior_pack_carryover: "unknown; not counted",
    margin_units_for_unmeasured_usage: r.marginUnits,
  });
  const res = await tx.execute(sql`
    UPDATE vendor_accounts
       SET included_units = ${r.includedUnits},
           used_units = ${r.marginUnits},
           remaining_units = ${r.includedUnits - r.marginUnits},
           expires_at = ${r.newExpiresAt}::timestamptz,
           metadata = COALESCE(metadata, '{}'::jsonb) || ${metadata}::jsonb
     WHERE provider_name = ${r.provider}
       AND monitor_mode = 'internal_counter'
       AND expires_at = ${r.oldExpiresAt}::timestamptz
  `);
  const rows = (res as { count?: number }).count ?? 0;
  return {
    block: "0147_reconcileSerperRenewal",
    outcome: rows === 0 ? "no change (Serper row already reconciled or absent)" : "Serper renewal reconciled into the vendor control tower",
    rows_affected: rows,
    duration_ms: Date.now() - startedAt,
  };
}
