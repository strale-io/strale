import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0153 — withhold `gdpr-fine-lookup` and the solutions built on it
 * (2026-11-11).
 *
 * Its only source is enforcementtracker.com (CMS Hasche Sigle). The licence
 * page (https://www.enforcementtracker.com/license) says the database "is
 * licensed under a Creative Commons Attribution-NonCommercial-ShareAlike 4.0
 * International License" and that CMS reserves reproduction of the database
 * "for the purposes of text and data mining" under §§ 44b and 87c UrhG.
 * Strale sold the lookup per call, which is resale against the source's terms
 * — never lane under DEC-20261023-A. Petter chose to withhold it on
 * 2026-11-11 (option "a: withhold it now").
 *
 * 1. The capability. The slug is in the DEACTIVATED map (auto-register.ts),
 *    whose boot sync runs before startup migrations (index.ts) and clears
 *    is_active, visible and x402_enabled without a reason. So, as block 0148
 *    does, this writes only the reason, and only once all three flags are
 *    already false (review finding H1 on #844).
 *
 * 2. The solutions. That boot sync does not cascade to bundles. Every solution
 *    with a gdpr-fine-lookup step would stay on sale with a step that can no
 *    longer run; in the repository's catalogue that is ai-act-assess, whose
 *    copy promises "prior enforcement actions". Each is switched off on both
 *    rails with a deactivation_reason, which wasDeactivatedDeliberately()
 *    (lib/solution-activation.ts) treats as deliberate, so no automated sweep
 *    switches it back on. The crypto-price precedent (2026-09-06) withheld its
 *    bundles the same way rather than rewriting them.
 *
 * Guards: the solution UPDATE matches only while the capability is still
 * withheld (is_active = false and carrying this reason), and only solutions
 * that still have the step and are still on some rail. A relisting — the
 * capability back on a licensed or regulator source, or a bundle rebuilt
 * without the step — therefore matches nothing, so even a forced re-run
 * (which re-runs "once" blocks) cannot undo it. If the boot sync failed on the
 * boot that ships this, step 1 writes nothing, step 2 then matches nothing,
 * and the run policy below retires the block; the next boot's sync still
 * takes the capability off sale, and the PR's post-deploy check names the
 * query that would show the bundle still listed.
 *
 * One capability row and the solutions with one step; no bulk operation
 * (DEC-20260504-B). Only strings are bound and timestamps are now() in SQL
 * (DEC-20260504-A).
 */
export const GDPR_FINE_LOOKUP_SLUG = "gdpr-fine-lookup";

export const GDPR_FINE_LOOKUP_WITHHELD_REASON =
  "withheld 2026-11-11 (block 0153, Petter): enforcementtracker.com, the only source, licenses its database CC BY-NC-SA 4.0 (non-commercial) and reserves text and data mining under §§ 44b and 87c UrhG; a per-call sale is resale against the source's terms (DEC-20261023-A, never lane). Relist only under a commercial licence from CMS, or after a rebuild on the data protection authorities' own published decisions";

export const GDPR_FINE_LOOKUP_SOLUTION_REASON =
  "withheld 2026-11-11 (block 0153, Petter): a step, gdpr-fine-lookup, is withheld because its source enforcementtracker.com is licensed CC BY-NC-SA 4.0 (non-commercial) with text and data mining reserved (DEC-20261023-A, never lane). Relist after rebuilding the bundle without that step, or once gdpr-fine-lookup is relisted on a licensed or regulator source";

export async function runMigration0153_withholdGdprFineLookup(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  const capRes = await tx.execute(sql`
    UPDATE capabilities
       SET deactivation_reason = ${GDPR_FINE_LOOKUP_WITHHELD_REASON},
           updated_at = now()
     WHERE slug = ${GDPR_FINE_LOOKUP_SLUG}
       AND is_active = false AND visible = false AND x402_enabled = false
       AND deactivation_reason IS DISTINCT FROM ${GDPR_FINE_LOOKUP_WITHHELD_REASON}
  `);
  const capAffected = (capRes as { count?: number }).count ?? 0;

  const solRes = await tx.execute(sql`
    UPDATE solutions
       SET is_active = false,
           x402_enabled = false,
           deactivation_reason = ${GDPR_FINE_LOOKUP_SOLUTION_REASON},
           updated_at = now()
     WHERE id IN (SELECT solution_id FROM solution_steps WHERE capability_slug = ${GDPR_FINE_LOOKUP_SLUG})
       AND (is_active = true OR x402_enabled = true)
       AND EXISTS (
         SELECT 1 FROM capabilities
          WHERE slug = ${GDPR_FINE_LOOKUP_SLUG}
            AND is_active = false
            AND deactivation_reason = ${GDPR_FINE_LOOKUP_WITHHELD_REASON})
  `);
  const solAffected = (solRes as { count?: number }).count ?? 0;

  const affected = capAffected + solAffected;
  return {
    block: "0153_withholdGdprFineLookup",
    outcome:
      affected === 0
        ? "no change (gdpr-fine-lookup already carries its reason and no listed solution has it as a step, or it is listed)"
        : `gdpr-fine-lookup withheld — enforcementtracker.com is CC BY-NC-SA 4.0 with TDM reserved; reason recorded on ${capAffected} capability row(s), ${solAffected} solution(s) withheld`,
    rows_affected: affected,
    duration_ms: Date.now() - startedAt,
  };
}
