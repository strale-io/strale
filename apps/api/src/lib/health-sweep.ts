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
import { FIXTURE_RECAPTURE_QUARANTINE_MARKER } from "./test-runner.js";
// Lifecycle automatic sweep removed with the SQS engine (DEC-20260503-B).
import { runWeeklyChecks } from "./meta-monitoring.js";
import { log, logWarn } from "./log.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SweepReport {
  timestamp: string;
  staleDateFixes: number;
  deadUrlsFound: number;
  quarantineReleased: string[];
  // Codex closing-pass round 3: suites quarantined specifically for
  // exhausted fixture-recapture attempts are a human-only reset by
  // design (test-runner.ts's runSingleTest refuses further live calls
  // for this cause, and captureBaseline can never reset the failure
  // counter without a real successful execution). The generic
  // quarantine-review sweep below never even evaluates recovery for
  // these — this list is purely observability, so an operator scanning
  // sweep reports can see which suites are waiting on them, not on time.
  quarantineSkippedNeedsHuman: string[];
  upstreamRecovered: string[];
  classificationSummary: Record<string, number>;
  totalSuitesScanned: number;
  remediationsApplied: number;
  remediationsProposed: number;
}

// ─── Main sweep function ────────────────────────────────────────────────────

export async function runWeeklyHealthSweep(): Promise<SweepReport> {
  const db = getDb();
  log.info({ label: "health-sweep-start" }, "health-sweep-start");

  const report: SweepReport = {
    timestamp: new Date().toISOString(),
    staleDateFixes: 0,
    deadUrlsFound: 0,
    quarantineReleased: [],
    quarantineSkippedNeedsHuman: [],
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
      logWarn("health-sweep-remediation-failed", "remediation failed", {
        capability_slug: suite.capabilitySlug,
        err: err instanceof Error ? err.message : String(err),
      });
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
    // Codex closing-pass round 3: exhausted-recapture quarantine is a
    // human-only reset by design (test-runner.ts's runSingleTest already
    // refuses every further live call for this cause, so the passing
    // evidence checkQuarantineRecovery looks for can never be generated
    // while it stays quarantined — this generic sweep must not even
    // evaluate recovery for it, let alone release it). Explicit rather
    // than relying on "checkQuarantineRecovery organically never finds 3
    // consecutive passes" holding by construction: that's true today but
    // fragile if either threshold changes independently later, and it
    // doesn't document the "needs human" intent anywhere a future reader
    // of THIS sweep would see it.
    if (suite.quarantineReason?.startsWith(FIXTURE_RECAPTURE_QUARANTINE_MARKER)) {
      report.quarantineSkippedNeedsHuman.push(suite.capabilitySlug);
      continue;
    }

    const recovered = await checkQuarantineRecovery(suite);
    if (recovered) {
      await db.update(testSuites).set({
        testStatus: "normal",
        quarantineReason: null,
        updatedAt: new Date(),
      }).where(eq(testSuites.id, suite.id));
      report.quarantineReleased.push(suite.capabilitySlug);
      log.info(
        { label: "health-sweep-quarantine-released", capability_slug: suite.capabilitySlug },
        "health-sweep-quarantine-released",
      );
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
      log.info(
        { label: "health-sweep-upstream-recovered", capability_slug: suite.capabilitySlug },
        "health-sweep-upstream-recovered",
      );
    }
  }

  // ── 6. Upstream escalation sweep ─────────────────────────────────────
  try {
    const escalations = await runUpstreamEscalationSweep();
    for (const esc of escalations) {
      if (esc.suitesEscalated > 0) {
        log.info(
          { label: "health-sweep-upstream-escalated", capability_slug: esc.slug, suites_escalated: esc.suitesEscalated },
          "health-sweep-upstream-escalated",
        );
      }
    }
  } catch (err) {
    logWarn("health-sweep-upstream-escalation-failed", "upstream escalation sweep failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  // ── 7. Lifecycle sweep removed (DEC-20260503-B) ───────────────────────
  // Automatic SQS-keyed transitions are gone. Manual flips only.

  // ── 8. Meta-monitoring weekly checks (8B + 8C) ────────────────────────
  // META-MONITORING: Also run daily via Railway cron or manual trigger:
  //   npx tsx scripts/meta-monitoring-run.ts --daily
  //   Checks: validation queue stuck, probation timeout, degraded count
  try {
    const metaResults = await runWeeklyChecks();
    const failures = metaResults.filter((r) => !r.passed);
    if (failures.length > 0) {
      logWarn("health-sweep-meta-failures", "meta-monitoring checks failed", {
        failure_count: failures.length,
      });
      for (const f of failures) {
        logWarn("health-sweep-meta-check-failed", f.details, {
          severity: f.severity,
          check: f.check,
        });
      }
    } else {
      log.info(
        { label: "health-sweep-meta-all-passed", checks_passed: metaResults.length },
        "health-sweep-meta-all-passed",
      );
    }
  } catch (err) {
    logWarn("health-sweep-meta-failed", "meta-monitoring weekly checks failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  // ── 9. Log health report ──────────────────────────────────────────────
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
  log.info(
    {
      label: "health-sweep-report",
      suites_scanned: report.totalSuitesScanned,
      remediations_applied: report.remediationsApplied,
      remediations_proposed: report.remediationsProposed,
      stale_date_fixes: report.staleDateFixes,
      dead_urls_found: report.deadUrlsFound,
      quarantine_released: report.quarantineReleased,
      upstream_recovered: report.upstreamRecovered,
      classification_summary: report.classificationSummary,
    },
    "health-sweep-report",
  );
}
