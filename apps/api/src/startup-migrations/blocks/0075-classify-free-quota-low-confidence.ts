import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0075: classify 8 low-confidence free_quota caps ──────────────────
//
// Phase B.4 of DEC-20260512-A. The Phase B.0 audit (2026-05-12) flagged
// 8 caps as `free_quota` at low confidence — the heuristic identified
// vendor-API + auth env var but couldn't pin per-window quota params
// without vendor-doc research. Chat completed that research during B.1/B.2
// prep and supplied authoritative override values (see PR body for source
// rationale per cap).
//
// All 8 caps share quota_window='daily' + quota_reset_dom=NULL, so only
// quota_cap varies. The 7 vendor patterns (CBEAPI, SUDREG, GITHUB,
// GEMI, PAGESPEED, BOLAGSVERKET, COURTLISTENER) span 6 different vendors —
// the GITHUB_TOKEN pattern covers 2 caps (github-repo-compare,
// github-user-profile). swedish-company-data resolves to free_quota via
// URL-based vendor identification: gw.api.bolagsverket.se is the
// Värdefulla datamängder open-data API (free, OAuth client credentials,
// rate-limited), NOT paid B2B (which uses different hostnames).
//
// Per-cap UPDATEs (8 atomic statements) because each cap has a different
// quota_cap. Idempotent via `AND cost_class IS NULL` per cap.

interface FreeQuotaLowConfCap {
  slug: string;
  quotaCap: number;
}

export const PHASE_B4_FREE_QUOTA_LOW_CONF_CAPS: ReadonlyArray<FreeQuotaLowConfCap> = [
  { slug: "belgian-company-data",  quotaCap: 2500 },   // cbeapi.be free tier
  { slug: "croatian-company-data", quotaCap: 500 },    // sudreg-api.pravosudje.hr — conservative
  { slug: "github-repo-compare",   quotaCap: 1000 },   // GitHub 5000/hour → conservative daily
  { slug: "github-user-profile",   quotaCap: 1000 },   // GitHub 5000/hour → conservative daily
  { slug: "greek-company-data",    quotaCap: 500 },    // GEMI Open Data — conservative
  { slug: "page-speed-test",       quotaCap: 25000 },  // Google PSI documented 25k/day
  { slug: "swedish-company-data",  quotaCap: 1000 },   // Bolagsverket Värdefulla datamängder
  { slug: "us-court-search",       quotaCap: 5000 },   // CourtListener free tier per SDK docs
];

export async function runMigration0075_classifyFreeQuotaLowConfidence(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  let totalAffected = 0;

  // Per-cap UPDATEs. Could be consolidated into one VALUES-clause UPDATE
  // like Block 0072, but the per-cap loop keeps the SQL trivial and the
  // diff readable for chat review of an 8-row batch with chat-supplied
  // authoritative values.
  for (const cap of PHASE_B4_FREE_QUOTA_LOW_CONF_CAPS) {
    const result = await tx.execute(sql`
      UPDATE capabilities
         SET cost_class = 'free_quota',
             quota_window = 'daily',
             quota_cap = ${cap.quotaCap},
             quota_reset_dom = NULL,
             updated_at = NOW()
       WHERE slug = ${cap.slug}
         AND cost_class IS NULL
    `);
    totalAffected += (result as { count?: number }).count ?? 0;
  }

  return {
    block: "0075_classify_free_quota_low_confidence",
    outcome:
      totalAffected === 0
        ? `no rows to classify (all ${PHASE_B4_FREE_QUOTA_LOW_CONF_CAPS.length} slugs already have cost_class set)`
        : `classified ${totalAffected} cap(s) as free_quota (of ${PHASE_B4_FREE_QUOTA_LOW_CONF_CAPS.length} target slugs)`,
    rows_affected: totalAffected,
    duration_ms: Date.now() - startedAt,
  };
}
