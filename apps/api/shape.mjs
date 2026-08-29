import dotenv from 'dotenv'; dotenv.config({ path: '../../.env' });
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 2 });
const U='e3c68534-4d7b-4387-9156-a1913f3bc52b';
const rows = await sql`
  SELECT t.created_at, c.slug AS what, t.output, t.latency_ms
  FROM transactions t LEFT JOIN capabilities c ON c.id=t.capability_id
  WHERE t.user_id=${U} ORDER BY t.created_at`;

// Structural summary only: key names, array lengths, boolean/numeric values.
// Strings are reduced to a length, so no customer content is printed.
function shape(v){
  if (v===null) return null;
  if (Array.isArray(v)) return v.length===0 ? '[] EMPTY' : `[${v.length} items] e.g. keys=${JSON.stringify(Object.keys(v[0]||{}))}`;
  if (typeof v==='object'){ const o={}; for(const[k,val] of Object.entries(v)) o[k]=shape(val); return o; }
  if (typeof v==='string') return `<str len=${v.length}>`;
  return v; // numbers, booleans printed — these carry the verdict
}
for (const r of rows){
  console.log(`\n### ${r.what}  (${r.latency_ms}ms)  ${r.created_at.toISOString()}`);
  console.log(JSON.stringify(shape(r.output), null, 1).slice(0, 1100));
}
await sql.end();
