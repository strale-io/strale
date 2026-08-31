import dotenv from 'dotenv'; dotenv.config({ path: '../../.env' });
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 2 });
console.log('## capability row:', JSON.stringify(await sql`
  SELECT slug, avg_latency_ms, price_cents, is_active, x402_enabled FROM capabilities WHERE slug='competitor-compare'`));
console.log('## solution row:', JSON.stringify(await sql`
  SELECT slug, is_active, x402_enabled, price_cents FROM solutions WHERE slug='competitor-compare'`));
console.log('## ALL completed competitor-compare latencies (any user, 30d):', JSON.stringify(await sql`
  SELECT COUNT(*)::int n, MIN(latency_ms)::int min, MAX(latency_ms)::int max,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::int p50,
         percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::int p95,
         COUNT(*) FILTER (WHERE latency_ms > 13000)::int over_13s
  FROM transactions WHERE solution_slug='competitor-compare' AND status='completed'
    AND created_at > NOW() - INTERVAL '30 days'`));
console.log('## non-completed competitor-compare (30d):', JSON.stringify(await sql`
  SELECT status, COUNT(*)::int n FROM transactions WHERE solution_slug='competitor-compare'
    AND created_at > NOW() - INTERVAL '30 days' GROUP BY 1`));
await sql.end();
