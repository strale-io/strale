import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// Block 0122 (2026-10-23): correct sanctions-check's public source copy (DQ-36).
//
// The UK's OFSI Consolidated List closed on 2026-01-28; the UK Sanctions List
// replaced it (gov.uk). sanctions-check's description and data_source still
// named "UK OFSI". Petter approved the corrected wording in session on
// 2026-10-23 ("I approve DQ-36 as drafted"); compliance and methodology claims
// are his to publish (CHARTER.md). The manifest carries the same text.
//
// Verified in production read-only on 2026-10-23: these two columns of the one
// sanctions-check row are the only places a capability or solution row names
// OFSI as our claim (output_schema's example also mentions it, but that is
// Dilisense's own source label in sample data, not a claim of ours).
//
// Each UPDATE is guarded on the exact old text, so a later edit is never
// reverted, and the block records itself and runs once. One row.
// Authority: DQ-36 (founder approval) under DEC-20260815-A.

export const DQ36_OLD_SANCTIONS_DESCRIPTION =
  "Check if a person or entity is on sanctions lists (EU, US OFAC, UN, UK OFSI, Swiss SECO, BIS, World Bank, EBRD, ADB + 125 national lists). Uses Dilisense consolidated database. Returns audit-grade evidence: match results with named source attribution and country attribution.";
export const DQ36_NEW_SANCTIONS_DESCRIPTION =
  "Check if a person or entity is on sanctions lists (EU, US OFAC, UN, the UK Sanctions List, Swiss SECO, BIS, World Bank, EBRD, ADB + 125 national lists). Uses Dilisense consolidated database. Returns audit-grade evidence: match results with named source attribution and country attribution.";
export const DQ36_OLD_SANCTIONS_DATA_SOURCE =
  "Dilisense consolidated (OFAC SDN, EU FSF, UN SC, UK OFSI, CH SECO, BIS, World Bank, EBRD, ADB + 125 national sanctions/debarment lists; full attribution at https://dilisense.com/en/sources/sanction-sources)";
export const DQ36_NEW_SANCTIONS_DATA_SOURCE =
  "Dilisense consolidated (OFAC SDN, EU FSF, UN SC, UK Sanctions List, CH SECO, BIS, World Bank, EBRD, ADB + 125 national sanctions/debarment lists; full attribution at https://dilisense.com/en/sources/sanction-sources)";

export async function runMigration0122_correctSanctionsSourceCopy(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  const BLOCK = "0122_correctSanctionsSourceCopy";

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS startup_migration_ledger (
      block text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now(),
      rows_affected integer NOT NULL DEFAULT 0
    )`);

  const prior = (await tx.execute(sql`
    SELECT block FROM startup_migration_ledger WHERE block = ${BLOCK}
  `)) as unknown as Array<{ block: string }>;

  if (prior.length > 0) {
    return {
      block: BLOCK,
      outcome: "no change (already applied once)",
      rows_affected: 0,
      duration_ms: Date.now() - startedAt,
    };
  }

  const description = (await tx.execute(sql`
    UPDATE capabilities
       SET description = ${DQ36_NEW_SANCTIONS_DESCRIPTION},
           updated_at = now()
     WHERE slug = 'sanctions-check'
       AND description = ${DQ36_OLD_SANCTIONS_DESCRIPTION}
     RETURNING slug
  `)) as unknown as Array<{ slug: string }>;

  const dataSource = (await tx.execute(sql`
    UPDATE capabilities
       SET data_source = ${DQ36_NEW_SANCTIONS_DATA_SOURCE},
           updated_at = now()
     WHERE slug = 'sanctions-check'
       AND data_source = ${DQ36_OLD_SANCTIONS_DATA_SOURCE}
     RETURNING slug
  `)) as unknown as Array<{ slug: string }>;

  const total = description.length + dataSource.length;

  await tx.execute(sql`
    INSERT INTO startup_migration_ledger (block, rows_affected)
    VALUES (${BLOCK}, ${total})
    ON CONFLICT (block) DO NOTHING
  `);

  return {
    block: BLOCK,
    outcome:
      total === 0
        ? "no change (sanctions-check copy already differs from the OFSI wording)"
        : `sanctions-check now names the UK Sanctions List (${description.length} description, ${dataSource.length} data_source)`,
    rows_affected: total,
    duration_ms: Date.now() - startedAt,
  };
}
