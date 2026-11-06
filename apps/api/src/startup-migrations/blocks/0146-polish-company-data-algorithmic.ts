import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0146 — `polish-company-data` is labelled `algorithmic`, not
 * `ai_generated` (2026-11-06).
 *
 * The tool reads one record from the KRS API (api-krs.ms.gov.pl) by its
 * 10-digit number and maps the JSON fields; nothing on its path calls a model.
 * Re-checked on 2026-11-06 for this block: the executor
 * (capabilities/polish-company-data.ts) imports only the capability registry
 * and lib/vat-derivation.ts (pure arithmetic, no imports); the slug has no
 * fallback chain (no registerChain for it); it is not in the Anthropic
 * provider's capability lists in dependency-manifest.ts, so getExecutor never
 * wraps it as an LLM call; and the name-search path that once existed was
 * removed (DEC-20260427-I) and now throws before any fetch. The old
 * `ai_generated` tag dates from the 2026-03-17 auto-generated manifest.
 *
 * Changing the label widens a public claim (the tool page then reads
 * "Computed by fixed rules and lookups; no AI model writes the answer").
 * Petter approved it on 2026-11-06 (handoff/_general/from-code/
 * 2026-11-06-petter-decisions-growth.md, decision 10), once this re-check
 * confirmed no model call.
 *
 * `transparency_tag` is db-canonical (capability-field-authority.ts), so the
 * boot manifest sync never writes it; this block does. The manifest carries
 * the same value. capabilities.updated_at is not written (blocks 0123, 0143,
 * 0144, 0145).
 *
 * The same row's `capability_type` still read `ai_assisted` (2026-04-20
 * drift inventory, archive/sessions/audit-reports/manifest_drift_inventory.md;
 * the column is "hybrid" in capability-field-authority.ts, so the boot sync
 * preserves a drifted value and nothing has rewritten it since). That value
 * types the tool "ai" in the audit body (compliance-profile.ts), adds US
 * processing for Anthropic to its provenance (provenance-builder.ts), and ties
 * it to Anthropic's health in upstream-health-gate.ts. The manifest says
 * `data_source_type: api`, which dataSourceTypeToCapType maps to
 * `stable_api`; this block sets that, guarded on `ai_assisted`, so the label
 * fix does not leave "AI" on the audit surfaces (independent review of PR
 * #949, 2026-11-06).
 *
 * Run policy "once". Each UPDATE is guarded on its old value, so a second run
 * writes 0 rows and a later edit is never overwritten. One row at most; no
 * bulk operation (DEC-20260504-B). Only strings are bound (DEC-20260504-A).
 */
export const POLISH_COMPANY_DATA_SLUG = "polish-company-data";

export async function runMigration0146_polishCompanyDataAlgorithmic(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  const res = await tx.execute(sql`
    UPDATE capabilities
       SET transparency_tag = ${"algorithmic"}
     WHERE slug = ${POLISH_COMPANY_DATA_SLUG}
       AND transparency_tag = ${"ai_generated"}
  `);
  const typeRes = await tx.execute(sql`
    UPDATE capabilities
       SET capability_type = ${"stable_api"}
     WHERE slug = ${POLISH_COMPANY_DATA_SLUG}
       AND capability_type = ${"ai_assisted"}
  `);
  const tagRows = (res as { count?: number }).count ?? 0;
  const typeRows = (typeRes as { count?: number }).count ?? 0;
  const done = [tagRows ? "labelled algorithmic" : null, typeRows ? "typed stable_api" : null].filter(Boolean);
  return {
    block: "0146_polishCompanyDataAlgorithmic",
    outcome: done.length === 0 ? "no change (label and type already corrected)" : `polish-company-data ${done.join(" and ")}`,
    rows_affected: tagRows + typeRows,
    duration_ms: Date.now() - startedAt,
  };
}
