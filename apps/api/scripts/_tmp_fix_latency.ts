import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { ssl: false, max: 1 });

const mean = await sql`
  SELECT round(avg(t.latency_ms))::int AS mean_ms, count(*)::int AS n
  FROM transactions t JOIN capabilities c ON c.id = t.capability_id
  WHERE c.slug = 'web-extract'
    AND t.created_at >= now() - interval '30 days'
    AND t.latency_ms IS NOT NULL AND t.status = 'completed'`;
console.log("measured mean (completed, 30d):", JSON.stringify(mean));

const newVal = Math.max(12000, mean[0].mean_ms ?? 0);
const updated = await sql`
  UPDATE capabilities
  SET avg_latency_ms = ${newVal}, updated_at = now()
  WHERE slug = 'web-extract'
  RETURNING slug, avg_latency_ms`;
console.log("updated:", JSON.stringify(updated));

await sql.end();
