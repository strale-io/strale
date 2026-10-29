import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0072: classify 8 high-confidence free_quota capabilities ─────────
//
// Phase B.2 of DEC-20260512-A. Sets cost_class='free_quota' plus per-cap
// quota_window / quota_cap / quota_reset_dom on 8 capabilities flagged
// by the Phase B.0 audit (2026-05-12) as high-confidence free_quota.
//
// All 8 caps use audit-shortlist env vars (ABN_LOOKUP_GUID, ADZUNA_APP_ID,
// AVIATIONSTACK_API_KEY, COMPANIES_HOUSE_API_KEY); the chat-supplied
// vendor override table for Phase B.2 did not affect any of these (none
// matched the 7 patterns CBEAPI_KEY / SUDREG_* / GITHUB_TOKEN /
// GEMI_API_KEY / PAGESPEED_API_KEY / BOLAGSVERKET_* / COURTLISTENER_API_TOKEN).
// No Bolagsverket exclusions needed.
//
// Per-cap values are inlined into a VALUES clause rather than a slug list
// because each cap has different quota params (unlike Block 0071's uniform
// free_unlimited). Idempotency: WHERE cost_class IS NULL gates the UPDATE.

interface FreeQuotaCapValues {
  slug: string;
  quotaWindow: "daily" | "monthly";
  quotaCap: number;
  quotaResetDom: number | null;
}

export const PHASE_B2_FREE_QUOTA_HIGH_CONF: ReadonlyArray<FreeQuotaCapValues> = [
  { slug: "au-company-data",             quotaWindow: "daily",   quotaCap: 1000, quotaResetDom: null },
  { slug: "beneficial-ownership-lookup", quotaWindow: "daily",   quotaCap: 600,  quotaResetDom: null },
  { slug: "flight-status",               quotaWindow: "monthly", quotaCap: 100,  quotaResetDom: 1 },
  { slug: "insolvency-check",            quotaWindow: "daily",   quotaCap: 600,  quotaResetDom: null },
  { slug: "job-board-search",            quotaWindow: "monthly", quotaCap: 1000, quotaResetDom: 1 },
  { slug: "officer-search",              quotaWindow: "daily",   quotaCap: 600,  quotaResetDom: null },
  { slug: "uk-companies-house-officers", quotaWindow: "daily",   quotaCap: 600,  quotaResetDom: null },
  { slug: "uk-filing-events",            quotaWindow: "daily",   quotaCap: 600,  quotaResetDom: null },
];

export async function runMigration0072_classifyFreeQuotaHighConfidence(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  // Build a VALUES-based UPDATE so per-cap quota params survive a single
  // statement. Each row: slug, quota_window, quota_cap, quota_reset_dom.
  // The CTE form makes the SQL diff-readable for chat review without
  // resorting to 8 separate UPDATE statements.
  const valuesRows = PHASE_B2_FREE_QUOTA_HIGH_CONF.map((c) => {
    const slug = c.slug.replace(/'/g, "''");
    const qd = c.quotaResetDom === null ? "NULL" : String(c.quotaResetDom);
    return `('${slug}', '${c.quotaWindow}', ${c.quotaCap}, ${qd})`;
  }).join(",\n      ");

  const result = await tx.execute(sql.raw(`
    UPDATE capabilities AS c
       SET cost_class = 'free_quota',
           quota_window = v.quota_window,
           quota_cap = v.quota_cap,
           quota_reset_dom = v.quota_reset_dom,
           updated_at = NOW()
      FROM (VALUES
      ${valuesRows}
      ) AS v(slug, quota_window, quota_cap, quota_reset_dom)
     WHERE c.slug = v.slug
       AND c.cost_class IS NULL
  `));
  const updateCount = (result as { count?: number }).count ?? 0;

  return {
    block: "0072_classify_free_quota_high_confidence",
    outcome:
      updateCount === 0
        ? `no rows to classify (all ${PHASE_B2_FREE_QUOTA_HIGH_CONF.length} slugs already have cost_class set)`
        : `classified ${updateCount} cap(s) as free_quota (of ${PHASE_B2_FREE_QUOTA_HIGH_CONF.length} target slugs)`,
    rows_affected: updateCount,
    duration_ms: Date.now() - startedAt,
  };
}
