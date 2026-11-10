import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Founder-approved page consistency fix, 2026-11-10. Two active sanctions-check
 * rows read from the public limitations endpoint are stale. Correct only
 * their exact old text; preserve later edits and unrelated rows. Runs once.
 * No screening, pricing or decision logic changes. Dilisense's source page
 * confirms the attributed hourly cadence; no end-to-end freshness guarantee.
 * The seed and manifest must match these frozen publication values (test).
 */
export const SANCTIONS_LIMITATIONS_0151 = [
  {
    category: "freshness",
    title: "Per-list update timestamps are not available",
    text: "Dilisense states that its consolidated sanctions index is refreshed every 60 minutes. The screening API does not expose per-list update timestamps, so this is not a guarantee that a new designation is already included. Read lists_queried for the provider's source information.",
    workaround: "For time-sensitive decisions, check the relevant primary sanctions lists and their publication dates.",
    oldTexts: [
      "Sanctions lists updated daily from OFAC, EU, and UN sources — newly sanctioned entities may take up to 24 hours to appear",
      "Sanctions lists updated multiple times per day from OFAC, EU, UN, the UK Sanctions List and 120+ other sources via Dilisense — newly sanctioned entities may take up to 24 hours to appear",
    ],
  },
  {
    category: "accuracy",
    title: "Potential name matches need review",
    text: "Name matching can return false positives. No match confidence score is returned. For individuals, birth_date is passed to the provider for disambiguation. The country input is echoed in country_filter but does not restrict the provider search.",
    workaround: "Compare names and available identifying details with the primary source. Do not treat a potential match as a confirmed identity or an empty result as clearance.",
    oldTexts: ["Name matching uses fuzzy logic — common names may produce false positives. Always verify flagged results"],
  },
] as const;

export async function runMigration0151_correctSanctionsLimitations(tx: MigrationExecutor): Promise<BlockResult> {
  const startedAt = Date.now();
  let total = 0;
  for (const row of SANCTIONS_LIMITATIONS_0151) {
    const oldTexts = sql.join(row.oldTexts.map((text) => sql`${text}`), sql`, `);
    const result = await tx.execute(sql`
      UPDATE capability_limitations
         SET title = ${row.title}, limitation_text = ${row.text}, workaround = ${row.workaround}
       WHERE capability_slug = 'sanctions-check'
         AND active = true
         AND category = ${row.category}
         AND limitation_text IN (${oldTexts})
    `);
    total += (result as { count?: number }).count ?? 0;
  }
  return { block: "0151_correctSanctionsLimitations", outcome: total ? `corrected ${total} sanctions-check limitation rows` : "no change (old sanctions-check text absent)", rows_affected: total, duration_ms: Date.now() - startedAt };
}
