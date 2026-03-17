/**
 * Weekly Health Sweep — Sprint 7C
 *
 * Runs once per week (triggered from scheduler) to act on accumulated
 * failure classifications and apply auto-remediations.
 *
 * 5 sweep checks:
 *   1. Stale date scan — find test inputs with expired dates, auto-fix
 *   2. URL liveness — probe URLs in test inputs, flag dead ones
 *   3. Quarantine review — check if quarantined suites should be released
 *   4. Upstream recovery — check if upstream_broken suites have recovered
 *   5. Health report — log summary of classification distribution
 */

import { eq, and, sql, desc, inArray, gte } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { testSuites, testResults } from "../db/schema.js";
import { analyzeAndRemediate, applyRemediation } from "./auto-remediation.js";
import { runUpstreamEscalationSweep } from "./upstream-tracker.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SweepReport {
  timestamp: string;
  staleDateFixes: number;
  deadUrlsFound: number;
  quarantineReleased: string[];
  upstreamRecovered: string[];
  classificationSummary: Record<string, number>;
  totalSuitesScanned: number;
  remediationsApplied: number;
  remediationsProposed: number;
}

// ─── Main sweep function ────────────────────────────────────────────────────

export async function runWeeklyHealthSweep(): Promise<SweepReport> {
  const db = getDb();
  console.log("[health-sweep] Starting weekly health sweep");

  const report: SweepReport = {
    timestamp: new Date().toISOString(),
    staleDateFixes: 0,
    deadUrlsFound: 0,
    quarantineReleased: [],
    upstreamRecovered: [],
    classificationSummary: {},
    totalSuitesScanned: 0,
    remediationsApplied: 0,
    remediationsProposed: 0,
  };

  // ── 1. Scan all active suites with recent failures ──────────────────────
  const failingSuites = await db
    .select()
    .from(testSuites)
    .where(and(
      eq(testSuites.active, true),
      sql`${testSuites.lastClassification} IS NOT NULL`,
    ));

  report.totalSuitesScanned = failingSuites.length;

  // ── 2. Build classification summary ────────────────────────────────────
  for (const suite of failingSuites) {
    const cls = suite.lastClassification as { verdict: string } | null;
    if (cls?.verdict) {
      report.classificationSummary[cls.verdict] =
        (report.classificationSummary[cls.verdict] ?? 0) + 1;
    }
  }

  // ── 3. Auto-remediate failing suites ───────────────────────────────────
  for (const suite of failingSuites) {
    try {
      const actions = await analyzeAndRemediate(suite);
      if (actions.length === 0) continue;

      const applied = actions.filter((a) => a.applied);
      const proposed = actions.filter((a) => !a.applied);

      report.remediationsApplied += applied.length;
      report.remediationsProposed += proposed.length;

      // Count stale date fixes specifically
      report.staleDateFixes += applied.filter((a) => a.rule === "stale_date").length;
      report.deadUrlsFound += actions.filter((a) => a.rule === "dead_url").length;

      // Apply remediations (only HIGH/MEDIUM confidence auto-apply)
      await applyRemediation(suite.id, actions);
    } catch (err) {
      console.warn(`[health-sweep] Remediation failed for ${suite.capabilitySlug}:`, err);
    }
  }

  // ── 4. Quarantine review — release suites that have recovered ──────────
  const quarantinedSuites = await db
    .select()
    .from(testSuites)
    .where(and(
      eq(testSuites.active, true),
      eq(testSuites.testStatus, "quarantined"),
    ));

  for (const suite of quarantinedSuites) {
    const recovered = await checkQuarantineRecovery(suite);
    if (recovered) {
      await db.update(testSuites).set({
        testStatus: "normal",
        quarantineReason: null,
        updatedAt: new Date(),
      }).where(eq(testSuites.id, suite.id));
      report.quarantineReleased.push(suite.capabilitySlug);
      console.log(`[health-sweep] Released ${suite.capabilitySlug} from quarantine`);
    }
  }

  // ── 5. Upstream recovery — check if upstream_broken suites are back ────
  const upstreamBrokenSuites = await db
    .select()
    .from(testSuites)
    .where(and(
      eq(testSuites.active, true),
      eq(testSuites.testStatus, "upstream_broken"),
    ));

  for (const suite of upstreamBrokenSuites) {
    const recovered = await checkUpstreamRecovery(suite);
    if (recovered) {
      await db.update(testSuites).set({
        testStatus: "normal",
        lastClassification: null,
        updatedAt: new Date(),
      }).where(eq(testSuites.id, suite.id));
      report.upstreamRecovered.push(suite.capabilitySlug);
      console.log(`[health-sweep] Upstream recovered: ${suite.capabilitySlug}`);
    }
  }

  // ── 6. Upstream escalation sweep ─────────────────────────────────────
  try {
    const escalations = await runUpstreamEscalationSweep();
    for (const esc of escalations) {
      if (esc.suitesEscalated > 0) {
        console.log(`[health-sweep] Upstream escalation: ${esc.slug} → ${esc.suitesEscalated} suite(s) broken`);
      }
    }
  } catch (err) {
    console.warn("[health-sweep] Upstream escalation sweep failed:", err);
  }

  // ── 7. Log health report ──────────────────────────────────────────────
  logSweepReport(report);

  return report;
}

