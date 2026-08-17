import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { getDb } from "../src/db/index.js";
import { sql } from "drizzle-orm";

const db = getDb();

// Check when the last schema_check, negative, edge_case tests ran for iban-validate
const lastByType = await db.execute(sql`
  SELECT ts.test_type, MAX(tr.executed_at) as last_run, COUNT(*) as total_30d
  FROM test_results tr
  INNER JOIN test_suites ts ON ts.id = tr.test_suite_id
  WHERE tr.capability_slug = 'iban-validate'
    AND tr.executed_at >= NOW() - INTERVAL '30 days'
    AND ts.test_status IN ('normal', 'env_dependent', 'upstream_broken')
  GROUP BY ts.test_type
  ORDER BY last_run DESC
`);
const rows = (Array.isArray(lastByType) ? lastByType : (lastByType as any)?.rows ?? []) as any[];
console.log("Last run by test type:");
for (const r of rows) {
  console.log(" ", r.test_type, "| last:", new Date(r.last_run).toISOString(), "| count 30d:", r.total_30d);
}

// What is the oldest of the 10 most-recent run windows?
const windows = await db.execute(sql`
  SELECT DISTINCT DATE_TRUNC('minute', tr.executed_at) AS run_window
  FROM test_results tr
  INNER JOIN test_suites ts ON ts.id = tr.test_suite_id
  WHERE tr.capability_slug = 'iban-validate'
    AND tr.executed_at >= NOW() - INTERVAL '30 days'
    AND ts.test_status IN ('normal', 'env_dependent', 'upstream_broken')
  ORDER BY run_window DESC
  LIMIT 10
`);
const ws = (Array.isArray(windows) ? windows : (windows as any)?.rows ?? []) as any[];
const oldest = ws[ws.length - 1];
const newest = ws[0];
console.log("\nNewest run window (most recent):", new Date(newest.run_window).toISOString());
console.log("Oldest run window (10th most recent):", new Date(oldest.run_window).toISOString());

// Now: what test types have results WITHIN that oldest window to now?
const inWindow = await db.execute(sql`
  SELECT ts.test_type, COUNT(*) as count
  FROM test_results tr
  INNER JOIN test_suites ts ON ts.id = tr.test_suite_id
  WHERE tr.capability_slug = 'iban-validate'
    AND DATE_TRUNC('minute', tr.executed_at) >= ${oldest.run_window}::timestamptz
    AND tr.executed_at >= NOW() - INTERVAL '30 days'
    AND ts.test_status IN ('normal', 'env_dependent', 'upstream_broken')
  GROUP BY ts.test_type
`);
const inWindowRows = (Array.isArray(inWindow) ? inWindow : (inWindow as any)?.rows ?? []) as any[];
console.log("\nTest types in the 10-window range (oldest window onwards):");
for (const r of inWindowRows) console.log(" ", r.test_type, ":", r.count);

process.exit(0);
