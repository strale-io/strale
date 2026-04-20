// Gate 2 helper: snapshot a capability row (pre/post diff).
// Usage: node gate2-snapshot.mjs <slug> [label]
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../../.env") });
import postgres from "postgres";

const slug = process.argv[2];
const label = process.argv[3] ?? "snapshot";
if (!slug) { console.error("usage: node gate2-snapshot.mjs <slug> [label]"); process.exit(1); }

const sql = postgres(process.env.DATABASE_URL);
const [row] = await sql`
  SELECT slug, lifecycle_state, visible, is_active, price_cents, is_free_tier,
         freshness_category, transparency_tag, geography, data_classification,
         processes_personal_data, personal_data_categories,
         maintenance_class, capability_type, output_field_reliability,
         updated_at, last_tested_at
  FROM capabilities WHERE slug = ${slug}
`;
console.log(`=== ${label}: ${slug} ===`);
console.log(JSON.stringify(row, null, 2));
await sql.end();
