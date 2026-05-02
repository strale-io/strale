import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../src/db/index.js";

const db = getDb();
const rows = await db.execute(sql`
  SELECT slug, x402_enabled, x402_method, price_cents, lifecycle_state, is_active
  FROM capabilities WHERE slug='paid-api-preflight'
`);
console.log(JSON.stringify(rows, null, 2));
process.exit(0);
