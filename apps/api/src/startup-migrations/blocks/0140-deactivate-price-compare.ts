import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0140 — take `price-compare` off the shelf (2026-10-30).
 *
 * Since PR #786 (2026-10-28) capabilities with `acquisition_method:
 * public_page_read` check robots.txt before fetching their own source.
 * price-compare fetches https://www.pricerunner.<tld>/search?q=..., which
 * redirects to /results?q=..., and PriceRunner's robots.txt carries
 * `Disallow: /results` for `User-agent: *`. Every call now fails with
 * "Source unavailable to Strale: www.pricerunner.<tld>'s robots.txt
 * disallows ...". A registered account's call failed on 2026-10-29, and there
 * was no non-harness revenue in 14 days. Under DEC-20261023-A a source whose
 * robots.txt forbids the read is not read, so the capability cannot work and
 * must not be listed for sale.
 *
 * The executor is also in the DEACTIVATED map (auto-register.ts), whose boot
 * sync clears the three flags. This block is the same decision executed
 * explicitly, and the only place that records `deactivation_reason`.
 *
 * Reactivate only on a price source whose terms and robots.txt permit
 * per-call automated reads (an official or affiliate product API): remove the
 * DEACTIVATED entry, then set the flags back.
 *
 * Idempotent via `WHERE is_active = true OR visible = true OR x402_enabled =
 * true`: a re-run on a delisted row matches nothing. One row; no bulk
 * operation (DEC-20260504-B). No solution has price-compare as a step
 * (verified read-only in production 2026-10-30).
 */
export const PRICE_COMPARE_DEACTIVATION_REASON =
  "delisted 2026-10-30 (block 0140): PriceRunner's robots.txt disallows /results, where /search redirects, so every call fails the robots.txt check (DEC-20261023-A); reactivate only on a price source whose terms and robots.txt permit per-call automated reads (an official or affiliate product API)";

export async function runMigration0140_deactivatePriceCompare(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  const res = await tx.execute(sql`
    UPDATE capabilities
       SET is_active = false,
           visible = false,
           x402_enabled = false,
           deactivation_reason = ${PRICE_COMPARE_DEACTIVATION_REASON},
           updated_at = now()
     WHERE slug = 'price-compare'
       AND (is_active = true OR visible = true OR x402_enabled = true)
  `);
  const affected = (res as { count?: number }).count ?? 0;

  return {
    block: "0140_deactivatePriceCompare",
    outcome:
      affected === 0
        ? "no change (price-compare already delisted)"
        : "price-compare delisted — PriceRunner robots.txt disallows the results page it reads",
    rows_affected: affected,
    duration_ms: Date.now() - startedAt,
  };
}
