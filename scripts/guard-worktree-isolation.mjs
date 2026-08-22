#!/usr/bin/env node
/**
 * Refuse to mutate anything from the shared checkout.
 *
 * ── Why ─────────────────────────────────────────────────────────────────────
 *
 * Several Claude Code sessions and background agents run against
 * `C:/Users/pette/Projects/strale` at once. CLAUDE.md's Shared-Checkout Rule
 * already says agents that edit files must be launched with worktree isolation.
 * On 2026-08-22 that rule was broken in both directions inside one hour:
 *
 *   - A session editing `apps/api/scripts/reconcile-stranded-executing.ts` in
 *     the shared tree had its edit silently reverted by a sibling session's
 *     `git checkout --` restore, mid-investigation. The edit was to the
 *     `authorised_by` field of an audit record. Whether it reached production
 *     was decided by a four-second race between two unrelated processes.
 *   - The same shared tree simultaneously held uncommitted WP9 work, an
 *     in-progress `lib/production-authority.ts`, and an unstarted
 *     `docs/incidents/` entry — three sessions' work, indistinguishable by
 *     `git status` from one session's.
 *
 * A rule that is known and broken anyway is not a control. This is the check.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *
 *   node scripts/guard-worktree-isolation.mjs --report
 *       Print who owns what. Always exits 0. Safe to run anywhere.
 *
 *   node scripts/guard-worktree-isolation.mjs --require-isolated
 *       Exit 1 if run from the primary worktree. Put this at the top of any
 *       script that writes files, writes production, or publishes.
 *
 *   node scripts/guard-worktree-isolation.mjs --require-clean
 *       Exit 1 if the tree carries changes at all. For mutation testing and
 *       anything else that restores files from a commit.
 */

import { execFileSync } from "node:child_process";
import { argv, exit } from "node:process";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

/**
 * A guard that dies with a stack trace is indistinguishable from a guard that
 * refused, and `--report` is documented to always exit 0 so it can be run
 * anywhere. Both were false: any git failure — not a repository, or a git
 * older than 2.31 without `--path-format` — threw straight out of
 * isPrimaryWorktree() / changedPaths(). A wrapper reading the exit code would
 * have read the crash as a policy refusal.
 */
function gitOrNull(...args) {
  try {
    return git(...args);
  } catch {
    return null;
  }
}

function inGitRepo() {
  return gitOrNull("rev-parse", "--is-inside-work-tree") === "true";
}

/**
 * The primary worktree is the one whose git dir IS the common git dir. A linked
 * worktree's git dir is `<common>/worktrees/<name>`.
 *
 * Compared as resolved absolute paths — `git rev-parse --git-dir` returns a
 * relative path when run from the repository root, and comparing a relative to
 * an absolute silently reports every worktree as linked, which would make the
 * guard pass everywhere. That is the "green because it checked the wrong
 * thing" failure this repository has hit repeatedly.
 */
export function isPrimaryWorktree() {
  const gitDir = gitOrNull("rev-parse", "--absolute-git-dir");
  const commonDir = gitOrNull(
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  );
  // Not a repo, or a git too old to answer. Unknown is NOT "isolated" — the
  // caller asked whether this tree is safe to mutate and we cannot say, so
  // --require-isolated must refuse rather than wave it through.
  if (gitDir === null || commonDir === null) return null;
  return normalise(gitDir) === normalise(commonDir);
}

