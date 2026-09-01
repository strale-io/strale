import postgres from "postgres";
import { config } from "dotenv";
config({ path: "C:/Users/pette/Projects/strale/.env" });
const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 1 });
const DEPLOY='2026-08-27T22:10:42Z';
const r = await sql`
  SELECT ts.test_type, tr.passed, left(coalesce(tr.failure_reason,''),80) AS reason, tr.executed_at
  FROM test_results tr JOIN test_suites ts ON ts.id=tr.test_suite_id
  WHERE tr.capability_slug='image-resize' AND tr.executed_at > ${DEPLOY}::timestamptz
  ORDER BY tr.executed_at`;
console.log("TYPES=" + r.map(x=>x.test_type).join(","));
console.table(r);
await sql.end();
