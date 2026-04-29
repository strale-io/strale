/**
 * Pre-flight verification for migrations 0052, 0053, 0054.
 * Read-only: queries DB state to confirm migrations will behave as expected.
 *
 * Run: cd apps/api && npx tsx scripts/preflight-2026-04-29-migrations.ts
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { getDb } from "../src/db/index.js";

config({ path: resolve(import.meta.dirname, "../../../.env") });

const db = getDb();

async function main() {
  console.log("=== Pre-flight: 0052 / 0053 / 0054 ===\n");

  // 0052 will flip rows where compliance_hash_state='complete' AND
  // integrity_hash IS NULL → 'unhashed_legacy'. Count them now.
  const willFlipResult = await db.execute(sql`
    SELECT COUNT(*)::int AS n
    FROM transactions
    WHERE compliance_hash_state = 'complete'
      AND integrity_hash IS NULL
  `);
  const willFlipRows = (Array.isArray(willFlipResult) ? willFlipResult : (willFlipResult as { rows?: unknown[] })?.rows ?? []) as Array<{ n: number }>;
  const willFlip = willFlipRows[0]?.n ?? 0;
  console.log(`0052: rows that will flip to 'unhashed_legacy' = ${willFlip}`);

  // Distribution of compliance_hash_state for context
  const distResult = await db.execute(sql`
    SELECT compliance_hash_state, COUNT(*)::int AS n
    FROM transactions
    GROUP BY compliance_hash_state
    ORDER BY n DESC
  `);
  const distRows = (Array.isArray(distResult) ? distResult : (distResult as { rows?: unknown[] })?.rows ?? []) as Array<{ compliance_hash_state: string; n: number }>;
  console.log("\nCurrent compliance_hash_state distribution:");
  for (const r of distRows) console.log(`  ${r.compliance_hash_state.padEnd(20)} ${r.n}`);

  // 0053 — confirm x402_orphan_settlements does NOT yet exist
  const tblResult = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'x402_orphan_settlements'
    ) AS exists
  `);
  const tblRows = (Array.isArray(tblResult) ? tblResult : (tblResult as { rows?: unknown[] })?.rows ?? []) as Array<{ exists: boolean }>;
  const orphanTblExists = tblRows[0]?.exists ?? false;
  console.log(`\n0053: x402_orphan_settlements table exists = ${orphanTblExists} (expect false)`);

  // 0054 — confirm trigger does NOT yet exist
  const trgResult = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'strale_chain_append_only_trigger' AND NOT tgisinternal
    ) AS exists
  `);
  const trgRows = (Array.isArray(trgResult) ? trgResult : (trgResult as { rows?: unknown[] })?.rows ?? []) as Array<{ exists: boolean }>;
  const trgExists = trgRows[0]?.exists ?? false;
  console.log(`\n0054: append-only trigger exists = ${trgExists} (expect false)`);

  // Confirm the schema columns 0052 references
  const colResult = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions'
      AND column_name IN ('deleted_at', 'redacted_at', 'deletion_reason', 'integrity_hash', 'previous_hash', 'compliance_hash_state')
    ORDER BY column_name
  `);
  const colRows = (Array.isArray(colResult) ? colResult : (colResult as { rows?: unknown[] })?.rows ?? []) as Array<{ column_name: string }>;
  console.log("\nRequired columns present:");
  for (const r of colRows) console.log(`  ${r.column_name}`);

  console.log("\n=== Pre-flight done ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("Pre-flight failed:", err);
  process.exit(1);
});
