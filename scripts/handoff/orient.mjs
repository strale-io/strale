#!/usr/bin/env node
// Session orientation: where this checkout is, what the program register says
// the next action is, and what the last handoff gates (Claude Code and Codex)
// found. Printed by the Claude Code SessionStart hook; Codex sessions run it
// as `npm run handoff:orient`. Read-only.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), "../.."));

function git(args) {
  try { return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim(); } catch { return null; }
}

function oneLine(text, max = 420) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

const lines = [];
const toplevel = git(["rev-parse", "--show-toplevel"]);
if (!toplevel) {
  console.log(`${root} is not a git checkout.`);
  process.exit(0);
}
const branch = git(["branch", "--show-current"]) || "(detached)";
const head = (git(["rev-parse", "--short", "HEAD"]) || "?");
const ahead = git(["rev-list", "--count", "origin/main..HEAD"]);
const behind = git(["rev-list", "--count", "HEAD..origin/main"]);
const dirty = (git(["status", "--porcelain", "--untracked-files=all"]) || "").split("\n").filter(Boolean).length;
lines.push(`Checkout: ${toplevel} on ${branch} @ ${head} (${ahead ?? "?"} ahead / ${behind ?? "?"} behind origin/main; ${dirty} uncommitted path(s))`);

const worktrees = (git(["worktree", "list"]) || "").split("\n").filter(Boolean);
if (worktrees.length > 1) lines.push(`Worktrees:\n${worktrees.map((w) => `  ${w}`).join("\n")}`);

const programsDir = join(root, "docs", "programs");
if (existsSync(programsDir)) {
  let YAML = null;
  try { YAML = (await import("yaml")).default; } catch { YAML = null; }
  for (const entry of readdirSync(programsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(programsDir, entry.name, "tracks.yaml");
    if (!existsSync(file)) continue;
    if (!YAML) { lines.push(`Program ${entry.name}: register present, but the yaml package is missing (npm ci)`); continue; }
    let doc;
    try { doc = YAML.parse(readFileSync(file, "utf8")); } catch (error) { lines.push(`Program ${entry.name}: tracks.yaml does not parse (${error.message.split("\n")[0]})`); continue; }
    const active = (doc?.tracks ?? []).filter((t) => t?.status === "active");
    if (!active.length) { lines.push(`Program ${entry.name}: ${doc?.program_status ?? "?"}, no active track`); continue; }
    for (const t of active) {
      lines.push(`Program ${entry.name} — active track ${t.id} "${t.title}"`);
      lines.push(`  next action: ${oneLine(t.next_action)}`);
      if (t.resume_file) lines.push(`  resume file: ${t.resume_file}`);
    }
  }
}

const stateDir = join(root, ".claude", "state", "handoff");
for (const provider of ["codex", "claude"]) {
  const last = join(stateDir, `last-${provider}.json`);
  if (!existsSync(last)) continue;
  try {
    const r = JSON.parse(readFileSync(last, "utf8"));
    const summary = r.ok ? "PASS" : `FAIL — ${r.failures.map((f) => `[${f.code}] ${f.message}`).join("; ")}`;
    lines.push(`Last ${provider} handoff gate (${r.at}${r.worktree ? `, ${r.worktree}` : ""}): ${summary}`);
  } catch { /* unreadable state is not worth failing orientation over */ }
}

lines.push("Session contract: read docs/programs/README.md → the active track's next action and resume file before choosing work; `npm run handoff:check` must pass before this session ends (clean, pushed, one batch worktree, register or handoff updated).");
console.log(lines.join("\n"));
