/**
 * WP9 post-deploy watch, phase 3. READ-ONLY.
 *
 * Phase 1 (first fact) fired 2026-08-22T19:38:07Z: x402_gateway / customer_paid,
 * epoch verified, no double count. Two events remain before acceptance:
 *
 *   - the first tick AFTER the epoch, which is the first tick that actually
 *     reads the fact branch. Until one runs, the floor has never consumed a
 *     fact in production.
 *   - the first solution_step fact, which is the defect closing.
 *
 * Plus the standing escalation conditions.
 */
import { config } from "dotenv";
import postgres from "postgres";
config({ path: ".env" });

const EPOCH = "2026-08-22T19:38:07.262Z";
const sql = postgres((process.env.DATABASE_URL || "").trim(), { max: 1, ssl: false, prepare: false });

try {
  const [step] = await sql`
    SELECT COUNT(*)::int AS n FROM capability_invocations WHERE rail='solution_step'`;
  const [vdo] = await sql`
    SELECT COUNT(*)::int AS n FROM capability_invocations WHERE rail='v1_do'`;
  const [failed] = await sql`
    SELECT COUNT(*)::int AS n FROM health_monitor_events
    WHERE event_type='invocation_fact_write_failed'`;
  const [supp] = await sql`
    SELECT COUNT(*)::int AS n FROM health_monitor_events
    WHERE event_type='quality_floor' AND action_taken='suppressed_incomplete_evidence'`;
  const [unprot] = await sql`
    SELECT COUNT(*)::int AS n FROM health_monitor_events
    WHERE event_type='quality_floor' AND action_taken='tick_complete'
      AND details->>'facts_table_protected'='false'`;

  const reasons = [];
  if (step.n > 0) reasons.push(`first solution_step fact (${step.n})`);
  if (vdo.n > 0) reasons.push(`first v1_do fact (${vdo.n})`);
  if (failed.n > 0) reasons.push(`ESCALATE: ${failed.n} invocation_fact_write_failed`);
  if (supp.n > 0) reasons.push(`ESCALATE: ${supp.n} suppressed_incomplete_evidence`);
  if (unprot.n > 0) reasons.push(`ESCALATE: ${unprot.n} ticks protected=false`);

  if (reasons.length) {
    console.log("WP9 WATCH FIRED: " + reasons.join(" | "));
    await sql.end();
    process.exit(0);
  }
  await sql.end();
  process.exit(1);
} catch (err) {
  console.error("watch probe error:", err instanceof Error ? err.message : String(err));
  await sql.end().catch(() => {});
  process.exit(1);
}
