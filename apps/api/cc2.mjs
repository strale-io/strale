import dotenv from 'dotenv'; dotenv.config({ path: '../../.env' });
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 2 });
const U='e3c68534-4d7b-4387-9156-a1913f3bc52b';
console.log(JSON.stringify(await sql`
  SELECT t.created_at,
         md5(lower(coalesce(t.output->'company_a'->>'domain','') || '|' || coalesce(t.output->'company_b'->>'domain',''))) AS pair_fingerprint,
         length(t.output->'comparison'->'positioning'->>'analysis') AS analysis_chars,
         jsonb_array_length(coalesce(t.output->'comparison'->'trust_signals'->'company_a','[]'::jsonb))
           + jsonb_array_length(coalesce(t.output->'comparison'->'trust_signals'->'company_b','[]'::jsonb)) AS trust_signals,
         t.latency_ms
  FROM transactions t JOIN capabilities c ON c.id=t.capability_id
  WHERE t.user_id=${U} AND c.slug='competitor-compare' ORDER BY t.created_at`, null, 1));
await sql.end();
