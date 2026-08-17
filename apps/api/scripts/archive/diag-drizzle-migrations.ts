import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });
const r = await sql`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 15`;
for (const row of r) console.log(row.created_at, row.hash.substring(0, 80));
await sql.end();
process.exit(0);
