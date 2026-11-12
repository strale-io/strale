import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0153 — withhold `gdpr-fine-lookup` and the solutions built on it
 * (2026-11-11).
 *
 * Its only source is enforcementtracker.com (CMS). The licence
 * page (https://www.enforcementtracker.com/license) says the database "is
 * licensed under a Creative Commons Attribution-NonCommercial-ShareAlike 4.0
 * International License" and that CMS reserves reproduction of the database
 * "for the purposes of text and data mining" under §§ 44b and 87c UrhG.
 * Strale sold the lookup per call, so it fails the condition of
 * DEC-20261023-A's checks lane for per-call reads of public sources Strale
 * chooses: the source's terms must permit automated per-call access, and these
 * do not (never item 6, reselling against vendor terms, applies only by
 * analogy). Petter chose to withhold it on 2026-11-11 (option "a: withhold it
 * now"). Whether the site is also a never item 5 aggregator is open for him.
 *
 * 1. The capability. The slug is in the DEACTIVATED map (auto-register.ts),
 *    whose boot sync runs before startup migrations (index.ts) and clears
 *    is_active, visible and x402_enabled without touching the reason. So, as
 *    block 0148 does, this writes only the reason, and only once all three
 *    flags are already false (review finding H1 on #844). It writes it only
 *    over no reason or a vendor-control-tower `vendor:` marker: any other
 *    reason is a deliberate decision by someone else (a rebuild kept dark, a
 *    later founder decision), which this block, running every boot, must
 *    leave alone rather than rewrite on each boot.
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
 * Guards: the solution UPDATE matches only while the capability is off on
 * every surface (is_active, visible and x402_enabled all false), whatever its
 * reason, and only solutions that still have the step and are still on some
 * rail or carry a vendor suspension marker. It does not key on step 1's
 * reason: a bundle whose step cannot run must not be on sale, even if the
 * capability row carries some older reason step 1 leaves alone. A relisting —
 * the capability back on a licensed or regulator source (is_active true), or
 * a bundle rebuilt without the step — matches nothing, and a bundle this block
 * has withheld is off both rails with a non-vendor reason, so it matches
 * nothing again either. That is what lets the block run every boot
 * (run-policy.ts).
 *
 * Every boot, not once: if the boot sync fails on the boot that ships this
 * (it logs and does not retry), steps 1 and 2 match nothing and return
 * normally; "once" would then record the block as done and leave the bundles
 * on sale. Run every boot, the next boot after a successful sync completes it.
 *
 * The vendor marker: vendor-control-tower suspends a solution with a
 * `vendor:` reason and later restores its previous rails only while that
 * exact marker is still there (vendor-control-tower.ts). A bundle suspended
 * that way is off both rails, so it is matched by its marker instead, and
 * overwriting the marker makes the tower's restore a no-op: its open
 * vendor_solution_suspensions row stays unrestored (restored_at IS NULL), and
 * each restore pass finds no suspension whose marker matches the current
 * reason and skips the bundle without writing anything. Its restore_error
 * branch runs only if the reason changes between its locked read and its
 * update. The tower's suspend step only takes rows with no reason or a
 * `vendor:` one, so it never touches the bundle again and the two cannot
 * loop. The same holds for a `vendor:` marker on the capability.
 *
 * One capability row and the solutions with one step; no bulk operation
 * (DEC-20260504-B). Only strings are bound and timestamps are now() in SQL
 * (DEC-20260504-A).
 */
export const GDPR_FINE_LOOKUP_SLUG = "gdpr-fine-lookup";

export const GDPR_FINE_LOOKUP_WITHHELD_REASON =
  "withheld 2026-11-11 (block 0153, Petter): enforcementtracker.com, the only source, licenses its database CC BY-NC-SA 4.0 (non-commercial) and reserves text and data mining under §§ 44b and 87c UrhG, so it fails DEC-20261023-A's checks-lane condition for per-call reads of public sources Strale chooses (the terms must permit automated per-call access); never item 6 applies only by analogy. Relist only under a commercial licence from CMS, or after a rebuild on the data protection authorities' own published decisions";

export const GDPR_FINE_LOOKUP_SOLUTION_REASON =
  "withheld 2026-11-11 (block 0153, Petter): a step, gdpr-fine-lookup, is withheld because its source enforcementtracker.com is licensed CC BY-NC-SA 4.0 (non-commercial) with text and data mining reserved, so it fails DEC-20261023-A's checks-lane condition for per-call reads of public sources Strale chooses. Relist after rebuilding the bundle without that step, or once gdpr-fine-lookup is relisted on a licensed or regulator source";

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
       AND (deactivation_reason IS NULL OR deactivation_reason LIKE 'vendor:%')
  `);
  const capAffected = (capRes as { count?: number }).count ?? 0;

  const solRes = await tx.execute(sql`
    UPDATE solutions
       SET is_active = false,
           x402_enabled = false,
           deactivation_reason = ${GDPR_FINE_LOOKUP_SOLUTION_REASON},
           updated_at = now()
     WHERE id IN (SELECT solution_id FROM solution_steps WHERE capability_slug = ${GDPR_FINE_LOOKUP_SLUG})
       AND (is_active = true OR x402_enabled = true OR deactivation_reason LIKE 'vendor:%')
       AND EXISTS (
         SELECT 1 FROM capabilities
          WHERE slug = ${GDPR_FINE_LOOKUP_SLUG}
            AND is_active = false AND visible = false AND x402_enabled = false)
  `);
  const solAffected = (solRes as { count?: number }).count ?? 0;

  const affected = capAffected + solAffected;
  return {
    block: "0153_withholdGdprFineLookup",
    outcome:
      affected === 0
        ? "no change (gdpr-fine-lookup already carries a reason and no listed solution has it as a step, or it is listed)"
        : `gdpr-fine-lookup withheld — enforcementtracker.com is CC BY-NC-SA 4.0 with TDM reserved; reason recorded on ${capAffected} capability row(s), ${solAffected} solution(s) withheld`,
    rows_affected: affected,
    duration_ms: Date.now() - startedAt,
  };
}
