import dotenv from 'dotenv'; dotenv.config({ path: '../../.env' });
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 2 });
// identify the registered payer's purchases WITHOUT printing identity
const r = await sql`
  SELECT u.id, split_part(u.email,'@',2) AS domain, u.created_at,
         COUNT(*) AS calls, SUM(t.price_cents) AS cents,
         MIN(t.created_at) AS first_call, MAX(t.created_at) AS last_call
  FROM transactions t JOIN users u ON u.id = t.user_id
  WHERE t.status='completed' AND t.price_cents > 0 AND t.created_at > NOW() - INTERVAL '14 days'
  GROUP BY u.id, u.email, u.created_at ORDER BY cents DESC LIMIT 10`;
console.log('## registered payers (14d):', JSON.stringify(r, null, 1));
const s = await sql`
  SELECT COALESCE(t.solution_slug, t.capability_slug) AS what, COUNT(*) AS calls, SUM(t.price_cents) AS cents,
         MIN(t.created_at) AS first, MAX(t.created_at) AS last
  FROM transactions t JOIN users u ON u.id = t.user_id
  WHERE t.status='completed' AND t.price_cents>0 AND t.created_at > NOW() - INTERVAL '14 days'
    AND u.email NOT LIKE '%strale%'
  GROUP BY 1 ORDER BY cents DESC LIMIT 15`;
console.log('## what they bought:', JSON.stringify(s, null, 1));
await sql.end();
