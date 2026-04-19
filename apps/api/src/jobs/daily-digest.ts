/**
 * Daily Digest — main entry point.
 * Gathers data, runs AI analysis, renders email, sends via Resend, saves snapshot.
 *
 * Usage: cd apps/api && npx tsx src/jobs/daily-digest.ts
 */

import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env") });

import { randomUUID } from "node:crypto";
import { gatherDigestData } from "../lib/daily-digest/index.js";
import { analyzeDigest } from "../lib/daily-digest/analyze.js";
import { renderDigestEmail } from "../lib/daily-digest/render-email.js";
import { sendDigestEmail } from "../lib/daily-digest/send.js";
import { saveSnapshot } from "../lib/daily-digest/snapshots.js";
import { log, logError } from "../lib/log.js";

async function main() {
  const startTime = Date.now();
  const runId = randomUUID();
  const jobLog = log.child({ job: "daily-digest", job_run_id: runId });
  jobLog.info({ label: "digest-start" }, "digest-start");

  try {
    jobLog.info({ label: "digest-gather-start" }, "digest-gather-start");
    const data = await gatherDigestData();
    jobLog.info({ label: "digest-gather-done", elapsed_ms: Date.now() - startTime }, "digest-gather-done");

    jobLog.info({ label: "digest-analyze-start" }, "digest-analyze-start");
    const analysis = await analyzeDigest(data);
    jobLog.info({ label: "digest-analyze-done", elapsed_ms: Date.now() - startTime }, "digest-analyze-done");

    jobLog.info({ label: "digest-render-start" }, "digest-render-start");
    const html = renderDigestEmail(data, analysis);
    jobLog.info({ label: "digest-render-done", html_chars: html.length }, "digest-render-done");

    jobLog.info({ label: "digest-send-start" }, "digest-send-start");
    await sendDigestEmail(html, new Date());
    jobLog.info({ label: "digest-send-done" }, "digest-send-done");

    jobLog.info({ label: "digest-snapshot-start" }, "digest-snapshot-start");
    await saveSnapshot(data);
    jobLog.info({ label: "digest-snapshot-done" }, "digest-snapshot-done");

    jobLog.info({ label: "digest-complete", total_elapsed_ms: Date.now() - startTime }, "digest-complete");
  } catch (error) {
    logError("digest-fatal", error, { job_run_id: runId });
    process.exit(1);
  }

  process.exit(0);
}

main();
