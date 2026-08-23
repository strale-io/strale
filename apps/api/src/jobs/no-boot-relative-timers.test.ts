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
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { MIGRATED_JOBS } from "./migrated-jobs.js";

const JOBS_DIR = import.meta.dirname;

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
});
