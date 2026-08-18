/**
 * Regression test: the `convert-fixtures` admin script (internal-tests.ts,
 * `POST /v1/internal/tests/admin/run-script`) must NEVER write
 * `fixture_last_refreshed` (Codex review, 2026-08-18 round 2 — HIGH).
 *
 * The route flips test_mode to 'fixture' on suites that already have SOME
 * baseline_output — it never executes the capability, so it has no basis
 * for claiming the baseline is fresh. `fixture_last_refreshed` is meant to
 * be single-writer: only `captureBaseline` in test-runner.ts, on a genuine
 * successful recapture, may set it (see `checkBaselineStaleness`'s doc
 * comment). Before this fix, the route stamped `fixture_last_refreshed =
 * NOW()` unconditionally on conversion — an arbitrarily old, never-
 * revalidated baseline got a fresh 30-day age-staleness grant it did
 * nothing to earn, breaking the "only a successful recapture resets the
 * clock" invariant HIGH-1 (round 1 of this review) established.
 *
 * No DB harness exists for this Hono route (admin-secret-gated, live
 * `db.execute(sql\`\`)` calls, no existing route test file for
 * internal-tests.ts at all) — test-harness exemption, DEC-20260504-A. Per
 * the review's own guidance ("grep-level or behavioral"), this is a
 * structural test: it extracts the exact SQL template literal the
 * convert-fixtures case's non-dry-run UPDATE issues and asserts that
 * specific string doesn't reference the column — NOT a whole-file grep,
 * which would trip on this file's own explanatory prose (which
 * legitimately mentions "fixture_last_refreshed" by name to explain why
 * it's absent from the SQL).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

function readConvertFixturesCaseBody(): string {
  const src = readFileSync(new URL("./internal-tests.ts", import.meta.url), "utf8");
  const caseStart = src.indexOf('case "convert-fixtures": {');
  expect(caseStart).toBeGreaterThan(-1);
  // The switch's next case (or the closing of the switch) bounds the block.
  // "default:" is the next case in the switch per this file's structure.
  const nextCaseStart = src.indexOf("default:", caseStart);
  expect(nextCaseStart).toBeGreaterThan(caseStart);
  return src.slice(caseStart, nextCaseStart);
}

/** Extract the exact sql`` template literal passed to the non-dry-run UPDATE. */
function extractUpdateSql(caseBody: string): string {
  const updateMatch = /sql`\s*UPDATE test_suites SET test_mode = 'fixture'[\s\S]*?`/.exec(caseBody);
  expect(updateMatch).not.toBeNull();
  return updateMatch![0];
}

describe("convert-fixtures admin script — fixture_last_refreshed single-writer invariant", () => {
  it("the UPDATE statement does not write fixture_last_refreshed", () => {
    const caseBody = readConvertFixturesCaseBody();
    const updateSql = extractUpdateSql(caseBody);
    expect(updateSql).not.toContain("fixture_last_refreshed");
  });

  it("the UPDATE statement still flips test_mode to fixture (the fix didn't remove the actual conversion)", () => {
    const caseBody = readConvertFixturesCaseBody();
    const updateSql = extractUpdateSql(caseBody);
    expect(updateSql).toContain("test_mode = 'fixture'");
  });

  it("the route still requires an existing baseline before converting (unrelated to this fix, but pins the guard stays in place)", () => {
    const caseBody = readConvertFixturesCaseBody();
    expect(caseBody).toContain("if (!suite.baseline_output)");
  });
});