// ─── Recovery checks ────────────────────────────────────────────────────────

/**
 * Check if a quarantined suite has had recent passing results.
 * Requires 3+ consecutive passes in the last 7 days to release.
 */
async function checkQuarantineRecovery(
  suite: typeof testSuites.$inferSelect,
): Promise<boolean> {
  const db = getDb();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentResults = await db
    .select({ passed: testResults.passed })
    .from(testResults)
    .where(and(
      eq(testResults.testSuiteId, suite.id),
      gte(testResults.executedAt, sevenDaysAgo),
    ))
    .orderBy(desc(testResults.executedAt))
    .limit(5);

  if (recentResults.length < 3) return false;

  // Need 3 consecutive passes from the most recent
  let consecutivePasses = 0;
  for (const r of recentResults) {
    if (r.passed) consecutivePasses++;
    else break;
  }

  return consecutivePasses >= 3;
}

/**
 * Check if an upstream_broken suite has recovered.
 * Looks for any passing result in the last 48 hours.
 */
async function checkUpstreamRecovery(
  suite: typeof testSuites.$inferSelect,
): Promise<boolean> {
  const db = getDb();
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

  const [recentPass] = await db
    .select({ id: testResults.id })
    .from(testResults)
    .where(and(
      eq(testResults.testSuiteId, suite.id),
      eq(testResults.passed, true),
      gte(testResults.executedAt, twoDaysAgo),
    ))
    .limit(1);

  return !!recentPass;
}

// ─── Report logging ─────────────────────────────────────────────────────────

function logSweepReport(report: SweepReport): void {
  const lines = [
    `[health-sweep] ══════ Weekly Health Report ══════`,
    `[health-sweep] Suites scanned: ${report.totalSuitesScanned}`,
    `[health-sweep] Remediations applied: ${report.remediationsApplied}`,
    `[health-sweep] Remediations proposed: ${report.remediationsProposed}`,
    `[health-sweep] Stale date fixes: ${report.staleDateFixes}`,
    `[health-sweep] Dead URLs found: ${report.deadUrlsFound}`,
  ];

  if (report.quarantineReleased.length > 0) {
    lines.push(`[health-sweep] Quarantine released: ${report.quarantineReleased.join(", ")}`);
  }

  if (report.upstreamRecovered.length > 0) {
    lines.push(`[health-sweep] Upstream recovered: ${report.upstreamRecovered.join(", ")}`);
  }

  if (Object.keys(report.classificationSummary).length > 0) {
    lines.push(`[health-sweep] Classification distribution:`);
    for (const [verdict, count] of Object.entries(report.classificationSummary)) {
      lines.push(`[health-sweep]   ${verdict}: ${count}`);
    }
  }

  lines.push(`[health-sweep] ══════════════════════════════`);

  for (const line of lines) {
    console.log(line);
  }
}
