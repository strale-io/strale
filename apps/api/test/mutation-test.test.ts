/**
 * The mutation-test guard must itself be discriminating.
 *
 * It exists because `git checkout --` destroyed uncommitted remediation work
 * four times, and its first version shipped two holes that a review caught:
 *
 *   1. `--untracked-files=no` let an UNTRACKED target through. Untracked files
 *      are exactly the ones with no recoverable copy, so exempting them
 *      inverted the guard's purpose.
 *   2. It mutated first and treated any non-zero exit as "caught", which makes
 *      a red baseline, a missing database, a bad env var and a typo in the test
 *      command all indistinguishable from a discriminating test. That produced
 *      a false MUTATION CAUGHT inside this very package.
 *
 * Every case below runs the real script against a THROWAWAY git repository
 * created per test, so a bug in the tool cannot reach this one.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { platform } from "node:process";

// The test lives in test/ because vitest only globs src/** and test/**; the
// script itself stays in scripts/ with its siblings.
const SCRIPT = join(import.meta.dirname, "..", "scripts", "mutation-test.mjs");

let repo: string;

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

/** Run the guard; capture its exit code and combined output. */
function runGuard(opts: {
  file: string;
  find: string;
  replace?: string;
  test: string;
}): { code: number; out: string } {
  try {
    const out = execFileSync(
      process.execPath,
      [
        SCRIPT,
        "--file", opts.file,
        "--find", opts.find,
        "--replace", opts.replace ?? "",
        "--test", opts.test,
      ],
      { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { code: 0, out };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

/**
 * Test commands built from shell builtins rather than `node -e`.
 *
 * `node -e "..."` looked obvious and does not survive the round trip: on Windows
 * `process.execPath` is "C:\Program Files\nodejs\node.exe" and cmd splits it on
 * the space, and the nested quoting mangles differently again on sh. The guard
 * correctly REFUSED the broken command as a failing baseline — which is how the
 * problem was found, and a small demonstration that the refusal works.
 */
const isWin = platform === "win32";
const PASS_CMD = "exit 0";
const FAIL_CMD = "exit 1";
/** Passes only while the marker is present — i.e. a discriminating test. */
const DISCRIMINATING_CMD = isWin
  ? "findstr GUARD src.txt >nul"
  : "grep -q GUARD src.txt";

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "mutation-guard-"));
  git("init", "-q");
  git("config", "user.email", "t@example.test");
  git("config", "user.name", "t");
  mkdirSync(join(repo, "sub"), { recursive: true });
  writeFileSync(join(repo, "src.txt"), "keep GUARD here\n");
  git("add", "-A");
  git("commit", "-q", "-m", "candidate");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("the guard refuses what it cannot restore", () => {
  it("refuses when the tree is dirty", () => {
    writeFileSync(join(repo, "src.txt"), "modified\n");
    const r = runGuard({ file: "src.txt", find: "modified", test: PASS_CMD });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/working tree is not clean/i);
  });

  it("refuses an UNTRACKED target, and leaves it untouched", () => {
    // The review's first blocking finding. An untracked file has no copy in any
    // commit, so mutating it is unrecoverable — the exact case the earlier
    // `--untracked-files=no` flag waved through.
    const untracked = join(repo, "sub", "new.txt");
    writeFileSync(untracked, "ORIGINAL CONTENT\n");

    const r = runGuard({
      file: "sub/new.txt",
      find: "ORIGINAL",
      replace: "MUTATED",
      test: PASS_CMD,
    });

    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/not clean|does not exist in the candidate commit/i);
    // Not modified — refusing must mean refusing, not "refused after writing".
    expect(readFileSync(untracked, "utf8")).toBe("ORIGINAL CONTENT\n");
  });

  it("refuses when the find text is absent", () => {
    const r = runGuard({ file: "src.txt", find: "NOT PRESENT", test: PASS_CMD });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/not present/i);
  });
});

describe("a result only counts as green → red → green", () => {
  it("REFUSES a red baseline rather than reporting a caught mutation", () => {
    // The review's second blocking finding, and it already produced a false
    // result in this package: four tests were committed with a missing import,
    // so the suite was red, and the tool reported MUTATION CAUGHT.
    const r = runGuard({ file: "src.txt", find: "GUARD", test: FAIL_CMD });

    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/baseline test run FAILED/i);
    expect(r.out, "a red baseline must never read as success").not.toMatch(
      /MUTATION CAUGHT/,
    );
    // And it must refuse BEFORE mutating.
    expect(readFileSync(join(repo, "src.txt"), "utf8")).toContain("GUARD");
  });

  it("reports MUTATION CAUGHT for a genuinely discriminating test", () => {
    const r = runGuard({
      file: "src.txt",
      find: "GUARD",
      replace: "gone",
      test: DISCRIMINATING_CMD,
    });

    expect(r.code).toBe(0);
    expect(r.out).toMatch(/MUTATION CAUGHT/);
    // Restored, and the tree is clean again.
    expect(readFileSync(join(repo, "src.txt"), "utf8")).toContain("GUARD");
    expect(git("status", "--porcelain")).toBe("");
  });

  it("reports MUTATION SURVIVED when the test does not discriminate", () => {
    const r = runGuard({
      file: "src.txt",
      find: "GUARD",
      replace: "gone",
      test: PASS_CMD,
    });

    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/MUTATION SURVIVED/);
    expect(readFileSync(join(repo, "src.txt"), "utf8")).toContain("GUARD");
  });

  it("restores the candidate even when the mutated run fails", () => {
    runGuard({
      file: "src.txt",
      find: "GUARD",
      replace: "gone",
      test: DISCRIMINATING_CMD,
    });
    // Line-ending agnostic: git restores using the platform checkout
    // convention, so an exact-bytes comparison fails on Windows for reasons
    // unrelated to the guard.
    expect(readFileSync(join(repo, "src.txt"), "utf8").trim()).toBe("keep GUARD here");
    expect(git("status", "--porcelain")).toBe("");
  });
});
