/**
 * Post-flight verification for migrations 0052, 0053, 0054.
 * Run: cd apps/api && npx tsx scripts/postflight-2026-04-29-migrations.ts
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { getDb } from "../src/db/index.js";

config({ path: resolve(import.meta.dirname, "../../../.env") });

const db = getDb();

async function main() {
  console.log("=== Post-flight: 0052 / 0053 / 0054 ===\n");

  const distResult = await db.execute(sql`
    SELECT compliance_hash_state, COUNT(*)::int AS n
    FROM transactions
    GROUP BY compliance_hash_state
    ORDER BY n DESC
  `);
  const distRows = (Array.isArray(distResult) ? distResult : (distResult as { rows?: unknown[] })?.rows ?? []) as Array<{ compliance_hash_state: string; n: number }>;
  console.log("0052: compliance_hash_state distribution AFTER migration:");
  for (const r of distRows) console.log(`  ${r.compliance_hash_state.padEnd(20)} ${r.n}`);

  // Confirm no rows left with compliance_hash_state='complete' AND integrity_hash IS NULL
  const orphanResult = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM transactions
    WHERE compliance_hash_state = 'complete' AND integrity_hash IS NULL
  `);
  const orphanRows = (Array.isArray(orphanResult) ? orphanResult : (orphanResult as { rows?: unknown[] })?.rows ?? []) as Array<{ n: number }>;
  console.log(`\n0052: rows still claiming 'complete' with NULL hash = ${orphanRows[0]?.n ?? 0} (expect 0)`);

  // 0053: confirm x402_orphan_settlements exists with the right columns
  const tblResult = await db.execute(sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'x402_orphan_settlements'
    ORDER BY ordinal_position
  `);
  const tblRows = (Array.isArray(tblResult) ? tblResult : (tblResult as { rows?: unknown[] })?.rows ?? []) as Array<{ column_name: string; data_type: string }>;
  console.log(`\n0053: x402_orphan_settlements columns (${tblRows.length}):`);
  for (const r of tblRows) console.log(`  ${r.column_name.padEnd(24)} ${r.data_type}`);

  // 0054: confirm trigger active
  const trgResult = await db.execute(sql`
    SELECT tgname, tgenabled FROM pg_trigger
    WHERE tgname = 'strale_chain_append_only_trigger' AND NOT tgisinternal
  `);
  const trgRows = (Array.isArray(trgResult) ? trgResult : (trgResult as { rows?: unknown[] })?.rows ?? []) as Array<{ tgname: string; tgenabled: string }>;
  console.log(`\n0054: append-only trigger:`);
  if (trgRows.length === 0) {
    console.log("  NOT FOUND (failure)");
  } else {
    for (const r of trgRows) {
      // tgenabled: 'O' = enabled (origin/local), 'D' = disabled, 'R' = replica, 'A' = always
      console.log(`  ${r.tgname}  tgenabled=${r.tgenabled} (O = enabled)`);
    }
  }

  // 0054: live trigger test — try to update integrity_hash on a 'complete'
  // row. Should fail with check_violation. Roll back so no live data
  // changes.
  console.log("\n0054: live trigger test (roll back, no data change)...");
  let triggerWorks = false;
  try {
    await db.transaction(async (tx) => {
      // Find one 'complete' row with a non-null integrity_hash
      const targetResult = await tx.execute(sql`
        SELECT id FROM transactions
        WHERE compliance_hash_state = 'complete' AND integrity_hash IS NOT NULL
        LIMIT 1
      `);
      const targetRows = (Array.isArray(targetResult) ? targetResult : (targetResult as { rows?: unknown[] })?.rows ?? []) as Array<{ id: string }>;
      if (targetRows.length === 0) {
        console.log("  no 'complete' row with hash to test against; skipping live test");
        return;
      }
      const id = targetRows[0].id;

      // Try to mutate integrity_hash. Should throw.
      try {
        await tx.execute(sql`
          UPDATE transactions
          SET integrity_hash = 'tampered-test-value-do-not-commit'
          WHERE id = ${id}
        `);
        // If we get here, the trigger DIDN'T fire — bug.
        triggerWorks = false;
      } catch (e) {
        triggerWorks = true;
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`  ✓ trigger blocked the mutation: "${msg.slice(0, 120)}..."`);
      }

      // Always roll back (the inner UPDATE either threw or shouldn't be committed)
      throw new Error("__intentional_rollback");
    });
  } catch (e) {
    if (e instanceof Error && e.message === "__intentional_rollback") {
      // expected
    } else {
      console.log(`  test transaction outer-throw: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`  trigger functional check: ${triggerWorks ? "PASS" : "FAIL"}`);

  console.log("\n=== Post-flight done ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("Post-flight failed:", err);
  process.exit(1);
});