function normalise(p) {
  return p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/** Every path git considers changed, tracked or not. Null when git cannot answer. */
export function changedPaths() {
  const out = gitOrNull("status", "--porcelain=v1", "--untracked-files=all");
  if (out === null) return null;
  if (!out) return [];
  return out
    .split("\n")
    .map((l) => ({ status: l.slice(0, 2).trim(), path: l.slice(3).trim() }))
    .filter((e) => e.path.length > 0);
}

function report() {
  if (!inGitRepo()) {
    // Documented to always exit 0, so say so plainly and stop.
    console.log("worktree : (not a git repository)");
    console.log("primary  : unknown");
    console.log("changes  : unknown");
    return;
  }
  const primary = isPrimaryWorktree();
  const changes = changedPaths() ?? [];
  console.log(`worktree : ${gitOrNull("rev-parse", "--show-toplevel") ?? "unknown"}`);
  console.log(`branch   : ${gitOrNull("rev-parse", "--abbrev-ref", "HEAD") ?? "unknown"}`);
  console.log(
    `primary  : ${primary === null ? "unknown" : primary ? "YES — SHARED, other sessions live here" : "no (isolated)"}`,
  );
  console.log(`changes  : ${changes.length}`);
  for (const c of changes) console.log(`  ${c.status.padEnd(2)} ${c.path}`);
  if (primary && changes.length > 0) {
    console.log(
      "\nNOTE: changes in the primary worktree may belong to another session.\n" +
        "Do not stage, revert, reset, checkout or clean a path you did not create.",
    );
  }
}

/**
 * Entry-point guard.
 *
 * Without this, importing the module to unit-test `isPrimaryWorktree` would run
 * the CLI and call `exit(2)`, killing the test worker. The seed script in
 * `db/seed-solutions.ts` had exactly this shape and wrote to whatever
 * DATABASE_URL pointed at on import; the lesson generalises.
 */
const invokedDirectly =
  process.argv[1] !== undefined &&
  normalise(process.argv[1]).endsWith("guard-worktree-isolation.mjs");

if (!invokedDirectly) {
  // Imported for its functions. Do nothing else.
} else {
  main();
}

function main() {
const wantReport = argv.includes("--report");
const requireIsolated = argv.includes("--require-isolated");
const requireClean = argv.includes("--require-clean");

if (!wantReport && !requireIsolated && !requireClean) {
  console.error(
    "usage: guard-worktree-isolation.mjs [--report] [--require-isolated] [--require-clean]",
  );
  exit(2);
}

if (wantReport) report();

// Unknown must refuse, not pass. `null && …` is falsy, so an earlier version
// of this line waved through every directory git could not describe.
const primaryState = requireIsolated || requireClean ? isPrimaryWorktree() : false;
if ((requireIsolated || requireClean) && primaryState === null) {
  console.error(
    "\nREFUSING: git could not describe this directory, so whether it is the\n" +
      "shared checkout is unknown. An unanswerable safety question is a refusal,\n" +
      "not a pass. Run from inside the repository with git >= 2.31.\n",
  );
  exit(1);
}

if (requireIsolated && primaryState) {
  console.error(
    "\nREFUSING: this is the PRIMARY worktree and it is shared.\n\n" +
      "Other sessions are editing files here right now. A write from this tree\n" +
      "can be reverted by a sibling's restore, and a restore from this tree can\n" +
      "destroy a sibling's uncommitted work. Both happened on 2026-08-22.\n\n" +
      "  git worktree add -b <branch> ../strale-wt-<name> origin/main\n" +
      "  cd ../strale-wt-<name> && npm install\n\n" +
      "Install deps in the worktree — never junction node_modules to the main\n" +
      "checkout, and remove the worktree with `git worktree remove`, never rm -rf.\n",
  );
  exit(1);
}

if (requireClean) {
  const changes = changedPaths();
  if (changes === null) {
    console.error(
      "\nREFUSING: git could not report the working-tree state, so 'clean'\n" +
        "cannot be established. Refusing rather than assuming.\n",
    );
    exit(1);
  }
  if (changes.length > 0) {
    console.error(
      "\nREFUSING: the working tree is not clean.\n\n" +
        changes.map((c) => `  ${c.status.padEnd(2)} ${c.path}`).join("\n") +
        "\n\nAnything not committed cannot be restored. Untracked files count —\n" +
        "they are the ones with no recoverable copy at all.\n",
    );
    exit(1);
  }
}
}
