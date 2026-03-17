/**
 * Capability Report — Dark Launch Tooling
 *
 * Detailed report for a single capability: lifecycle state, SQS breakdown,
 * last 5 test results, recent health events, limitations, field reliability,
 * and circuit breaker state.
 *
 * Usage:
 *   npx tsx scripts/capability-report.ts --slug swedish-company-data
 *   npx tsx scripts/capability-report.ts --slug swedish-company-data --json
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import "../src/app.js";

import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import {
  capabilities,
  testSuites,
  testResults,
  capabilityHealth,
  capabilityLimitations,
  healthMonitorEvents,
} from "../src/db/schema.js";
import { computeCapabilitySQS } from "../src/lib/sqs.js";

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes("--json");
  const slugIdx = args.indexOf("--slug");
  const slug = slugIdx !== -1 ? args[slugIdx + 1] : null;

  if (!slug) {
    console.error("Usage: npx tsx scripts/capability-report.ts --slug <slug> [--json]");
    process.exit(1);
  }

  const db = getDb();

  // ── Fetch capability ────────────────────────────────────────────────────
  const [cap] = await db
    .select()
    .from(capabilities)
    .where(eq(capabilities.slug, slug))
    .limit(1);

  if (!cap) {
    console.error(`Capability not found: ${slug}`);
    process.exit(1);
  }

  // ── Live SQS ────────────────────────────────────────────────────────────
  const sqs = await computeCapabilitySQS(slug);

  // ── Circuit breaker ─────────────────────────────────────────────────────
  const [health] = await db
    .select()
    .from(capabilityHealth)
    .where(eq(capabilityHealth.capabilitySlug, slug))
    .limit(1);

  // ── Last 5 test results ─────────────────────────────────────────────────
  const recentResults = await db
    .select({
      id: testResults.id,
      testSuiteId: testResults.testSuiteId,
      passed: testResults.passed,
      failureReason: testResults.failureReason,
      responseTimeMs: testResults.responseTimeMs,
      executedAt: testResults.executedAt,
      failureClassification: testResults.failureClassification,
      autoFixed: testResults.autoFixed,
      testName: testSuites.testName,
      testType: testSuites.testType,
      testStatus: testSuites.testStatus,
    })
    .from(testResults)
    .innerJoin(testSuites, eq(testResults.testSuiteId, testSuites.id))
    .where(eq(testResults.capabilitySlug, slug))
    .orderBy(desc(testResults.executedAt))
    .limit(5);

  // ── Test suite counts ───────────────────────────────────────────────────
  const suiteCountRows = await db
    .select({
      testType: testSuites.testType,
      testStatus: testSuites.testStatus,
      count: sql<string>`COUNT(*)`,
    })
    .from(testSuites)
    .where(and(eq(testSuites.capabilitySlug, slug), eq(testSuites.active, true)))
    .groupBy(testSuites.testType, testSuites.testStatus);

  const suitesByType: Record<string, { total: number; normal: number; quarantined: number; other: number }> = {};
  for (const row of suiteCountRows) {
    if (!suitesByType[row.testType]) {
      suitesByType[row.testType] = { total: 0, normal: 0, quarantined: 0, other: 0 };
    }
    suitesByType[row.testType].total += Number(row.count);
    if (row.testStatus === "normal") suitesByType[row.testType].normal += Number(row.count);
    else if (row.testStatus === "quarantined") suitesByType[row.testType].quarantined += Number(row.count);
    else suitesByType[row.testType].other += Number(row.count);
  }

  // ── Limitations ─────────────────────────────────────────────────────────
  const limitations = await db
    .select({
      title: capabilityLimitations.title,
      limitationText: capabilityLimitations.limitationText,
      category: capabilityLimitations.category,
      severity: capabilityLimitations.severity,
      affectedPercentage: capabilityLimitations.affectedPercentage,
      workaround: capabilityLimitations.workaround,
    })
    .from(capabilityLimitations)
    .where(
      and(
        eq(capabilityLimitations.capabilitySlug, slug),
        eq(capabilityLimitations.active, true),
      ),
    )
    .orderBy(capabilityLimitations.sortOrder);

  // ── Recent health events (last 10) ──────────────────────────────────────
  const events = await db
    .select({
      eventType: healthMonitorEvents.eventType,
      tier: healthMonitorEvents.tier,
      actionTaken: healthMonitorEvents.actionTaken,
      humanOverride: healthMonitorEvents.humanOverride,
      createdAt: healthMonitorEvents.createdAt,
    })
    .from(healthMonitorEvents)
    .where(eq(healthMonitorEvents.capabilitySlug, slug))
    .orderBy(desc(healthMonitorEvents.createdAt))
    .limit(10);

  // ── Field reliability ───────────────────────────────────────────────────
  const fieldReliability = cap.outputFieldReliability as Record<string, string> | null;

  if (jsonMode) {
    console.log(
      JSON.stringify(
        {
          slug: cap.slug,
          name: cap.name,
          category: cap.category,
          lifecycleState: cap.lifecycleState,
          visible: cap.visible,
          isActive: cap.isActive,
          isFreeTier: cap.isFreeTier,
          priceCents: cap.priceCents,
          capabilityType: cap.capabilityType,
          dataSource: cap.dataSource,
          geography: cap.geography,
          createdAt: cap.createdAt,
          updatedAt: cap.updatedAt,
          sqs: {
            score: sqs.score,
            label: sqs.label,
            pending: sqs.pending,
            trend: sqs.trend,
            circuitBreaker: sqs.circuit_breaker,
            runsAnalyzed: sqs.runs_analyzed,
            externalServiceIssues: sqs.external_service_issues,
            factors: sqs.factors,
            cached: cap.matrixSqs !== null ? Number(cap.matrixSqs) : null,
          },
          circuitBreaker: health
            ? {
                state: health.state,
                consecutiveFailures: health.consecutiveFailures,
                totalFailures: health.totalFailures,
                totalSuccesses: health.totalSuccesses,
                lastFailureAt: health.lastFailureAt,
                lastSuccessAt: health.lastSuccessAt,
                openedAt: health.openedAt,
                nextRetryAt: health.nextRetryAt,
              }
            : null,
          testSuites: suitesByType,
          recentTestResults: recentResults.map((r) => ({
            testName: r.testName,
            testType: r.testType,
            testStatus: r.testStatus,
            passed: r.passed,
            failureReason: r.failureReason,
            failureClassification: r.failureClassification,
            autoFixed: r.autoFixed,
            responseTimeMs: r.responseTimeMs,
            executedAt: r.executedAt,
          })),
          limitations: limitations.map((l) => ({
            title: l.title,
            text: l.limitationText,
            category: l.category,
            severity: l.severity,
            affectedPercentage: l.affectedPercentage,
            workaround: l.workaround,
          })),
          fieldReliability,
          recentHealthEvents: events.map((e) => ({
            eventType: e.eventType,
            tier: e.tier,
            actionTaken: e.actionTaken,
            humanOverride: e.humanOverride,
            createdAt: e.createdAt,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  // ── Human-readable output ─────────────────────────────────────────────

  const pad = (label: string, width = 20) => label.padEnd(width);

  console.log(`\nCAPABILITY REPORT — ${cap.slug}`);
  console.log("═".repeat(60));

  // Overview
  console.log("\nOverview:");
  console.log(`  ${pad("Name:")}${cap.name}`);
  console.log(`  ${pad("Category:")}${cap.category}`);
  console.log(`  ${pad("Type:")}${cap.capabilityType}`);
  console.log(`  ${pad("Geography:")}${cap.geography ?? "—"}`);
  console.log(`  ${pad("Data source:")}${cap.dataSource ?? "—"}`);
  console.log(`  ${pad("Price:")}€${(cap.priceCents / 100).toFixed(2)}`);
  if (cap.isFreeTier) console.log(`  ${pad("Free tier:")}yes`);

  // State
  console.log("\nState:");
  const stateEmoji: Record<string, string> = {
    active: "✅",
    probation: "🔵",
    validating: "⏳",
    degraded: "⚠️",
    suspended: "🔴",
    draft: "📋",
  };
  const emoji = stateEmoji[cap.lifecycleState] ?? "❓";
  console.log(`  ${pad("Lifecycle:")}${emoji}  ${cap.lifecycleState}`);
  console.log(`  ${pad("Visible:")}${cap.visible ? "yes (published)" : "no (hidden)"}`);
  console.log(`  ${pad("Is active:")}${cap.isActive ? "yes" : "no"}`);

  // SQS
  console.log("\nSQS:");
  if (sqs.pending) {
    console.log(`  Score:              Pending (${sqs.runs_analyzed} runs so far)`);
  } else {
    console.log(`  ${pad("Score:")}${sqs.score} — ${sqs.label}`);
    console.log(`  ${pad("Trend:")}${sqs.trend}`);
    console.log(`  ${pad("Runs analyzed:")}${sqs.runs_analyzed}`);
    console.log(`  ${pad("Circuit breaker:")}${sqs.circuit_breaker ? "⚡ ACTIVE (−30 penalty)" : "closed"}`);
    if (sqs.external_service_issues > 0) {
      console.log(`  ${pad("Ext. service issues:")}${sqs.external_service_issues}`);
    }
    if (cap.matrixSqs !== null) {
      console.log(`  ${pad("Cached score:")}${Number(cap.matrixSqs)} (use --json for diff)`);
    }

    console.log("\n  Factors:");
    const factors = sqs.factors;
    const factorLabels: [string, keyof typeof factors][] = [
      ["Correctness (40%)", "correctness"],
      ["Schema (25%)", "schema"],
      ["Availability (20%)", "availability"],
      ["Error handling (10%)", "error_handling"],
      ["Edge cases (5%)", "edge_cases"],
    ];
    for (const [label, key] of factorLabels) {
      const f = factors[key];
      if (!f.has_data) {
        console.log(`    ${label.padEnd(22)} — no data`);
      } else {
        const pct = (f.rate * 100).toFixed(0);
        console.log(`    ${label.padEnd(22)} ${pct}%  (${f.passed}/${f.total} passed, contrib ${f.weighted_contribution.toFixed(1)})`);
      }
    }
  }

  // Circuit breaker
  console.log("\nCircuit Breaker:");
  if (!health) {
    console.log("  (no record)");
  } else {
    console.log(`  ${pad("State:")}${health.state}`);
    console.log(`  ${pad("Consecutive fails:")}${health.consecutiveFailures}`);
    console.log(`  ${pad("Total failures:")}${health.totalFailures}`);
    console.log(`  ${pad("Total successes:")}${health.totalSuccesses}`);
    if (health.lastFailureAt) console.log(`  ${pad("Last failure:")}${health.lastFailureAt.toISOString()}`);
    if (health.lastSuccessAt) console.log(`  ${pad("Last success:")}${health.lastSuccessAt.toISOString()}`);
    if (health.state === "open" && health.nextRetryAt) {
      console.log(`  ${pad("Next retry:")}${health.nextRetryAt.toISOString()}`);
    }
  }

  // Test suites
  console.log("\nTest Suites (active):");
  if (Object.keys(suitesByType).length === 0) {
    console.log("  (none)");
  } else {
    const typeOrder = ["known_answer", "schema_check", "dependency_health", "negative", "edge_case"];
    for (const type of typeOrder) {
      const s = suitesByType[type];
      if (!s) continue;
      const parts = [`${s.total} total`];
      if (s.quarantined > 0) parts.push(`${s.quarantined} quarantined`);
      if (s.other > 0) parts.push(`${s.other} other`);
      console.log(`  ${type.padEnd(22)} ${parts.join(", ")}`);
    }
    for (const type of Object.keys(suitesByType)) {
      if (!typeOrder.includes(type)) {
        const s = suitesByType[type];
        console.log(`  ${type.padEnd(22)} ${s.total} total`);
      }
    }
  }

  // Recent test results
  console.log("\nLast 5 Test Results:");
  if (recentResults.length === 0) {
    console.log("  (none)");
  } else {
    for (const r of recentResults) {
      const status = r.passed ? "✅ PASS" : "❌ FAIL";
      const when = r.executedAt.toISOString().replace("T", " ").slice(0, 19);
      const ms = `${r.responseTimeMs}ms`;
      console.log(`  ${status}  ${r.testType.padEnd(22)} ${when}  ${ms.padStart(6)}`);
      if (!r.passed && r.failureReason) {
        const truncated = r.failureReason.length > 80 ? r.failureReason.slice(0, 77) + "..." : r.failureReason;
        console.log(`         ${truncated}`);
      }
      if (!r.passed && r.failureClassification) {
        console.log(`         Classification: ${r.failureClassification}${r.autoFixed ? " (auto-fixed)" : ""}`);
      }
    }
  }

  // Field reliability
  console.log("\nField Reliability:");
  if (!fieldReliability || Object.keys(fieldReliability).length === 0) {
    console.log("  (not annotated)");
  } else {
    const groups: Record<string, string[]> = { guaranteed: [], common: [], rare: [] };
    for (const [field, level] of Object.entries(fieldReliability)) {
      (groups[level] ?? (groups[level] = [])).push(field);
    }
    for (const [level, fields] of Object.entries(groups)) {
      if (fields.length > 0) {
        console.log(`  ${level.padEnd(12)} ${fields.join(", ")}`);
      }
    }
  }

  // Limitations
  console.log("\nLimitations:");
  if (limitations.length === 0) {
    console.log("  (none recorded)");
  } else {
    for (const lim of limitations) {
      const sevIcon = lim.severity === "critical" ? "🔴" : lim.severity === "warning" ? "⚠️ " : "ℹ️ ";
      const pct = lim.affectedPercentage ? ` (${lim.affectedPercentage}% affected)` : "";
      const label = lim.title ?? lim.category;
      console.log(`  ${sevIcon} [${lim.category}] ${label}${pct}`);
      if (lim.workaround) {
        console.log(`     Workaround: ${lim.workaround}`);
      }
    }
  }

  // Recent health events
  console.log("\nRecent Health Events:");
  if (events.length === 0) {
    console.log("  (none)");
  } else {
    for (const e of events) {
      const when = e.createdAt.toISOString().replace("T", " ").slice(0, 19);
      const override = e.humanOverride ? " [human]" : "";
      console.log(`  ${when}  T${e.tier}  ${e.eventType}${override}`);
      console.log(`           ${e.actionTaken}`);
    }
  }

  console.log("");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
