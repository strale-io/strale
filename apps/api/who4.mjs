import dotenv from 'dotenv'; dotenv.config({ path: '../../.env' });
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 2 });
const W = '9a7d1191-2c2c-4927-a5cc-25c6ddd68d3c';
const r = await sql`SELECT type, amount_cents, description, (stripe_session_id IS NOT NULL) AS has_stripe, created_at
  FROM wallet_transactions WHERE wallet_id=${W} ORDER BY created_at LIMIT 30`;
console.log('## ledger:', JSON.stringify(r, null, 1));
const b = await sql`SELECT COALESCE(t.solution_slug, c.slug) AS what, COUNT(*) AS calls, SUM(t.price_cents) AS cents,
   MIN(t.created_at) AS first, MAX(t.created_at) AS last
  FROM transactions t LEFT JOIN capabilities c ON c.id = t.capability_id
  WHERE t.user_id='e3c68534-4d7b-4387-9156-a1913f3bc52b' AND t.status='completed' AND t.price_cents>0
  GROUP BY 1 ORDER BY cents DESC`;
console.log('## bought:', JSON.stringify(b, null, 1));
await sql.end();
