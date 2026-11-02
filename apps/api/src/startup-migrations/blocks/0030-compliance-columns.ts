import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0030: compliance infrastructure (transactions hash chain) ────────
//
// Adds three columns to the transactions table for the EU AI Act / DEC-
// 20260428-B audit-trail engine: hash-chained integrity, parent-link, and
// a legal-hold flag. Plus an index on the integrity_hash for chain-walk
// performance.
//
// information_schema check + skip pattern matches blocks 0028 / 0029.
// Cannot use a bare ADD COLUMN IF NOT EXISTS for `legal_hold` because the
// NOT NULL DEFAULT false would re-apply on a pre-existing column without
// the conditional — at best a no-op, at worst confusing in audit logs.

export async function runMigration0030_complianceColumns(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  // information_schema column counts return bigint; coerce via text to avoid postgres-js's bigint→string default.
  const check = await tx.execute(sql`
    SELECT count(*)::text AS cnt FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'integrity_hash'
  `);
  const rows = Array.isArray(check) ? check : (check as { rows?: unknown[] })?.rows ?? [];
  const exists = (rows[0] as { cnt?: string })?.cnt !== "0";

  if (exists) {
    return {
      block: "0030_compliance_columns",
      outcome: "skipped (columns already exist)",
      duration_ms: Date.now() - startedAt,
    };
  }

  await tx.execute(sql`ALTER TABLE "transactions" ADD COLUMN "integrity_hash" varchar(128)`);
  await tx.execute(sql`ALTER TABLE "transactions" ADD COLUMN "previous_hash" varchar(128)`);
  await tx.execute(sql`ALTER TABLE "transactions" ADD COLUMN "legal_hold" boolean DEFAULT false NOT NULL`);
  await tx.execute(sql`CREATE INDEX IF NOT EXISTS "transactions_integrity_hash_idx" ON "transactions" ("integrity_hash")`);

  return {
    block: "0030_compliance_columns",
    outcome: "added integrity_hash + previous_hash + legal_hold + index",
    duration_ms: Date.now() - startedAt,
  };
}
