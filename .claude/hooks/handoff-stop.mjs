#!/usr/bin/env node
// Claude Code Stop hook: run the handoff gate; on failure return
// {"decision":"block","reason":…} so the session keeps working until the
// checkout is clean, committed, pushed, and the resume surface is updated.
// A loop guard lets the stop through after repeated blocks on the same
// findings, so an unfixable state cannot trap a session forever (the failure
// is then left in .claude/state/handoff/last-claude.json for the next
// session's orientation).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_BLOCKS = 6;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let payload = {};
try { payload = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { payload = {}; }

const stateDir = join(root, ".claude", "state", "handoff");
mkdirSync(stateDir, { recursive: true });
const marker = join(stateDir, `${payload.session_id || "unknown"}.json`);
let state = { blocks: 0, lastKey: "" };
if (existsSync(marker)) {
  try { state = { blocks: 0, lastKey: "", ...JSON.parse(readFileSync(marker, "utf8")) }; } catch { /* keep defaults */ }
}

const args = [join(root, "scripts", "handoff", "handoff-check.mjs"), "--mode", "session", "--json"];
if (state.startSha) args.push("--since", state.startSha);
const run = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", timeout: 120_000 });
let result;
try { result = JSON.parse(run.stdout); } catch {
  result = {
    ok: false,
    failures: [{ code: "gate-error", message: (run.stderr || run.stdout || "the handoff gate did not run").trim().split("\n").slice(-3).join(" "), fix: "run `npm run handoff:check` and fix the gate itself" }],
    warnings: [],
  };
}
writeFileSync(join(stateDir, "last-claude.json"), JSON.stringify({ ...result, at: new Date().toISOString(), sessionId: payload.session_id ?? null }));

if (result.ok) {
  writeFileSync(marker, JSON.stringify({ ...state, blocks: 0, lastKey: "" }));
  process.exit(0);
}

const key = result.failures.map((f) => `${f.code}:${f.message}`).join("|");
const blocks = state.lastKey === key ? state.blocks + 1 : 1;
writeFileSync(marker, JSON.stringify({ ...state, blocks, lastKey: key }));

if (blocks > MAX_BLOCKS) {
  console.error(`handoff gate still failing after ${MAX_BLOCKS} blocks on the same findings; letting the stop through. Fix by hand: ${key}`);
  process.exit(0);
}

const lines = result.failures.map((f) => `- [${f.code}] ${f.message}. Fix: ${f.fix}`);
const reason = [
  `HANDOFF GATE FAILED (block ${blocks}/${MAX_BLOCKS}). The session may not end until the checkout is clean for the next session (Claude Code or Codex). Fix these, then stop again:`,
  ...lines,
  "Rules: commit with a Conventional Commit message; push the working branch (routine backup); never push main; update the active track's next_action in docs/programs/<program>/tracks.yaml or write a handoff file whenever code changed; remove worktrees or merged branches you created (never the ones recorded in scripts/handoff/baseline.json, which wait for the founder); never rm -rf a worktree.",
].join("\n");
console.log(JSON.stringify({ decision: "block", reason }));
process.exit(0);
