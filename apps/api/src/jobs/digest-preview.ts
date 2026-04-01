/**
 * Generate a digest email preview without sending.
 * Saves HTML to /tmp/digest-preview.html for browser inspection.
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

console.log("\n  1/3  Gathering data...");
const data = await gatherDigestData();

console.log("  2/3  Running AI analysis...");
const analysis = await analyzeDigest(data);

console.log("  3/3  Rendering email...");
const html = renderDigestEmail(data, analysis);

const outPath = resolve(process.cwd(), "../../digest-preview.html");
writeFileSync(outPath, html, "utf-8");

console.log(`\n  ✓ Preview saved to ${outPath}`);
console.log("    Open in browser to inspect.\n");

process.exit(0);
