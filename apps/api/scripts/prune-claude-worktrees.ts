/**
 * Janitor for orphan agent-isolation worktrees under `.claude/worktrees/*`.
 *
 * WORKTREES.md Rule 3 bans `Agent({isolation: "worktree"})` but the rule is
 * advisory — CC sub-agents occasionally leave filesystem residue (directories
 * that aren't registered in `git worktree list`), often paired with abandoned
 * `claude/<adjective-name>` branches.
 *
 * This script removes those orphans safely:
 *   - Never touches a directory registered in `git worktree list --porcelain`.
 *   - Only safe-deletes branches (`git branch -d`); never `-D`. Branches with
 *     unmerged work are logged and left for operator review.
 *   - Idempotent: running twice in a row produces a clean second run.
 *
 * Usage:
 *   npx tsx apps/api/scripts/prune-claude-worktrees.ts
 *
 * Run on demand after a session that may have spawned isolation worktrees,
 * or weekly as a sweep.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const WORKTREES_DIR = join(REPO_ROOT, ".claude", "worktrees");

function canon(p: string): string {
  return resolve(p).replace(/\\/g, "/").toLowerCase();
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
}

function getRegisteredWorktreePaths(): Set<string> {
  const out = git("worktree", "list", "--porcelain");
  const paths = new Set<string>();
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      paths.add(canon(line.slice("worktree ".length)));
    }
  }
  return paths;
}

function listClaudeBranches(): string[] {
  const out = git("branch", "--list", "claude/*");
  return out
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s*+]+/, "").trim())
    .filter((l) => l.length > 0);
}

function main(): void {
  if (!existsSync(WORKTREES_DIR)) {
    console.log(`No .claude/worktrees/ directory at ${WORKTREES_DIR} — nothing to prune.`);
    return;
  }

  const registered = getRegisteredWorktreePaths();

  // Phase 1: directory cleanup
  const removedDirs: string[] = [];
  const skippedRegistered: string[] = [];
  for (const entry of readdirSync(WORKTREES_DIR)) {
    const full = join(WORKTREES_DIR, entry);
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;

    if (registered.has(canon(full))) {
      skippedRegistered.push(entry);
      continue;
    }

    try {
      rmSync(full, { recursive: true, force: true });
      removedDirs.push(entry);
    } catch (err) {
      console.error(`[error] failed to remove ${full}: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  // Phase 2: branch cleanup. Re-read worktree list post-removal in case any
  // registered worktree paths changed (defensive — they shouldn't).
  const registeredAfter = getRegisteredWorktreePaths();
  const branchesUsedByLiveWorktrees = new Set<string>();
  // Parse `git worktree list --porcelain` more fully to extract branch refs.
  for (const line of git("worktree", "list", "--porcelain").split(/\r?\n/)) {
    if (line.startsWith("branch ")) {
      // Format: "branch refs/heads/<name>"
      const ref = line.slice("branch ".length).replace(/^refs\/heads\//, "");
      branchesUsedByLiveWorktrees.add(ref);
    }
  }

  const branches = listClaudeBranches();
  const deletedBranches: string[] = [];
  const refusedBranches: { name: string; reason: string }[] = [];
  const skippedLiveBranches: string[] = [];

  for (const branch of branches) {
    if (branchesUsedByLiveWorktrees.has(branch)) {
      skippedLiveBranches.push(branch);
      continue;
    }
    try {
      execFileSync("git", ["branch", "-d", branch], { cwd: REPO_ROOT, stdio: "pipe" });
      deletedBranches.push(branch);
    } catch (err) {
      const stderr = ((err as { stderr?: Buffer }).stderr ?? Buffer.from("")).toString().trim();
      const reason = stderr.split(/\r?\n/)[0] ?? "unknown";
      refusedBranches.push({ name: branch, reason });
    }
  }

  // Summary
  console.log("=== prune-claude-worktrees summary ===");
  console.log(`Registered worktrees skipped: ${skippedRegistered.length}`);
  for (const e of skippedRegistered) console.log(`  - ${e} (live)`);
  console.log(`Directories removed: ${removedDirs.length}`);
  for (const e of removedDirs) console.log(`  - ${e}`);
  console.log(`Branches deleted via -d: ${deletedBranches.length}`);
  for (const b of deletedBranches) console.log(`  - ${b}`);
  console.log(`Branches refused (left for operator review): ${refusedBranches.length}`);
  for (const { name, reason } of refusedBranches) {
    console.log(`  - ${name}: ${reason}`);
  }
  console.log(`Branches skipped (live worktree using them): ${skippedLiveBranches.length}`);
  for (const b of skippedLiveBranches) console.log(`  - ${b}`);

  // Sanity invariant: registered worktrees post-cleanup must equal pre-cleanup
  // count (we never remove registered worktrees).
  if (registeredAfter.size !== registered.size) {
    console.error(
      `[error] registered worktree count changed during run (${registered.size} -> ${registeredAfter.size}); investigate.`,
    );
    process.exit(1);
  }
}

try {
  main();
} catch (err) {
  console.error(`[error] ${(err as Error).message}`);
  process.exit(1);
}
