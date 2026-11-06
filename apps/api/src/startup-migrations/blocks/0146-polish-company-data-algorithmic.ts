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
 * Run policy "once". The UPDATE is guarded on the old value, so a second run
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
  const rows = (res as { count?: number }).count ?? 0;
  return {
    block: "0146_polishCompanyDataAlgorithmic",
    outcome: rows === 0 ? "no change (label already corrected)" : "polish-company-data labelled algorithmic",
    rows_affected: rows,
    duration_ms: Date.now() - startedAt,
  };
}
