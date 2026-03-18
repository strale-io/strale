import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });
import { sql } from "drizzle-orm";
import { getDb } from "../src/db/index.js";

const db = getDb();
const rows = await db.execute(sql`
  SELECT slug, lifecycle_state, visible
  FROM capabilities
  WHERE slug IN ('address-geocode','company-name-match','tax-id-validate','phone-type-detect','pep-check','age-verify','ip-risk-score')
  ORDER BY slug
`);
for (const r of (rows as any[]).map ? rows as any[] : (rows as any).rows) {
  console.log(r.slug, r.lifecycle_state, r.visible);
}
process.exit(0);
