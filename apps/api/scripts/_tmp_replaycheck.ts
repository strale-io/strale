import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { ssl: false, max: 1 });

const rows = await sql`
  SELECT t.status, t.error, t.created_at, t.payment_method
  FROM transactions t JOIN capabilities c ON c.id = t.capability_id
  WHERE c.slug = 'web-extract' AND t.created_at >= now() - interval '30 minutes'
  ORDER BY t.created_at DESC LIMIT 5`;
console.log(JSON.stringify(rows, null, 2));

await sql.end();
