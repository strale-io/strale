#!/usr/bin/env node
// Codex `notify` wrapper. Codex appends one JSON argument describing the event
// (type "agent-turn-complete", with the turn's cwd and thread id). This script
// runs the handoff gate for the repository the turn ran in, writes the result
// to <repo>/.claude/state/handoff/last-codex.json (gitignored) so the next
// session's orientation surfaces it, then forwards the event to the original
// notify command given as the leading arguments, so existing notifications
// (and other repositories' wrappers) keep working.
//
// ~/.codex/config.toml (chain in front of whatever is there today):
//   notify = ["node", "C:/Users/pette/Projects/strale/scripts/handoff/codex-notify.mjs",
//             "<original notify command>", "<its args>..."]
//
// The gate scopes "code changed without a register/handoff update" to the
// thread: the first turn of a thread records HEAD, later turns pass --since.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const payloadArg = argv.length ? argv[argv.length - 1] : "{}";
const forward = argv.slice(0, -1);
let payload = {};
try { payload = JSON.parse(payloadArg); } catch { payload = {}; }

function gitRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

if (!payload.type || payload.type === "agent-turn-complete") {
  const cwd = payload.cwd || process.env.CODEX_CWD || process.cwd();
  const root = existsSync(cwd) ? gitRoot(cwd) : null;
  const gate = root ? join(root, "scripts", "handoff", "handoff-check.mjs") : null;
  if (gate && existsSync(gate)) {
    const stateDir = join(root, ".claude", "state", "handoff");
    mkdirSync(stateDir, { recursive: true });
    const threadId = payload["thread-id"] ?? payload.thread_id ?? null;
    const marker = threadId ? join(stateDir, `codex-${threadId}.json`) : null;
    let startSha = null;
    if (marker && existsSync(marker)) {
      try { startSha = JSON.parse(readFileSync(marker, "utf8")).startSha ?? null; } catch { startSha = null; }
    } else if (marker) {
      try { startSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { startSha = null; }
      writeFileSync(marker, JSON.stringify({ threadId, startSha, startedAt: new Date().toISOString() }));
    }
    const args = [gate, "--mode", "session", "--json"];
    if (startSha) args.push("--since", startSha);
    const run = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", timeout: 120_000 });
    let result;
    try { result = JSON.parse(run.stdout); } catch {
      result = {
        ok: false,
        failures: [{ code: "gate-error", message: (run.stderr || run.stdout || "the handoff gate did not run").trim().split("\n").slice(-2).join(" "), fix: "run `npm run handoff:check` and fix the gate itself" }],
        warnings: [],
      };
    }
    writeFileSync(join(stateDir, "last-codex.json"), JSON.stringify({ ...result, at: new Date().toISOString(), turnId: payload["turn-id"] ?? null, threadId }));
  }
}

if (forward.length) {
  try {
    const cmd = forward[0] === "node" ? process.execPath : forward[0];
    const child = spawn(cmd, [...forward.slice(1), payloadArg], { detached: true, stdio: "ignore", windowsHide: true });
    child.unref();
  } catch {
    // the original notifier is best-effort
  }
}
