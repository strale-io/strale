#!/usr/bin/env node
// `npm run hooks:install` (also `prepare`, so `npm ci` does it): point git at
// the tracked hooks so pre-commit and pre-push run for every tool that commits
// or pushes here — Claude Code, Codex, a terminal. core.hooksPath lives in the
// repository config, which every worktree of this clone shares, so one install
// covers the trunk and every batch worktree. Silent outside a git checkout
// (container builds, tarballs).
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
try {
  execFileSync("git", ["rev-parse", "--git-dir"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], { cwd: root, stdio: "ignore" });
  console.log("git hooks: core.hooksPath = .githooks (pre-commit and pre-push run the handoff gate)");
} catch {
  // not a git checkout; nothing to install
}
