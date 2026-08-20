import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { ssl: false, max: 1 });

const cap = await sql`
  SELECT slug, avg_latency_ms FROM capabilities WHERE slug IN ('web-extract','product-reviews-extract')`;
console.log("declared:", JSON.stringify(cap));

// Measured latency on real completed calls, 30d
const measured = await sql`
  SELECT c.slug, count(*)::int AS n,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY t.latency_ms)::int AS p50,
         percentile_cont(0.95) WITHIN GROUP (ORDER BY t.latency_ms)::int AS p95,
         max(t.latency_ms)::int AS max
  FROM transactions t JOIN capabilities c ON c.id = t.capability_id
  WHERE c.slug IN ('web-extract','product-reviews-extract')
    AND t.created_at >= now() - interval '30 days'
    AND t.latency_ms IS NOT NULL
  GROUP BY c.slug`;
console.log("measured 30d:", JSON.stringify(measured));

await sql.end();
