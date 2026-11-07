import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0149 — publish the narrowed sanctions-check and pep-check text (DQ-46).
 *
 * PR #966 narrowed what every sanctions-check and pep-check response says
 * about its sources (lib/dilisense-sources.ts) to what Dilisense's own
 * catalogue states (checked 2026-11-07): the development-bank debarment lists
 * are paid per-client add-ons Strale does not have, 120 sanctions lists are
 * included (not 134), and PEP data is updated once a day by default. The
 * published text still said the opposite in three places. This block delivers
 * the narrowed text to the live rows.
 *
 * Why a block: the boot-time manifest text sync refuses compliance
 * capabilities (`isReportOnly`, manifest-publication-policy.ts) until Petter
 * approves. Approval: Petter, in session 2026-11-07 ("approve DQ-46"),
 * answering DQ-46 in docs/company/DECISION-QUEUE.md. The change only narrows
 * claims (DEC-20260822-A part 2).
 *
 * Writes, each guarded on the exact production text read on 2026-11-07, so a
 * later edit is never overwritten:
 *  - capabilities.data_source of sanctions-check (the text block 0122 wrote);
 *  - capabilities.output_schema of sanctions-check and pep-check: only the
 *    sample response's `example.lists_queried` object, compared as JSON;
 *  - capability_limitations title and limitation_text of pep-check's one
 *    active freshness row, guarded on its exact production text (read from
 *    the public /v1/public/ops/limitations route on 2026-11-07): "updated
 *    multiple times per day" becomes the approved "once a day by default"
 *    wording; the row's existing 48-hour lag sentence is kept unchanged.
 *
 * The other production limitation rows of pep-check predate the switch to
 * Dilisense and still name OpenSanctions and an LLM fallback. They are not
 * DQ-46's text; publishing the manifest's limitation set is DQ-47.
 *
 * capabilities.updated_at is deliberately not written (same rule as blocks
 * 0123 and 0143: a copy-only change must not read as a changed capability).
 * Run policy "once": a re-run must not undo a later edit.
 *
 * The data_source and sample responses below must equal
 * manifests/sanctions-check.yaml and manifests/pep-check.yaml;
 * startup-migration-0149.test.ts pins them.
 */

export const DQ46_OLD_SANCTIONS_DATA_SOURCE =
  "Dilisense consolidated (OFAC SDN, EU FSF, UN SC, UK Sanctions List, CH SECO, BIS, World Bank, EBRD, ADB + 125 national sanctions/debarment lists; full attribution at https://dilisense.com/en/sources/sanction-sources)";
export const DQ46_NEW_SANCTIONS_DATA_SOURCE =
  "Dilisense consolidated (120 sanctions and restrictive-measure lists, including OFAC SDN, EU FSF, UN SC, the UK Sanctions List, CH SECO and BIS; full attribution at https://dilisense.com/en/sources/sanction-sources)";

export const DQ46_OLD_SANCTIONS_EXAMPLE_LISTS = {
  collection: "dilisense/consolidated-sanctions",
  source_count: 134,
  major_lists: [
    "OFAC — Specially Designated Nationals (SDN)",
    "European Commission — Consolidated List of Financial Sanctions",
    "UN Security Council — Consolidated List",
    "HMT OFSI — Financial Sanctions",
    "SECO — Switzerland Sanctions",
    "BIS — Entity List",
    "(plus ~128 more)",
  ],
  freshness_note:
    "Dilisense aggregates 130+ sanctions, debarment, and restrictive-measure lists into a consolidated index. The publisher refreshes the consolidated index multiple times daily; per-list timestamps are not exposed via the screening API.",
  source_catalog_url: "https://dilisense.com/en/sources/sanction-sources",
  version: null,
  last_updated_at: null,
};
export const DQ46_NEW_SANCTIONS_EXAMPLE_LISTS = {
  collection: "dilisense/consolidated-sanctions",
  source_count: 120,
  major_lists: [
    "OFAC — Specially Designated Nationals (SDN)",
    "European Commission — Consolidated List of Financial Sanctions",
    "UN Security Council — Consolidated List",
    "UK Government — Sanctions List",
    "SECO — Switzerland Sanctions",
    "BIS — Entity List",
    "(plus ~114 more)",
  ],
  freshness_note:
    "Dilisense consolidates 120 sanctions and restrictive-measure lists into one index, and states that it is updated every 60 minutes. Per-list timestamps are not exposed by the screening API.",
  source_catalog_url: "https://dilisense.com/en/sources/sanction-sources",
  version: null,
  last_updated_at: null,
};

