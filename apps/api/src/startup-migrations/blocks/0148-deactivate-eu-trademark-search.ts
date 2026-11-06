import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0148 — take `eu-trademark-search` off sale (2026-11-06).
 *
 * The executor renders https://euipo.europa.eu/eSearch/ and EUIPO's
 * robots.txt carries `disallow: /eSearch/` for every agent. Since the
 * 2026-10-28 fetch hardening (PR #786) every call refuses before the fetch
 * and is not charged (archive/receipts/2026-10-30-check-source-robots-access.json).
 * Under DEC-20261023-A a source whose robots.txt forbids the read is not read,
 * so the tool cannot work and must not be listed for sale. It earned money
 * before 10-28, so delisting it was founder-gated: Petter approved it on
 * 2026-11-06 answering DQ-42 ("yes, delist eu-trademark-search if it cant be
 * fixed"). The only permitted fix is a rebuild on EUIPO's official Trademark
 * Search API, which needs the free EUIPO developer account he approved but has
 * not yet opened; relist when that rebuild ships.
 *
 * The executor is also in the DEACTIVATED map (auto-register.ts). Its boot
 * sync runs before startup migrations (index.ts) and clears is_active,
 * visible and x402_enabled without writing a reason, so on the boot that
 * ships this block the flags are already false (review finding H1 on #844).
 * This block is the only place that records the reason.
 *
 * Guard: it matches only a row whose three flags are all false and whose
 * reason is not yet this one. While the slug sits in DEACTIVATED, the sync
 * guarantees the flags are false when this runs. A relisting removes the
 * DEACTIVATED entry and sets the flags back to true, so a re-run (a forced
 * run re-runs "once" blocks) matches nothing and cannot undo it. If the sync
 * ever failed on that boot the row would keep its flags, this block would
 * write nothing, and the next boot's sync still takes the tool off sale.
 *
 * One row; no bulk operation (DEC-20260504-B). Only strings are bound and the
 * timestamp is now() in SQL (DEC-20260504-A). No solution in the repository's
 * catalogue (db/solution-catalogue.ts) has eu-trademark-search as a step.
 */
export const EU_TRADEMARK_SEARCH_SLUG = "eu-trademark-search";

export const EU_TRADEMARK_SEARCH_DEACTIVATION_REASON =
  "delisted 2026-11-06 (block 0148, DQ-42, approved by Petter): EUIPO's robots.txt disallows /eSearch/, the page this tool renders, so every call fails the robots.txt check (DEC-20261023-A); relist when the rebuild on EUIPO's official Trademark Search API ships";

export async function runMigration0148_deactivateEuTrademarkSearch(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  const res = await tx.execute(sql`
    UPDATE capabilities
       SET deactivation_reason = ${EU_TRADEMARK_SEARCH_DEACTIVATION_REASON},
           updated_at = now()
     WHERE slug = ${EU_TRADEMARK_SEARCH_SLUG}
       AND is_active = false AND visible = false AND x402_enabled = false
       AND deactivation_reason IS DISTINCT FROM ${EU_TRADEMARK_SEARCH_DEACTIVATION_REASON}
  `);
  const affected = (res as { count?: number }).count ?? 0;

  return {
    block: "0148_deactivateEuTrademarkSearch",
    outcome:
      affected === 0
        ? "no change (eu-trademark-search already carries its reason, or is listed)"
        : "eu-trademark-search delisting reason recorded — EUIPO robots.txt disallows /eSearch/",
    rows_affected: affected,
    duration_ms: Date.now() - startedAt,
  };
}
