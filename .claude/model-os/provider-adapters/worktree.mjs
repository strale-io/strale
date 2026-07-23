import { randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { subscriptionOnlyDispatchEnv } from "./common.mjs";

function safeBranch(branch) {
  if (typeof branch !== "string" || !/^[A-Za-z0-9._/-]+$/.test(branch)) throw new Error("unsafe worktree branch");
  return branch;
}

function safeRef(ref) {
  if (typeof ref !== "string" || !/^[A-Za-z0-9._/@{}~^-]+$/.test(ref)) throw new Error("unsafe worktree base ref");
  return ref;
}

function assertRequestedBranch(reported, requested, label = "worktree") {
  if (reported !== requested) throw new Error(`${label} reported branch '${reported}' instead of requested '${requested}'`);
}

function canonicalPath(value) {
  const canonical = realpathSync.native(path.resolve(value));
  return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}

export function sameFilesystemPath(left, right) { return canonicalPath(left) === canonicalPath(right); }

function run(command, args, { cwd, env = process.env, timeoutMs = 60_000, spawn = spawnSync } = {}) {
  const result = spawn(command, args, {
    cwd, env, encoding: "utf8", shell: false, windowsHide: true, timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
  return result;
}

function runChecked(command, args, options = {}) {
  const result = run(command, args, { ...options, env: subscriptionOnlyDispatchEnv(options.env || process.env) });
  if (result.error || result.status !== 0) {
    throw new Error((result.stderr || result.stdout || result.error?.message || `exit ${result.status}`).trim());
  }
  return result.stdout || "";
}

function git(args, options) {
  return runChecked("git", args, options).trim();
}

const SAFE_GIT_CONFIG = [
  "-c", "core.fsmonitor=false",
  "-c", "core.hooksPath=NUL",
  "-c", "diff.external=",
  "-c", "interactive.diffFilter=",
];

function pinnedGitArgs(worktree, args) {
  return [
    ...SAFE_GIT_CONFIG,
    `--git-dir=${worktree.gitDir}`,
    `--work-tree=${worktree.path}`,
    ...args,
  ];
}

function runDiff(args, options) {
  const result = run("git", args, { ...options, env: subscriptionOnlyDispatchEnv(options?.env || process.env) });
  if (result.error || ![0, 1].includes(result.status)) {
    throw new Error((result.stderr || result.stdout || result.error?.message || `exit ${result.status}`).trim());
  }
  return result.stdout || "";
}

export function createWorktreeAdapter({ spawn = spawnSync, uuid = randomUUID } = {}) {
  return {
    create({ repoPath, baseRef = "HEAD", env = process.env }) {
      const root = path.resolve(repoPath);
      const branch = `model-os/dispatch-${uuid().replace(/[^A-Za-z0-9]/g, "").slice(0, 12)}`;
      const worktreeName = `${path.basename(root)}--wt-${branch.replace(/[^A-Za-z0-9._-]/g, "-")}`;
      const worktreePath = path.resolve(path.dirname(root), worktreeName);
      if (existsSync(worktreePath)) throw new Error(`worktree path already exists: ${worktreePath}`);
      runChecked("git", ["-C", root, ...SAFE_GIT_CONFIG, "worktree", "add", "--quiet", "-b",
        safeBranch(branch), worktreePath, safeRef(baseRef)], { cwd: root, env, spawn });
      if (sameFilesystemPath(worktreePath, root)) throw new Error("worktree path resolves to the shared tree");
      const topLevel = path.resolve(git(["-C", worktreePath, "rev-parse", "--show-toplevel"], { spawn }));
      if (!sameFilesystemPath(topLevel, worktreePath)) throw new Error("created path is not a Git worktree root");
      const canonicalWorktree = canonicalPath(worktreePath);
      const registered = git(["-C", root, "worktree", "list", "--porcelain"], { spawn })
        .split(/\r?\n/).filter((line) => line.startsWith("worktree "))
        .map((line) => canonicalPath(line.slice("worktree ".length)));
      if (!registered.includes(canonicalWorktree)) throw new Error("worktree path is not registered with the shared repository");
      const actualBranch = git(["-C", worktreePath, "branch", "--show-current"], { spawn });
      assertRequestedBranch(actualBranch, branch, "worktree");
      const baseSha = git(["-C", worktreePath, "rev-parse", "HEAD"], { spawn });
      const gitDir = path.resolve(git(["-C", worktreePath, "rev-parse", "--absolute-git-dir"], { spawn }));
      return { path: worktreePath, branch, baseSha, gitDir, repoPath: root, cleanupOwed: true };
    },
    diff(worktree, { env = process.env } = {}) {
      const tracked = runDiff(pinnedGitArgs(worktree, ["diff", "--no-ext-diff", "--no-textconv", "--binary", worktree.baseSha, "--"]), { spawn, env });
      const untrackedRaw = runChecked("git", pinnedGitArgs(worktree, ["ls-files", "--others", "--exclude-standard", "-z"]), { spawn, env });
      const untracked = untrackedRaw.split("\0").filter(Boolean);
      const nullDevice = process.platform === "win32" ? "NUL" : "/dev/null";
      const additions = untracked.map((relativePath) => runDiff([
        ...SAFE_GIT_CONFIG,
        "diff", "--no-index", "--no-ext-diff", "--no-textconv", "--binary", "--",
        nullDevice, relativePath,
      ], { spawn, env, cwd: worktree.path })).join("");
      return tracked + additions;
    },
    cleanup(worktree, { env = process.env } = {}) {
      const errors = [];
      try { runChecked("git", ["-C", worktree.repoPath, ...SAFE_GIT_CONFIG, "worktree", "remove", "--force", worktree.path], { spawn, env }); }
      catch (error) { errors.push(`worktree remove: ${error.message}`); }
      try { runChecked("git", ["-C", worktree.repoPath, ...SAFE_GIT_CONFIG, "branch", "-D", worktree.branch], { spawn, env }); }
      catch (error) { errors.push(`branch delete: ${error.message}`); }
      if (errors.length) throw new Error(errors.join("; "));
    },
  };
}