export const DQ46_OLD_PEP_EXAMPLE_LISTS = {
  collection: "dilisense/consolidated-pep",
  source_count: 230,
  major_lists: [
    "EU C/2023/724 — Member-State PEP function definitions",
    "DE Bundestag, Bundesrat, Bundespräsident, Bundesbank, state-owned enterprises",
    "(plus 228+ national parliament/government/central-bank/judiciary sources)",
  ],
  freshness_note:
    "Dilisense PEP coverage spans 230+ geopolitical territories and aligns with EU C/2023/724 PEP function definitions. The publisher refreshes the index multiple times daily; per-list timestamps are not exposed via the screening API.",
  source_catalog_url: "https://dilisense.com/en/sources/politically-exposed-persons-list",
  version: null,
  last_updated_at: null,
};
export const DQ46_NEW_PEP_EXAMPLE_LISTS = {
  collection: "dilisense/consolidated-pep",
  source_count: 230,
  major_lists: [
    "EU C/2023/724 — public functions defining PEPs in each Member State",
    "Politicians",
    "Relatives and close associates (RCAs)",
    "Example given by the publisher for Germany: Federal President, Bundestag, Bundesrat, Bundesbank, and state-owned enterprises (Deutsche Bahn, Bundesdruckerei, BwConsulting)",
    "(plus the other categories in the publisher's catalogue)",
  ],
  freshness_note:
    "Dilisense states PEP coverage of 230+ geopolitical territories in 12 categories, updated once a day by default and more often for highly important PEPs, and describes EU PEPs by the C/2023/724 public-function lists. Per-list timestamps are not exposed by the screening API.",
  source_catalog_url: "https://dilisense.com/en/sources/politically-exposed-persons-list",
  version: null,
  last_updated_at: null,
};

/** The approved wording (DQ-46 item 3); the manifest's limitation opens with it too. */
export const DQ46_NEW_PEP_LIMITATION_PHRASE =
  "Dilisense updates its PEP data once a day by default, and more often for highly important PEPs";
export const DQ46_OLD_PEP_LIMITATION_TITLE =
  "PEP lists updated multiple times per day — recently appointed officials may take up to 48 hours";
export const DQ46_OLD_PEP_LIMITATION_TEXT =
  "PEP lists updated multiple times per day — recently appointed officials may take up to 48 hours to appear";
export const DQ46_NEW_PEP_LIMITATION_TITLE =
  "PEP data is updated once a day by default — recently appointed officials may take up to 48 hours";
export const DQ46_NEW_PEP_LIMITATION_TEXT = `${DQ46_NEW_PEP_LIMITATION_PHRASE}. Recently appointed officials may take up to 48 hours to appear.`;

export async function runMigration0149_publishDilisenseSourceText(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  const dataSource = await tx.execute(sql`
    UPDATE capabilities
       SET data_source = ${DQ46_NEW_SANCTIONS_DATA_SOURCE}
     WHERE slug = 'sanctions-check'
       AND data_source = ${DQ46_OLD_SANCTIONS_DATA_SOURCE}
  `);

  const sanctionsExample = await tx.execute(sql`
    UPDATE capabilities
       SET output_schema = jsonb_set(output_schema, '{example,lists_queried}', ${JSON.stringify(DQ46_NEW_SANCTIONS_EXAMPLE_LISTS)}::jsonb)
     WHERE slug = 'sanctions-check'
       AND output_schema #> '{example,lists_queried}' = ${JSON.stringify(DQ46_OLD_SANCTIONS_EXAMPLE_LISTS)}::jsonb
  `);

  const pepExample = await tx.execute(sql`
    UPDATE capabilities
       SET output_schema = jsonb_set(output_schema, '{example,lists_queried}', ${JSON.stringify(DQ46_NEW_PEP_EXAMPLE_LISTS)}::jsonb)
     WHERE slug = 'pep-check'
       AND output_schema #> '{example,lists_queried}' = ${JSON.stringify(DQ46_OLD_PEP_EXAMPLE_LISTS)}::jsonb
  `);

  const pepLimitation = await tx.execute(sql`
    UPDATE capability_limitations
       SET title = ${DQ46_NEW_PEP_LIMITATION_TITLE},
           limitation_text = ${DQ46_NEW_PEP_LIMITATION_TEXT}
     WHERE capability_slug = 'pep-check'
       AND category = 'freshness'
       AND active = true
       AND limitation_text = ${DQ46_OLD_PEP_LIMITATION_TEXT}
  `);

  const count = (r: unknown) => (r as { count?: number }).count ?? 0;
  const parts = {
    data_source: count(dataSource),
    sanctions_example: count(sanctionsExample),
    pep_example: count(pepExample),
    pep_limitation: count(pepLimitation),
  };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);

  return {
    block: "0149_publishDilisenseSourceText",
    outcome:
      total === 0
        ? "no change (sanctions-check and pep-check text already differs from the pre-DQ-46 wording)"
        : `DQ-46 text published (data_source ${parts.data_source}, sanctions example ${parts.sanctions_example}, pep example ${parts.pep_example}, pep limitation ${parts.pep_limitation})`,
    rows_affected: total,
    duration_ms: Date.now() - startedAt,
  };
}
