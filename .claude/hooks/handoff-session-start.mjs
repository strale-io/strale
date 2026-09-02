#!/usr/bin/env node
// Claude Code SessionStart hook: record where this session starts (so the Stop
// hook can judge "code changed in this session"), make sure the git hooks are
// installed, and print the orientation (checkout, active track, last gates).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let payload = {};
try { payload = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { payload = {}; }

const stateDir = join(root, ".claude", "state", "handoff");
mkdirSync(stateDir, { recursive: true });
const sessionId = payload.session_id || "unknown";
const marker = join(stateDir, `${sessionId}.json`);
if (!existsSync(marker)) {
  let head = "";
  try { head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); } catch { head = ""; }
  writeFileSync(marker, JSON.stringify({ sessionId, startSha: head, startedAt: new Date().toISOString(), blocks: 0 }));
}

const install = spawnSync(process.execPath, [join(root, "scripts", "handoff", "install-hooks.mjs")], { cwd: root, encoding: "utf8" });
if (install.stdout?.trim()) console.log(install.stdout.trim());

const orient = spawnSync(process.execPath, [join(root, "scripts", "handoff", "orient.mjs"), root], { cwd: root, encoding: "utf8" });
console.log(orient.stdout?.trim() || `(orientation failed: ${(orient.stderr || "").trim().split("\n").slice(-1)[0]})`);
