/**
 * Mutation check for the 2026-09-06 retention batch.
 *
 * Both guards here exist because something was invisible: a capped redaction
 * run looked like a finished one, and a rate ceiling was claimed by a comment
 * rather than held by code. A test that would pass with the guard removed
 * would reproduce exactly the problem being fixed, so plant each failure and
 * require the suite to catch it.
 *
 * Run: node scripts/mutation-check-retention-batch.mjs   (clean tree only)
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

try {
  execSync("git diff --quiet && git diff --cached --quiet", { stdio: "pipe" });
} catch {
  console.error("refusing to run: the working tree has uncommitted changes.");
  console.error("`git checkout HEAD --` would discard them. Commit or stash first.");
  process.exit(2);
}

const MUTATIONS = [
  {
    name: "retention: stop warning when the per-run ceiling is hit",
    file: "src/lib/data-retention.ts",
    from: "    if (++batches >= MAX_BATCHES_PER_RUN) { hitCap = true; break; }",
    to: "    if (++batches >= MAX_BATCHES_PER_RUN) { break; }",
    test: "src/lib/data-retention-backlog.test.ts src/lib/go-review-regressions.test.ts",
  },
  {
    name: "retention: report an unavailable backlog count as zero",
    file: "src/lib/data-retention.ts",
    from: "      remaining = null;",
    to: "      remaining = 0;",
    test: "src/lib/data-retention-backlog.test.ts src/lib/go-review-regressions.test.ts",
  },
  {
    name: "retention: let a sweep run past its ceiling",
    file: "src/lib/data-retention.ts",
    from: "const MAX_BATCHES_PER_RUN = 50;",
    to: "const MAX_BATCHES_PER_RUN = 500;",
    test: "src/lib/data-retention-backlog.test.ts src/lib/go-review-regressions.test.ts",
  },
  {
    name: "retention: revert the cadence to weekly",
    file: "src/jobs/test-scheduler.ts",
    from: "const RETENTION_INTERVAL_MS         = 24 * 60 * 60 * 1000;",
    to: "const RETENTION_INTERVAL_MS         = 7 * 24 * 60 * 60 * 1000;",
    test: "src/jobs/test-scheduler-cadence.test.ts",
  },
  {
    name: "company-fundamentals: bypass the SEC rate gate",
    file: "src/capabilities/company-fundamentals.ts",
    from: "  await secSlot();",
    to: "  // gate bypassed",
    test: "src/capabilities/company-fundamentals-rate.test.ts",
  },
  {
    name: "company-fundamentals: collapse the gate interval to zero",
    file: "src/capabilities/company-fundamentals.ts",
    from: "const SEC_MIN_INTERVAL_MS = 120;",
    to: "const SEC_MIN_INTERVAL_MS = 0;",
    test: "src/capabilities/company-fundamentals-rate.test.ts",
  },
  {
    name: "job-coordinator: clamp only on last_finished_at (an interval change stops taking effect)",
    file: "src/lib/job-coordinator.ts",
    from: "WHEN COALESCE(job_schedule.last_finished_at, job_schedule.last_started_at) IS NULL",
    to: "WHEN job_schedule.last_finished_at IS NULL",
    test: "src/lib/job-coordinator-interval-change.test.ts",
  },
  {
    name: "data-retention: drop a drain loop's per-run cap",
    file: "src/lib/data-retention.ts",
    from: "if (count < BATCH_SIZE || ++batches >= MAX_BATCHES_PER_RUN) break;",
    to: "if (count < BATCH_SIZE) break;",
    test: "src/lib/go-review-regressions.test.ts",
  },
  {
    name: "retention: warn even when the capped run left nothing behind",
    file: "src/lib/data-retention.ts",
    from: "    if (remaining !== 0) log.warn(",
    to: "    if (true) log.warn(",
    test: "src/lib/data-retention-backlog.test.ts",
  },
];

let survived = 0;
for (const m of MUTATIONS) {
  const original = readFileSync(m.file, "utf8");
  if (!original.includes(m.from)) {
    console.log(`SKIP  ${m.name}\n      anchor not found in ${m.file}`);
    survived++;
    continue;
  }
  writeFileSync(m.file, original.replace(m.from, m.to));
  let caught = false;
  try {
    execSync(`npx vitest run ${m.test}`, { stdio: "pipe" });
  } catch {
    caught = true;
  } finally {
    execSync(`git checkout HEAD -- ${m.file}`, { stdio: "pipe" });
  }
  console.log(`${caught ? "CAUGHT" : "SURVIVED"}  ${m.name}`);
  if (!caught) survived++;
}

console.log(`\n${MUTATIONS.length - survived}/${MUTATIONS.length} mutations caught`);
process.exit(survived === 0 ? 0 : 1);
