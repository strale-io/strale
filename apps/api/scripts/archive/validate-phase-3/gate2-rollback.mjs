// Gate 2 rollback: restore price_cents to pre-state.
// The Phase 2 authority-drift warning correctly noted that manifest (10)
// differs from DB (5), but Phase 4 hasn't hardened enforcement yet, so
// the backfill overwrote the DB value. Restoring.
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../../.env") });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL);
await sql`UPDATE capabilities SET price_cents = 5 WHERE slug = 'lei-lookup'`;
const [row] = await sql`SELECT slug, price_cents FROM capabilities WHERE slug = 'lei-lookup'`;
console.log("After rollback:", row);
await sql.end();
