#!/usr/bin/env node
// Pre-commit and pre-merge-commit regeneration of generated indexes
// (DEC-20261024-A, way-of-working review step 1).
//
// The archive and handoff index (archive/README.md, handoff/README.md) used
// to be checked in CI and nowhere else, so a forgotten `npm run
// archive:index` surfaced only after a push: 10 of 11 recent CI failures.
// This hook regenerates them instead, from the STAGED snapshot (never from
// untracked or unstaged files in the working tree), and stages the result.
//
// The legacy-authority inventory (docs/project/legacy-authority-inventory.json)
// hashes the staged blobs of its targets, `handoff/` among them, so a
// regenerated handoff/README.md would make the inventory stale and the
// pre-commit inventory rule would then refuse the commit. When any inventory
// target is staged, the inventory is regenerated and staged too. Only that
// one file is written; the rest of `npm run context:generate` is untouched.
//
// It never overwrites a generated file that has unstaged edits in the
// working tree: it refuses instead, so hand edits are never lost. "Unstaged
// edits" is git's verdict (`git diff --quiet`), never a byte comparison, so a
// CRLF checkout (Git for Windows, `* text=auto`) is not mistaken for an edit.
//
// `git commit <pathspec>` runs hooks against a temporary index
// (GIT_INDEX_FILE=.git/next-index-*.lock); a file staged there reaches the
// commit but not the real index, which then holds a stale copy. When it would
// have to stage something in that case, it refuses and asks for a commit
// without a pathspec.
//
// A clean `git merge` skips pre-commit and runs pre-merge-commit, but git
// (2.43 measured) commits the merge from the tree it had BEFORE that hook, so
// a file staged there would silently miss the merge commit. With --merge the
// script therefore stops the merge after staging (exit 1, MERGE_HEAD kept);
// `git commit --no-edit` then completes it with the fresh index, through
// pre-commit, which finds nothing left to do.
//
// Usage (called by .githooks/pre-commit and .githooks/pre-merge-commit):
//   node scripts/handoff/regenerate-indexes.mjs [--merge] [--root <dir>]
// Exit 0 when nothing needed regenerating or the regenerated files were
// staged for this commit; exit 1 with a fix line when it refused, or (with
// --merge) when it staged anything.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ARCHIVE_DIR,
  ARCHIVE_README_PATH,
  HANDOFF_DIR,
  HANDOFF_README_PATH,
  generateAll,
} from "../generate-archive-index.mjs";

export const INVENTORY_PATH = "docs/project/legacy-authority-inventory.json";

function makeGit(root) {
  return (args, input) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      input,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
}

function stagedPaths(git) {
  // --no-renames reports a rename as delete + add, so both sides are seen.
  return git(["diff", "--cached", "--name-only", "--no-renames", "-z"])
    .split("\0")
    .filter(Boolean);
}

function stagedBlob(git, path) {
  try {
    return git(["show", `:${path}`]);
  } catch {
    return null;
  }
}

/** True when the working copy differs from the index, by git's own rules. */
function hasUnstagedEdits(root, path) {
  const run = spawnSync("git", ["diff", "--quiet", "--", path], { cwd: root, stdio: "ignore" });
  return run.status === 1;
}

function isPathspecCommit(env) {
  const index = env.GIT_INDEX_FILE ?? "";
  return /(^|[\\/])next-index[^\\/]*$/.test(index);
}

const under = (path, dir) => path === dir || path.startsWith(`${dir}/`);

/**
 * Writes `content` to `path` and stages it, unless the working copy carries
 * unstaged edits (then it records a refusal and leaves the file alone).
 */
function stageGenerated(root, git, path, content, result, env) {
  const staged = stagedBlob(git, path);
  if (staged === content) return;
  if (isPathspecCommit(env)) {
    result.refused.push({
      path,
      fix: `${path} needs regenerating, which a commit with a pathspec cannot carry into the index. Stage the files instead (git add <paths>) and run git commit without paths`,
    });
    return;
  }
  if (staged !== null && hasUnstagedEdits(root, path)) {
    result.refused.push({
      path,
      fix: `${path} has unstaged edits; it is generated. Stage or discard them (git add ${path}, or git checkout -- ${path}) and commit again`,
    });
    return;
  }
  mkdirSync(dirname(resolve(root, path)), { recursive: true });
  writeFileSync(resolve(root, path), content, "utf8");
  git(["add", "--", path]);
  result.staged.push(path);
}

/** Regenerates archive/README.md and handoff/README.md from the staged tree. */
function regenerateArchiveIndex(root, git, result, env) {
  const listed = git(["ls-files", "-z", "--", ARCHIVE_DIR, HANDOFF_DIR]);
  const snapshot = mkdtempSync(join(tmpdir(), "strale-index-"));
  try {
    if (listed) git(["checkout-index", "-z", "--stdin", `--prefix=${snapshot}/`], listed);
    generateAll(snapshot);
    for (const path of [ARCHIVE_README_PATH, HANDOFF_README_PATH]) {
      stageGenerated(root, git, path, readFileSync(join(snapshot, path), "utf8"), result, env);
    }
  } finally {
    rmSync(snapshot, { recursive: true, force: true });
  }
}

/** Regenerates the legacy-authority inventory from the (now updated) index. */
async function regenerateInventory(root, git, result, staged, options, env) {
  const lib = options.contextLib ?? (await import("../project-context-lib.mjs"));
  const targets = (lib.INVENTORY_TARGETS ?? []).map((t) => t.path);
  if (!staged.some((f) => targets.some((t) => under(f, t)))) return;
  const content = `${JSON.stringify(lib.buildInventory(root), null, 2)}\n`;
  stageGenerated(root, git, INVENTORY_PATH, content, result, env);
}

export async function regenerateIndexes(options = {}) {
  const root = resolve(options.root ?? process.cwd());
  const git = makeGit(root);
  const env = options.env ?? process.env;
  const result = { staged: [], refused: [] };

  const staged = stagedPaths(git);
  if (staged.some((f) => under(f, ARCHIVE_DIR) || under(f, HANDOFF_DIR))) {
    regenerateArchiveIndex(root, git, result, env);
  }
  // Re-read: the archive step may have staged handoff/README.md.
  await regenerateInventory(root, git, result, stagedPaths(git), options, env);
  return result;
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (invokedDirectly) {
  const rootFlag = process.argv.indexOf("--root");
  const root = rootFlag !== -1 ? process.argv[rootFlag + 1] : process.cwd();
  let result;
  try {
    result = await regenerateIndexes({ root });
  } catch (error) {
    console.error(`regenerate-indexes: ${error.message}`);
    console.error("fix: run npm run archive:index (and npm run context:generate in a batch worktree), stage the output, and commit again");
    process.exit(1);
  }
  for (const path of result.staged) console.log(`regenerated and staged ${path}`);
  if (result.refused.length) {
    for (const r of result.refused) console.error(`regenerate-indexes: ${r.fix}`);
    process.exit(1);
  }
  if (process.argv.includes("--merge") && result.staged.length) {
    console.error("regenerate-indexes: the merge is PAUSED, not failed. It brought in archive/ or handoff/ files, so the generated indexes above were regenerated and staged.");
    console.error("fix: finish the merge with git commit --no-edit (do not run git merge --abort)");
    process.exit(1);
  }
}
