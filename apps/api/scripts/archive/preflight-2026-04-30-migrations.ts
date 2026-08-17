/**
 * Pre-flight check for migrations 0056 (x402_payment_hash) and 0057
 * (user erasure + ToS).
 *
 * Both are pure ADD COLUMN / CREATE INDEX operations — non-destructive.
 * The 0057 backfill UPDATE touches every users row to set tos_accepted_at.
 * Run from apps/api/: npx tsx scripts/preflight-2026-04-30-migrations.ts
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
config({ path: resolve(import.meta.dirname, "../../../.env") });

const db = getDb();

async function main() {
  console.log("=== Pre-flight: 0056 / 0057 ===\n");

  // 0056 — does x402_payment_hash column exist yet?
  const c0056 = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='transactions'
        AND column_name='x402_payment_hash'
    ) AS exists
  `);
  const c0056Rows = (Array.isArray(c0056) ? c0056 : (c0056 as { rows?: unknown[] })?.rows ?? []) as Array<{ exists: boolean }>;
  console.log(`0056: transactions.x402_payment_hash exists = ${c0056Rows[0]?.exists} (expect false)`);

  // 0057 — does deleted_at on users exist yet?
  const c0057 = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users'
      AND column_name IN ('deleted_at', 'deletion_reason', 'tos_accepted_at', 'tos_version')
    ORDER BY column_name
  `);
  const c0057Rows = (Array.isArray(c0057) ? c0057 : (c0057 as { rows?: unknown[] })?.rows ?? []) as Array<{ column_name: string }>;
  console.log(`0057: erasure/ToS columns present in users = ${c0057Rows.length} (expect 0)`);
  for (const r of c0057Rows) console.log(`  ${r.column_name}`);

  // Backfill scope — how many users rows would the 0057 UPDATE touch?
  const userCountResult = await db.execute(sql`SELECT COUNT(*)::int AS n FROM users`);
  const userCountRows = (Array.isArray(userCountResult) ? userCountResult : (userCountResult as { rows?: unknown[] })?.rows ?? []) as Array<{ n: number }>;
  console.log(`\n0057 backfill scope: ${userCountRows[0]?.n ?? 0} users rows`);

  console.log("\n=== Pre-flight done ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("Pre-flight failed:", err);
  process.exit(1);
});
