/**
 * Trigger test runs for capabilities with pending SQS scores.
 *
 * Runs two rounds separated by 65 seconds to ensure test results land in
 * different minute windows (required for SQS to produce a real score).
 *
 * Usage: cd apps/api && npx tsx scripts/trigger-test-runs.ts
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

config({ path: resolve(import.meta.dirname, "../../../.env") });

// UTF-16 .env fallback
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

// Register executors before running tests
import { autoRegisterCapabilities } from "../src/capabilities/auto-register.js";
await autoRegisterCapabilities();

import { getDb } from "../src/db/index.js";
import { capabilities, testSuites, testResults } from "../src/db/schema.js";
import { eq, and, sql, gte, count, countDistinct } from "drizzle-orm";
import { runTests } from "../src/lib/test-runner.js";
import { computeCapabilitySQS } from "../src/lib/sqs.js";
import { onCapabilityCreated } from "../src/lib/capability-onboarding.js";

const db = getDb();

// ─── Step 1: Find capabilities with <2 run windows ─────────────────────────
console.log("=== Step 1: Discovering capabilities with pending SQS ===\n");

const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

const pendingCaps = await db
  .select({
    slug: capabilities.slug,
    name: capabilities.name,
    runWindows: countDistinct(sql`DATE_TRUNC('minute', ${testResults.executedAt})`),
  })
  .from(capabilities)
  .leftJoin(
    testResults,
    and(
      eq(testResults.capabilitySlug, capabilities.slug),
      gte(testResults.executedAt, thirtyDaysAgo),
    ),
  )
  .where(eq(capabilities.isActive, true))
  .groupBy(capabilities.slug, capabilities.name)
  .having(sql`COUNT(DISTINCT DATE_TRUNC('minute', ${testResults.executedAt})) < 2`)
  .orderBy(capabilities.slug);

console.log(`Found ${pendingCaps.length} capabilities with <2 run windows:\n`);
for (const c of pendingCaps) {
  console.log(`  ${c.slug} (${c.runWindows} windows)`);
}

// ─── Step 2: Find capabilities with no test suites ──────────────────────────
console.log("\n=== Step 2: Checking for capabilities without test suites ===\n");

const noSuites = await db
  .select({
    slug: capabilities.slug,
    name: capabilities.name,
    suiteCount: count(testSuites.id),
  })
  .from(capabilities)
  .leftJoin(
    testSuites,
    and(
      eq(testSuites.capabilitySlug, capabilities.slug),
      eq(testSuites.active, true),
    ),
  )
  .where(eq(capabilities.isActive, true))
  .groupBy(capabilities.slug, capabilities.name)
  .having(sql`COUNT(${testSuites.id}) = 0`)
  .orderBy(capabilities.slug);

if (noSuites.length > 0) {
  console.log(`Found ${noSuites.length} capabilities without test suites:`);
  for (const c of noSuites) {
    console.log(`  ${c.slug}`);
  }

  console.log("\nOnboarding capabilities without test suites...");
  for (const c of noSuites) {
    try {
      await onCapabilityCreated(c.slug);
      console.log(`  Onboarded: ${c.slug}`);
    } catch (err) {
      console.error(`  Failed to onboard ${c.slug}:`, err instanceof Error ? err.message : err);
    }
  }
} else {
  console.log("All active capabilities have test suites.");
}

// ─── Step 3: Round 1 ───────────────────────────────────────────────────────
const pendingSlugs = pendingCaps.map((c) => c.slug);
console.log(`\n=== Step 3: Round 1 — Running tests for ${pendingSlugs.length} capabilities ===\n`);

let r1Total = 0;
let r1Passed = 0;
let r1Failed = 0;

for (const slug of pendingSlugs) {
  try {
    const result = await runTests({ capabilitySlug: slug });
    r1Total += result.total;
    r1Passed += result.passed;
    r1Failed += result.failed;
    console.log(`  ${slug}: ${result.passed}/${result.total} passed, ${result.failed} failed`);
  } catch (err) {
    console.error(`  ${slug}: ERROR — ${err instanceof Error ? err.message : err}`);
  }
}

console.log(`\nRound 1 summary: ${r1Passed}/${r1Total} passed, ${r1Failed} failed`);

// ─── Step 4: Wait 65 seconds, then Round 2 ────────────────────────────────
console.log("\n=== Step 4: Waiting 65 seconds for next minute window... ===\n");
await new Promise((resolve) => setTimeout(resolve, 65_000));

console.log(`=== Round 2 — Running tests for ${pendingSlugs.length} capabilities ===\n`);

let r2Total = 0;
let r2Passed = 0;
let r2Failed = 0;

for (const slug of pendingSlugs) {
  try {
    const result = await runTests({ capabilitySlug: slug });
    r2Total += result.total;
    r2Passed += result.passed;
    r2Failed += result.failed;
    console.log(`  ${slug}: ${result.passed}/${result.total} passed, ${result.failed} failed`);
  } catch (err) {
    console.error(`  ${slug}: ERROR — ${err instanceof Error ? err.message : err}`);
  }
}

console.log(`\nRound 2 summary: ${r2Passed}/${r2Total} passed, ${r2Failed} failed`);

// ─── Step 5 & 6: Verify SQS scores and print report ───────────────────────
console.log("\n=== Final Report ===\n");
console.log(
  "SLUG".padEnd(40) +
    "SQS".padStart(5) +
    "  LABEL".padEnd(14) +
    "PENDING".padStart(9) +
    "  WINDOWS".padStart(9),
);
console.log("-".repeat(80));

let stillPending = 0;
let lowScore = 0;

for (const slug of pendingSlugs) {
  try {
    const sqs = await computeCapabilitySQS(slug);

    // Recount run windows
    const [windowCount] = await db
      .select({
        windows: countDistinct(sql`DATE_TRUNC('minute', ${testResults.executedAt})`),
      })
      .from(testResults)
      .where(
        and(
          eq(testResults.capabilitySlug, slug),
          gte(testResults.executedAt, thirtyDaysAgo),
        ),
      );

    const flag =
      sqs.pending ? " ← STILL PENDING" : sqs.score < 60 ? " ← LOW" : "";

    console.log(
      slug.padEnd(40) +
        String(sqs.score).padStart(5) +
        `  ${sqs.label}`.padEnd(14) +
        String(sqs.pending).padStart(9) +
        String(windowCount.windows).padStart(9) +
        flag,
    );

    if (sqs.pending) stillPending++;
    if (sqs.score < 60 && !sqs.pending) lowScore++;
  } catch (err) {
    console.log(
      slug.padEnd(40) + "ERROR".padStart(5) + `  ${err instanceof Error ? err.message : err}`,
    );
  }
}

console.log("-".repeat(80));
console.log(
  `\nTotal: ${pendingSlugs.length} capabilities processed`,
);
console.log(`  Round 1: ${r1Passed}/${r1Total} passed`);
console.log(`  Round 2: ${r2Passed}/${r2Total} passed`);
console.log(`  Still pending: ${stillPending}`);
console.log(`  Low score (<60): ${lowScore}`);

if (stillPending > 0) {
  console.log(
    "\n⚠ Some capabilities are still pending. They may need additional test runs or have no passing tests.",
  );
}

console.log(
  "\nNote: strale.dev will show updated scores within ~10 minutes (HTTP cache TTL).",
);

process.exit(0);
