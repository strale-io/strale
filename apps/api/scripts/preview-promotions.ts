/**
 * Read-only preview of what the capability-promotion tick would decide.
 *
 * Runs the job's exact evidence query (imported, not copied — a preview that
 * can drift from the job is worse than none) and the job's exact pure core,
 * and writes nothing: no flag flips, no health_monitor_events. Use it to see
 * the next tick's decisions before they happen, or to check a promotion after
 * the fact against the evidence that produced it.
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
import {
  toPromotionStats,
  PROMOTION_EVIDENCE_SQL,
  isEnforceMode,
  type PromotionEvidenceRow,
} from "../src/jobs/capability-promotion.js";

const connStr = process.env.DATABASE_URL;
if (!connStr) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const sql = postgres(connStr, { max: 1 });

const rows = await sql.unsafe<PromotionEvidenceRow[]>(PROMOTION_EVIDENCE_SQL);
const stats = toPromotionStats(rows);
const decisions = evaluatePromotion(stats, DEFAULT_PROMOTION_CONFIG);

console.log(`Delisted-but-active capabilities evaluated: ${rows.length}`);
console.log(`Job would run in: ${isEnforceMode() ? "ENFORCE" : "dry-run"} mode`);
console.log(`Config: ${JSON.stringify(DEFAULT_PROMOTION_CONFIG)}\n`);

for (const action of ["promote", "flag", "none"] as const) {
  const group = decisions.filter((d) => d.action === action);
  if (group.length === 0) continue;
  console.log(`--- ${action.toUpperCase()} (${group.length}) ---`);
  for (const d of group) console.log(`  ${d.slug}\n    ${d.reason}`);
  console.log();
}
if (decisions.length === 0) console.log("No decisions: nothing clears the bar this window.\n");

// The core's hard filters produce no decision at all, by design — a capability
// that fails one of them is not a near-miss worth an event every day. But
// "absent from the output" is the shape a bug hides in, so the preview always
// shows the full evidence table and names the first unmet gate for anything
// the core never reached a decision on.
const byslug = new Map(decisions.map((d) => [d.slug, d]));
const cfg = DEFAULT_PROMOTION_CONFIG;
console.log("--- EVIDENCE (all evaluated) ---");
console.log("slug".padEnd(32), "state".padEnd(11), "pass".padEnd(14), "days", "ka".padStart(8), "24h".padStart(7), "  outcome");
for (const s of [...stats].sort((a, b) => a.slug.localeCompare(b.slug))) {
  const rate = s.totalTests > 0 ? s.passedTests / s.totalTests : 0;
  const d = byslug.get(s.slug);
  const blocked =
    !cfg.promotableLifecycles.includes(s.lifecycleState) ? `lifecycle_state=${s.lifecycleState}`
    : s.deactivationReason !== null ? "deactivation_reason set"
    : !s.marketplaceEligible ? "marketplace_eligible=false"
    : !(s.breakerState === null || s.breakerState === "closed") ? `breaker=${s.breakerState}`
    : s.totalTests < cfg.minTests ? `only ${s.totalTests} results (need ${cfg.minTests})`
    : s.distinctTestDays < cfg.minDistinctTestDays ? `only ${s.distinctTestDays} test days (need ${cfg.minDistinctTestDays})`
    : rate < cfg.minPassRate ? `pass rate below ${cfg.minPassRate}`
    : "(no decision — unexpected, investigate)";
  console.log(
    s.slug.padEnd(32),
    s.lifecycleState.padEnd(11),
    `${(rate * 100).toFixed(0)}% (${s.passedTests}/${s.totalTests})`.padEnd(14),
    String(s.distinctTestDays).padEnd(4),
    `${s.knownAnswerPassed}/${s.knownAnswerTotal}`.padStart(8),
    `${s.recentPassed}/${s.recentTotal}`.padStart(7),
    "  " + (d ? `→ ${d.action}` : blocked),
  );
}

await sql.end({ timeout: 5 });
