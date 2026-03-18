import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const tables = await sql`SELECT schemaname, tablename FROM pg_tables WHERE tablename LIKE '%migration%' OR tablename LIKE '%drizzle%'`;
  console.log("Migration tables:", JSON.stringify(tables));
  
  if (tables.length > 0) {
    const latest = await sql`SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 5`;
    console.log("Latest migrations:", JSON.stringify(latest));
  }
  await sql.end();
}
main();
