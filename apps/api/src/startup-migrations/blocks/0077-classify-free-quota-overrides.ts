import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0077: classify 2 free_quota caps that override audit's paid heuristic ──
//
// Phase B.5 sibling. The Phase B.0 audit's heuristic classified these
// 2 Dutch gov vendors as paid_prepaid because their maintenance_class
// is `commercial-stable-api`. Chat research confirmed both are
// gov-operated free APIs with auth-gated rate-limited access (NOT paid
// commercial APIs as the heuristic assumed):
//
//   - nl-bag-address: Kadaster BAG API Individuele Bevragingen,
//     documented free at 50k/day. URL api.bag.kadaster.nl matches.
//   - nl-energy-label: RVO/EP-Online gov free with API-key auth,
//     no published quota. Conservative cap 1000/day matches the
//     SUDREG/GEMI posture used in Block 0075.
//
// Per-cap UPDATEs (same pattern as Block 0075). Idempotent via
// `AND cost_class IS NULL`.

interface FreeQuotaOverrideCap {
  slug: string;
  quotaCap: number;
}

export const PHASE_B5_FREE_QUOTA_OVERRIDE_CAPS: ReadonlyArray<FreeQuotaOverrideCap> = [
  { slug: "nl-bag-address",  quotaCap: 50000 }, // Kadaster BAG documented 50k/day
  { slug: "nl-energy-label", quotaCap: 1000 },  // EP-Online conservative cap
];

export async function runMigration0077_classifyFreeQuotaOverrides(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  let totalAffected = 0;

  for (const cap of PHASE_B5_FREE_QUOTA_OVERRIDE_CAPS) {
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
    block: "0077_classify_free_quota_overrides",
    outcome:
      totalAffected === 0
        ? `no rows to classify (all ${PHASE_B5_FREE_QUOTA_OVERRIDE_CAPS.length} slugs already classified)`
        : `classified ${totalAffected} cap(s) as free_quota (of ${PHASE_B5_FREE_QUOTA_OVERRIDE_CAPS.length} target slugs)`,
    rows_affected: totalAffected,
    duration_ms: Date.now() - startedAt,
  };
}
