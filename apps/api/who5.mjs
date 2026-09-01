import dotenv from 'dotenv'; dotenv.config({ path: '../../.env' });
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 2 });
const U='e3c68534-4d7b-4387-9156-a1913f3bc52b';
console.log('## other accounts on same domain:', JSON.stringify(await sql`
  SELECT COUNT(*)::int AS n FROM users WHERE email LIKE '%@dlgt.io'`));
console.log('## client_meta sample:', JSON.stringify(await sql`
  SELECT DISTINCT client_meta->>'ua' AS ua, COUNT(*)::int AS n FROM transactions
  WHERE user_id=${U} GROUP BY 1 ORDER BY n DESC LIMIT 5`));
console.log('## totals:', JSON.stringify(await sql`
  SELECT COUNT(*)::int calls, SUM(price_cents)::int cents, COUNT(*) FILTER (WHERE status='failed')::int failed,
         COUNT(DISTINCT (created_at AT TIME ZONE 'UTC')::date)::int days
  FROM transactions WHERE user_id=${U}`));
console.log('## failures:', JSON.stringify(await sql`
  SELECT c.slug, t.error, COUNT(*)::int n FROM transactions t LEFT JOIN capabilities c ON c.id=t.capability_id
  WHERE t.user_id=${U} AND t.status<>'completed' GROUP BY 1,2 ORDER BY n DESC LIMIT 10`, null, 1));
console.log('## recent stripe topups all users 30d:', JSON.stringify(await sql`
  SELECT wt.amount_cents, wt.created_at, split_part(u.email,'@',2) domain
  FROM wallet_transactions wt JOIN wallets w ON w.id=wt.wallet_id JOIN users u ON u.id=w.user_id
  WHERE wt.type='top_up' AND wt.created_at > NOW() - INTERVAL '120 days' ORDER BY wt.created_at DESC LIMIT 10`, null, 1));
await sql.end();
