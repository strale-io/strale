/**
 * Read-only preview of what the capability-promotion tick would decide.
 *
 * Runs the job's exact evidence query and the exact pure core, and writes
 * nothing — no flag flips, no health_monitor_events. Use it to see the next
 * tick's decisions before they happen, or to check a promotion after the fact
 * against the evidence that produced it.
 *
 * The query is duplicated from jobs/capability-promotion.ts on purpose: this
 * script must be provably incapable of writing, which a shared code path that
 * also does the applying could not promise. The decision logic — the part
 * where being wrong matters — is imported, not copied.
 *
 * Run: cd apps/api && npx tsx scripts/preview-promotions.ts
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });
import postgres from "postgres";
import {
  evaluatePromotion,
  DEFAULT_PROMOTION_CONFIG,
} from "../src/lib/capability-promotion.js";
import { toPromotionStats, type PromotionEvidenceRow } from "../src/jobs/capability-promotion.js";

const connStr = process.env.DATABASE_URL;
if (!connStr) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const sql = postgres(connStr, { max: 1 });

const rows = await sql<PromotionEvidenceRow[]>`
  SELECT c.slug,
         c.lifecycle_state,
         c.visible,
         c.x402_enabled,
         COALESCE(c.is_free_tier, false)         AS is_free_tier,
         c.maintenance_class,
         COALESCE(c.marketplace_eligible, false) AS marketplace_eligible,
         c.deactivation_reason,
         (c.x402_method IS NOT NULL)             AS has_x402_method,
         h.state                                 AS breaker_state,
         COUNT(tr.id)::int                                          AS total_tests,
         COUNT(tr.id) FILTER (WHERE tr.passed)::int                 AS passed_tests,
         COUNT(DISTINCT date_trunc('day', tr.executed_at))::int     AS distinct_test_days,
         COUNT(tr.id) FILTER (WHERE ts.test_type = 'known_answer')::int               AS ka_total,
         COUNT(tr.id) FILTER (WHERE ts.test_type = 'known_answer' AND tr.passed)::int AS ka_passed
  FROM capabilities c
  LEFT JOIN capability_health h ON h.capability_slug = c.slug
  LEFT JOIN test_results tr
         ON tr.capability_slug = c.slug
        AND tr.executed_at > NOW() - INTERVAL '7 days'
  LEFT JOIN test_suites ts ON ts.id = tr.test_suite_id
  WHERE c.is_active = true
    AND c.visible = false
  GROUP BY c.slug, c.lifecycle_state, c.visible, c.x402_enabled, c.is_free_tier,
           c.maintenance_class, c.marketplace_eligible, c.deactivation_reason,
           c.x402_method, h.state`;

const decisions = evaluatePromotion(toPromotionStats(rows), DEFAULT_PROMOTION_CONFIG);

console.log(`Delisted-but-active capabilities evaluated: ${rows.length}`);
console.log(`Config: ${JSON.stringify(DEFAULT_PROMOTION_CONFIG)}\n`);

for (const action of ["promote", "flag", "none"] as const) {
  const group = decisions.filter((d) => d.action === action);
  if (group.length === 0) continue;
  console.log(`--- ${action.toUpperCase()} (${group.length}) ---`);
  for (const d of group) console.log(`  ${d.slug}\n    ${d.reason}`);
  console.log();
}
if (decisions.length === 0) console.log("No decisions: nothing clears the bar this window.");

// The core's hard filters produce no decision at all, by design — a
// capability that fails one of them is not a near-miss worth an event every
// day. But "absent from the output" is the shape a bug hides in, so the
// preview always shows the full evidence table and names the first unmet
// gate for anything the core never reached a decision on.
const decided = new Set(decisions.map((d) => d.slug));
const cfg = DEFAULT_PROMOTION_CONFIG;
console.log("--- EVIDENCE (all evaluated) ---");
console.log("slug".padEnd(32), "state".padEnd(11), "pass".padEnd(9), "days", "ka".padStart(8), "  blocked by");
for (const r of [...rows].sort((a, b) => a.slug.localeCompare(b.slug))) {
  const rate = r.total_tests > 0 ? r.passed_tests / r.total_tests : 0;
  const blocked =
    !cfg.promotableLifecycles.includes(r.lifecycle_state) ? `lifecycle_state=${r.lifecycle_state}`
    : r.deactivation_reason !== null ? `deactivation_reason set`
    : !r.marketplace_eligible ? "marketplace_eligible=false"
    : !(r.breaker_state === null || r.breaker_state === "closed") ? `breaker=${r.breaker_state}`
    : r.total_tests < cfg.minTests ? `only ${r.total_tests} results (need ${cfg.minTests})`
    : r.distinct_test_days < cfg.minDistinctTestDays ? `only ${r.distinct_test_days} test days (need ${cfg.minDistinctTestDays})`
    : rate < cfg.minPassRate ? `pass rate below ${cfg.minPassRate}`
    : decided.has(r.slug) ? "" : "(see decision above)";
  console.log(
    r.slug.padEnd(32),
    r.lifecycle_state.padEnd(11),
    `${(rate * 100).toFixed(0)}% (${r.passed_tests}/${r.total_tests})`.padEnd(9),
    String(r.distinct_test_days).padEnd(4),
    `${r.ka_passed}/${r.ka_total}`.padStart(8),
    "  " + (decided.has(r.slug) ? `→ ${decisions.find((d) => d.slug === r.slug)!.action}` : blocked),
  );
}

await sql.end({ timeout: 5 });
