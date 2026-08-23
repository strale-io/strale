/**
 * A migrated job must be on the coordinator and ONLY on the coordinator
 * (WP10, risk CR-08).
 *
 * `job-migration.integration.test.ts` proves each `startX()` writes a
 * `job_schedule` row. It cannot prove the absence of a second scheduler: a job
 * that registers with the coordinator *and* keeps its own `setInterval` passes
 * it unchanged, while running twice — the second time outside any lease, which
 * is precisely the state WP10 exists to remove. Reviewer-found gap.
 *
 * This is a source-level check, which this codebase is rightly suspicious of.
 * It is the correct tool here because the claim is itself about the source:
 * "these modules contain no timer". It is kept honest by scoping to a fixed
 * list of files, stripping comments and strings before matching, and by
 * asserting the matcher finds a planted timer.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { MIGRATED_JOBS } from "./migrated-jobs.js";

const JOBS_DIR = import.meta.dirname;

/**
 * Files in `src/jobs/` that are deliberately NOT on the coordinator.
 *
 * Every entry is a claim that the file schedules no long-period recurring work.
 * The reason is required because the exemption is the only thing standing
 * between a new job and both WP10 guards.
 */
const EXEMPT: Record<string, string> = {
  // Sub-hour tick loops. The poll cadence IS the point, a restart costs at most
  // one tick, and routing them through the database would add a round-trip per
  // tick for no gain.
  "reservation-reconciler.ts": "60s tick loop — restart costs one tick",
  "settlement-reconciler.ts": "60s tick loop — restart costs one tick",
  "integrity-hash-retry.ts": "30s tick loop — restart costs one tick",
  "test-scheduler.ts":
    "60s poll loop; its seven long-period auxiliary tasks DO use the coordinator, " +
    "via consumeDueSlot",

  // No timer at all: invoked on demand, not on a schedule.
  "daily-digest.ts": "no timer — invoked from a route/script",
  "digest-preview.ts": "no timer — invoked from a route/script",
  "fix-lifecycle-anomalies.ts": "no timer — one-shot operator remediation",

  // Not a job.
  "migrated-jobs.ts": "the shared list these guards read",
};

/** `setInterval(` / `setTimeout(`, however they are reached. */
const TIMER = /\b(?:setInterval|setTimeout)\s*\(|\bglobalThis\s*\.\s*set(?:Interval|Timeout)\b/;

/**
 * Remove comments and string/template literals, so prose about `setInterval`
 * — which several of these files now carry, explaining what they no longer do
 * — cannot be mistaken for a call.
 */
function stripNonCode(src: string): string {
  // Strings FIRST, then comments. The other order let a "/*" string literal
  // open a phantom comment that swallowed real code up to the next "*/"
  // literal — a genuine `setInterval` planted between them passed the lint.
  // Reviewer-found, by planting exactly that.
  return src
    .replace(/`(?:[^`\\]|\\[\s\S])*`/g, "``")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("migrated jobs keep no timer of their own", () => {
  for (const { file, job } of MIGRATED_JOBS) {
    it(`${job} schedules nothing itself`, () => {
      const src = stripNonCode(readFileSync(join(JOBS_DIR, file), "utf8"));
      const match = TIMER.exec(src);
      expect(
        match?.[0] ?? null,
        `${file} contains a timer. Its cadence belongs to job_schedule; a ` +
          "second scheduler here runs the job outside the coordinator's lease, " +
          "and every other WP10 test stays green while it happens.",
      ).toBeNull();
    });
  }

  it("the matcher actually finds a timer, and ignores one in prose", () => {
    // Without this, a broken regex or an over-eager stripNonCode would make
    // every assertion above vacuous.
    expect(TIMER.test(stripNonCode("setInterval(fn, 1000);"))).toBe(true);
    expect(TIMER.test(stripNonCode("  setTimeout(() => {}, 5);"))).toBe(true);
    expect(TIMER.test(stripNonCode("globalThis.setInterval(fn, 1);"))).toBe(true);
    expect(TIMER.test(stripNonCode("// we used to call setInterval(fn, 1000)"))).toBe(false);
    expect(TIMER.test(stripNonCode("/* setInterval(fn, 1) */"))).toBe(false);
    expect(TIMER.test(stripNonCode('const s = "setInterval(x, 1)";'))).toBe(false);
    // A string literal must not be able to open a comment that hides real code.
    expect(
      TIMER.test(stripNonCode('const a = "/*"; setInterval(fn, 1000); const b = "*/";')),
    ).toBe(true);
  });

  it("covers every job the migration guard covers", () => {
    // The two guards share one list precisely so neither can drift into
    // checking a subset while reading as if it checked all of them.
    expect(MIGRATED_JOBS.length).toBeGreaterThanOrEqual(11);
    expect(new Set(MIGRATED_JOBS.map((j) => j.job)).size).toBe(MIGRATED_JOBS.length);
  });

  it("every file in src/jobs is either migrated or exempt with a stated reason", () => {
    // Fail CLOSED. Asserting only "MIGRATED_JOBS has at least 11 entries" left
    // a twelfth long-period job — added here and wired in index.ts but never
    // added to the list — checked by neither guard, which is the silent
    // regression this whole package exists to make impossible.
    const migrated = new Set(MIGRATED_JOBS.map((j) => j.file));
    const unaccounted = readdirSync(JOBS_DIR)
      .filter((f) => f.endsWith(".ts") && !f.includes(".test."))
      .filter((f) => !migrated.has(f) && !(f in EXEMPT));

    expect(
      unaccounted,
      "a new file in src/jobs/ is covered by neither WP10 guard. If it schedules " +
        "recurring work, add it to MIGRATED_JOBS and register it with the job " +
        "coordinator. If it does not, add it to EXEMPT with the reason.",
    ).toEqual([]);
  });

  it("every exemption names a file that still exists", () => {
    // An exemption for a deleted file is a stale licence that could silently
    // cover a future file of the same name.
    const present = new Set(readdirSync(JOBS_DIR));
    for (const file of Object.keys(EXEMPT)) {
      expect(present.has(file), `EXEMPT lists ${file}, which no longer exists`).toBe(true);
    }
  });
});
