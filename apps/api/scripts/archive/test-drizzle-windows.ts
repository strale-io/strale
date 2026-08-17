import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });
import { getDb } from "../src/db/index.js";
import { sql } from "drizzle-orm";

const db = getDb();
const slug = "iban-validate";

const runWindows = await db.execute(sql`
  SELECT DISTINCT DATE_TRUNC('minute', tr.executed_at) AS run_window
  FROM test_results tr
  INNER JOIN test_suites ts ON ts.id = tr.test_suite_id
  WHERE tr.capability_slug = ${slug}
    AND tr.executed_at >= NOW() - INTERVAL '30 days'
    AND ts.test_status IN ('normal', 'env_dependent', 'upstream_broken')
  ORDER BY run_window DESC
  LIMIT ${10}
`);

const windows = (Array.isArray(runWindows) ? runWindows : (runWindows as any)?.rows ?? []) as any[];
const w = windows[0];
console.log("windows.length:", windows.length);
console.log("first window type:", typeof w?.run_window, w?.run_window instanceof Date ? "Date" : "not Date");
console.log("first window raw:", JSON.stringify(w?.run_window));
console.log("getTime:", new Date(w?.run_window).getTime(), "isNaN:", isNaN(new Date(w?.run_window).getTime()));

// Build windowIndexMap
const windowIndexMap = new Map<number, number>();
for (let i = 0; i < windows.length; i++) {
  const t = new Date(windows[i].run_window).getTime();
  windowIndexMap.set(t, i);
}
console.log("Map size:", windowIndexMap.size);

const oldestWindow = windows[windows.length - 1].run_window;
const testRows = await db.execute(sql`
  SELECT ts.test_type, tr.passed, DATE_TRUNC('minute', tr.executed_at) AS run_window
  FROM test_results tr
  INNER JOIN test_suites ts ON ts.id = tr.test_suite_id
  WHERE tr.capability_slug = ${slug}
    AND DATE_TRUNC('minute', tr.executed_at) >= ${oldestWindow}::timestamptz
    AND tr.executed_at >= NOW() - INTERVAL '30 days'
    AND ts.test_status IN ('normal', 'env_dependent', 'upstream_broken')
    AND ts.test_type IN ('known_answer', 'piggyback', 'regression', 'schema_check', 'negative', 'edge_case')
    AND (tr.passed = true OR tr.failure_classification IS NULL OR tr.failure_classification IN ('upstream_degraded', 'upstream_changed', 'capability_bug'))
  LIMIT 10
`);

const rows = (Array.isArray(testRows) ? testRows : (testRows as any)?.rows ?? []) as any[];
console.log("testRows.length:", rows.length);
if (rows.length > 0) {
  const row = rows[0];
  const t = new Date(row.run_window).getTime();
  console.log("row run_window type:", typeof row.run_window, row.run_window instanceof Date ? "Date" : "not Date");
  console.log("row run_window raw:", JSON.stringify(row.run_window));
  console.log("row getTime:", t, "isNaN:", isNaN(t));
  console.log("Found in map?", windowIndexMap.has(t));
  console.log("Map keys sample:", [...windowIndexMap.keys()].slice(0, 3));
}

process.exit(0);
