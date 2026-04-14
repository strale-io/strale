import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { autoRegisterCapabilities } from "../src/capabilities/auto-register.js";
await autoRegisterCapabilities();

import { runTests } from "../src/lib/test-runner.js";
import { computeCapabilitySQS } from "../src/lib/sqs.js";

const slugs = ["german-company-data", "email-validate"];

for (const slug of slugs) {
  console.log(`\n=== Running tests for ${slug} ===`);
  const r1 = await runTests({ capabilitySlug: slug });
  console.log(`  round 1: passed=${r1.passed}/${r1.total}`);
  // Wait 65s to land in different minute window (needed for SQS multi-window requirement)
  await new Promise((r) => setTimeout(r, 65_000));
  const r2 = await runTests({ capabilitySlug: slug });
  console.log(`  round 2: passed=${r2.passed}/${r2.total}`);

  const sqs = await computeCapabilitySQS(slug);
  console.log(`  -> SQS: ${sqs.score} (QP:${sqs.qualityProfile?.grade} RP:${sqs.reliabilityProfile?.grade})`);
  if (sqs.qualityProfile) {
    for (const f of sqs.qualityProfile.factors) {
      console.log(`     ${f.name}: ${f.rate}%`);
    }
  }
}

process.exit(0);
