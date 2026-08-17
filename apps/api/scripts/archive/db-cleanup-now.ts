/**
 * One-off DB cleanup + reclaim-space script.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/db-cleanup-now.ts --inspect
 *   DATABASE_URL=... npx tsx scripts/db-cleanup-now.ts --prune
 *   DATABASE_URL=... npx tsx scripts/db-cleanup-now.ts --vacuum
 *   DATABASE_URL=... npx tsx scripts/db-cleanup-now.ts --all
 *
 * Retention windows (same as db-retention cron):
 *   test_results             > 30 days
 *   health_monitor_events    > 30 days
 *   failed_requests          > 90 days
 *   test_run_log             > 180 days
 *
 * Does NOT touch: transactions, transaction_quality, sqs_daily_snapshot, users, wallets, capabilities.
 */
import postgres from "postgres";

const TABLES = [
  { name: "test_results", column: "executed_at", days: 30 },
  { name: "health_monitor_events", column: "created_at", days: 30 },
  { name: "failed_requests", column: "created_at", days: 90 },
  { name: "test_run_log", column: "started_at", days: 180 },
] as const;

// Plain VACUUM (not FULL) — reclaims space without taking exclusive locks.
// FULL is only needed if total DB size is pressuring the volume, which it isn't.
const VACUUM_TABLES = ["test_results", "health_monitor_events", "failed_requests", "test_run_log"] as const;

async function main() {
  const args = new Set(process.argv.slice(2));
  const all = args.has("--all");
  const doInspect = all || args.has("--inspect") || args.size === 0;
  const doPrune = all || args.has("--prune");
  const doVacuum = all || args.has("--vacuum");

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");

  const sql = postgres(url, { max: 1, connect_timeout: 20, idle_timeout: 5 });

  try {
    if (doInspect) {
      console.log("\n=== Top 15 tables by size ===");
      const sizes = await sql<Array<{ relname: string; n_live_tup: number; n_dead_tup: number; total_size: string }>>`
        SELECT C.relname,
               COALESCE(S.n_live_tup, 0)::int AS n_live_tup,
               COALESCE(S.n_dead_tup, 0)::int AS n_dead_tup,
               pg_size_pretty(pg_total_relation_size(C.oid)) AS total_size
        FROM pg_class C
        LEFT JOIN pg_namespace N ON (N.oid = C.relnamespace)
        LEFT JOIN pg_stat_user_tables S ON S.relid = C.oid
        WHERE nspname = 'public' AND C.relkind = 'r'
        ORDER BY pg_total_relation_size(C.oid) DESC
        LIMIT 15
      `;
      for (const r of sizes) {
        console.log(
          (r.relname ?? "").padEnd(34),
          String(r.n_live_tup).padStart(10),
          "live",
          String(r.n_dead_tup).padStart(10),
          "dead",
          r.total_size,
        );
      }
      const [{ size: dbSize }] = await sql`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`;
      console.log(`\nDB size: ${dbSize}`);
    }

    if (doPrune) {
      console.log("\n=== Pruning ===");
      for (const t of TABLES) {
        const cutoff = new Date(Date.now() - t.days * 86400_000).toISOString();
        const rows = await sql.unsafe(
          `DELETE FROM ${t.name} WHERE ${t.column} < $1 RETURNING 1`,
          [cutoff],
        );
        console.log(`  ${t.name.padEnd(30)} deleted ${rows.count} rows older than ${t.days} days`);
      }
    }

    if (doVacuum) {
      console.log("\n=== VACUUM ANALYZE (non-blocking) ===");
      for (const name of VACUUM_TABLES) {
        const start = Date.now();
        await sql.unsafe(`VACUUM (ANALYZE) ${name}`);
        console.log(`  ${name.padEnd(30)} done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
      }
      console.log("\n=== Post-vacuum sizes ===");
      const sizes = await sql<Array<{ relname: string; total_size: string }>>`
        SELECT C.relname, pg_size_pretty(pg_total_relation_size(C.oid)) AS total_size
        FROM pg_class C
        LEFT JOIN pg_namespace N ON (N.oid = C.relnamespace)
        WHERE nspname = 'public' AND C.relkind = 'r'
        ORDER BY pg_total_relation_size(C.oid) DESC
        LIMIT 10
      `;
      for (const r of sizes) console.log((r.relname ?? "").padEnd(34), r.total_size);
      const [{ size: dbSize }] = await sql`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`;
      console.log(`\nDB size: ${dbSize}`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
