import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0087 — give customers back the history a content redaction took.
 *
 * The 90-day customer-content sweep in `data-retention.ts` set BOTH
 * `redacted_at` and `deleted_at`. Only the first was correct. Per schema.ts,
 * `deleted_at` means "the row is logically gone", and every customer read path
 * filters on it: the transaction list, transaction detail, the audit-record
 * endpoint behind every shareable audit URL, and the A2A task lookup. So a
 * redaction that was supposed to zero the payload and keep the Art. 30
 * skeleton readable for 1095 days instead made the whole row vanish from the
 * API at 90 — for Audit Trail, a product we sell.
 *
 * Under the old narrow selector this hit only personal-data capabilities.
 * Widening it to all transactions on 2026-08-15 made it universal. A separate
 * bug (every loop read `.rowCount`, which this driver never sets, so each
 * sweep stopped after one batch) capped the damage at roughly one batch per
 * run — which is the only reason this is a repair and not an incident.
 *
 * The repair is narrow by construction: it clears `deleted_at` ONLY where the
 * row carries this sweep's exact signature — a retention content-redaction
 * reason, `redacted_at` set, and `deleted_at` set. It cannot touch a
 * user-requested erasure (`deletion_reason = 'user_request'`), and it cannot
 * touch the 1095-day hard-retention purge, which writes `'retention_purge'`
 * and where `deleted_at` is correct. Nothing is un-redacted: the payload
 * columns stay zeroed, permanently. Only the row's visibility comes back.
 *
 * DEC-20260504-B: this is an UPDATE of a few thousand rows setting one column
 * to NULL, run once inside the migration transaction. No payload is written,
 * nothing is deleted, and the WHERE clause is self-limiting — after the first
 * successful run it matches nothing, which is what makes re-running on every
 * boot a no-op.
 */
export async function runMigration0087_unhideRedactedRows(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  const res = await tx.execute(sql`
    UPDATE transactions
    SET deleted_at = NULL
    WHERE deleted_at IS NOT NULL
      AND redacted_at IS NOT NULL
      AND deletion_reason IN ('pii_retention_purge', 'content_retention_purge')
  `);
  const restored = (res as { count?: number }).count ?? 0;

  // Bring the old reason string in line with what the column now means, so an
  // operator reading `deletion_reason` is not told a row was deleted for PII
  // when it was redacted for content. Chain verification buckets both under
  // retention (routes/verify.ts isRetentionReason), so this is cosmetic to the
  // public response and load-bearing for whoever reads the table directly.
  const renamed = await tx.execute(sql`
    UPDATE transactions
    SET deletion_reason = 'content_retention_purge'
    WHERE deletion_reason = 'pii_retention_purge'
  `);
  const renamedCount = (renamed as { count?: number }).count ?? 0;

  return {
    block: "0087_unhideRedactedRows",
    outcome:
      restored === 0
        ? "no change (no content-redacted rows were marked deleted)"
        : `${restored} redacted transactions made visible again to their owners; payload stays zeroed`,
    rows_affected: restored + renamedCount,
    duration_ms: Date.now() - startedAt,
  };
}
