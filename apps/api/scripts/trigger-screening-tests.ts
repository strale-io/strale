/**
 * Run two test rounds (65s apart) for the three Payee Assurance screening
 * capabilities so their SQS freshness gate lifts after the audit-grade
 * hardening session on 2026-04-27.
 *
 * Usage: cd apps/api && npx tsx scripts/trigger-screening-tests.ts
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

config({ path: resolve(import.meta.dirname, "../../../.env") });

if (!process.env.DATABASE_URL) {
  const buf = readFileSync(resolve(import.meta.dirname, "../../../.env"));
  const text = buf.toString("utf16le");
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  for (const line of clean.split(/\r?\n/)) {
    if (line.startsWith("DATABASE_URL=")) {
      process.env.DATABASE_URL = line.substring("DATABASE_URL=".length);
      break;
    }
  }
}

import { autoRegisterCapabilities } from "../src/capabilities/auto-register.js";
await autoRegisterCapabilities();

import { runTests } from "../src/lib/test-runner.js";

const SLUGS = ["sanctions-check", "pep-check", "adverse-media-check"];

console.log(`=== Round 1 — ${new Date().toISOString()} ===\n`);
for (const slug of SLUGS) {
  try {
    const result = await runTests({ capabilitySlug: slug });
    console.log(`  ${slug}: ${result.passed}/${result.total} passed, ${result.failed} failed`);
  } catch (err) {
    console.error(`  ${slug}: ERROR — ${err instanceof Error ? err.message : err}`);
  }
}

console.log("\n=== Waiting 65s for next minute window ===\n");
await new Promise((r) => setTimeout(r, 65_000));

console.log(`=== Round 2 — ${new Date().toISOString()} ===\n`);
for (const slug of SLUGS) {
  try {
    const result = await runTests({ capabilitySlug: slug });
    console.log(`  ${slug}: ${result.passed}/${result.total} passed, ${result.failed} failed`);
  } catch (err) {
    console.error(`  ${slug}: ERROR — ${err instanceof Error ? err.message : err}`);
  }
}

console.log("\n=== Done. Check SQS via /v1/quality/<slug> ===");
process.exit(0);
