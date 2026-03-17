/**
 * Platform Status — Dark Launch Tooling
 *
 * Quick snapshot of the entire platform: capabilities, SQS, test health,
 * recent events, and capabilities ready to publish.
 *
 * Usage:
 *   npx tsx scripts/platform-status.ts
 *   npx tsx scripts/platform-status.ts --json   (machine-readable output)
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import "../src/app.js";

import { eq, and, sql, gte } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import { capabilities, testSuites, healthMonitorEvents } from "../src/db/schema.js";
import { computeCapabilitySQS } from "../src/lib/sqs.js";

const PUBLISH_SQS_THRESHOLD = 60;

async function main() {
  const jsonMode = process.argv.includes("--json");
  const db = getDb();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600_000);

  // ── Capability counts by lifecycle_state + visibility ─────────────────────
  const capRows = await db
    .select({
      lifecycleState: capabilities.lifecycleState,
      visible: capabilities.visible,
      count: sql<string>`COUNT(*)`,
    })
    .from(capabilities)
    .where(eq(capabilities.isActive, true))
    .groupBy(capabilities.lifecycleState, capabilities.visible);

  const capCounts: Record<string, { visible: number; hidden: number }> = {};
  for (const row of capRows) {
    const state = row.lifecycleState;
    if (!capCounts[state]) capCounts[state] = { visible: 0, hidden: 0 };
    if (row.visible) capCounts[state].visible += Number(row.count);
    else capCounts[state].hidden += Number(row.count);
  }

  const totalCaps = capRows.reduce((s, r) => s + Number(r.count), 0);
  const activeVisible = capCounts["active"]?.visible ?? 0;
  const activeHidden = capCounts["active"]?.hidden ?? 0;

  // ── SQS distribution (active caps only, use cached matrixSqs column) ──────
  const sqsRows = await db
    .select({ matrixSqs: capabilities.matrixSqs })
    .from(capabilities)
    .where(and(eq(capabilities.isActive, true), eq(capabilities.lifecycleState, "active")));

  const sqsDist = { excellent: 0, good: 0, fair: 0, poor: 0, building: 0 };
  for (const row of sqsRows) {
    if (row.matrixSqs === null) { sqsDist.building++; continue; }
    const s = Number(row.matrixSqs);
    if (s >= 90) sqsDist.excellent++;
    else if (s >= 75) sqsDist.good++;
    else if (s >= 60) sqsDist.fair++;
    else sqsDist.poor++;
  }

  // ── Test health counts ────────────────────────────────────────────────────
  const testRows = await db
    .select({
      testStatus: testSuites.testStatus,
      count: sql<string>`COUNT(*)`,
    })
    .from(testSuites)
    .where(eq(testSuites.active, true))
    .groupBy(testSuites.testStatus);

  const testCounts: Record<string, number> = {};
  for (const row of testRows) {
    testCounts[row.testStatus] = Number(row.count);
  }

  // ── Recent events (last 7 days) ───────────────────────────────────────────
  const eventRows = await db
    .select({
      eventType: healthMonitorEvents.eventType,
      count: sql<string>`COUNT(*)`,
    })
    .from(healthMonitorEvents)
    .where(gte(healthMonitorEvents.createdAt, weekAgo))
    .groupBy(healthMonitorEvents.eventType);

  const eventCounts: Record<string, number> = {};
  for (const row of eventRows) {
    eventCounts[row.eventType] = Number(row.count);
  }

  // ── Capabilities ready to publish ─────────────────────────────────────────
  const hiddenActive = await db
    .select({ slug: capabilities.slug, name: capabilities.name, matrixSqs: capabilities.matrixSqs })
    .from(capabilities)
    .where(
      and(
        eq(capabilities.isActive, true),
        eq(capabilities.lifecycleState, "active"),
        eq(capabilities.visible, false),
      ),
    )
    .orderBy(capabilities.matrixSqs);

  // Annotate with SQS (use cached matrixSqs for speed; live check for publish action)
  const readyToPublish: Array<{ slug: string; sqs: number | null; belowThreshold: boolean }> = hiddenActive.map((cap) => {
    const sqs = cap.matrixSqs !== null ? Number(cap.matrixSqs) : null;
    return { slug: cap.slug, sqs, belowThreshold: sqs !== null && sqs < PUBLISH_SQS_THRESHOLD };
  });
  readyToPublish.sort((a, b) => (b.sqs ?? -1) - (a.sqs ?? -1));

  if (jsonMode) {
    console.log(JSON.stringify({
      generatedAt: now.toISOString(),
      capabilities: {
        activeVisible,
        activeHidden,
        probation: (capCounts["probation"]?.visible ?? 0) + (capCounts["probation"]?.hidden ?? 0),
        validating: (capCounts["validating"]?.visible ?? 0) + (capCounts["validating"]?.hidden ?? 0),
        degraded: (capCounts["degraded"]?.visible ?? 0) + (capCounts["degraded"]?.hidden ?? 0),
        suspended: (capCounts["suspended"]?.visible ?? 0) + (capCounts["suspended"]?.hidden ?? 0),
        draft: (capCounts["draft"]?.visible ?? 0) + (capCounts["draft"]?.hidden ?? 0),
        total: totalCaps,
      },
      sqsDistribution: sqsDist,
      testHealth: testCounts,
      recentEvents: eventCounts,
      readyToPublish,
    }, null, 2));
    return;
  }

  // ── Human-readable output ─────────────────────────────────────────────────

  const dateStr = now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  console.log(`\nSTRALE PLATFORM STATUS — ${dateStr}`);
  console.log("═".repeat(60));

  console.log("\nCapabilities:");
  console.log(`  Active + Visible:  ${activeVisible}`);
  console.log(`  Active + Hidden:   ${activeHidden}${activeHidden > 0 ? " (ready to publish)" : ""}`);
  console.log(`  Probation:         ${(capCounts["probation"]?.visible ?? 0) + (capCounts["probation"]?.hidden ?? 0)}`);
  console.log(`  Validating:        ${(capCounts["validating"]?.visible ?? 0) + (capCounts["validating"]?.hidden ?? 0)}`);
  console.log(`  Degraded:          ${(capCounts["degraded"]?.visible ?? 0) + (capCounts["degraded"]?.hidden ?? 0)}`);
  console.log(`  Suspended:         ${(capCounts["suspended"]?.visible ?? 0) + (capCounts["suspended"]?.hidden ?? 0)}`);
  console.log(`  Draft:             ${(capCounts["draft"]?.visible ?? 0) + (capCounts["draft"]?.hidden ?? 0)}`);
  console.log(`  Total:             ${totalCaps}`);

  console.log("\nSQS Distribution (active capabilities):");
  console.log(`  Excellent (≥90):   ${sqsDist.excellent}`);
  console.log(`  Good (75–89):      ${sqsDist.good}`);
  console.log(`  Fair (60–74):      ${sqsDist.fair}`);
  console.log(`  Poor (<60):        ${sqsDist.poor}`);
  console.log(`  Building:          ${sqsDist.building}`);

  console.log("\nTest Health:");
  console.log(`  Normal:            ${testCounts["normal"] ?? 0}`);
  console.log(`  Infra Limited:     ${testCounts["infra_limited"] ?? 0}`);
  console.log(`  Env Dependent:     ${testCounts["env_dependent"] ?? 0}`);
  console.log(`  Quarantined:       ${testCounts["quarantined"] ?? 0}`);
  console.log(`  Upstream Broken:   ${testCounts["upstream_broken"] ?? 0}`);

  console.log("\nRecent Events (last 7 days):");
  const autoFixes = eventCounts["auto_fix"] ?? 0;
  const circuitBreaker = eventCounts["circuit_breaker"] ?? 0;
  const upstream = eventCounts["upstream_escalation"] ?? 0;
  const proposals = eventCounts["proposal_created"] ?? 0;
  const interrupts = eventCounts["interrupt_sent"] ?? 0;
  const transitions = eventCounts["lifecycle_transition"] ?? 0;
  if (autoFixes > 0)     console.log(`  Auto-fixes:        ${autoFixes}`);
  if (circuitBreaker > 0) console.log(`  Circuit breaker:   ${circuitBreaker}`);
  if (upstream > 0)      console.log(`  Upstream escal.:   ${upstream}`);
  if (proposals > 0)     console.log(`  Proposals:         ${proposals}`);
  if (interrupts > 0)    console.log(`  Interrupts sent:   ${interrupts}`);
  if (transitions > 0)   console.log(`  Transitions:       ${transitions}`);
  if (autoFixes + circuitBreaker + upstream + proposals + interrupts + transitions === 0) {
    console.log("  (none)");
  }

  if (readyToPublish.length > 0) {
    console.log("\nCapabilities Ready to Publish:");
    for (const cap of readyToPublish) {
      const sqsLabel = cap.sqs !== null ? `SQS ${cap.sqs}` : "SQS pending";
      const warn = cap.belowThreshold ? " ⚠️  Below threshold" : "";
      console.log(`  ${cap.slug} (${sqsLabel})${warn}`);
    }
  } else {
    console.log("\nCapabilities Ready to Publish: none");
  }

  console.log("");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
