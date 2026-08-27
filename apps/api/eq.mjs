import dotenv from 'dotenv'; dotenv.config({ path: '../../.env' });
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 2 });
const U='e3c68534-4d7b-4387-9156-a1913f3bc52b';
// Compare WITHOUT disclosing content: equality + a company-suffix regex test.
console.log(JSON.stringify(await sql`
  SELECT c.slug,
         md5(lower(coalesce(t.output->>'query', t.output->>'searched_name','')))  AS query_fingerprint,
         (t.output->>'query') ~* '(ltd|limited|plc|inc|llc|gmbh|holdings|group)\s*\.?$' AS looks_like_company,
         length(t.output->>'query') AS qlen
  FROM transactions t JOIN capabilities c ON c.id=t.capability_id
  WHERE t.user_id=${U} AND t.output ? 'query'
  ORDER BY t.created_at`, null, 1));
await sql.end();
