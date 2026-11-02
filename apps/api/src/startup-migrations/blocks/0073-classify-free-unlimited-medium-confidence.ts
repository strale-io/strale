import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0073: 5 medium-confidence free_unlimited scraping caps ───────────
//
// Phase B.2 sibling of Block 0072. The 5 scraping caps below have
// data_source_type=scrape, no BROWSERLESS_* env var (raw fetch + cheerio),
// no vendor cost. Heuristic confidence flagged as medium because the
// vendor identity is the scrape target (gov registry pages) rather than
// an API contract — slightly higher operational fragility but no
// classification ambiguity.
//
// Same idempotency shape as Block 0071: ANY-list UPDATE filtered on
// cost_class IS NULL.

export const PHASE_B2_FREE_UNLIMITED_MEDIUM_CONF: ReadonlyArray<string> = [
  "canadian-company-data",
  "japanese-company-data",
  "polish-company-data",
  "seo-audit",
  "tech-stack-detect",
];

export async function runMigration0073_classifyFreeUnlimitedMediumConfidence(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  const result = await tx.execute(sql`
    UPDATE capabilities
       SET cost_class = 'free_unlimited',
           quota_window = 'none',
           quota_cap = NULL,
           quota_reset_dom = NULL,
           updated_at = NOW()
     WHERE slug IN ${sql.raw("(" + PHASE_B2_FREE_UNLIMITED_MEDIUM_CONF.map((s) => `'${s.replace(/'/g, "''")}'`).join(",") + ")")}
       AND cost_class IS NULL
  `);
  const updateCount = (result as { count?: number }).count ?? 0;

  return {
    block: "0073_classify_free_unlimited_medium_confidence",
    outcome:
      updateCount === 0
        ? `no rows to classify (all ${PHASE_B2_FREE_UNLIMITED_MEDIUM_CONF.length} slugs already have cost_class set)`
        : `classified ${updateCount} cap(s) as free_unlimited (of ${PHASE_B2_FREE_UNLIMITED_MEDIUM_CONF.length} target slugs)`,
    rows_affected: updateCount,
    duration_ms: Date.now() - startedAt,
  };
}
