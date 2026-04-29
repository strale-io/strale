/** Quick post-flight verification for migration 0055. */
import { config } from "dotenv";
import { resolve } from "node:path";
import postgres from "postgres";
config({ path: resolve(import.meta.dirname, "../../../.env") });
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });
const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='transactions' AND column_name='client_ip_hash'`;
console.log(`client_ip_hash column: ${cols.length === 1 ? "EXISTS" : "MISSING"}`);
const idx = await sql`SELECT indexname FROM pg_indexes WHERE indexname='transactions_free_tier_ip_hash_idx'`;
console.log(`partial index: ${idx.length === 1 ? "EXISTS" : "MISSING"}`);
const today = await sql`SELECT COUNT(*)::int AS n, COUNT(client_ip_hash)::int AS with_ip FROM transactions WHERE created_at >= CURRENT_DATE AND user_id IS NULL AND is_free_tier = true`;
console.log(`today's free-tier rows: ${today[0].n}, with client_ip_hash backfilled: ${today[0].with_ip}`);
await sql.end();
process.exit(0);
