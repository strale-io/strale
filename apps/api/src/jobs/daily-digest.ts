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

import { gatherDigestData } from "../lib/daily-digest/index.js";
import { analyzeDigest } from "../lib/daily-digest/analyze.js";
import { renderDigestEmail } from "../lib/daily-digest/render-email.js";
import { sendDigestEmail } from "../lib/daily-digest/send.js";
import { saveSnapshot } from "../lib/daily-digest/snapshots.js";

async function main() {
  const startTime = Date.now();
  console.log("[digest] Starting daily digest generation...");

  try {
    console.log("[digest] Gathering data from all sources...");
    const data = await gatherDigestData();
    console.log(`[digest] Data gathered in ${Date.now() - startTime}ms`);

    console.log("[digest] Running AI analysis (Sonnet)...");
    const analysis = await analyzeDigest(data);
    console.log(`[digest] Analysis complete in ${Date.now() - startTime}ms`);

    console.log("[digest] Rendering email...");
    const html = renderDigestEmail(data, analysis);
    console.log(`[digest] Email rendered (${html.length} chars)`);

    console.log("[digest] Sending via Resend...");
    await sendDigestEmail(html, new Date());
    console.log("[digest] Email sent successfully");

    console.log("[digest] Saving snapshot...");
    await saveSnapshot(data);
    console.log("[digest] Snapshot saved");

    console.log(`[digest] Complete in ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error("[digest] Fatal error:", error);
    process.exit(1);
  }

  process.exit(0);
}

main();
