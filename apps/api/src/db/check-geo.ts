import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../../.env") });

import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

async function run() {
  // Check what US-related slugs exist
  const usRows = await sql`SELECT slug, geography FROM capabilities WHERE is_active = true AND (slug LIKE '%us-%' OR slug LIKE '%sec-%' OR slug LIKE '%fda%' OR slug LIKE '%trademark%') ORDER BY slug`;
  console.log("US-related capabilities:");
  for (const r of usRows) console.log(`  ${r.slug} -> ${r.geography}`);

  // Check nordic
  const nordicRows = await sql`SELECT slug, geography FROM capabilities WHERE geography = 'nordic' ORDER BY slug`;
  console.log("\nNordic capabilities:");
  for (const r of nordicRows) console.log(`  ${r.slug}`);

  // Count by geography
  const counts = await sql`SELECT geography, count(*)::int as cnt FROM capabilities WHERE is_active = true GROUP BY geography ORDER BY cnt DESC`;
  console.log("\nFull distribution:");
  for (const r of counts) console.log(`  ${r.geography}: ${r.cnt}`);

  await sql.end();
}

run().catch(console.error);
