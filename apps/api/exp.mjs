import dotenv from 'dotenv'; dotenv.config({ path: '../../.env' });
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 2 });
const U='e3c68534-4d7b-4387-9156-a1913f3bc52b';

const q = async (k,s)=>{ try{ console.log('##',k); console.log(JSON.stringify(await s,null,1)); }catch(e){ console.log('##',k,'ERR:',e.message); } };

await q('per-call', sql`
  SELECT t.created_at, COALESCE(t.solution_slug, c.slug) AS what, t.status, t.price_cents,
         t.latency_ms, t.error IS NOT NULL AS has_error,
         length(t.output::text) AS output_bytes
  FROM transactions t LEFT JOIN capabilities c ON c.id=t.capability_id
  WHERE t.user_id=${U} ORDER BY t.created_at`);

await q('all statuses', sql`
  SELECT status, COUNT(*)::int n FROM transactions WHERE user_id=${U} GROUP BY 1`);

await q('failed_requests (asked for something we do not have)', sql`
  SELECT * FROM failed_requests WHERE user_id=${U} ORDER BY created_at`);
await sql.end();
