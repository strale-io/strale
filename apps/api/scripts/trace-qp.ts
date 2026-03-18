import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { getDb } from "../src/db/index.js";
import { sql } from "drizzle-orm";

const db = getDb();
const slug = "iban-validate";
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
const cutoff = thirtyDaysAgo.toISOString();
const ROLLING_RUNS = 10;

// Step 1: Get run windows
const runWindows = await db.execute(sql`
  SELECT DISTINCT DATE_TRUNC('minute', tr.executed_at) AS run_window
  FROM test_results tr
  INNER JOIN test_suites ts ON ts.id = tr.test_suite_id
  WHERE tr.capability_slug = ${slug}
    AND tr.executed_at >= ${cutoff}::timestamptz
    AND ts.test_status IN ('normal', 'env_dependent', 'upstream_broken')
  ORDER BY run_window DESC
  LIMIT ${ROLLING_RUNS}
`);
const windows = (Array.isArray(runWindows) ? runWindows : (runWindows as any)?.rows ?? []) as any[];
console.log("Run windows count:", windows.length);

const windowIndexMap = new Map<number, number>();
for (let i = 0; i < windows.length; i++) {
  const t = new Date(windows[i].run_window).getTime();
  windowIndexMap.set(t, i);
}
console.log("windowIndexMap size:", windowIndexMap.size);

const oldestWindow = windows[windows.length - 1].run_window;

// Step 2: Get test rows (QP filter)
const rows = await db.execute(sql`
  SELECT
    ts.test_type,
    tr.passed,
    tr.failure_reason,
    tr.failure_classification,
    DATE_TRUNC('minute', tr.executed_at) AS run_window
  FROM test_results tr
  INNER JOIN test_suites ts ON ts.id = tr.test_suite_id
  WHERE tr.capability_slug = ${slug}
    AND DATE_TRUNC('minute', tr.executed_at) >= ${oldestWindow}::timestamptz
    AND tr.executed_at >= ${cutoff}::timestamptz
    AND ts.test_status IN ('normal', 'env_dependent', 'upstream_broken')
    AND ts.test_type IN ('known_answer', 'piggyback', 'regression', 'schema_check', 'negative', 'edge_case')
    AND (
      tr.passed = true
      OR tr.failure_classification IS NULL
      OR tr.failure_classification IN ('upstream_degraded', 'upstream_changed', 'capability_bug')
    )
  LIMIT 100
`);
const testRows = (Array.isArray(rows) ? rows : (rows as any)?.rows ?? []) as any[];
console.log("testRows count:", testRows.length);

// Step 3: Walk the accumulation loop exactly as the code does
const TYPE_TO_QP_FACTOR: Record<string, string> = {
  known_answer: "correctness",
  piggyback: "correctness",
  regression: "correctness",
  schema_check: "schema",
  negative: "error_handling",
  edge_case: "edge_cases",
};

const EXTERNAL_SERVICE_PATTERNS = [
  /HTTP 429/i, /HTTP 503/i, /HTTP 502/i,
  /Too Many Requests/i, /rate limit/i,
  /ECONNRESET/i, /ECONNREFUSED/i, /ETIMEDOUT/i,
  /timeout/i, /upstream/i, /Browserless/i,
  /VIES error/i, /Navigation timeout/i,
];

function isExternalServiceFailure(reason: string | null) {
  if (!reason) return false;
  return EXTERNAL_SERVICE_PATTERNS.some((p) => p.test(reason));
}

const accum: Record<string, { total: number }> = {
  correctness: { total: 0 },
  schema: { total: 0 },
  error_handling: { total: 0 },
  edge_cases: { total: 0 },
};

let skippedNoFactor = 0;
let skippedExternal = 0;
let skippedNoWindow = 0;
let counted = 0;

for (const row of testRows) {
  const factor = TYPE_TO_QP_FACTOR[row.test_type];
  if (!factor) { skippedNoFactor++; continue; }
  if (!row.passed && isExternalServiceFailure(row.failure_reason)) { skippedExternal++; continue; }
  const runIndex = windowIndexMap.get(new Date(row.run_window).getTime()) ?? -1;
  if (runIndex < 0) { skippedNoWindow++; continue; }
  accum[factor].total++;
  counted++;
}

console.log("Accumulation results:");
console.log("  skippedNoFactor:", skippedNoFactor);
console.log("  skippedExternal:", skippedExternal);
console.log("  skippedNoWindow:", skippedNoWindow);
console.log("  counted:", counted);
console.log("  accum.correctness.total:", accum.correctness.total);
console.log("  accum.schema.total:", accum.schema.total);
console.log("  accum.error_handling.total:", accum.error_handling.total);
console.log("  accum.edge_cases.total:", accum.edge_cases.total);

// Check condition at line 205
const factorsWithData = ["correctness", "schema", "error_handling", "edge_cases"].filter((k) => accum[k].total > 0);
console.log("\nfactorsWithData:", factorsWithData);
console.log("Would go pending?", factorsWithData.length < 2 || accum.correctness.total === 0);

process.exit(0);
