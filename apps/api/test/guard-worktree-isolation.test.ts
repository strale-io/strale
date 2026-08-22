/**
 * The worktree-isolation guard must itself be discriminating.
 *
 * This repository has shipped several guards that were green while doing
 * nothing: one checked FILES where it meant FUNCTIONS, one read the two columns
 * quarantine does not touch, one was satisfied by an import line. So these
 * tests build real git repositories on disk and assert the guard's exit codes
 * against them, rather than asserting on its source text.
 *
 * The specific trap pinned here: `git rev-parse --git-dir` returns a RELATIVE
 * path from the repo root, and comparing it to the absolute `--git-common-dir`
 * makes every worktree look linked — so `--require-isolated` would pass
 * everywhere, including the shared checkout it exists to refuse.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "scripts",
  "guard-worktree-isolation.mjs",
);

let primary: string;
let linked: string;

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/** Run the guard in `cwd`. Returns its exit code. */
function runGuard(cwd: string, ...flags: string[]): number {
  try {
    execFileSync(process.execPath, [SCRIPT, ...flags], {
      cwd,
      encoding: "utf8",
      stdio: "pipe",
    });
    return 0;
  } catch (err) {
    return (err as { status?: number }).status ?? -1;
  }
}

beforeAll(() => {
  primary = mkdtempSync(join(tmpdir(), "guard-primary-"));
  git(primary, "init", "--initial-branch=main");
  git(primary, "config", "user.email", "t@example.com");
  git(primary, "config", "user.name", "t");
  // The developer's global core.autocrlf=true otherwise rewrites line endings
  // on checkout, and "restore the file by writing the same string" then leaves
  // the tree dirty — which would make the clean-tree assertions fail for a
  // reason that has nothing to do with the guard. Inherited by the linked
  // worktree created below.
  git(primary, "config", "core.autocrlf", "false");
  writeFileSync(join(primary, "a.txt"), "hello\n");
  git(primary, "add", "-A");
  git(primary, "commit", "-m", "init");

  linked = mkdtempSync(join(tmpdir(), "guard-linked-")) + "-wt";
  git(primary, "worktree", "add", "-b", "side", linked);
}, 60_000);

afterAll(() => {
  try {
    git(primary, "worktree", "remove", "--force", linked);
  } catch {
    /* best effort */
  }
  for (const d of [primary, linked]) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

describe("--require-isolated", () => {
  // Computed once. Each guard run is a node spawn plus two git calls, and this
  // file previously made fourteen of them — enough, under full-suite parallel
  // load, to push neighbouring test files past their timeouts. Spawns are the
  // expensive thing here, so they are shared rather than repeated.
  let onPrimary: number;
  let onLinked: number;

  beforeAll(() => {
    onPrimary = runGuard(primary, "--require-isolated");
    onLinked = runGuard(linked, "--require-isolated");
  }, 60_000);

  it("REFUSES in the primary worktree — the shared-checkout case", () => {
    // The whole point. If this ever returns 0 the guard is decorative.
    expect(onPrimary).toBe(1);
  });

  it("permits in a linked worktree", () => {
    expect(onLinked).toBe(0);
  });

  it("distinguishes the two — not merely constant", () => {
    // Pins the relative-vs-absolute git-dir trap: a guard that compared a
    // relative --git-dir to an absolute --git-common-dir returns the SAME
    // answer in both trees, and both of the assertions above would pass
    // individually only by luck.
    expect(onPrimary).not.toBe(onLinked);
  });
});

describe("--require-clean", () => {
  it("permits a clean tree", () => {
    expect(runGuard(linked, "--require-clean")).toBe(0);
  });

  it("REFUSES on a tracked modification", () => {
    // Restore the exact bytes that were checked out, not a string we believe
    // equals them.
    const path = join(linked, "a.txt");
    const pristine = readFileSync(path);
    writeFileSync(path, "modified\n");
    expect(runGuard(linked, "--require-clean")).toBe(1);
    writeFileSync(path, pristine);
    expect(runGuard(linked, "--require-clean")).toBe(0);
  });

  it("REFUSES on an UNTRACKED file", () => {
    // Untracked files are exactly the ones with no recoverable copy, so they
    // are the last thing that should be exempt. An earlier guard in this repo
    // passed --untracked-files=no and let one through to be destroyed.
    const stray = join(linked, "untracked.txt");
    writeFileSync(stray, "no commit holds me\n");
    expect(runGuard(linked, "--require-clean")).toBe(1);
    rmSync(stray);
    expect(runGuard(linked, "--require-clean")).toBe(0);
  });
});

describe("CLI contract and behaviour outside a repository", () => {
  let bare: string;
  let noFlags: number;
  let reportPrimary: number;
  let reportLinked: number;
  let bareReport: number;
  let bareIsolated: number;
  let bareClean: number;

  beforeAll(() => {
    // A plain directory with no repository anywhere above it.
    bare = mkdtempSync(join(tmpdir(), "guard-nogit-"));
    noFlags = runGuard(linked);
    reportPrimary = runGuard(primary, "--report");
    reportLinked = runGuard(linked, "--report");
    bareReport = runGuard(bare, "--report");
    bareIsolated = runGuard(bare, "--require-isolated");
    bareClean = runGuard(bare, "--require-clean");
  }, 90_000);

  afterAll(() => {
    try {
      rmSync(bare, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  it("exits 2 with no flags rather than silently succeeding", () => {
    // A guard invoked with a typo'd flag must not look like a pass.
    expect(noFlags).toBe(2);
  });

  it("--report never fails, so it is safe to run anywhere", () => {
    expect(reportPrimary).toBe(0);
    expect(reportLinked).toBe(0);
  });

  it("--report still exits 0 outside a git repository, as documented", () => {
    // Previously this died with an unhandled Node stack trace, which a calling
    // script would have read as a policy refusal.
    expect(bareReport).toBe(0);
  });

  it("--require-isolated REFUSES outside a repository rather than passing", () => {
    // The dangerous direction. `null && ...` is falsy, so a naive fix makes an
    // unanswerable safety question look like a pass.
    expect(bareIsolated).toBe(1);
  });

  it("--require-clean REFUSES rather than assuming clean", () => {
    expect(bareClean).toBe(1);
  });
});
