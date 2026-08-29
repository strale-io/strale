/**
 * What would `POST /v1/internal/onboarding/fix-latency` write? (#438)
 *
 * READ-ONLY. Run:  npx tsx scripts/dry-run-fix-latency.ts
 *
 * Same query and the same estimator the endpoint uses, against the read-only
 * operator handle, printing the decision per capability instead of writing it.
 * Exists because the endpoint's previous implementation wrote a routing-
 * relevant number derived from tests that never executed, and nothing showed
 * an operator what it was about to do before it did it.
 */
import { sql } from "drizzle-orm";
import { openOperatorDrizzle } from "../src/lib/operator-db.js";
import {
  estimateRoutingLatency,
  MIN_EXECUTION_SAMPLES,
  ROUTING_LATENCY_PERCENTILE,
} from "../src/lib/latency-estimate.js";
import { shouldExecuteAsync, SYNC_TRANSACTION_WALL_MS } from "../src/lib/execution-routing.js";

interface Row {
  slug: string;
  latencies: number[];
}

async function main(): Promise<void> {
  const db = openOperatorDrizzle();

  const rows = (await db.execute(sql`
    SELECT c.slug,
           coalesce(
             array_agg(t.latency_ms) FILTER (WHERE t.latency_ms IS NOT NULL),
             ARRAY[]::int[]
           ) AS latencies
      FROM capabilities c
      LEFT JOIN transactions t
        ON t.capability_id = c.id AND t.status = 'completed'
     WHERE c.is_active = TRUE AND c.avg_latency_ms IS NULL
     GROUP BY c.slug
     ORDER BY c.slug
  `)) as unknown as Row[];

  console.log(
    `Dry run of fix-latency over ${rows.length} active capabilities with a null avg_latency_ms.\n` +
      `Statistic: p${ROUTING_LATENCY_PERCENTILE * 100} of completed executions, ` +
      `minimum ${MIN_EXECUTION_SAMPLES} samples. Sync wall ${SYNC_TRANSACTION_WALL_MS} ms.\n`,
  );

  const wouldWrite: Array<{ slug: string; value: number; lane: string; samples: number }> = [];
  const wouldSkip: Array<{ slug: string; reason: string }> = [];

  for (const r of rows) {
    const estimate = estimateRoutingLatency((r.latencies ?? []).map(Number));
    if (estimate.value === null) {
      wouldSkip.push({ slug: r.slug, reason: estimate.reason });
      continue;
    }
    wouldWrite.push({
      slug: r.slug,
      value: estimate.value,
      lane: shouldExecuteAsync(estimate.value) ? "ASYNC" : "sync",
      samples: estimate.samples,
    });
  }

  const flipped = wouldWrite.filter((w) => w.lane === "ASYNC");
  console.log(`WOULD WRITE (${wouldWrite.length}) — ${flipped.length} of them change lane to async:\n`);
  console.log(`  ${"slug".padEnd(32)}${"value".padStart(8)}${"samples".padStart(9)}   lane`);
  for (const w of wouldWrite.sort((a, b) => b.value - a.value)) {
    console.log(
      `  ${w.slug.padEnd(32)}${String(w.value).padStart(8)}${String(w.samples).padStart(9)}   ${w.lane}`,
    );
  }

  console.log(`\nWOULD SKIP (${wouldSkip.length}) — left null on purpose:\n`);
  for (const s of wouldSkip) console.log(`  ${s.slug.padEnd(32)} ${s.reason}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("dry-run-fix-latency failed:", err);
  process.exit(1);
});
