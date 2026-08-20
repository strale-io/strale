import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { ssl: false, max: 1 });

const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='capability_limitations' ORDER BY ordinal_position`;
console.log("cols:", cols.map((c: any) => c.column_name).join(", "));

const existing = await sql`
  SELECT capability_slug, title FROM capability_limitations
  WHERE capability_slug IN ('web-extract','product-reviews-extract')
  ORDER BY capability_slug, display_order`;
console.log("existing:", JSON.stringify(existing));

await sql.end();
