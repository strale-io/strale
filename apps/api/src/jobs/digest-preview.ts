/**
 * Digest Preview — generates email locally without sending.
 * Prints data summary to console and saves HTML for browser inspection.
 *
 * Usage: cd apps/api && npx tsx src/jobs/digest-preview.ts
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env") });

const { gatherDigestData } = await import("../lib/daily-digest/index.js");
const { analyzeDigest } = await import("../lib/daily-digest/analyze.js");
const { renderDigestEmail } = await import("../lib/daily-digest/render-email.js");

console.log("\n[preview] Gathering data...");
const data = await gatherDigestData();

console.log("\n=== DATA SUMMARY ===");
console.log(`Platform: ${data.platformActivity.apiCalls.total} calls, ${data.platformActivity.signups.count} signups, ${data.platformActivity.revenue.cents}c revenue`);
console.log(`Health: ${data.platformHealth.testPassRate.rate}% pass rate, ${data.platformHealth.circuitBreakers.length} open breakers`);
console.log(`Ship log: ${data.shipLog.journalEntries.length} journal, ${data.shipLog.githubCommits.length} commits, ${data.shipLog.socialPosts.length} posts`);
console.log(`Beacon: ${data.beaconActivity.scansLast24h} scans (24h), ${data.beaconActivity.totalScans} total, ${data.beaconActivity.newSubscribers} new subscribers`);
console.log(`Ecosystem: ${data.ecosystem.repos.length} repos, ${data.ecosystem.npmDownloads.length} npm pkgs, ${data.ecosystem.pypiDownloads.length} pypi pkgs`);
console.log(`Surfaces: ${data.distributionSurfaces.length} tracked`);
console.log(`Priorities: ${data.priorities.unreviewedDecisions.length} unreviewed, ${data.priorities.actionRequired.length} action required`);
console.log(`Scoreboard: ${data.scoreboard.totalUsers} users, ${data.scoreboard.totalCapabilities} caps, ${data.scoreboard.totalSolutions} sols`);

console.log("\n[preview] Running AI analysis...");
const analysis = await analyzeDigest(data);

console.log("\n=== AI ANALYSIS ===");
console.log(`Assessment: ${analysis.situationAssessment}`);
console.log(`Ship log: ${analysis.shipLogSummary || "(empty)"}`);
console.log(`Bottleneck: ${analysis.bottleneck ?? "None identified"}`);
console.log(`Actions: ${analysis.recommendedActions.length}`);
analysis.recommendedActions.forEach((a, i) => console.log(`  ${i + 1}. [${a.impact}] ${a.action}`));
if (analysis.anomalies.length > 0) {
  console.log(`Anomalies:`);
  analysis.anomalies.forEach((a) => console.log(`  - ${a}`));
}

console.log("\n[preview] Rendering email...");
const html = renderDigestEmail(data, analysis);

const outPath = resolve(process.cwd(), "../../digest-preview.html");
writeFileSync(outPath, html, "utf-8");

console.log(`\n  Preview saved to ${outPath}`);
console.log("  Open in browser to inspect.\n");

process.exit(0);
