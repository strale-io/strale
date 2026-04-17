import { config } from "dotenv";
import postgres from "postgres";
config({ path: "C:/Users/pette/Projects/strale/.env" });
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  console.log("=== advisory locks on hotfix lock IDs ===");
  const locks = await sql`
    SELECT objid, pid, mode, granted,
           (SELECT state FROM pg_stat_activity WHERE pid = pl.pid) AS state,
           (SELECT now() - state_change FROM pg_stat_activity WHERE pid = pl.pid) AS idle_for
    FROM pg_locks pl
    WHERE locktype = 'advisory'
      AND objid IN (20260417, 20260402, 20260415, 314159)
  `;
  console.table(locks);

  console.log("\n=== compliance_hash_state distribution ===");
  const dist = await sql`
    SELECT compliance_hash_state AS state, COUNT(*)::int AS n,
           MIN(created_at)::text AS oldest, MAX(created_at)::text AS newest
    FROM transactions GROUP BY 1 ORDER BY n DESC
  `;
  console.table(dist);

  console.log("\n=== oldest pending (should be < a few minutes old) ===");
  const oldest = await sql`
    SELECT id, created_at::text, compliance_hash_state, (now() - created_at) AS age
    FROM transactions WHERE compliance_hash_state = 'pending'
    ORDER BY created_at ASC LIMIT 5
  `;
  console.table(oldest);
  await sql.end();
} catch (err) {
  console.error("ERROR:", err.message);
  await sql.end();
  process.exit(1);
}
