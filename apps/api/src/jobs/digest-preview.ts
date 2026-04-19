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
const { log } = await import("../lib/log.js");

log.info({ label: "digest-preview-gather-start" }, "digest-preview-gather-start");
const data = await gatherDigestData();

log.info(
  {
    label: "digest-preview-data-summary",
    platform: {
      api_calls: data.platformActivity.apiCalls.total,
      signups: data.platformActivity.signups.count,
      revenue_cents: data.platformActivity.revenue.cents,
    },
    health: {
      test_pass_rate_pct: data.platformHealth.testPassRate.rate,
      open_breakers: data.platformHealth.circuitBreakers.length,
    },
    ship_log: {
      journal_entries: data.shipLog.journalEntries.length,
      github_commits: data.shipLog.githubCommits.length,
      social_posts: data.shipLog.socialPosts.length,
    },
    beacon: {
      scans_last_24h: data.beaconActivity.scansLast24h,
      total_scans: data.beaconActivity.totalScans,
      new_subscribers: data.beaconActivity.newSubscribers,
    },
    ecosystem: {
      repos: data.ecosystem.repos.length,
      npm_packages: data.ecosystem.npmDownloads.length,
      pypi_packages: data.ecosystem.pypiDownloads.length,
    },
    surfaces_tracked: data.distributionSurfaces.length,
    priorities: {
      unreviewed_decisions: data.priorities.unreviewedDecisions.length,
      action_required: data.priorities.actionRequired.length,
    },
    scoreboard: {
      users: data.scoreboard.totalUsers,
      capabilities: data.scoreboard.totalCapabilities,
      solutions: data.scoreboard.totalSolutions,
    },
  },
  "digest-preview-data-summary",
);

log.info({ label: "digest-preview-analyze-start" }, "digest-preview-analyze-start");
const analysis = await analyzeDigest(data);

log.info(
  {
    label: "digest-preview-analysis",
    situation_assessment: analysis.situationAssessment,
    ship_log_summary: analysis.shipLogSummary || null,
    bottleneck: analysis.bottleneck ?? null,
    recommended_actions: analysis.recommendedActions.map((a) => ({ impact: a.impact, action: a.action })),
    anomalies: analysis.anomalies,
  },
  "digest-preview-analysis",
);

log.info({ label: "digest-preview-render-start" }, "digest-preview-render-start");
const html = renderDigestEmail(data, analysis);

const outPath = resolve(process.cwd(), "../../digest-preview.html");
writeFileSync(outPath, html, "utf-8");

log.info(
  { label: "digest-preview-saved", out_path: outPath },
  "digest-preview-saved — open in browser to inspect",
);

process.exit(0);
