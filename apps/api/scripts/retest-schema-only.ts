/**
 * Run only schema_check tests for the 25 capabilities whose output_schema
 * was fixed. Minimal-cost approach: schema_check typically uses a simple
 * health-check input and re-validates against the corrected schema.
 *
 * Runs TWO rounds spaced 65s apart so results land in separate minute windows
 * (required for SQS to compute a real score).
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { autoRegisterCapabilities } from "../src/capabilities/auto-register.js";
await autoRegisterCapabilities();

import { runTests } from "../src/lib/test-runner.js";
import { computeCapabilitySQS } from "../src/lib/sqs.js";

const slugs = [
  "australian-company-data", "polish-company-data", "portuguese-company-data",
  "german-company-data", "norwegian-company-data", "email-validate",
  "us-company-data", "irish-company-data", "finnish-company-data",
  "danish-company-data", "italian-company-data", "spanish-company-data",
  "au-company-data", "french-company-data", "brazilian-company-data",
  "canadian-company-data", "belgian-company-data", "uk-company-data",
  "lithuanian-company-data", "austrian-company-data", "dutch-company-data",
  "japanese-company-data", "swiss-company-data", "swedish-company-data",
  "invoice-extract",
];

const before: Record<string, number> = {};
const after: Record<string, number> = {};

console.log(`Running schema_check for ${slugs.length} capabilities (2 rounds)...`);

for (const slug of slugs) {
  const s = await computeCapabilitySQS(slug);
  before[slug] = s.score ?? 0;
}

// Round 1
console.log(`\n--- Round 1 ---`);
for (const slug of slugs) {
  try {
    const r = await runTests({ capabilitySlug: slug, testType: "schema_check" });
    console.log(`  ${slug}: ${r.passed}/${r.total}`);
  } catch (e: any) {
    console.error(`  ${slug}: ERROR ${e?.message}`);
  }
}

console.log(`\nWaiting 65s for minute window...`);
await new Promise((r) => setTimeout(r, 65_000));

// Round 2
console.log(`\n--- Round 2 ---`);
for (const slug of slugs) {
  try {
    const r = await runTests({ capabilitySlug: slug, testType: "schema_check" });
    console.log(`  ${slug}: ${r.passed}/${r.total}`);
  } catch (e: any) {
    console.error(`  ${slug}: ERROR ${e?.message}`);
  }
}

console.log(`\n--- Recomputing SQS ---`);
for (const slug of slugs) {
  const s = await computeCapabilitySQS(slug);
  after[slug] = s.score ?? 0;
}

console.log(`\n=== Before / After ===`);
console.log(`slug`.padEnd(32) + `before  after   delta`);
for (const slug of slugs) {
  const b = before[slug];
  const a = after[slug];
  const d = a - b;
  const arrow = d > 0 ? `+${d.toFixed(1)}` : d.toFixed(1);
  console.log(`${slug.padEnd(32)}${b.toFixed(1).padStart(6)}  ${a.toFixed(1).padStart(6)}  ${arrow}`);
}

process.exit(0);
