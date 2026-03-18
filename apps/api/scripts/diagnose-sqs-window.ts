/**
 * Diagnose why SQS window count differs from history window count.
 * Run: npx tsx scripts/diagnose-sqs-window.ts [slug]
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { sql } from "drizzle-orm";
import { getDb } from "../src/db/index.js";

const slug = process.argv[2] ?? "address-geocode";
const db = getDb();

// 1. Test suites for this capability
const suites = await db.execute(sql`
  SELECT id, test_type, test_status, active, schedule_tier
  FROM test_suites
  WHERE capability_slug = ${slug}
  ORDER BY test_type
`);
console.log(`\n=== Test suites for ${slug} ===`);
for (const s of (suites as any[]).map ? suites as any[] : (suites as any).rows) {
  console.log(`  ${String(s.test_type).padEnd(25)} status=${String(s.test_status).padEnd(20)} active=${s.active} tier=${s.schedule_tier}`);
}

// 2. Distinct windows WITH test_status filter (SQS query)
const sqsWindows = await db.execute(sql`
  SELECT DISTINCT DATE_TRUNC('minute', tr.executed_at) AS run_window
  FROM test_results tr
  INNER JOIN test_suites ts ON ts.id = tr.test_suite_id
  WHERE tr.capability_slug = ${slug}
    AND tr.executed_at >= NOW() - INTERVAL '30 days'
    AND ts.test_status IN ('normal', 'env_dependent', 'upstream_broken')
  ORDER BY run_window DESC
  LIMIT 20
`);
const sqsRows = Array.isArray(sqsWindows) ? sqsWindows : (sqsWindows as any).rows ?? [];
console.log(`\n=== SQS-filtered windows (${sqsRows.length}) ===`);
sqsRows.forEach((r: any) => console.log(`  ${r.run_window}`));

// 3. Distinct windows WITHOUT filter (history query)
const allWindows = await db.execute(sql`
  SELECT DISTINCT DATE_TRUNC('minute', tr.executed_at) AS run_window
  FROM test_results tr
  WHERE tr.capability_slug = ${slug}
    AND tr.executed_at >= NOW() - INTERVAL '30 days'
  ORDER BY run_window DESC
  LIMIT 20
`);
const allRows = Array.isArray(allWindows) ? allWindows : (allWindows as any).rows ?? [];
console.log(`\n=== All windows (${allRows.length}) ===`);
allRows.forEach((r: any) => console.log(`  ${r.run_window}`));

// 4. What test_status values appear in test_results for this cap?
const statusBreakdown = await db.execute(sql`
  SELECT ts.test_status, ts.test_type, COUNT(*) as cnt
  FROM test_results tr
  INNER JOIN test_suites ts ON ts.id = tr.test_suite_id
  WHERE tr.capability_slug = ${slug}
    AND tr.executed_at >= NOW() - INTERVAL '30 days'
  GROUP BY ts.test_status, ts.test_type
  ORDER BY ts.test_status, ts.test_type
`);
const sbRows = Array.isArray(statusBreakdown) ? statusBreakdown : (statusBreakdown as any).rows ?? [];
console.log(`\n=== test_results by suite status+type ===`);
sbRows.forEach((r: any) => console.log(`  test_status=${r.test_status?.padEnd(20)} type=${r.test_type?.padEnd(25)} count=${r.cnt}`));

process.exit(0);
