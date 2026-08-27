import dotenv from 'dotenv'; dotenv.config({ path: '../../.env' });
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 2 });
const W = '9a7d1191-2c2c-4927-a5cc-25c6ddd68d3c';
const t = await sql`SELECT table_name FROM information_schema.tables WHERE table_name ILIKE '%ledger%' OR table_name ILIKE '%wallet%' OR table_name ILIKE '%topup%' OR table_name ILIKE '%payment%' ORDER BY 1`;
console.log('## tables:', t.map(x=>x.table_name).join(','));
for (const tn of t.map(x=>x.table_name)) {
  const c = await sql`SELECT column_name FROM information_schema.columns WHERE table_name=${tn} ORDER BY 1`;
  console.log(`## ${tn}:`, c.map(x=>x.column_name).join(','));
}
console.log('## entries for wallet:');
try { console.log(JSON.stringify(await sql`SELECT * FROM wallet_ledger WHERE wallet_id=${W} ORDER BY created_at LIMIT 20`, null, 1)); } catch(e){ console.log('ERR', e.message); }
await sql.end();
