/**
 * Which active capabilities are routed into a wall they cannot clear? (#436)
 *
 * READ-ONLY. Run:  npx tsx scripts/audit-execution-routing.ts
 *
 * `/v1/do` decides sync-vs-async from `capabilities.avg_latency_ms` against a
 * 10s threshold, but the sync path itself dies at 15s
 * (`idle_in_transaction_session_timeout` in `executeSync`'s wallet
 * transaction). So a capability whose average is under 10s but whose TAIL runs
 * past 15s is routed sync and has its slowest calls killed — unbilled, but
 * unanswered. `page-speed-test` was in exactly that state when #434 measured
 * it: avg 8,000 ms declared, p95 19,029 ms observed.
 *
 * Two reasons a one-time query was not enough:
 *
 *   1. `avg_latency_ms` is a central-tendency statistic being used to predict
 *      whether a HARD limit will be crossed. It is structurally blind to the
 *      tail, so the mismatch recurs whenever a capability slows down.
 *   2. The observed latencies come from `transactions`, ~98% of which are the
 *      internal harness calling executors DIRECTLY — a path with no wall at
 *      all. The harness is therefore incapable of noticing the problem it is
 *      the only heavy user of. Completed rows exist at 49.9s.
 *
 * This reports; it does not write. Remediation is a scoped operator UPDATE of
 * `avg_latency_ms` (a `db`-authority column per `capability-field-authority.ts`
 * — measured at runtime, not authored in a manifest).
 */
import { sql } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import {
  ASYNC_THRESHOLD_MS,
  SYNC_TRANSACTION_WALL_MS,
  shouldExecuteAsync,
} from "../src/lib/execution-routing.js";

/** Ignore capabilities with too little traffic for a percentile to mean anything. */
const MIN_SAMPLES = 20;

interface Row {
  slug: string;
  avg_latency_ms: number | null;
  p50: number;
  p95: number;
  max: number;
  n: number;
  over_wall: number;
}

async function main(): Promise<void> {
  const db = getDb();
  // postgres-js returns the row array itself, not a `{ rows }` envelope — the
  // same shape trap `db.execute(...).count` vs `.rowCount` comes from.
  const rows = (await db.execute(sql`
    SELECT c.slug,
           c.avg_latency_ms,
           percentile_disc(0.50) WITHIN GROUP (ORDER BY t.latency_ms) AS p50,
           percentile_disc(0.95) WITHIN GROUP (ORDER BY t.latency_ms) AS p95,
           MAX(t.latency_ms) AS max,
           COUNT(*) AS n,
           COUNT(*) FILTER (WHERE t.latency_ms > ${SYNC_TRANSACTION_WALL_MS}) AS over_wall
      FROM capabilities c
      JOIN transactions t ON t.capability_id = c.id
     WHERE c.is_active = TRUE
       AND t.status = 'completed'
       AND t.created_at > now() - interval '90 days'
     GROUP BY c.slug, c.avg_latency_ms
    HAVING COUNT(*) >= ${MIN_SAMPLES}
     ORDER BY percentile_disc(0.95) WITHIN GROUP (ORDER BY t.latency_ms) DESC
  `)) as unknown as { rows: Row[] };

  const mismatched = rows.filter(
    (r) => !shouldExecuteAsync(r.avg_latency_ms) && Number(r.p95) > SYNC_TRANSACTION_WALL_MS,
  );

  console.log(
    `Routing threshold ${ASYNC_THRESHOLD_MS} ms; sync wall ${SYNC_TRANSACTION_WALL_MS} ms; ` +
      `${rows.length} active capabilities with >= ${MIN_SAMPLES} completed calls in 90 days.\n`,
  );

  if (mismatched.length === 0) {
    console.log("No capability is routed sync with a p95 past the wall.");
  } else {
    console.log("Routed SYNC but p95 exceeds the sync wall — slowest calls die unanswered:\n");
    console.log(
      `  ${"slug".padEnd(28)}${"avg".padStart(8)}${"p50".padStart(8)}${"p95".padStart(8)}` +
        `${"max".padStart(8)}${"n".padStart(7)}${"over wall".padStart(11)}`,
    );
    for (const r of mismatched) {
      const pct = ((100 * Number(r.over_wall)) / Number(r.n)).toFixed(1);
      console.log(
        `  ${r.slug.padEnd(28)}${String(r.avg_latency_ms ?? "null").padStart(8)}` +
          `${String(r.p50).padStart(8)}${String(r.p95).padStart(8)}${String(r.max).padStart(8)}` +
          `${String(r.n).padStart(7)}${`${r.over_wall} (${pct}%)`.padStart(11)}`,
      );
    }
    console.log(
      "\nRemedy per slug (operator, needs a write grant):\n" +
        "  UPDATE capabilities SET avg_latency_ms = <above " +
        `${ASYNC_THRESHOLD_MS}>, updated_at = now() WHERE slug = '<slug>';\n\n` +
        "Do NOT use POST /v1/internal/onboarding/fix-latency for these (#436): it\n" +
        "medians `test_results.response_time_ms` across ALL suites including the\n" +
        "negative and known_bad ones, which fail validation in ~5 ms without ever\n" +
        "executing. Measured 2026-08-29: page-speed-test's median over all 1,592\n" +
        "results is 6 ms, while the 617 results that actually ran median 11,208 ms.\n" +
        "That endpoint would route a slow capability sync. Use the p95 above.",
    );
  }

  // Reported separately: a null cannot be compared against a threshold, but it
  // is the same hazard by a different route — `shouldExecuteAsync(null)` is
  // false, so an unmeasured capability is always routed sync.
  const nulls = rows.filter((r) => r.avg_latency_ms == null);
  if (nulls.length > 0) {
    console.log(`\n${nulls.length} active capabilit${nulls.length === 1 ? "y has" : "ies have"} no avg_latency_ms (routed sync by default):`);
    for (const r of nulls) {
      console.log(`  ${r.slug.padEnd(28)} p95=${String(r.p95).padStart(7)}  max=${String(r.max).padStart(7)}  n=${r.n}`);
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("audit-execution-routing failed:", err);
  process.exit(1);
});
