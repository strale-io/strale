import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import postgres from "postgres";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  const [c1] = await sql`SELECT COUNT(*)::int AS n FROM information_schema.columns WHERE table_name='rate_limit_counters' AND column_name='bucket_key'`;
  const [c2] = await sql`SELECT COUNT(*)::int AS n FROM information_schema.columns WHERE table_name='transactions' AND column_name='compliance_hash_state'`;
  console.log(`rate_limit_counters.bucket_key: ${c1.n === 1 ? 'YES' : 'NO'}`);
  console.log(`transactions.compliance_hash_state: ${c2.n === 1 ? 'YES' : 'NO'}`);
  console.log("\n=== compliance_hash_state ===");
  const dist = await sql`SELECT compliance_hash_state AS state, COUNT(*)::int AS n FROM transactions GROUP BY 1 ORDER BY n DESC`;
  console.table(dist);
  console.log("\n=== integrity_hash_status (untouched) ===");
  const other = await sql`SELECT integrity_hash_status AS status, COUNT(*)::int AS n FROM transactions GROUP BY 1 ORDER BY n DESC`;
  console.table(other);
  console.log("\n=== rate_limit_counters recent ===");
  const rlc = await sql`SELECT bucket_key, count, window_start::text FROM rate_limit_counters WHERE window_start > NOW() - INTERVAL '24 hours' ORDER BY window_start DESC LIMIT 5`;
  console.table(rlc);
  await sql.end();
} catch (err) { console.error("ERROR:", err.message); await sql.end(); process.exit(1); }
