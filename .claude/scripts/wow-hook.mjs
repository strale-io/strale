#!/usr/bin/env node
// wow-core — the ONE hook dispatcher for Claude Code and Codex. Source of truth: wow-core
// scripts/wow-hook.mjs; consumers receive it by sync as .claude/scripts/wow-hook.mjs, and
// scripts/install.ps1 copies it (with the thin scripts/codex-hook.mjs wrapper and hooks/guard-bash-policy.mjs, which that
// copy loads from its own folder) to ~/.codex/wow-core/ for the user-level Codex hooks. Edit it HERE; never in a consumer
// or in the installed copy.
//
//   node wow-hook.mjs session-start | session-end | pre-tool-use | post-tool-use |
//                     post-tool-use-failure | stop   [--tool claude|codex]   < hook JSON
//
// Why one dispatcher (2026-10-08 fleet cleanup): hooks repeated output on every turn, every
// Bash call spawned two pwsh processes, and pwsh is optional on the Linux cloud runners, so
// hooks broke there silently. Everything is node now: no pwsh, one process per hook event,
// silent unless there is something to say. Codex records hook trust per DEFINITION hash, so
// the user-level hooks.json stays static (node "<path>" <event>) and all behaviour lives
// here; the dispatcher stays silent anywhere that is not a wow-core consumer.
//
// Tool: --tool wins and nothing else is consulted (the Claude wiring passes `--tool claude`, so
// a CODEX_THREAD_ID inherited from a launching Codex session cannot flip it; codex-hook.mjs
// forces codex). Without --tool: WOW_HOOK_TOOL, then Codex when the environment/payload says
// so (CODEX_THREAD_ID, payload turn_id), else Claude Code.
//
// Events
//   session-start   source startup/clear/absent: the startup contract + `health.mjs --brief`
//                   as ONE block of at most 15 lines / 2,000 characters (health is trimmed
//                   first, the contract never; the lane statement and the repo's handoff context,
//                   clipped to a few lines plus a pointer, count inside the same budget).
//                   source resume/compact: ONE line of at most 260 characters.
//                   Claude Code gets it as hookSpecificOutput.additionalContext JSON, Codex
//                   as plain stdout (its developer context). Claude also writes the
//                   per-session presence marker .claude/sessions/<id>.lock. Codex adds its
//                   orientation lines and the repo's handoff-session-start.mjs output.
//   session-end     removes the marker (and the no-progress ledger).
//   pre-tool-use    Every tool ("*"), first: the old-account fence (WOW_ACCOUNT_LABEL set and this
//                   session started before the current lease period on another account, or before
//                   the previous period when the fleet returned to this account: DENY every tool
//                   but the few to go quiet; fail open, PACE_CORE §2a "The old-account fence").
//                   mcp__*: DENY a tool that matches a hard-stop entry of permissions.deny on any instance of
//                   its connector (a -<hex> instance suffix or claude_ai_ prefix on the server; hardStopEntry).
//                   Then the mail guard on every tool (mailGuard; SECURITY_CORE §1a): a Gmail or Microsoft 365 tool marks
//                   the session `mail`, a shell command naming BWS_PROD_TOKEN marks it `prod` (markers are never removed);
//                   DENY either kind in a session holding the other marker or, in Claude Code, whose transcript shows an
//                   earlier call of the other kind (a resumed or forked session). The token command fails CLOSED (no
//                   session id, a state store or transcript it cannot use, a deadline or an internal error); the mail tool
//                   never does, and one let through by a deadline or an error still marks the session. A session that
//                   used mail is also DENIED a cross-session tool whose input names BWS_PROD (handsTokenOn) and a shell
//                   command that dumps the whole environment (environmentDump); neither marks it. It never allows.
//                   Bash: a lease write must name WOW_ACCOUNT_LABEL; hooks/guard-bash-policy.mjs, then the shared-tree commit guard
//                   (BLOCK `git commit` in the PRIMARY checkout while another live session
//                   holds it; worktrees and solo sessions are never blocked), then the push
//                   check (`git push` in any form, with WOW_ACCOUNT_LABEL set: DENY when the
//                   newest account lease, `bus.mjs lease --json`, names another account, so a
//                   session left on the old account stops itself; FAIL OPEN with one stderr
//                   line when the label is unset or the bus cannot be read in 5 s). Deny JSON.
//                   Bash, last of all (no deny above is overridden): ALLOW a routine read the grammar parsed completely: one
//                   `gh api` GET of a fleet repository or search (readCommandDecision; no `node` allow: a hook allow skips the
//                   classifier). Anything else: no decision (design 2026-11-06). A missing, unloadable or throwing shell policy where
//                   the hook's install ships one (a full consumer, wow-core): DENY Bash (review on #340).
//                   mcp__claude-code-remote__add_repo: ALLOW when the call is exactly {owner,
//                   repo} or {repo: "owner/name"} naming the repository in WOW_BUS_REPO; also exactly
//                   {owner: <WOW_BUS_REPO's owner>, repo: "wow-core"} with no other key (read-only,
//                   wowCoreAttachDecision); files the session can edit are never read. In wow-core's own checkout also the Codex
//                   dispatcher's push attach of a roster repository (codexDispatcherAttachDecision).
//                   Anything else gets no decision: the host's normal permission flow runs.
//                   mcp__claude-code-remote__confirm_repository_trust: DENY for every session (founder
//                   2026-11-06, "yes": no cloud session is ever trusted; PC work goes through the PC desk,
//                   docs/fleet-roster.md "PC desk"), citing COMMS_CORE §1, before the hard stops; a deadline
//                   or internal error on this call denies too (fail CLOSED), and permissions.deny lists it as
//                   the static backup. Replaces the masters' trust route of #263/#266.
//   post-tool-use, post-tool-use-failure
//                   Bash: no-progress halt ({"decision":"block"} once) after 3 identical
//                   consecutive failures; silent otherwise.
//   stop            Codex runs `.claude/scripts/handoff/handoff-stop.mjs`; Claude runs that
//                   handoff gate when the repository opts in with `.claude/handoff.config.json`.
//                   Child results map onto one Stop contract:
//                     child exit 2 (+ stderr reason)          -> block, reason = stderr
//                     child exit 0 + {"decision":"block"}     -> block, reason = its reason
//                     child exit 0 + {"systemMessage": ...}   -> passed through, stop allowed
//                     child exit 0, empty or plain stdout     -> pass (plain text goes to stderr)
//                     child crash (other exit), timeout,
//                     or spawn failure                        -> FAIL-OPEN: stop allowed, visible
//                                                                systemMessage + stderr note
//                   Any block -> exactly one JSON {"decision":"block","reason":...} on stdout,
//                   exit 0. All pass -> no stdout. Fail-open on a crashing child matches Claude
//                   Code (exit 1 from a Stop hook does not block): a broken gate must not trap
//                   the session in a block loop the agent cannot clear; it is surfaced instead.
//                   The lane pool is NOT part of the stop path: a session never sends work to
//                   another agent unless the founder asks (founder decision 2026-10-08).
//
// Cloud parent folder: in a Claude Code cloud session, pre-tool-use and session-start in the hook's own primary checkout
// also wire <parent>/.claude/settings.json (`--via-parent`) for turns that start in the checkout's parent folder; see
// "Parent-folder wiring" below and templates/cloud-runner/README.md.
//
// Once running, the dispatcher's own errors fail open (exit 0, stderr note; only confirm_repository_trust, a command that
// names BWS_PROD_TOKEN (usesProdToken) and a Bash push or merge command are denied: isGitPush, isMergeCommand), and every child and the dispatcher itself run under a
// deadline below the host's hook timeout: its 8 s watchdog and its internal catch ALLOW every other call and DENY those.
// A push or merge command is denied only until the shell policy (the merge and send stops) has decided. After it, the
// shared-tree guard refuses on its own failures (synchronous, own deadline) and the push check's lease read is fail-open
// by contract, so a bus outage that runs out the deadline there still allows an ordinary push (the push check also reuses
// a fence read that failed in this call instead of waiting a second time; a failure served from the cache does not count).
// What blocks otherwise is the host's `"onFailure": "block"` on the wired PreToolUse entry (Claude Code 2.1.295+): a dispatcher that cannot start (the script or node is missing, a syntax error; a script cut
// short at a statement boundary can still parse and pass silently, see README "If every tool call is blocked"), that reaches
// the host's hook timeout, or that exits other than 0 or 2. finish() always exits 0, so a normal allow is never blocked.
//
// Environment (tests): WOW_HOOK_CHILD_TIMEOUT_MS (alias WOW_CODEX_HOOK_CHILD_TIMEOUT_MS)
// overrides every child timeout; WOW_SESSION_MARKER_TTL_HOURS bounds peer-marker age.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  closeSync, constants as fsConstants, existsSync, fstatSync, linkSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, realpathSync, renameSync, rmSync, statSync, utimesSync, writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath, pathToFileURL } from "node:url";

const SELF = path.resolve(fileURLToPath(import.meta.url));
export const MODES = ["session-start", "session-end", "pre-tool-use", "post-tool-use", "post-tool-use-failure", "stop"];
const OVERRIDE_MS = Number(process.env.WOW_HOOK_CHILD_TIMEOUT_MS || process.env.WOW_CODEX_HOOK_CHILD_TIMEOUT_MS) || 0;
const STDIN_WAIT_MS = 5_000;
const DEADLINE_MS = {
  "session-start": 55_000, "session-end": 8_000, "pre-tool-use": 8_000,
  "post-tool-use": 8_000, "post-tool-use-failure": 8_000, stop: 170_000,
};
// Tests shorten the pre-tool-use deadline to prove the trust call fails closed (never lengthens it).
const DEADLINE_TEST_MS = Number(process.env.WOW_HOOK_DEADLINE_MS) || 0;
if (DEADLINE_TEST_MS > 0) DEADLINE_MS["pre-tool-use"] = Math.min(DEADLINE_MS["pre-tool-use"], DEADLINE_TEST_MS);
const CHILD_MS = { sessionStart: 40_000, handoff: 120_000, health: 5_000 };
export const BUDGET = { lines: 15, chars: 2_000 };
export const RESUME_LINE = "wow-core: restore the working set (modified files, active ids, current task); re-read the live state resume block and the PR body's Resume here line (a master also AGENTS.md and its takeover or dispatcher state); the model check is already done.";
export const NOPROGRESS_THRESHOLD = 3;

function note(message) {
  try { process.stderr.write(`wow-core hook: ${message}\n`); } catch { /* ignore */ }
}

let exiting = false;
function finish(stdout = "") {
  if (exiting) return;
  exiting = true;
  const done = () => process.exit(0);
  if (stdout) process.stdout.write(stdout, done);
  else done();
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) { resolve(""); return; }
    let data = "";
    let settled = false;
    const end = () => {
      if (settled) return;
      settled = true;
      try { process.stdin.pause(); } catch { /* ignore */ }
      resolve(data);
    };
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", end);
    process.stdin.on("error", end);
    setTimeout(end, STDIN_WAIT_MS).unref();
  });
}

export function parsePayload(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

export function detectTool(argv = process.argv, env = process.env, payload = {}) {
  const flag = argv.indexOf("--tool");
  const named = flag >= 0 ? argv[flag + 1] : env.WOW_HOOK_TOOL;
  if (named === "codex" || named === "claude") return named;
  if (env.CODEX_THREAD_ID || (payload && typeof payload.turn_id === "string")) return "codex";
  return "claude";
}

// ---- repository discovery (no git process: walk up looking for .git, honouring ceilings) ----

const normDir = (value) => {
  const resolved = path.resolve(value).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
};

export function findRoot(start, env = process.env) {
  const ceilings = String(env.GIT_CEILING_DIRECTORIES || "").split(path.delimiter).filter(Boolean).map(normDir);
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir || ceilings.includes(normDir(parent))) return null;
    dir = parent;
  }
}

// `.git` is a directory in a primary checkout and a `gitdir: <repo>/.git/worktrees/<n>` file in
// a linked worktree. A submodule's file points into .git/modules, so it counts as primary.
export function isLinkedWorktree(root) {
  try {
    const dotGit = path.join(root, ".git");
    if (statSync(dotGit).isDirectory()) return false;
    const target = readFileSync(dotGit, "utf8").replace(/^gitdir:\s*/i, "").trim().replace(/\\/g, "/");
    return /\/worktrees\//.test(target);
  } catch { return false; }
}

// Live Codex lane runs 2026-10-05: inherited repo-wide state is verified by the master.
function isLane(root) {
  if (process.env.WOW_LANE) return true;
  try {
    const hooks = execFileSync("git", ["-C", root, "config", "--worktree", "--get", "core.hooksPath"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true, timeout: 10_000,
    }).trim().replace(/\\/g, "/");
    return /(?:^|\/)wow-lanes\/hooks-sub\d+\/?$/i.test(hooks);
  } catch { return false; }
}

const has = (root, rel) => existsSync(path.join(root, rel));
// A settings file is read only if it is a regular file of at most 1 MB (follow-up to #342 "Not done"; the same pattern as
// workflowText in hooks/guard-bash-policy.mjs). A checkout's .claude/settings.json is attacker-influenced input to this hook,
// and a sibling checkout's is read on every turn that starts in the parent folder: a FIFO there would block readFileSync in
// open(), so the event loop would stop and not even the 8 s watchdog could fire. The file is opened non-blocking (a FIFO opens at
// once) and checked on the open descriptor, so swapping it in after the check does not help either. Throws what readFileSync
// would (ENOENT stays ENOENT), or an error for a file that is not a regular file or is too big.
const SETTINGS_MAX_BYTES = 1_000_000;
function readSettings(file) {
  const fd = openSync(file, fsConstants.O_RDONLY | (fsConstants.O_NONBLOCK ?? 0));
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.size > SETTINGS_MAX_BYTES) throw Object.assign(new Error(`${file} is not a regular file of at most ${SETTINGS_MAX_BYTES} bytes`), { code: "EWOWSETTINGS" });
    return readFileSync(fd, "utf8");
  } finally { try { closeSync(fd); } catch { /* nothing to close */ } }
}
const isWowCore = (root) =>
  has(root, "consumers.json") && has(root, "core/WAYS_OF_WORKING_CORE.md") && has(root, "scripts/sync-to-project.ps1");
// The checkout root when this hook runs from wow-core's own layout (<root>/scripts/wow-hook.mjs), else null: a consumer's
// copy sits in .claude/scripts. Working-tree files alone can be planted (review 2026-11-05), the hook's own path cannot.
export function ownCheckoutRoot(self = SELF) {
  const dir = path.dirname(self);
  const root = path.dirname(dir);
  return path.basename(dir) === "scripts" && path.basename(root) !== ".claude" ? root : null;
}
// The checkout that holds this hook in either layout: wow-core's own (<root>/scripts) or a consumer's (<root>/.claude/scripts),
// a primary checkout or a worktree; null for any other copy (the user-level Codex install in ~/.codex/wow-core).
export function hookCheckoutRoot(self = SELF) {
  const dir = path.dirname(self);
  if (path.basename(dir) !== "scripts") return null;
  const up = path.dirname(dir);
  const root = path.basename(up) === ".claude" ? path.dirname(up) : up;
  return existsSync(path.join(root, ".git")) ? root : null;
}
// Compared after realpath on both sides: node resolves the hook's own path through symbolic links but keeps a Windows 8.3
// short name (RUNNER~1), and a payload cwd or CLAUDE_PROJECT_DIR may carry either.
const realDir = (value) => { try { return normDir(realpathSync.native(value)); } catch { return normDir(value); } };
const sameDir = (a, b) => Boolean(a && b) && realDir(a) === realDir(b);
// The primary checkouts directly under `parent` that carry a consumer's synced wow-core hook (.claude/scripts/wow-hook.mjs
// plus a sync stamp: full, partial or comms). In a cloud session these are the session's own repositories: a session
// source is cloned directly under the parent, an add_repo attach one level deeper (<owner>/<name>).
export function consumerCheckoutsIn(parent) {
  let names = [];
  try { names = readdirSync(parent).sort(); } catch { return []; }
  return names.map((name) => path.join(parent, name)).filter((dir) => {
    try { if (!statSync(path.join(dir, ".git")).isDirectory()) return false; } catch { return false; }
    return has(dir, ".claude/scripts/wow-hook.mjs")
      && [".claude/wow-core.version", ".claude/wow-core.partial", ".claude/wow-core.comms"].some((rel) => has(dir, rel));
  });
}
// The host's project directory (CLAUDE_PROJECT_DIR). In a turn that starts in the parent folder of this hook's checkout
// (see "Parent-folder wiring" below) the host names the parent: read it as the checkout, so the spawn rule's master
// exemption and roster refusal hold there exactly as in a turn started in the checkout. One exception (review
// 2026-11-06, M2): wow-core's own copy, wired into a parent that also holds a consumer checkout, is in a session whose
// primary repository is that consumer (a master session has the project first, then wow-core and the bus), so the parent
// stays the host: the turn is not the wow-core master's and gets no wow-core-master exemption or roster refusal, exactly
// what the consumer's own copy would decide there. It applies only while that consumer owns the parent file (its
// seeding call took it over): a folder merely planted under the parent strips nothing (review 2026-11-06).
export function hostProjectDir(env = process.env, self = SELF) {
  const dir = typeof env.CLAUDE_PROJECT_DIR === "string" && env.CLAUDE_PROJECT_DIR ? path.resolve(env.CLAUDE_PROJECT_DIR) : null;
  const own = hookCheckoutRoot(self);
  if (!(dir && own && sameDir(path.dirname(own), dir))) return dir;
  if (!ownCheckoutRoot(self)) return own;
  let owner = null;
  try { owner = JSON.parse(readSettings(path.join(dir, ".claude", "settings.json")))?.[PARENT_OWNER_KEY]?.checkout ?? null; } catch { /* no parent file */ }
  return typeof owner === "string" && consumerCheckoutsIn(dir).some((checkout) => sameDir(checkout, owner)) ? dir : own;
}
// The host project is wow-core AND this hook is wow-core's own copy: the only test for the master's exemptions.
const isWowCoreHost = (projectDir) => Boolean(projectDir && ownCheckoutRoot() && isWowCore(projectDir));

// ---- Parent-folder wiring (evidence 2026-11-05) ----
// In a Claude Code cloud session every turn starts a fresh Claude Code process in the session's primary working
// directory, which moves between the checkout (/home/user/<repo>) and its parent folder (/home/user): to the parent once
// the session has attached more repositories, and after shell commands that end outside the checkout. A turn started in
// the parent loaded no project settings, so no hook of this file ran there (the wow-core master's own system/init events
// showed /home/user at 20:42, 20:53 and 20:55Z; the Codex dispatcher's push attach of strale-io/strale was refused by the
// classifier at ~20:30Z although this hook allows that payload). So, in a cloud session, this hook's FIRST call in its own
// primary checkout (pre-tool-use for every profile, session-start too for full consumers) writes
// <parent>/.claude/settings.json: the same wow-hook entries as the checkout's own .claude/settings.json (event, matcher,
// timeout; derived from it on every call in the owning checkout or a parent turn, so they cannot drift), by the absolute path of this hook and with
// `--via-parent`, plus the checkout's permissions.deny list exactly, joined by the deny lists of the other wired primary
// checkouts under the same parent (deny only: it can only narrow; parentDenyFor, parentDenyUnion). Nothing
// else is copied: no allow, ask or defaultMode or status line; the checkout's other `type: "command"` hooks are carried
// only when their command can be rewritten safely and guarded (rewriteProjectDirCommand, carriedCommand). Ownership: the file carries PARENT_OWNER_KEY naming the checkout; a file without it is never touched
// (one warning line per container). First checkout wins: a file owned by another checkout is left alone, silently, so a
// second repository in the same session never replaces the first's wiring; only the owning checkout rewrites it, and
// only when its derived entries change. One exception (review 2026-11-06, M2): a consumer's seeding call takes over a
// file owned by a wow-core checkout or by a checkout that no longer exists, because consumers own the parent (the fleet
// setup script seeds them first, and a master session's primary repository is its project); otherwise wow-core's copy
// would decide a consumer master's turns. A failure prints one line and the hook carries on.
export const PARENT_OWNER_KEY = "$wow-core-parent-hooks";
export const VIA_PARENT = "--via-parent";
// A dispatcher command in the three forms a checkout's wiring may carry: the project-dir form, braced (what the sync writes
// now) or bare (an older wiring), or the repo-relative script. Groups: 1 = the path after the quoted project-dir reference,
// 2 = the bare relative path, 3 = the mode.
const DISPATCHER_COMMAND = /^node\s+(?:"\$(?:CLAUDE_PROJECT_DIR|\{CLAUDE_PROJECT_DIR\})\/((?:\.claude\/)?scripts\/wow-hook\.mjs)"|((?:\.claude\/)?scripts\/wow-hook\.mjs))\s+([a-z-]+)(?:\s+--tool\s+claude)?$/;
const SAFE_PATH = /^[A-Za-z0-9._@+~/: -]+$/; // the path goes inside double quotes in a shell command: no $, `, ", \ or !
const toPosix = (p) => p.replace(/\\/g, "/");

// A literal repo-relative script path (the working directory of a checkout-turn hook is the project directory, so
// `.claude/hooks/x.mjs` and `./x.mjs` are the checkout's files): returns it without a leading `./`, or null when it has a
// `..` segment, a glob, `$`, a backtick, a backslash, a leading `/` or `~`, or any character outside the safe set.
const RELATIVE_SCRIPT = /^(?:\.\/)?[A-Za-z0-9._@+-]+(?:\/[A-Za-z0-9._@+-]+)*$/;
function relativeScript(word) {
  if (!RELATIVE_SCRIPT.test(word)) return null;
  const rel = word.replace(/^\.\//, "");
  return rel.split("/").some((part) => part === ".." || part === ".") ? null : rel;
}

// The command of another hook of the checkout, with its `$CLAUDE_PROJECT_DIR` reference rewritten to the checkout's
// absolute path, or null when that cannot be done safely. The rewrite secures the PATH only: the rest of the command's
// syntax is carried verbatim, which is what a checkout turn already runs. A reference is rewritten when it is the
// executable (first word of a simple command) or the first argument after an interpreter (node, bash, sh, pwsh, python,
// python3), at the start of its word, as `$CLAUDE_PROJECT_DIR/<path>`, `${CLAUDE_PROJECT_DIR}/<path>` or
// `"$CLAUDE_PROJECT_DIR"/<path>`, bare or inside double quotes, or as a literal repo-relative script (`.claude/hooks/x.mjs`,
// `./x.sh`: a checkout-turn hook runs from the project directory, so it is the checkout's file; a bare word with no `/` is
// a script only as the first argument after an interpreter, so `ls` or `echo` stay as written): it becomes the checkout's
// absolute path, quoted where it is not already inside double quotes. A word in the executable or interpreter position that
// starts with `/` or `~` is left as written (it is not a repo-relative reference), a literal one in a command that also
// runs `cd` or `pushd` is refused (it would name another directory's file), and the command is carried only when at
// least one reference was rewritten. Refused (null): a checkout path outside SAFE_PATH (it goes into a shell command),
// a reference inside single quotes or after an unquoted `#`, a reference elsewhere in a command (a later argument, a
// `--flag=` value), a path with no segment, a `..` segment or a glob character (`*?[`), any other `$`, command
// substitution, a backtick, a backslash, a newline, unbalanced quotes, a command with no reference (a relative path would
// resolve against the parent's cwd) and any command that mentions wow-hook.mjs (its own entries come only from the
// dispatcher branch of parentHooksFor).
const INTERPRETER = /^(?:node|bash|sh|pwsh|python3?)$/;
const CHANGES_DIR = /(?:^|[\s;&|()])(?:cd|pushd)(?=[\s;&|()]|$)/;
const MAX_HOOK_COMMAND = 4096; // a longer hook command is not carried (the rewrite re-slices the text at every word)
export function rewriteProjectDirCommand(command, root) {
  const abs = toPosix(root);
  if (typeof command !== "string" || command.length > MAX_HOOK_COMMAND || !SAFE_PATH.test(abs) || /[`\\\r\n]/.test(command) || command.includes("$(") || /wow-hook\.mjs/.test(command)) return null;
  let out = "";
  let quote = null;
  let refs = 0;
  let words = [];
  let word = "";
  let inWord = false;
  const endWord = () => { if (inWord) words.push(word); word = ""; inWord = false; };
  for (let i = 0; i < command.length;) {
    const ch = command[i];
    if (ch === "$") {
      const ref = /^\$(?:CLAUDE_PROJECT_DIR(?![A-Za-z0-9_])|\{CLAUDE_PROJECT_DIR\})/.exec(command.slice(i));
      if (!ref || quote === "'" || word !== "") return null;
      const first = words[0]?.split("/").pop();
      if (words.length > 1 || (words.length === 1 && !INTERPRETER.test(first))) return null;
      // Inside double quotes the path runs to the closing quote; a closing quote right after the reference ends the word.
      const rest = command.slice(i + ref[0].length);
      const tail = (quote === '"' ? /^(?:\/([^"]+)|"\/([^\s"';&|<>()]+))/ : /^\/([^\s"';&|<>()]+)/).exec(rest);
      const tailPath = tail && (tail[1] ?? tail[2]);
      if (!tailPath || tailPath.split("/").includes("..") || /[*?[]/.test(tailPath)) return null;
      out += quote === '"' ? abs : `"${abs}"`;
      refs += 1;
      inWord = true;
      word = "\u0001";
      i += ref[0].length;
      continue;
    }
    if (!quote && !inWord) {
      // A literal repo-relative script path in script position (the executable, or the first argument after an interpreter).
      const pos = words.length;
      const scriptPos = pos === 0 || (pos === 1 && INTERPRETER.test(words[0].split("/").pop()));
      const lit = scriptPos ? /^(?:"([^"$`\\]+)"|'([^'$`\\]+)'|([^\s"';&|<>()$`\\#]+))(?=[\s;&|<>()]|$)/.exec(command.slice(i)) : null;
      const w = lit && (lit[1] ?? lit[2] ?? lit[3]);
      if (w && !w.startsWith("-") && !w.startsWith("/") && !w.startsWith("~") && (pos === 1 || w.includes("/") || /[*?[]/.test(w))) {
        if (CHANGES_DIR.test(command)) return null; // after a cd the relative word names another directory's file
        const rel = relativeScript(w);
        if (!rel) return null; // `..`, a glob or an odd character where a script path stands: not placeable
        out += `"${abs}/${rel}"`;
        refs += 1;
        inWord = true;
        word = "\u0001";
        i += lit[0].length;
        continue;
      }
    }
    out += ch;
    i += 1;
    if (quote) { if (ch === quote) quote = null; else word += ch; continue; }
    if (ch === "'" || ch === '"') { quote = ch; inWord = true; continue; }
    if (ch === "#" && !inWord) { if (command.slice(i).includes("$")) return null; out += command.slice(i); break; }
    if (ch === " " || ch === "\t") { endWord(); continue; }
    if (ch === "<" || ch === ">" || (ch === "&" && /[<>]/.test(command[i - 2] ?? ""))) { endWord(); continue; }
    if (";&|()".includes(ch)) { endWord(); words = []; continue; }
    inWord = true;
    word += ch;
  }
  return quote || !refs ? null : out;
}

// The cloud setup hook: the WHOLE command is the script, with optional plain arguments and plain output redirections
// (`> file`, `>>`, `2>&1`, `>/dev/null`), an optional trailing `|| true`, `|| :` or `|| exit 0`, one line, and no other shell operator, so a compound command that runs it and something
// else is judged like any other hook (never carried: not a parent-turn hook). A linear tokenizer, not a regex: this runs
// before every PreToolUse, so a padded settings line must not cost more than its length (a longer command is not it).
const CLOUD_SESSION_SCRIPT = /^(?:"?\$\{?CLAUDE_PROJECT_DIR\}?"?\/|\.\/)?(?:\.claude\/)?scripts\/cloud-session\.sh"?$/;
const CLOUD_SESSION_MAX = 512;
export function isCloudSessionHook(command) {
  if (typeof command !== "string" || command.length > CLOUD_SESSION_MAX || /[\r\n]/.test(command)) return false;
  const tokens = command.split(/\s+/).filter(Boolean);
  // A trailing `|| true`, `|| :` or `|| exit 0` only keeps a failed setup from failing the session: still the setup hook.
  const tail = tokens.slice(-3).join(" ");
  if (/^\S+ \|\| (?:true|:)$/.test(tail) || tokens.slice(-3).join(" ") === "|| exit 0") tokens.splice(tokens.lastIndexOf("||"));
  let i = tokens[0] === "bash" || tokens[0] === "sh" ? 1 : 0;
  if (!CLOUD_SESSION_SCRIPT.test(tokens[i] ?? "")) return false;
  const target = (word) => word !== undefined && (/^&\d$/.test(word) || /^[\w./-]+$/.test(word));
  let redirecting = false;
  for (i += 1; i < tokens.length; i += 1) {
    const redirect = /^\d?>>?/.exec(tokens[i]);
    if (redirect) {
      redirecting = true;
      const rest = tokens[i].slice(redirect[0].length);
      if (rest) { if (!target(rest)) return false; } else if (!target(tokens[++i])) return false;
    } else if (redirecting || /[;&|<>`$()]/.test(tokens[i])) return false;
  }
  return true;
}

// The shell-form equivalent of an exec-form hook (`command` plus an `args` array: Claude Code spawns the executable with
// the argument vector and no shell, and substitutes the `${CLAUDE_PROJECT_DIR}` placeholder, not `$CLAUDE_PROJECT_DIR`,
// into `command` and each element). Carried only when the script is a literal repo-relative or `${CLAUDE_PROJECT_DIR}/`
// path, either as `command` or as the first argument of an interpreter, and every other argument is a plain literal
// (no space, quote, `$`, `;`, glob or backslash); each is single-quoted. Null otherwise.
const ARG_PLAIN = /^[A-Za-z0-9._@+:=,/-]+$/;
function scriptToken(word, needsSlash) {
  if (typeof word !== "string") return null;
  const placeholder = /^\$\{CLAUDE_PROJECT_DIR\}\/(.+)$/.exec(word);
  const rel = relativeScript(placeholder ? placeholder[1] : word);
  if (!rel || (!placeholder && needsSlash && !/^\.?\//.test(word) && !rel.includes("/"))) return null;
  return placeholder ? `"$CLAUDE_PROJECT_DIR/${rel}"` : needsSlash && !rel.includes("/") ? `./${rel}` : rel;
}
function execFormCommand(hook) {
  const { command, args } = hook;
  if (typeof command !== "string" || command.length > 256 || !Array.isArray(args) || args.length > 64 || !args.every((arg) => typeof arg === "string" && arg.length <= 256)) return null;
  const interpreter = INTERPRETER.test(command);
  const script = interpreter ? scriptToken(args[0], false) : scriptToken(command, true);
  const rest = interpreter ? args.slice(1) : args;
  if (!script || !rest.every((arg) => ARG_PLAIN.test(arg))) return null;
  return [interpreter ? command : null, script, ...rest.map((arg) => `'${arg}'`)].filter(Boolean).join(" ");
}

// A carried hook's command for the parent file: the rewritten command behind a guard that makes it a no-op unless the
// host's project is the parent folder (mirroring parentWiringApplies, so it never runs twice), and that sets
// CLAUDE_PROJECT_DIR to the checkout and runs the hook from the checkout, as a checkout turn does. Both paths are quoted and must pass SAFE_PATH. Null when the
// command cannot be rewritten.
function carriedCommand(command, root) {
  const rewritten = rewriteProjectDirCommand(command, root);
  const parent = toPosix(path.dirname(root));
  if (!rewritten || !SAFE_PATH.test(parent)) return null;
  return `[ "$CLAUDE_PROJECT_DIR" != "${parent}" ] && [ "$CLAUDE_PROJECT_DIR" != "${parent}/" ] && exit 0; export CLAUDE_PROJECT_DIR="${toPosix(root)}"; cd "${toPosix(root)}" || exit 0; ${rewritten}`;
}

// The parent's hooks object for the checkout's settings text: this hook's own dispatcher entries, rewritten by absolute
// path and marked --via-parent, and the checkout's other `type: "command"` hooks whose command carriedCommand can
// rewrite (consumer-owned hooks, such as a spawn cap or a copy gate, must also run in a turn that starts in the parent).
// `report` collects what the caller needs: `own` counts the dispatcher entries written (only those make a checkout an
// owner) and `dropped` lists the hooks that could not be carried (a command that cannot be rewritten, or any non-`command`
// hook type such as http or prompt) and were left out. The cloud setup hook
// is never carried and not reported. A dispatcher-shaped entry of another checkout, or of an unknown mode, is left out
// silently.
export function parentHooksFor(settingsText, root, self = SELF, report = { dropped: [], own: 0 }) {
  const settings = JSON.parse(settingsText);
  const out = {};
  for (const [event, groups] of Object.entries(settings?.hooks ?? {})) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      const hooks = [];
      for (const hook of Array.isArray(group?.hooks) ? group.hooks : []) {
        if (hook?.type !== "command" || typeof hook.command !== "string") {
          if (hook?.type) report.dropped.push(`${hook.type} hook${typeof hook.url === "string" ? ` ${hook.url}` : ""}`);
          continue;
        }
        const exec = hook.args !== undefined;
        if (!exec && hook.command.length > MAX_HOOK_COMMAND) { report.dropped.push(`${hook.command.slice(0, 120)}... (${hook.command.length} characters)`); continue; }
        const trimmed = exec ? (execFormCommand(hook) ?? "") : hook.command.trim();
        if (exec && !trimmed) { report.dropped.push(`${hook.command} ${JSON.stringify(hook.args)}`.slice(0, 160)); continue; }
        const m = exec ? null : trimmed.match(DISPATCHER_COMMAND);
        if (m) {
          if (!MODES.includes(m[3]) || !sameDir(path.resolve(root, m[1] ?? m[2]), self)) continue;
          // onFailure is carried too, so the parent copy of the PreToolUse entry fails closed like the checkout's own.
          hooks.push({ type: "command", command: `node "${toPosix(self)}" ${m[3]} --tool claude ${VIA_PARENT}`, ...(Number.isFinite(hook.timeout) ? { timeout: hook.timeout } : {}), ...(hook.onFailure === "block" || hook.onFailure === "continue" ? { onFailure: hook.onFailure } : {}) });
          report.own += 1;
          continue;
        }
        if (isCloudSessionHook(trimmed)) continue;
        const command = carriedCommand(trimmed, root);
        if (command) {
          const { args: _args, ...rest } = hook; // the carried command is shell form: the args are folded into it
          hooks.push({ ...rest, command });
        } else report.dropped.push(exec ? `${hook.command} ${JSON.stringify(hook.args)}`.slice(0, 160) : trimmed);
      }
      if (hooks.length) (out[event] ??= []).push({ ...(typeof group.matcher === "string" && group.matcher ? { matcher: group.matcher } : {}), hooks });
    }
  }
  return out;
}

// The checkout's permissions.deny list, exactly, and nothing else of its permissions: a deny can only narrow what a
// parent turn may do (the hard-stop list, #251: mail send, deletes, hand merges), while allow, ask and defaultMode would
// widen or change it, so they are never copied (coordinator 2026-11-05). Re-derived on every call, like the hooks.
export function parentDenyFor(settingsText) {
  const deny = JSON.parse(settingsText)?.permissions?.deny;
  return Array.isArray(deny) ? deny.filter((entry) => typeof entry === "string") : [];
}

// ---- hard stops on every instance of a connector ----
// The hard-stop deny list (#251: never send, post or invite; never pay or accept terms; never delete or publish without
// the founder's yes) names each connector tool by its server name, exactly. The platform names a second account of the
// same claude.ai connector with an instance suffix (seen live 2026-11-06: mcp__Microsoft_365-fe0a0ef2__outlook_send_mail,
// the founder's second mailbox), and the local CLI adds a claude_ai_ prefix, so an exact entry never matched those.
// mcpRuleParts reduces a name to { server, tool }, lower case, the server without a leading claude_ai_ and a trailing
// -<hex> instance suffix; a server-only entry (mcp__X) or mcp__X__* covers every tool of X. The patterns are the
// checkout's own permissions.deny (no second, hand-kept list), so only a tool that matches an entry is ever refused.
// An MCP tool name split into { server, tool }, lower case, the server without a leading claude_ai_ and plugin_<plugin>_ prefix
// but with any instance suffix kept; tool is "*" for a server-only name; null for a name that is not an MCP tool. Shared by the
// hard stops (mcpRuleParts) and the mail guard (isMailTool), which read instance suffixes differently.
function mcpNameParts(name) {
  if (typeof name !== "string" || !name.startsWith("mcp__")) return null;
  const rest = name.slice("mcp__".length);
  const cut = rest.indexOf("__");
  // Plugin servers are mcp__plugin_<plugin>_<server> (plugin names are kebab-case, so the lazy match stops at the first
  // underscore after the plugin name).
  const server = (cut < 0 ? rest : rest.slice(0, cut)).toLowerCase().replace(/^plugin_[a-z0-9-]+?_/, "").replace(/^claude_ai_/, "");
  const tool = cut < 0 ? "*" : rest.slice(cut + 2).toLowerCase();
  return { server, tool };
}

export function mcpRuleParts(name) {
  const parts = mcpNameParts(name);
  if (!parts) return null;
  // Only the -<hex> instance suffix has been seen live; other shapes (_2, (2)) are not covered, and an over-strip can only
  // add a deny, never remove one, except where the server's own name ends in -<hex>: a hyphenated `microsoft-365` reduces to
  // `microsoft` and so matches no Microsoft_365 entry (the mail guard reads that name itself, isMailTool).
  const server = parts.server.replace(/-[0-9a-f]+$/, "");
  return server && parts.tool ? { server, tool: parts.tool } : null;
}

// The deny entry that a call to `toolName` matches on another instance of its connector, or null.
export function hardStopEntry(toolName, deny) {
  const call = mcpRuleParts(toolName);
  if (!call || call.tool === "*" || !Array.isArray(deny)) return null;
  for (const entry of deny) {
    const rule = mcpRuleParts(entry);
    if (rule && rule.server === call.server && (rule.tool === "*" || rule.tool === call.tool)) return entry;
  }
  return null;
}

// The hard-stop patterns for this call: the permissions.deny list of the hook's own checkout and of the payload's
// repository (in a parent-folder turn, the union with every wired sibling checkout, as the parent file carries). A
// settings file that cannot be parsed adds nothing, and so does one that does not exist (ENOENT). One that exists but cannot
// be read (a FIFO, a device, a directory, a file over the size cap, any other read error) is reported in `unreadable`, and the
// caller refuses the call: "adds nothing" would turn a hard-stop tool into an allow (round 1 of the #342 follow-up, D).
function hardStopDeny({ own, repoRoot, parentTurn }) {
  const deny = [], unreadable = [];
  for (const root of [...new Set([own, repoRoot].filter(Boolean))]) {
    const file = path.join(root, ".claude", "settings.json");
    let text;
    try { text = readSettings(file); } catch (error) { if (error?.code !== "ENOENT") unreadable.push(file); continue; }
    try { deny.push(...(parentTurn && root === own ? parentDenyUnion(text, own, unreadable) : parentDenyFor(text))); } catch { /* not parseable: adds nothing */ }
  }
  return { deny, unreadable };
}

export const unreadableSettingsReason = (toolName, file) => `wow-core: ${toolName} is refused because the hard-stop list could not be read: ${file} exists but is not a readable regular file of at most ${SETTINGS_MAX_BYTES} bytes (a FIFO, a device, a directory, an oversize file or a read error), so this call cannot be checked against the founder's hard stops (never send, post or invite; never pay or accept terms; never delete or publish without his yes). Fix or remove that file and retry; it is not a decision about this tool.`;

export const hardStopReason = (toolName, entry) => `wow-core: ${toolName} is a hard stop: it matches the deny entry ${entry}, which covers every account and instance of that connector (permissions.deny; the founder's hard stops, 2026-11-05: never send, post or invite, never pay or accept terms, never delete or publish without his yes). The founder does this himself: prepare a draft or the exact step and ask him.`;

// The parent file's deny list: the owner's list exactly, then each new entry of every other existing primary checkout directly
// under the parent that has wow-core wiring (a consumer's .claude/scripts/wow-hook.mjs or wow-core's scripts/wow-hook.mjs),
// in folder order, each once. Several checkouts share one container's parent folder, and a parent turn must keep every
// one's hard stops (review 2026-11-06, Strale orchestrator, for #262). A union can only narrow; the hook entries stay
// the owner's. A sibling whose settings cannot be parsed, or does not exist, adds nothing; one that exists but cannot be read is
// pushed on `unreadable` (when given) for the caller to refuse on.
export function parentDenyUnion(ownText, root, unreadable = []) {
  const deny = parentDenyFor(ownText); // exactly, as before: a single checkout's parent file is unchanged
  const seen = new Set(deny);
  let names = [];
  try { names = readdirSync(path.dirname(root)).sort(); } catch { /* the owner's list alone */ }
  for (const name of names) {
    const dir = path.join(path.dirname(root), name);
    if (sameDir(dir, root) || !(has(dir, ".claude/scripts/wow-hook.mjs") || (has(dir, "scripts/wow-hook.mjs") && isWowCore(dir)))) continue;
    try { if (!statSync(path.join(dir, ".git")).isDirectory()) continue; } catch { continue; }
    const file = path.join(dir, ".claude", "settings.json");
    let list;
    try { list = parentDenyFor(readSettings(file)); } catch (error) { if (error?.code !== "ENOENT" && error?.name !== "SyntaxError") unreadable.push(file); continue; }
    for (const entry of list) if (!seen.has(entry)) { seen.add(entry); deny.push(entry); }
  }
  return deny;
}

// Why a parent file owned by another checkout deserves a look, or null: it carries anything this hook never writes (a key
// besides the owner key, hooks and permissions.deny; permissions other than deny), or its owner is not an existing
// primary checkout. Such a file is still left alone (first checkout wins), but not silently.
function otherOwnerConcern(text, checkout) {
  const parsed = JSON.parse(text);
  const extra = Object.keys(parsed).filter((key) => ![PARENT_OWNER_KEY, "hooks", "permissions"].includes(key));
  const perms = parsed.permissions;
  if (perms !== undefined) {
    if (!perms || typeof perms !== "object" || Array.isArray(perms)) extra.push("permissions");
    else extra.push(...Object.keys(perms).filter((key) => key !== "deny").map((key) => `permissions.${key}`));
  }
  if (extra.length) return `it carries ${extra.join(", ")}, which wow-core never writes there`;
  let primary = false;
  try { primary = statSync(path.join(checkout, ".git")).isDirectory(); } catch { /* not a checkout */ }
  return primary ? null : "that is not an existing primary checkout";
}

// A consumer's seeding call may take over the parent file from this owner: a wow-core checkout, or a path that is no
// longer an existing primary checkout.
function takeoverAllowed(checkout) {
  try { if (!statSync(path.join(checkout, ".git")).isDirectory()) return true; } catch { return true; }
  return isWowCore(checkout);
}

// Prints `message` once per container for this parent file and kind (a stamp file under the OS temp folder).
function noteOnce(kind, file, message, env) {
  const dir = typeof env.WOW_PARENT_HOOKS_STATE_DIR === "string" && env.WOW_PARENT_HOOKS_STATE_DIR ? env.WOW_PARENT_HOOKS_STATE_DIR : os.tmpdir();
  const stamp = path.join(dir, `wow-parent-hooks-${createHash("sha256").update(`${kind}\n${file}`).digest("hex").slice(0, 16)}.noted`);
  try { closeSync(openSync(stamp, "wx")); } catch (error) { if (error?.code === "EEXIST") return; }
  note(message);
}

// { status, file } — written | updated | taken-over | current | other-checkout | foreign | skipped | failed. Never throws.
// create: false (a --via-parent call) only refreshes a file this checkout already owns; it never creates one, so a
// by-hand --via-parent run cannot make its checkout the owner (only the seeding call from the checkout's own wiring can).
export function ensureParentHooks({ root, self = SELF, env = process.env, create = true }) {
  const parent = path.dirname(root);
  const file = path.join(parent, ".claude", "settings.json");
  try {
    if (env.CLAUDE_CODE_REMOTE !== "true" || isLinkedWorktree(root)) return { status: "skipped", file };
    // Never the user's own settings (loaded in every turn, so the hooks would run twice) or a filesystem root.
    if (sameDir(parent, os.homedir()) || path.dirname(parent) === parent || !SAFE_PATH.test(toPosix(self))) return { status: "skipped", file };
    let existing = null;
    let takeover = null;
    try { existing = readSettings(file); } catch (error) { if (error?.code !== "ENOENT") throw error; }
    if (existing === null && !create) return { status: "skipped", file };
    if (existing !== null) {
      let owner;
      try { owner = JSON.parse(existing)?.[PARENT_OWNER_KEY]; } catch { owner = undefined; }
      if (!owner || typeof owner !== "object" || typeof owner.checkout !== "string") {
        noteOnce("foreign", file, `${file} was not written by wow-core; left as it is, so a turn that starts in ${parent} runs none of this checkout's hooks.`, env);
        return { status: "foreign", file };
      }
      if (!sameDir(owner.checkout, root)) {
        if (create && !ownCheckoutRoot(self) && takeoverAllowed(owner.checkout)) {
          takeover = owner.checkout;
        } else {
          const why = otherOwnerConcern(existing, owner.checkout);
          if (why) noteOnce("other-checkout", file, `${file} is owned by another checkout (${owner.checkout}) but ${why}; left as it is. Remove it if no wow-core checkout wrote it.`, env);
          return { status: "other-checkout", file };
        }
      }
    }
    const checkoutText = readSettings(path.join(root, ".claude", "settings.json"));
    const report = { dropped: [], own: 0 };
    const hooks = parentHooksFor(checkoutText, root, self, report);
    const dropped = report.dropped;
    const deny = parentDenyUnion(checkoutText, root);
    if (dropped.length) noteOnce("dropped-hooks", file, `${dropped.length} hook(s) of ${root}/.claude/settings.json are not carried to ${file}: a command must reference the checkout as "$CLAUDE_PROJECT_DIR/<path>" with nothing else the hook cannot rewrite (first: ${dropped[0].slice(0, 120)}). A turn that starts in ${parent} does not run them (only type "command" hooks are carried).`, env);
    if (existing === null && !report.own) return { status: "skipped", file };
    // A consumer whose settings wire no wow-hook entry would take over and leave the parent with no wow-core hook at all.
    if (takeover && !report.own) return { status: "other-checkout", file };
    const text = `${JSON.stringify({
      [PARENT_OWNER_KEY]: { checkout: toPosix(root), note: `Written by ${toPosix(self)} for cloud turns that start in this folder; it is rewritten from ${toPosix(path.join(root, ".claude/settings.json"))}. Remove this file to unwire.` },
      ...(deny.length ? { permissions: { deny } } : {}),
      hooks,
    }, null, 2)}\n`;
    if (existing === text) return { status: "current", file };
    mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}-${createHash("sha256").update(`${Date.now()}${Math.random()}`).digest("hex").slice(0, 8)}.tmp`;
    writeFileSync(temp, text);
    try {
      if (existing !== null) {
        renameSync(temp, file);
        if (takeover) noteOnce("taken-over", file, `${file} was wired by ${takeover}; this consumer checkout (${root}) owns it now (consumers own the parent folder).`, env);
        return { status: takeover ? "taken-over" : "updated", file };
      }
      // Create: a hard link appears whole or not at all and refuses an existing file, so the first checkout wins a race.
      try { linkSync(temp, file); } catch (error) {
        if (error?.code === "EEXIST") return { status: "other-checkout", file };
        writeFileSync(file, text, { flag: "wx" });
      }
      return { status: "written", file };
    } finally { try { rmSync(temp, { force: true }); } catch { /* ignore */ } }
  } catch (error) {
    noteOnce("failed", file, `could not write ${file} (${String(error?.message ?? error).split("\n")[0]}); a turn that starts in ${parent} runs none of this checkout's hooks.`, env);
    return { status: "failed", file };
  }
}

// Whether a `--via-parent` call (the copy wired into the parent folder) should act: only when the host's project is
// that parent folder. In a turn whose project is the checkout the checkout's own wiring runs, so this copy does nothing
// and no hook runs twice. Without CLAUDE_PROJECT_DIR, only when the payload cwd is not inside the checkout: that fallback
// also skips a parent turn whose shell has moved into the checkout (the host normally sets CLAUDE_PROJECT_DIR).
export function parentWiringApplies({ own, found, env = process.env }) {
  if (!own) return false;
  const dir = typeof env.CLAUDE_PROJECT_DIR === "string" && env.CLAUDE_PROJECT_DIR ? env.CLAUDE_PROJECT_DIR : null;
  if (dir) return sameDir(path.dirname(own), dir);
  return !sameDir(found, own);
}
export const isConsumer = (root) =>
  has(root, ".claude/wow-core.version") || has(root, ".claude/wow-core.partial") || isWowCore(root);
const firstExisting = (root, rels) => rels.find((rel) => has(root, rel)) ?? null;

// ---- presence markers and the no-progress ledger: .claude/sessions/ (gitignored) ----

const sessionsDir = (root) => path.join(root, ".claude", "sessions");
const safeId = (sid) => (typeof sid === "string" && /^[A-Za-z0-9._-]{1,128}$/.test(sid) ? sid : null);
const markerPath = (root, sid) => path.join(sessionsDir(root), `${sid}.lock`);
const ledgerPath = (root, sid) => path.join(sessionsDir(root), `${sid}.noprogress.json`);

export function writeMarker(root, sid, cwd) {
  const id = safeId(sid);
  if (!id) return false;
  try {
    mkdirSync(sessionsDir(root), { recursive: true });
    writeFileSync(markerPath(root, id), JSON.stringify({ session_id: id, pid: process.pid, started_at: Math.floor(Date.now() / 1000), cwd }));
    return true;
  } catch { return false; }
}

export function removeSessionFiles(root, sid) {
  const id = safeId(sid);
  if (!id) return;
  for (const file of [markerPath(root, id), ledgerPath(root, id)]) {
    try { rmSync(file, { force: true }); } catch { /* ignore */ }
  }
}

// Liveness: any shell activity refreshes THIS session's marker mtime, so a long-running
// session stays detectable by a peer's guard (expiry in guardSharedTree).
export function touchMarker(root, sid) {
  const id = safeId(sid);
  if (!id) return;
  try {
    const file = markerPath(root, id);
    if (existsSync(file)) { const now = new Date(); utimesSync(file, now, now); }
  } catch { /* ignore */ }
}

// ---- shared-tree commit guard (port of the retired hooks/guard-shared-tree-commit.ps1) ----
// Two sessions sharing one tree clobbered a commit and swapped HEAD under each other
// (GLES-016). Isolating parallel writers in worktrees is the kept doctrine (DEC-092); this
// makes the one irreversible shared-state action fail loud instead of relying on memory.

// Every `git ... commit` the command may run, as { index, args } (index: where its command start is; args: the text from the blank
// after `git` up to the end of the command, `-C` flags included). A command start is the start of the text or of a line (after a
// \n, \r, U+2028 or U+2029), or a `;`, `&`, `|`, `(`, `)` or `{`, wherever it stands (inside a quote too: `sh -c "cd x && git commit"`).
// (`)` and `{` are new: `{ git commit; }` and `case x in a) git commit` are commits that the previous expression did not see.)
// From a start: blanks, optionally `env` or `command` and a blank, any number of `NAME=value` and a blank, then `git` or `git.exe`
// and a blank, and a `commit` word before the next `;`, `&`, `|` or line break. A value is a run of quoted parts, backslash escapes
// and plain characters (`A='x'y`, `N='O'\''Brien'`, `A=\<newline>"x"`); a plain character is not whitespace, a quote, a backslash or
// one of `; & | ( ) < >`. Every start is tried, also one inside the arguments of an earlier match (`git commit -m "$(git -C ../p commit)"`
// holds two commits; the previous expression, which went on after the arguments, saw one).
// This is a scan, not a regular expression, because every regular-expression form of it was quadratic on some shape (`A=\(` repeated,
// `A=\` plus a line break plus a blank, `(git x ` repeated: each start, of which there can be one per few characters, ran to the end of
// the run) and two rounds of tuning only traded one such shape for another (#365 review, rounds 1 and 2). Here each position's
// answer is computed once and kept: where a value ends (valueEnd), where the assignments from a position lead to a `git` (gitWordFrom),
// where a run of blanks ends (blanksEnd), and where the next command end and the next `commit` word are (found once, by one pass
// backwards), so a start costs a constant, a blank run or a word is read by one start only, and the whole scan is linear in the text
// whatever its shape (the matches are collected only up to MAX_COMMITS + 1, and probe() refuses past MAX_COMMITS of them before it reads any `-C`, so a run
// of `(git commit ` is refused, fast). The answers are those of the previous regular expression, except where it was wrong or
// unbounded, for the two added starts and for the matches inside arguments, which only add probes: a line break
// is never a blank (a break between `git` and its arguments ends the command), a U+2028 or U+2029 is a line start (a command may begin
// after one, as `^` read it) but does not end the arguments, since the shell does not break at it (`git -c user.name=a<U+2028>b commit`
// is a commit, and its `-C` and the directory are probed), and a U+2028 or U+2029 right after `git` is a blank, as the previous
// expression read it (PowerShell separates words there, so `git<U+2028>commit` is a commit); a U+0085 (NEL) is a blank, which the
// previous expression's \s left out (isBlank). Every start is
// tried, so a commit inside an earlier match's arguments is still found and its `-C` read. A value may hold any number of line continuations. A differential fuzz against ea479bd's expression (#365 round 3) found no
// probe directory dropped outside those shapes.
const isWs = (c) => (c >= 9 && c <= 13) || c === 32 || c === 160 || c === 5760 || (c >= 8192 && c <= 8202) || c === 8232 || c === 8233
  || c === 8239 || c === 8287 || c === 12288 || c === 65279; // exactly the characters of \s
const isLineBreak = (c) => c === 10 || c === 13 || c === 8232 || c === 8233;
// A blank is whitespace but a line break, plus U+0085 (NEL), which \s leaves out but PowerShell's parser separates words at
// (`git<NEL>commit` is `git commit` there; checked with [Parser]::ParseInput). NEL still does not end a value (partEnd reads \s):
// bash keeps it inside a word, so `A=x<NEL>y git commit` stays a commit. U+FEFF is in \s although PowerShell does not separate
// at it; reading it as a blank only adds probes.
const isBlank = (c) => (isWs(c) && !isLineBreak(c)) || c === 133;
const isCommandEnd = (c) => c === 59 || c === 38 || c === 124 || c === 10 || c === 13; // ; & | LF and CR (not U+2028/9: the shell does not end a command there)
const isWordChar = (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || c === 95 || (c >= 97 && c <= 122);
const lower = (c) => c | 32; // for the letters tested below: only the letter and its other case map to the same value
const COMMIT_WORD = /\bcommit\b/gi;
export function findGitCommits(command) {
  const text = String(command ?? "");
  const n = text.length;
  if (!/commit/i.test(text)) return [];
  const code = (i) => text.charCodeAt(i);
  const word = (at, name) => { // `name` (lower case letters) at `at`, in either case
    for (let k = 0; k < name.length; k++) if (at + k >= n || lower(code(at + k)) !== name.charCodeAt(k)) return false;
    return true;
  };
  const memo = () => new Int32Array(n + 1).fill(-2);
  const blanksAt = memo(); // end of the run of blanks starting at i
  const blanksEnd = (i) => {
    if (blanksAt[i] !== -2) return blanksAt[i];
    let j = i;
    while (j < n && isBlank(code(j))) j++;
    return (blanksAt[i] = j);
  };
  // The end of the one value part at i (a quote that closes on its line, a backslash and the next character, a plain character), or -1.
  const partEnd = (i) => {
    const c = code(i);
    if (c === 34 || c === 39) {
      for (let j = i + 1; j < n; j++) {
        const d = code(j);
        if (d === c) return j + 1;
        if (d === 10 || d === 13) return -1;
      }
      return -1;
    }
    if (c === 92) return i + 1 < n ? i + 2 : -1;
    if (isWs(c) || c === 59 || c === 38 || c === 124 || c === 40 || c === 41 || c === 60 || c === 62) return -1;
    return i + 1;
  };
  const valueAt = memo(); // end of the value that starts at i
  const valueEnd = (start) => {
    const path = [];
    let i = start;
    let end;
    for (;;) {
      if (i >= n) { end = n; break; }
      if (valueAt[i] !== -2) { end = valueAt[i]; break; }
      const next = partEnd(i);
      if (next < 0) { end = i; valueAt[i] = i; break; }
      path.push(i);
      i = next;
    }
    for (const at of path) valueAt[at] = end;
    return end;
  };
  // Where the arguments begin if `git` or `git.exe` and a blank stand at i, else -1.
  const gitArgs = (i) => {
    if (!word(i, "git")) return -1;
    let j = i + 3;
    if (code(j) === 46 && word(j + 1, "exe")) j += 4;
    return j < n && (isBlank(code(j)) || code(j) === 8232 || code(j) === 8233) ? j : -1;
  };
  // Where the arguments of the git command reached from i begin, through any number of `NAME=value` and a blank, or -1.
  const gitFrom = memo();
  const gitWordFrom = (start) => {
    const path = [];
    let i = start;
    let found;
    for (;;) {
      if (i >= n) { found = -1; break; }
      if (gitFrom[i] !== -2) { found = gitFrom[i]; break; }
      path.push(i);
      const args = gitArgs(i);
      if (args >= 0) { found = args; break; }
      let j = i;
      const first = code(j);
      if (!((first >= 65 && first <= 90) || (first >= 97 && first <= 122) || first === 95)) { found = -1; break; }
      while (j < n && isWordChar(code(j))) j++;
      if (code(j) !== 61) { found = -1; break; }
      const after = valueEnd(j + 1);
      const next = blanksEnd(after);
      if (next === after) { found = -1; break; }
      i = next;
    }
    for (const at of path) gitFrom[at] = found;
    return found;
  };
  // The first character of the arguments' end and of the next `commit` word, at or after each position (n if none).
  let nextEnd = null;
  let nextCommit = null;
  const prepare = () => {
    nextEnd = new Int32Array(n + 2);
    nextCommit = new Int32Array(n + 2);
    const starts = new Uint8Array(n + 1);
    for (const found of text.matchAll(COMMIT_WORD)) starts[found.index] = 1;
    nextEnd[n] = nextEnd[n + 1] = nextCommit[n] = nextCommit[n + 1] = n;
    for (let i = n - 1; i >= 0; i--) {
      nextEnd[i] = isCommandEnd(code(i)) ? i : nextEnd[i + 1];
      nextCommit[i] = starts[i] ? i : nextCommit[i + 1];
    }
  };
  const found = [];
  const attempt = (at, index) => { // a command start (at `index`) whose words begin at `at`
    let i = blanksEnd(at);
    if (word(i, "env") ? isBlank(code(i + 3)) : word(i, "command") && isBlank(code(i + 7))) {
      i = blanksEnd(i + (word(i, "env") ? 3 : 7));
    }
    const args = gitWordFrom(i);
    if (args < 0) return false;
    if (!nextEnd) prepare();
    const end = nextEnd[args];
    if (nextCommit[args + 1] >= end) return false;
    found.push({ index, args: text.slice(args, end) });
    return true;
  };
  for (let i = 0; i < n && found.length <= MAX_COMMITS; i++) { // past MAX_COMMITS the caller refuses, so the rest is not collected
    const c = code(i);
    if (i === 0 || isLineBreak(code(i - 1))) { if (attempt(i, i)) continue; }
    if (c === 59 || c === 38 || c === 124 || c === 40 || c === 41 || c === 123) attempt(i + 1, i);
  }
  return found;
}

// Every literal `cd <target>` or `pushd <target>` in `text`, wherever it appears (a heredoc line, a quote, a group, `eval`,
// `sh -c`, `builtin cd`, `\cd` all count): an extra candidate directory can only add a block, never remove one. Targets the
// hook cannot resolve (`cd` with no argument, `cd -`, `~`, `$`, a backtick, a glob) are skipped; the payload cwd is always a
// candidate anyway. A backslash is read as written, as bash does inside quotes and PowerShell everywhere: a Windows path
// (`cd "C:\repo" && git commit`, Git Bash or PowerShell) is followed. Until 2026-11 such a target was skipped, so on Windows
// the commit was checked against the cwd only (the Windows CI run of 18 Nov 2026); an unquoted bash `\x` escape is not undone,
// and the literal reading runs as an extra pass, so it only adds candidates (see the end of probe).
// Two readings, probed as two separate runs and the directories of both kept (one command runs in one shell, so the readings never
// mix, and the union holds every directory the shell reading alone gives): the shell's, unchanged since #365 (blanks are a space or a
// tab; a target ends at any \s character, so a U+0085 (NEL) stays inside it as in bash, while an NBSP ends it, which bash does not),
// and PowerShell's, where every whitespace but CR and LF separates words, NEL too, and its location
// commands are read in any case (`cd<NBSP>../p; git commit`, `Set-Location ../p`; checked with [Parser]::ParseInput on 7.7.0).
// The PowerShell run happens only when the text holds something the two readings treat differently: any whitespace but a space,
// a tab, CR and LF, a NEL, or a location word only PowerShell has (`chdir`, `sl`, `Set-Location`, `Push-Location`, or `cd`/`pushd`
// not in lower case); without one both runs find the same cds and moves.
const CD_TARGET = /(?<![\w./-])(?:cd|pushd)[ \t]+(?:-[A-Za-z]+[ \t]+)*(?:--[ \t]+)?(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^\s;&|()<>"'`]+))/g;
const CD_TARGET_PS = /(?<![\w./-])(?:cd|pushd|chdir|sl|Set-Location|Push-Location)(?:[^\S\r\n]|\x85)+(?:-[A-Za-z]+(?:[^\S\r\n]|\x85)+)*(?:--(?:[^\S\r\n]|\x85)+)?(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^\s\x85;&|()<>"'`]+))/gi;
// A `-C <dir>` in a commit's flags, read the same two ways.
const MOVE_FLAG = /(?:^|\s)-C(?:\s+|=)(?:"([^"]+)"|'([^']+)'|(\S+))/g;
const MOVE_FLAG_PS = /(?:^|[\s\x85])-C(?:[\s\x85]+|=)(?:"([^"]+)"|'([^']+)'|([^\s\x85]+))/g;
const readingsDiffer = (text) => /[^\S \t\r\n]|\x85/.test(text)
  || /(?<![\w./-])(?:chdir|sl|Set-Location|Push-Location)(?![\w-])/i.test(text)
  || [...text.matchAll(/(?<![\w./-])(?:cd|pushd)(?![\w-])/gi)].some((found) => found[0] !== found[0].toLowerCase());
const SKIP = /[$*?[]/; // cd targets the hook cannot resolve: a variable or a glob
const SKIP_WITH_BACKSLASH = /[$\\*?[]/; // the same, plus any backslash (the reading before 2026-11, kept as its own run)
const EXACT_CANDIDATES = 512; // every combination of succeeding and failing cds, up to this many directories (as before)
const MAX_DIRS = 8192; // directories one command may ask the guard to look up; past it the guard refuses (fail closed)
const MAX_COMMITS = 100; // more git commits than this in one command: refused (fail closed), never probed partially
const MAX_CDS = 200; // more literal cd/pushd targets before the last commit than this: refused (fail closed)
const MAX_MOVES = 16; // more `-C` flags than this on one commit: refused (fail closed)
const RESOLVE_BUDGET = 300_000; // path resolutions per command (about 0.2 s); past it the guard refuses (fail closed)
const MAX_PATH = 4096; // a candidate directory longer than this (Linux PATH_MAX) cannot be opened: refused (fail closed)
export const GUARD_DEADLINE_MS = 2000; // wall-clock time the whole guard may take; past it the guard refuses (fail closed)
// Thrown when the guard runs out of time or meets a path past MAX_PATH; guardSharedTree turns it into a refusal.
class GuardOverrun extends Error {}
const deadlineCheck = (deadline) => () => { if (performance.now() > deadline) throw new GuardOverrun("deadline"); };

// The directories one `git ... commit` may target: the payload cwd, plus every literal cd or pushd target that appears
// before this commit, and then `git -C <path>` of this commit applied to each (a -C moves the probe for that commit, as it
// always has: so `git -C ../wt commit` from a busy primary probes the worktree only). The cwd is never dropped for a cd.
// Each cd target is resolved against the cwd and against the earlier candidates: every combination of cds that succeed
// or fail, while that stays within EXACT_CANDIDATES. Past that the exact set is kept and the rest is followed as chains:
// every run of consecutive cds that all succeed, starting from the cwd at any cd (so a chain whose first cds fail is
// followed; a cd that fails in the middle of a long chain is the one shape not followed). A -C is applied to EVERY candidate, existing or not (the directory may
// be created in the same command: `mkdir out && cd out && git -C .. commit`), which can over-block a cd that fails.
// The work is bounded whatever the input: a hook that runs out of time is non-blocking in Claude Code, so a slow probe
// would switch off every hard stop. Returns { dirs, overflow }: overflow is true (and dirs null) past MAX_COMMITS commits,
// MAX_CDS cds before the last commit, MAX_MOVES -C flags on one commit, MAX_DIRS directories or RESOLVE_BUDGET path
// resolutions: the guard refuses rather than probe part of it. Path cost grows with length, so a count alone does not bound
// the time: `check` throws GuardOverrun past the guard's deadline, and so does a candidate longer than MAX_PATH.
function probe(command, cwd, check = () => {}) {
  const text = String(command ?? "");
  const matches = findGitCommits(text);
  if (!matches.length) return { dirs: null, overflow: false };
  const OVER = { dirs: null, overflow: true };
  if (matches.length > MAX_COMMITS) return OVER;
  const lastCommit = matches[matches.length - 1].index;
  let budget = RESOLVE_BUDGET;
  const resolve = (from, target) => {
    budget -= 1;
    if ((budget & 63) === 0) check();
    const dir = path.isAbsolute(target) ? path.resolve(target) : path.resolve(from, target);
    if (dir.length > MAX_PATH) throw new GuardOverrun("path");
    return dir;
  };
  const start = path.resolve(cwd);
  const dirs = new Set();
  // One reading: its cds and its -C moves, every combination within EXACT_CANDIDATES, then the chains. False past a limit.
  const run = (cdPattern, movePattern, unresolvable) => {
    const cds = [];
    for (const found of text.matchAll(cdPattern)) {
      if (found.index >= lastCommit) break;
      const target = found[1] ?? found[2] ?? found[3];
      if (!target || target === "-" || target.startsWith("~") || unresolvable.test(target)) continue;
      cds.push({ at: found.index, target });
    }
    if (cds.length > MAX_CDS) return false;
    const all = new Set([start]);
    let exact = true; // still every combination; false once only the chains are followed
    let heads = new Set(); // where each run of consecutive succeeding cds ending at the latest cd has reached
    let next = 0;
    for (const match of matches) {
      while (next < cds.length && cds[next].at < match.index) {
        const { target } = cds[next++];
        const moved = new Set([resolve(start, target)]);
        for (const from of heads) moved.add(resolve(from, target));
        heads = moved;
        if (exact) {
          const added = [...all].map((from) => resolve(from, target));
          const grown = new Set([...all, ...moved, ...added]);
          if (grown.size <= EXACT_CANDIDATES) { for (const dir of grown) all.add(dir); continue; }
          exact = false; // keep the exact set built so far; from here on only the chains are added
        }
        for (const dir of heads) all.add(dir);
        if (all.size > MAX_DIRS || budget < 0) return false;
      }
      let flags = match.args;
      const at = flags.search(/commit/i);
      if (at >= 0) flags = flags.slice(0, at);
      const moves = [...flags.matchAll(movePattern)].map((found) => found[1] ?? found[2] ?? found[3]);
      if (moves.length > MAX_MOVES) return false;
      let here = [...all];
      for (const target of moves) here = [...new Set(here.map((dir) => resolve(dir, target)))];
      for (const dir of here) dirs.add(dir);
      if (dirs.size > MAX_DIRS || budget < 0) return false;
    }
    return true;
  };
  // Each reading runs once skipping backslash targets (the pre-2026-11 set, unchanged) and, when the text holds a backslash,
  // once more following them: a followed target counts toward EXACT_CANDIDATES and could otherwise push a directory the
  // first run finds out of the exact set (review of the Windows fix, 2026-11-21). The union is a superset of the old set.
  const backslash = text.includes("\\");
  if (!run(CD_TARGET, MOVE_FLAG, SKIP_WITH_BACKSLASH)) return OVER;
  if (backslash && !run(CD_TARGET, MOVE_FLAG, SKIP)) return OVER;
  if (readingsDiffer(text)) {
    if (!run(CD_TARGET_PS, MOVE_FLAG_PS, SKIP_WITH_BACKSLASH)) return OVER;
    if (backslash && !run(CD_TARGET_PS, MOVE_FLAG_PS, SKIP)) return OVER;
  }
  return { dirs: [...dirs], overflow: false };
}

// The directories the command's `git ... commit` commands may target (every commit in the command is probed), or null
// when the command has no git commit. Not followed: `cd` with no argument, `cd -`, `~`, `$`, backtick and glob targets
// (the payload cwd stays a candidate), `--git-dir` and GIT_DIR. Past a limit the guard refuses (guardSharedTree); this
// function then returns null.
export function commitProbeDirs(command, cwd) {
  try { return probe(command, cwd).dirs; } catch (error) { if (error instanceof GuardOverrun) return null; throw error; }
}

// findRoot for many directories at once: each directory walked up is remembered, so the lookups cost at most one
// existence check per distinct directory (MAX_DIRS candidates share most of their ancestors).
function rootFinder(env, check = () => {}) {
  const known = new Map();
  const ceilings = String(env.GIT_CEILING_DIRECTORIES || "").split(path.delimiter).filter(Boolean).map(normDir);
  return (start) => {
    const walked = [];
    let dir = path.resolve(start);
    let root = null;
    for (;;) {
      if (known.has(dir)) { root = known.get(dir); break; }
      walked.push(dir);
      check();
      if (existsSync(path.join(dir, ".git"))) { root = dir; break; }
      const parent = path.dirname(dir);
      if (parent === dir || ceilings.includes(normDir(parent))) break;
      dir = parent;
    }
    for (const seen of walked) known.set(seen, root);
    return root;
  };
}

// The first PRIMARY checkout among `dirs` that another live session shares, as { root, peers, ttlHours }, plus warnings.
function peersIn(dirs, sid, env, now, warnings, rootOf = rootFinder(env)) {
  let ttlHours = 4;
  const configured = env.WOW_SESSION_MARKER_TTL_HOURS;
  if (configured !== undefined && String(configured).trim() !== "") {
    const value = Number(configured);
    if (Number.isFinite(value) && value > 0) ttlHours = value;
    else warnings.push(`WARNING (multi-session safeguard): invalid WOW_SESSION_MARKER_TTL_HOURS='${configured}'; using default 4 h.`);
  }
  const mine = safeId(sid);
  for (const root of [...new Set(dirs.map(rootOf).filter(Boolean))]) {
    if (isLinkedWorktree(root)) continue; // a worktree: the safe path
    const dir = sessionsDir(root);
    if (!existsSync(dir)) continue;
    touchMarker(root, sid);
    const peers = [];
    let names = [];
    try { names = readdirSync(dir).filter((name) => name.endsWith(".lock")).sort(); } catch { continue; }
    for (const name of names) {
      const id = name.slice(0, -".lock".length);
      if (id === mine) continue;
      let ageHours;
      try { ageHours = (now - statSync(path.join(dir, name)).mtimeMs) / 3_600_000; } catch { continue; }
      if (ageHours >= ttlHours) {
        warnings.push(`WARNING (multi-session safeguard): stale marker '${name}' in '${root}' is older than the ${ttlHours} h TTL; ignoring it and allowing the commit.`);
        continue;
      }
      peers.push(id);
    }
    if (peers.length) return { root, peers, ttlHours };
  }
  return null;
}

// `cwd` is the payload cwd, which every `cd` and `-C` target resolves against; `workDir` is where the hook's checkout
// is (the checkout in a parent-folder turn). The commit is probed at the payload-cwd candidates first; only when none
// of them is inside a repository (a plain `git commit` in a parent folder) are the candidates computed again from workDir.
// Either probe past a limit refuses: a null set never reaches peersIn. Any overrun or exception refuses too: a hook that
// throws or runs out of time is non-blocking, so the guard fails closed itself rather than switch the hard stops off.
const OVERFLOW_REASON = `BLOCKED (multi-session safeguard): the command has more git commit commands, cd commands, -C flags or directories than the guard checks one by one (${MAX_COMMITS} commits, ${MAX_CDS} cds, ${MAX_MOVES} -C flags, ${MAX_DIRS} directories), so it refuses rather than guess (GLES-016). Split it into smaller commands.`;
export function guardSharedTree({ command, sid, cwd, workDir = cwd, env = process.env, now = Date.now(), deadlineMs = GUARD_DEADLINE_MS }) {
  const result = { reason: null, warnings: [] };
  const check = deadlineCheck(performance.now() + deadlineMs);
  let found;
  try {
    const rootOf = rootFinder(env, check);
    let { dirs, overflow } = probe(command, cwd, check);
    if (!overflow && dirs && !dirs.some(rootOf) && path.resolve(workDir) !== path.resolve(cwd)) ({ dirs, overflow } = probe(command, workDir, check));
    if (overflow) { result.reason = OVERFLOW_REASON; return result; }
    if (!dirs) return result;
    found = peersIn(dirs, sid, env, now, result.warnings, rootOf);
  } catch (error) {
    result.reason = error instanceof GuardOverrun
      ? `BLOCKED (multi-session safeguard): the command's cd and -C paths take longer than ${deadlineMs} ms or run longer than ${MAX_PATH} characters, so the guard refuses rather than guess (GLES-016). Split it into smaller commands with shorter paths.`
      : `BLOCKED (multi-session safeguard): the guard failed (${String(error?.message ?? error).slice(0, 200)}), so it refuses rather than let the commit through unchecked (GLES-016). Report this; commit from a worktree meanwhile.`;
    return result;
  }
  if (found) {
    result.reason = `BLOCKED (multi-session safeguard): another agent session is active in this PRIMARY checkout (${found.root}). Peer session(s): ${found.peers.join(", ")}. Two sessions sharing one tree clobber each other's commits and swap HEAD (GLES-016). Isolate: create a worktree (git worktree add ../<name> -b <branch>), then run cd <worktree> as its own command (the Bash tool keeps that directory) or use git -C <worktree> commit; a cd inside the same command still probes this checkout. Stale markers are ignored after ${found.ttlHours} h (WOW_SESSION_MARKER_TTL_HOURS).`;
  }
  return result;
}

// ---- bus repository attach (plan 2026-10-27 §4g item 3, 2026-10-29) ----
// A cloud session starts with only its own repository attached, so bus.mjs gets HTTP 403, and the
// auto-mode classifier refuses add_repo as a self-granted permission. The fleet environment has no
// per-environment repository setting, so this rule allows that one attach and nothing wider. It
// narrows what an honest session attaches; it is code in the repository, so it does not stop a
// session that edits its own hooks or settings (the classifier and review stay that control).

export const ADD_REPO_TOOL = "mcp__claude-code-remote__add_repo";
// The same pattern as bus.mjs REPO_NAME, so every bus repository bus.mjs accepts can match.
const REPO_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const NAME_PART = /^[A-Za-z0-9_.-]+$/;

// The environment only: add_repo is a cloud tool and the fleet environment sets WOW_BUS_REPO. Files
// (the project's .claude/bus.json, the user bus config) are writable by the session, never trusted.
export function trustedBusRepo(env = process.env) {
  const repo = env.WOW_BUS_REPO;
  return typeof repo === "string" && REPO_NAME.test(repo) ? repo : null;
}

// The one repository the call names, as lower-case owner/name, or null. Exact shapes only:
// {owner, repo} or {repo: "owner/name"}, every value a string. Any other key or value gives null, so
// the hook never allows a call it did not fully compare (the tool's real fields are unverified).
export function addRepoTarget(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const keys = Object.keys(input);
  if (!keys.includes("repo") || !keys.every((key) => key === "owner" || key === "repo")) return null;
  const owner = Object.hasOwn(input, "owner") ? input.owner : undefined;
  const repo = input.repo;
  if (typeof repo !== "string") return null;
  if (owner === undefined) return REPO_NAME.test(repo) ? repo.toLowerCase() : null;
  if (typeof owner !== "string" || !NAME_PART.test(owner) || !NAME_PART.test(repo)) return null;
  return `${owner}/${repo}`.toLowerCase();
}

export function busAttachDecision(input, env = process.env) {
  const bus = trustedBusRepo(env);
  const target = addRepoTarget(input);
  if (!bus || !target || target !== bus.toLowerCase()) return null;
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow",
    permissionDecisionReason: `wow-core: attaching the bus repository ${bus} (WOW_BUS_REPO) is allowed` } };
}

// ---- wow-core read-only attach (evidence 2026-11-06) ----
// A master opened without wow-core attached cannot take its wow-core sync: four masters were opened that way on
// 2026-11-06 and one master's read-only add_repo of wow-core was refused by its auto-mode classifier. So this rule allows
// that one attach as well, and nothing wider: the call is exactly the own keys owner and repo, repo exactly "wow-core"
// and owner exactly (case-sensitive) the owner of WOW_BUS_REPO. No access key at all, so the host attaches read-only;
// a call with access ("read" or "push"), any other key, shape or spelling gets no decision and the host's normal flow
// runs. The owner comes from the environment, like the bus rule, never from a file the session can edit. It is not a
// constant because this file ships to comms consumers, which may be public, so it names no owner (the comms payload
// test forbids one); the fleet keeps wow-core under the bus repository's owner (docs/fleet-roster.md), and where that
// does not hold the rule simply never matches. Earlier denies still win: the old-account fence and the hard stops run
// before the add_repo branch.
export const WOW_CORE_REPO_NAME = "wow-core";

export function wowCoreAttachDecision(input, env = process.env) {
  const bus = trustedBusRepo(env);
  if (!bus || !input || typeof input !== "object" || Array.isArray(input)) return null;
  const keys = Object.keys(input);
  if (keys.length !== 2 || !keys.includes("owner") || !keys.includes("repo")) return null;
  const owner = bus.split("/")[0];
  if (input.owner !== owner || input.repo !== WOW_CORE_REPO_NAME) return null;
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow",
    permissionDecisionReason: `wow-core: attaching ${owner}/${WOW_CORE_REPO_NAME} read-only (no access key) is allowed: a master takes its wow-core sync from it (owner from WOW_BUS_REPO; COMMS_CORE §2)` } };
}

export function denyResponse(reason) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } };
}

// ---- session-start cap and depth (founder 2026-11-01; promotes a consumer PR) ----
// An unprompted create_session would let any session, or an injected prompt it reads, start
// sessions whose children could do the same: fan-out and spend with no ceiling. This rule is the
// only thing that approves the call (it is in no allow list, so a crash, a timeout or an older
// copy of this hook falls back to a prompt, never to an uncapped yes): inside a cap (per session,
// per container per UTC day, each start claiming its own slot file atomically) and a depth: a
// master (0) may start lanes (1), a lane reviewers (2), a reviewer nothing. A session's depth is
// the tag in its own first prompt, which this rule writes into every child it allows; no tag
// means 0 (a session nobody started through this rule). Anything it cannot read or claim is a
// deny. Known limits: a session that edits its own transcript, settings or slot files can evade
// it (code in the repository, like the bus rule above), and a scheduled task that starts a fresh
// session each time is not a create_session call.

// Raised from 10 and 25 by the founder on 2026-11-06 (docs/reviews/2026-11-05-security-rollback.md row E3): a master
// stopped at 10 lanes. Still a cap, the only guard against an injected prompt fanning out sessions on his budget.
export const SPAWN_LIMITS = Object.freeze({ perSession: 25, perContainerDay: 60, maxDepth: 2 });
export const ARCHIVE_TAGS = Object.freeze(["wow-task"]);
const DEPTH_TAG = /\[wow-spawn-depth: (\d+)\]/g;
const HEAD_BYTES = 256 * 1024;
// Only the Claude Code remote server's tool (also under a plugin prefix); another server's tool of that name keeps the normal prompt.
export const isCreateSession = (name) => typeof name === "string" && /^mcp__(?:.+_)?claude-code-remote__create_session$/.test(name);

// The first real user turn's text from a Claude Code transcript (JSONL), read from the head only.
// Meta and compaction entries and tool results are not the first prompt; none found throws.
export function firstPromptText(transcriptPath) {
  const fd = openSync(transcriptPath, "r");
  let head;
  try {
    const buffer = Buffer.alloc(HEAD_BYTES);
    head = buffer.subarray(0, readSync(fd, buffer, 0, HEAD_BYTES, 0)).toString("utf8");
  } finally { closeSync(fd); }
  for (const line of head.split("\n")) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry?.type !== "user" || !entry.message || entry.isMeta || entry.isCompactSummary) continue;
    const content = entry.message.content;
    if (typeof content === "string" && content.trim()) return content;
    if (Array.isArray(content)) {
      const parts = content.filter((part) => part?.type === "text" && part.text).map((part) => part.text);
      if (parts.length) return parts.join("\n");
    }
  }
  throw new Error("no first user prompt in the transcript head");
}

// A user entry's text: a string, or the text parts of a content array (tool results and other parts are not text).
function userText(entry) {
  const content = entry?.message?.content;
  if (typeof content === "string") return content.trim() ? content : "";
  if (Array.isArray(content)) return content.filter((part) => part?.type === "text" && part.text).map((part) => part.text).join("\n");
  return "";
}

// The spawn depth of the session that owns this transcript. Normally the depth tag in its first real prompt. A cloud
// session resumed after a compaction can get a rebuilt transcript (2026-11-18, a project master: 21 MB, a compaction
// summary at line 7, the first prompt gone, the next real user turn at byte 584,834). For that case the session-start
// hook re-states the depth on every resume and compaction as its own line (sessionDepthLine), but only when the depth
// came from the first prompt or from an earlier such line, never from the fallback below; the transcript keeps it as a
// SessionStart attachment after the summary. In a rebuilt transcript the depth is the highest of those hook lines and
// of real user turns that end in the tag in the form the spawn hook appends. Only when no hook line is there (a
// transcript rebuilt before this change) do tags anywhere in a compaction summary count too, and 0 when there are none.
// That fallback can lose a lane's or reviewer's tag when the summary dropped it, which lets such a session start
// children one or two levels too deep; the per-session and per-container caps still hold. A tag quoted mid-text in a
// later turn is ignored, so it cannot lock a master out. The whole file is read in 1 MB chunks, a long line kept as
// pieces until its end (linear, not re-scanned per chunk). A line over LINE_MAX_CHARS is skipped; one skipped before the
// first real prompt could have been that prompt, so the read then fails closed. A transcript with neither a real
// prompt, a summary nor a hook line throws, and so does one over TRANSCRIPT_MAX_BYTES, even with a hook line (fail closed).
const TRANSCRIPT_MAX_BYTES = 512 * 1024 * 1024;
const LINE_MAX_CHARS = 32 * 1024 * 1024;
const TURN_END_TAG = /\n\n\[wow-spawn-depth: (\d+)\]\s*$/;
const HOOK_LINE_PREFIX = "wow-core: this session's spawn depth, kept for a rebuilt transcript";
// The whole text of the hook's own resume output, nothing else: another SessionStart hook's output (an inbox relaying a
// message body) could end in the same words and lower the depth (a project review of ebd2fa8, 2026-11-18).
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const HOOK_LINE_TAG = new RegExp(`^\\s*${escapeRegExp(RESUME_LINE)} ${escapeRegExp(HOOK_LINE_PREFIX)} \\[wow-spawn-depth: (\\d+)\\]\\s*$`);
export const sessionDepthLine = (depth) => `${HOOK_LINE_PREFIX} [wow-spawn-depth: ${depth}]`;
function hookLineDepth(entry) {
  const a = entry?.attachment;
  if (entry?.type !== "attachment" || a?.type !== "hook_additional_context" || a.hookEvent !== "SessionStart") return null;
  const texts = Array.isArray(a.content) ? a.content : [a.content];
  const tags = texts.map((t) => (typeof t === "string" ? t.match(HOOK_LINE_TAG) : null)).filter(Boolean).map((m) => Number(m[1]));
  return tags.length ? Math.max(...tags) : null;
}
// { depth, source }: source is "prompt" (the first real prompt), "hook" (a hook line) or "fallback" (summary tags).
export function readSpawnDepth(transcriptPath) {
  const fd = openSync(transcriptPath, "r");
  let rebuilt = false;
  let hook = null; // highest hook line
  let turns = 0; // highest end-of-turn tag in a real user turn after the summary
  let summaries = 0; // highest tag anywhere in a summary (fallback only)
  let skippedEarly = false; // a line was skipped before the first real prompt or summary
  let capped = false;
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    const decoder = new StringDecoder("utf8"); // a character split across two chunks stays whole
    let pieces = []; // the unfinished line, in pieces
    let pieceChars = 0;
    let skipping = false; // inside a line longer than LINE_MAX_CHARS
    let offset = 0;
    for (;;) {
      const want = Math.min(buffer.length, TRANSCRIPT_MAX_BYTES - offset);
      const n = want > 0 ? readSync(fd, buffer, 0, want, offset) : 0;
      if (want <= 0) capped = readSync(fd, Buffer.alloc(1), 0, 1, offset) > 0;
      offset += n;
      const text = n ? decoder.write(buffer.subarray(0, n)) : decoder.end();
      const cut = n ? text.lastIndexOf("\n") : text.length; // at the end, the rest is a whole line
      if (cut < 0) {
        if (!skipping) {
          pieces.push(text);
          pieceChars += text.length;
          if (pieceChars > LINE_MAX_CHARS) {
            pieces = []; pieceChars = 0; skipping = true;
            if (!rebuilt) skippedEarly = true;
          }
        }
        continue;
      }
      const lines = (pieces.join("") + text.slice(0, cut)).split("\n");
      const rest = n ? text.slice(cut + 1) : "";
      pieces = rest ? [rest] : []; pieceChars = rest.length;
      if (skipping) { lines.shift(); skipping = false; } // the tail of the skipped line
      for (const line of lines) {
        if (!line.trim()) continue;
        let entry;
        try { entry = JSON.parse(line); } catch { continue; }
        const fromHook = hookLineDepth(entry);
        if (fromHook !== null) { hook = Math.max(hook ?? 0, fromHook); continue; }
        if (entry?.type !== "user" || !entry.message || entry.isMeta) continue;
        if (entry.isCompactSummary) {
          if (skippedEarly && !rebuilt) throw new Error("a line too long to read comes before the first prompt");
          rebuilt = true; summaries = Math.max(summaries, depthOf(userText(entry))); continue;
        }
        const prompt = userText(entry);
        if (!prompt) continue;
        if (!rebuilt) {
          if (skippedEarly) throw new Error("a line too long to read comes before the first prompt");
          return { depth: depthOf(prompt), source: "prompt" };
        }
        const tag = prompt.match(TURN_END_TAG);
        if (tag) turns = Math.max(turns, Number(tag[1]));
      }
      if (!n) break;
    }
  } finally { closeSync(fd); }
  if (capped) throw new Error(`the transcript is over ${TRANSCRIPT_MAX_BYTES} bytes`);
  if (hook !== null) return { depth: Math.max(hook, turns), source: "hook" };
  if (!rebuilt) throw new Error(skippedEarly ? "a line too long to read comes before the first prompt" : "no first user prompt in the transcript");
  return { depth: Math.max(turns, summaries), source: "fallback" };
}
export const spawnDepth = (transcriptPath) => readSpawnDepth(transcriptPath).depth;

export function depthOf(promptText) {
  const tags = [...String(promptText ?? "").matchAll(DEPTH_TAG)].map((m) => Number(m[1]));
  return tags.length ? Math.max(...tags) : 0;
}

// owner/name, lower case, from any GitHub URL spelling; null when it is not one. Only a string,
// a GitHub owner (letters, digits, inner hyphens) and a repository name other than ".", "..", ".git"
// count: a name GitHub cannot hold would start a session without a checkout (#211 review).
export function githubRepo(url) {
  if (typeof url !== "string") return null;
  // A colon separates host and owner only in the scp form (git@github.com:owner/repo): elsewhere
  // it is a port, so github.com:443/a/b must not read as owner 443 (review 2026-11-02).
  const m = url.trim().toLowerCase()
    .match(/^(?:(?:https?:\/\/|ssh:\/\/git@)?(?:www\.)?github\.com\/|git@github\.com:)([a-z0-9](?:-?[a-z0-9])*)\/([a-z0-9_.-]+?)(?:\.git)?(?:[/?#].*)?$/);
  return m && ![".", "..", ".git"].includes(m[2]) ? `${m[1]}/${m[2]}` : null;
}

// The repositories of the roster's Active masters table (its second column, one `owner/name` each), lower-case.
export function rosterRepos(text) {
  const section = String(text ?? "").split(/^## /m).slice(1).find((part) => part.startsWith("Active masters")) ?? "";
  return new Set([...section.matchAll(/^\|[^|]*\|\s*`([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)`/gm)].map((m) => m[1].toLowerCase()));
}
// ... from the real wow-core project directory's working tree (the spawn rule only refuses with it).
const rosterReposAt = (wowCore) => rosterRepos(readFileSync(path.join(wowCore, "docs", "fleet-roster.md"), "utf8"));

// The per-session state directory of the spawn cap and the mail guard (outside every checkout, so no repository's files
// can reset it; WOW_SPAWN_DIR for tests).
const stateBase = (env = process.env) => env.WOW_SPAWN_DIR || path.join(os.homedir(), ".wow-core", "spawn");

// Claim the first free numbered slot in dir, atomically (O_EXCL); null when all limit are taken.
function claimSlot(dir, limit) {
  mkdirSync(dir, { recursive: true });
  for (let n = 0; n < limit; n++) {
    try { closeSync(openSync(path.join(dir, String(n)), "wx")); return path.join(dir, String(n)); }
    catch (error) { if (error?.code !== "EEXIST") throw error; }
  }
  return null;
}

function pruneOldDays(base, today) {
  try {
    for (const name of readdirSync(base)) {
      const day = name.match(/^container-.+-(\d{4}-\d{2}-\d{2})$/)?.[1];
      const old = day ? Date.parse(today) - Date.parse(day) > 2 * 86_400_000
        : name.startsWith("session-") && Date.now() - statSync(path.join(base, name)).mtimeMs > 7 * 86_400_000;
      if (old) rmSync(path.join(base, name), { recursive: true, force: true });
    }
  } catch { /* best effort */ }
}

// ---- child model ceiling (founder 2026-11-11, docs/reviews/2026-11-11-fleet-review.md change 5) ----
// 7 of 47 sub-orchestrators on 1fg ran on the top model (USD 1,117 of 2,905 list price): a start that
// names no model inherits its parent's, so a master on the top model passed it down. The routing table
// (core/MODEL_ROUTING.md) gives a child session the `sub-orchestrator` tier, and the registry
// (core/models.json; docs/models.json in a full consumer) owns the ids: this refuses a create_session
// whose model is not an anthropic id of a tier at or below it, unless the prompt carries one line
// `Top model: <reason>` outside a code fence (tier-2 final verification, and the Codex dispatcher's
// orchestration role, whose launch line carries the line itself). Models match by family, so an alias and
// a dated id both resolve. A comms consumer ships the hook without the registry: a fixed table stands in.
const TIER_RANK = Object.freeze({ mechanical: 0, fast: 1, strong: 2, frontier: 3 });
const FAMILIES = ["fable", "opus", "sonnet", "haiku"]; // top families first
const FALLBACK_FAMILY = Object.freeze({ mechanical: "haiku", fast: "sonnet", strong: "sonnet", frontier: "opus" });
// Line matchers are linear: a regex like `^Top model:[ \t]*.*\w.*$` backtracks quadratically over a long line with no word character.
const hasWord = (text) => /\w/.test(text);
const topModelLine = (prompt) => prompt.split("\n").some((line) => line.startsWith("Top model:") && hasWord(line.slice("Top model:".length)));
const frontierLaneLine = (prompt) => {
  for (const line of prompt.split("\n")) {
    if (!line.startsWith("Frontier lane:")) continue;
    const parts = /^[ \t]*(\S+)[ \t]+(\S[^\r\n]*)$/.exec(line.slice("Frontier lane:".length));
    if (parts && hasWord(parts[2])) return parts;
  }
  return null;
};
export function modelFamily(model) {
  const name = typeof model === "string" ? model.toLowerCase().replace(/\[1m\]/g, "") : "";
  return FAMILIES.find((family) => name.includes(family)) ?? null;
}
const hookDir = () => path.dirname(fileURLToPath(import.meta.url));
// Where the hook sits: wow-core (scripts/ beside core/), a full consumer (.claude/scripts/ beside docs/), or neither.
function registryFiles(here) {
  for (const [dir, models, routing, resolve] of [
    [path.join(here, "..", "core"), "models.json", "MODEL_ROUTING.md", "node scripts/models.mjs"],
    [path.join(here, "..", "..", "docs"), "models.json", "MODEL_ROUTING.md", "node .claude/scripts/models.mjs"]]) {
    if (existsSync(path.join(dir, models))) return { models: path.join(dir, models), routing: path.join(dir, routing), resolve };
  }
  return null;
}
// The routing table's tier for a child session; `strong` when the table is not beside this copy or has no such row.
export function childTierCeiling(routingPath) {
  const here = hookDir();
  for (const file of routingPath ? [routingPath] : [path.join(here, "..", "core", "MODEL_ROUTING.md"), path.join(here, "..", "..", "docs", "MODEL_ROUTING.md")]) {
    try {
      const row = readFileSync(file, "utf8").match(/^\|\s*sub-orchestrator\s*\|\s*(frontier|strong|fast|mechanical)\s*\|/m);
      if (row) return row[1];
    } catch { /* not here */ }
  }
  return "strong";
}
export function allowedModelFamilies(here = hookDir()) {
  const files = registryFiles(here);
  const ceiling = files ? childTierCeiling(files.routing) : "strong";
  let ids = null;
  if (files) {
    try {
      const tiers = JSON.parse(readFileSync(files.models, "utf8")).tiers ?? {};
      ids = Object.fromEntries(Object.keys(TIER_RANK).map((tier) => [tier, tiers[tier]?.anthropic?.id]));
    } catch { ids = null; }
  }
  const familyOf = (tier) => ids ? modelFamily(ids[tier]) : FALLBACK_FAMILY[tier];
  const tiers = Object.keys(TIER_RANK);
  const families = new Set(tiers.filter((tier) => TIER_RANK[tier] <= TIER_RANK[ceiling]).map(familyOf).filter(Boolean));
  // The families the registry names at all; the fallback table knows every family it can tell apart.
  const known = ids ? new Set(tiers.map(familyOf).filter(Boolean)) : new Set(FAMILIES);
  return { ceiling, families, known, frontier: familyOf("frontier") ?? null, source: ids ? "registry" : "fallback", resolve: files?.resolve ?? null, hasRouting: Boolean(files) };
}
// The top model (founder 2026-11-11): a family ranked above the registry's frontier family. Masters, the
// dispatcher and sub-orchestrators start on the frontier tier (MODEL_ROUTING); the top model is for a one-off
// piece of heavy thinking in a child with a `Top model: <reason>` line. Claude Code's SessionStart payload
// carries the session's own `model`, so a session started above the frontier tier gets one warning line, never a block.
export function aboveFrontierNote(model, here = hookDir()) {
  const family = modelFamily(model);
  const { frontier, resolve } = allowedModelFamilies(here);
  if (!family || !frontier || FAMILIES.indexOf(family) >= FAMILIES.indexOf(frontier)) return null;
  const pin = resolve ? ` (\`${resolve} resolve --role orchestration\`)` : "";
  return `MODEL NOTE: this session runs on the ${family} family, above the ${frontier} frontier tier. A master, dispatcher or sub-orchestrator starts on the frontier tier${pin}, not above it (MODEL_ROUTING, founder 2026-11-11): if that is your role, say so to the founder in your next report and keep working. A one-off heavy-thinking child started with a \`Top model: <reason>\` line needs no action.`;
}
// A consumer-owned frontier floor for named lanes (founder-ratified by the project, recorded in its overlay): the file
// `<project>/.claude/wow-core.local.json` is outside the sync manifest, so a sync never writes or prunes it (GLES-095), and
// declares {"frontierLanes": {"decision": "<id>", "founder": "<YYYY-MM-DD>"}}. With it, a create_session prompt with one
// line `Frontier lane: <decision id> <reason>` may start at the FRONTIER tier, never above it. Without the file, with a
// different id or without the line, nothing changes. `Top model:` is a separate rule and is untouched.
export const LOCAL_FILE = path.join(".claude", "wow-core.local.json");
export function frontierLanesDeclaration(projectDir) {
  if (!projectDir) return null;
  try {
    // readSettings, not readFileSync: a FIFO planted here would freeze the hook. A rejection lands in the catch below, the same
    // path as an unreadable file always took (no declaration).
    const declared = JSON.parse(readSettings(path.join(projectDir, LOCAL_FILE)))?.frontierLanes;
    const ok = declared && typeof declared.decision === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(declared.decision)
      && typeof declared.founder === "string" && /^\d{4}-\d{2}-\d{2}$/.test(declared.founder);
    return ok ? { decision: declared.decision, founder: declared.founder } : null;
  } catch { return null; }
}
export function modelCeilingDenial(input, here = hookDir(), { projectDir = null } = {}) {
  const { ceiling, families, known, frontier, resolve, hasRouting } = allowedModelFamilies(here);
  const model = typeof input.model === "string" ? input.model.trim() : "";
  const family = modelFamily(model);
  if (family && families.has(family)) return null;
  const prompt = String(input.prompt ?? "").replace(/```[\s\S]*?```/g, "");
  if (topModelLine(prompt)) return null;
  const declared = frontierLanesDeclaration(projectDir);
  const lane = frontierLaneLine(prompt);
  let laneNote = "";
  if (lane) {
    if (!declared) laneNote = ` The \`Frontier lane:\` line was ignored: this project declares no frontierLanes decision in ${LOCAL_FILE}.`;
    else if (lane[1] !== declared.decision) laneNote = ` The \`Frontier lane:\` line was ignored: its decision id ${lane[1]} is not the one ${LOCAL_FILE} declares.`;
    else if (family && known.has(family) && frontier && FAMILIES.indexOf(family) >= FAMILIES.indexOf(frontier)) return null;
    else laneNote = " A frontier lane runs at the frontier tier only, never above it.";
  } else if (declared) laneNote = ` This project declares frontier lanes (decision ${declared.decision}): a named lane may instead put one line \`Frontier lane: ${declared.decision} <reason>\` in the prompt and start at the frontier tier.`;
  const what = !model ? `this start names no model, so the child would inherit this session's, possibly the top one (a child gets the ${ceiling} tier)`
    : family && known.has(family) ? `model ${model} is above the ${ceiling} tier the routing table gives a child`
    : `model ${model} is not a model the registry knows`;
  const pin = resolve ? ` Pin \`model\` to the ${ceiling} tier (\`${resolve} resolve --role sub-orchestrator\`)` : ` Pin \`model\` to the ${ceiling} tier (${[...families].join(" or ")})`;
  return `wow-core: create_session ${what}${hasRouting ? " (MODEL_ROUTING, sub-orchestrator row)" : ""}.${pin}, or put one line \`Top model: <reason>\` in the prompt (tier-2 final verification and the Codex dispatcher's orchestration role only).${laneNote}`;
}

export function spawnDecision(payload, env = process.env, now = Date.now()) {
  try {
    const sid = safeId(payload?.session_id);
    const transcript = payload?.transcript_path;
    if (!sid || typeof transcript !== "string" || !transcript) throw new Error("no session id or transcript path in the hook payload");
    const depth = spawnDepth(transcript);
    const input = payload?.tool_input && typeof payload.tool_input === "object" ? payload.tool_input : {};
    // A depth-0 session whose host project directory is wow-core (the takeover or the wow-core
    // master) never starts a roster master: the founder does, in its own project, so it is not this
    // session's child in the app (founder 2026-11-02, takeover step 5). wow-core's own row is exempt by its
    // repository name: this file also ships to comms consumers, which may be public, so it names no owner.
    const projectDir = hostProjectDir(env);
    const target = githubRepo(input.source_url);
    if (depth === 0 && isWowCoreHost(projectDir) && target && target.split("/")[1] !== "wow-core"
      && rosterReposAt(projectDir).has(target)) {
      return denyResponse("wow-core: the founder starts a roster master in its own project from the takeover's launch line, so it does not sit under this session in the app (founder 2026-11-02). Give him the line (docs/fleet-roster.md) instead.");
    }
    // A child without a repository has no checkout, so no hooks: the cap and the depth limit
    // would stop at it (live probe 2026-11-01: a no-repo depth-2 session started a third level
    // unprompted). Only the wow-core master (depth 0, host project wow-core, this hook wow-core's own copy) may start one.
    // The exception covers an absent source_url only: one that is present but does not parse (a
    // port, user info, an API host) is refused, so it cannot slip a roster master past the refusal
    // above (review 2026-11-02).
    const master = depth === 0 && isWowCoreHost(projectDir);
    const noUrl = input.source_url === undefined || input.source_url === null || input.source_url === "";
    if (!target && !(master && noUrl)) {
      return denyResponse("wow-core: create_session needs a GitHub source_url: a session without a repository has no hooks, so the session cap and depth limit could not follow it (founder 2026-11-01). Use a subagent, or name the repository.");
    }
    const childDepth = depth + 1;
    if (childDepth > SPAWN_LIMITS.maxDepth) {
      return denyResponse(`wow-core: session depth ${depth} may not start sessions (master → lane → reviewer, no deeper; founder 2026-11-01). Use a subagent instead.`);
    }
    const modelDenial = modelCeilingDenial(input, undefined, { projectDir });
    if (modelDenial) return denyResponse(modelDenial);
    const badTitle = titleDenial(input.title);
    if (badTitle) return denyResponse(badTitle);
    const base = stateBase(env);
    const container = safeId(env.CLAUDE_CODE_CONTAINER_ID) || safeId(os.hostname()) || "local";
    const today = new Date(now).toISOString().slice(0, 10);
    pruneOldDays(base, today);
    const sessionSlot = claimSlot(path.join(base, `session-${sid}`), SPAWN_LIMITS.perSession);
    if (!sessionSlot) return denyResponse(`wow-core: this session has started ${SPAWN_LIMITS.perSession} sessions, the cap (founder 2026-11-01, raised 2026-11-06). Use a subagent.`);
    let daySlot;
    try { daySlot = claimSlot(path.join(base, `container-${container}-${today}`), SPAWN_LIMITS.perContainerDay); }
    catch (error) { rmSync(sessionSlot, { force: true }); throw error; }
    if (!daySlot) {
      rmSync(sessionSlot, { force: true });
      return denyResponse(`wow-core: this container has started ${SPAWN_LIMITS.perContainerDay} sessions today (UTC ${today}), the cap (founder 2026-11-01, raised 2026-11-06). Use a subagent, or wait for the next UTC day.`);
    }
    const prompt = String(input.prompt ?? "").replace(DEPTH_TAG, "").trimEnd();
    // The archive tag (founder 2026-11-02): every session started here is a task the starter
    // archives when it is done, and the sweep archives it if the starter does not. The caller
    // cannot choose.
    const tags = (Array.isArray(input.tags) ? input.tags : []).filter((t) => typeof t === "string" && !ARCHIVE_TAGS.includes(t));
    const updatedInput = { ...input, prompt: `${prompt}${prompt ? "\n\n" : ""}[wow-spawn-depth: ${childDepth}]`,
      tags: [...tags, "wow-task"] };
    return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow",
      permissionDecisionReason: `wow-core: session start ${Number(path.basename(sessionSlot)) + 1}/${SPAWN_LIMITS.perSession} for this session, ${Number(path.basename(daySlot)) + 1}/${SPAWN_LIMITS.perContainerDay} for this container today, child depth ${childDepth}`,
      updatedInput } };
  } catch (error) {
    return denyResponse(`wow-core: the session-start cap could not check this call (${error?.message ?? error}), so it is refused (fail closed). Use a subagent, or retry once the cause is fixed (COMMS_CORE §3).`);
  }
}

// ---- session titles (founder 2026-11-17, PACE_CORE §2a; enforced 2026-11-18) ----
// The founder scans the app's sidebar, which cuts an indented title at about 25 characters. One project's lanes were titled
// "<Project> Sub41: test stac…" for days after the rule landed (its sync predated it, and nothing checked), so he saw the
// project and a number, never the work. A create_session or set_session_title whose title fits none of the shapes below is
// refused with the rule; one exact standing title is kept because the sweep and the takeover find that session by it.
export const isSetSessionTitle = (name) => typeof name === "string" && /^mcp__(?:.+_)?claude-code-remote__set_session_title$/.test(name);
export const TITLE_MAX = 40;
const STANDING_TITLES = new Set(["Codex dispatcher"]);
const TITLE_RULE = 'A master is "<Project> master"; a lane is "#NNN - <1-2 words>" (three digits); a helper is "<prefix> - <Role> <what>", '
  + 'the prefix its lane\'s #NNN or, for the master\'s own helpers and services, the project name (Role: Build, Fix, Check, Review). '
  + 'Examples: "#041 - Test stack", "#104 - Check PR 2182 run 2", "Acme - Build nightly OOM" (PACE_CORE §2a).';
export function titleDenial(title) {
  const t = typeof title === "string" ? title.trim() : "";
  if (!t) return `wow-core: give the session a title, so the founder's sidebar says what it does. ${TITLE_RULE}`;
  // The sweep and the takeover find the dispatcher by its exact title, and the tool gets the title as sent: no padding, one line.
  if (t !== title || /[\u0000-\u001f\u007f]/.test(t)) return `wow-core: the title ${JSON.stringify(String(title).slice(0, 60))} has spaces at its ends or a line break or control character; send it trimmed, on one line. ${TITLE_RULE}`;
  if (STANDING_TITLES.has(t)) return null;
  if (t.length > TITLE_MAX) return `wow-core: the title "${t.slice(0, 60)}" is ${t.length} characters; keep it to ${TITLE_MAX} (the sidebar cuts an indented title at about 25). ${TITLE_RULE}`;
  // "Sub41", "Sub 41", "Sub-orchestrator 41": the number the founder could not read as work.
  if (/\bsub(?:-?orchestrator)?[ -]?\d/i.test(t)) return `wow-core: the title "${t}" names a lane by its sub number; write the lane as "#NNN - <what it does>". ${TITLE_RULE}`;
  if (/^\S+ master$/.test(t) || /^#\d{3} - \S/.test(t) || /^[A-Za-z][\w.-]* - \S/.test(t)) return null;
  return `wow-core: the title "${t}" does not follow the session-title rule. ${TITLE_RULE}`;
}

// ---- mail guard: mail and BWS_PROD_TOKEN never meet in one session (SECURITY_CORE §1a; review 2026-11-06 of #277, H2) ----
// claude.ai connectors are per account, not per environment, and the founder keeps his mail connected on every cloud account
// (2026-11-16), so a cloud session on `fleet` can hold mail tools next to BWS_PROD_TOKEN, the store token that opens the
// production platform tokens, and an injected email could make it send the token out over the open network. Each session
// records, in the spawn cap's state directory, `mail` when a mail connector tool is about to run and `prod` when a command
// that names the token is about to run; a call of either kind in a session that holds the other marker is refused.
// Races (review of #278, M1): a marker is NEVER removed. Each call (1) looks for the other side and is refused, creating
// nothing, when it is there; (2) creates its own marker (O_EXCL, as claimSlot; EEXIST is fine); (3) looks again and is
// refused, keeping its own marker, when the other appeared meanwhile. For a mail call and a token call to both pass, each
// would have to create its marker before the other's final look and look before the other created its marker, which is
// impossible; when two calls cross, both are refused and the session keeps both markers (it loses both sides, the safe one).
// A marker only narrows: a call that a later rule refuses keeps its marker.
// Sessions outlive containers (review of #278, H1): a cloud session resumed on a fresh container, or a forked session (a
// new session id), keeps its transcript, and the email's text with it, but not ~/.wow-core. So in Claude Code, step (1)
// also reads the session's transcript (transcript_path, with its subagents' transcripts) when the other marker is absent:
// an earlier tool_use of the other kind records that marker and refuses the call. A token command whose transcript is
// missing, unreadable or has no line that parses is refused (fail closed); a mail call then goes on as if none was found.
// A tool_use that this guard, the fence or a hard stop refused (its tool_use_id recorded as `refused-<id>`) ran nothing and
// is not counted; on a fresh container those records are gone, so such a call then counts (it only narrows). Codex payloads
// carry no Claude Code transcript (Codex environments hold neither the token nor mail): markers only.
// Fail closed for the token only: no usable session id, a state store it cannot read or write, or an unreadable transcript
// refuses the token command, and so does a hook that hits its deadline or an internal error on that call (run()); the mail
// tool then gets no decision, so a broken store never cuts a session off from mail it may need (a mail call let through by a
// deadline or an error still records its marker when it can, run()). The marker directories are never pruned: a pruned
// marker would reopen the pair (each is an empty file per session).
// A speed bump, not a boundary (docs/reviews/2026-11-05-security-rollback.md T5: hooks are speed bumps): only a command
// whose text names the variable counts (BWS_PROD as a prefix, any case, quotes, backslashes and backticks removed, so
// `${!x}` with x=BWS_PROD_TOKEN set in the same command is caught), and any mention counts as use (a grep, a commit message).
// After mail, a hand-off that names the token to another session and the listed environment-dump forms are refused too
// (handsTokenOn, environmentDump; review of #362, M1, M2). A command that reaches the variable some other way (a dump form
// not on that list, a script file, a name built in an earlier command), a hand-off that does not name it, or a dump before
// the first mail call is not caught, nor a session that deletes its own markers, edits its transcript or points
// WOW_SPAWN_DIR elsewhere; SECURITY_CORE §1a says so.

// The connectors whose every tool counts as mail, read and draft included (reading is the exposure: the content an
// injected email puts into the session). The server name is reduced as for the hard stops (mcpNameParts: lower case,
// without the claude_ai_ and plugin_<name>_ prefixes), hyphens and spaces read as underscores, and it counts when it
// starts with a mail connector's name followed by nothing or by a non-alphanumeric character, so every instance shape
// counts: Gmail, gmail_2, Gmail-1a2b3c4d, Gmail (2), Gmail_Personal, microsoft-365, microsoft365, Microsoft_365_hotmail,
// Microsoft_365_2-fe0a0ef2, Office_365, Outlook (review of #362, L1; each is a mail product's own name, so no other
// connector matches). Not covered: a mail tool served under another connector's name (a Google Workspace connector's
// Gmail tools, a bare `Microsoft` or `Microsoft_Outlook`, Hotmail). A name the list misses is not mail to this guard; SECURITY_CORE §1a still binds.
const MAIL_SERVER = /^(?:gmail|microsoft_?365|office_?365|outlook)(?![a-z0-9])/;
export function isMailTool(name) {
  const parts = mcpNameParts(name);
  return Boolean(parts) && MAIL_SERVER.test(parts.server.replace(/[-\s]/g, "_"));
}

const PROD_TOKEN = /BWS_PROD/i;
// Quotes, backticks and backslashes removed, so a name split by them reads whole (`$BWS_""PROD_TOKEN`, `os.env""iron`).
const unsplit = (text) => text.replace(/["'`\\]/g, "");
// A shell command's text, unsplit: Bash, PowerShell, Monitor, Codex's nameless shell payload, a string or an argv array.
// An MCP tool's `command` runs elsewhere, without this environment's variables, so it has none.
function rawShellText(toolName, input) {
  if (typeof toolName === "string" && toolName.startsWith("mcp__")) return null;
  const command = input?.command;
  return typeof command === "string" ? command
    : Array.isArray(command) ? command.filter((part) => typeof part === "string").join(" ") : null;
}
function shellText(toolName, input) {
  const text = rawShellText(toolName, input);
  return text === null ? null : unsplit(text);
}
export function usesProdToken(toolName, input) {
  const text = shellText(toolName, input);
  return text !== null && PROD_TOKEN.test(text);
}

// Two ways a mail session could hand the token on without naming it in its own shell (review of #362, M1, M2). Neither
// marks the session: each is only refused in a session that has used mail, so a session without mail sees no change.
// (M1) A tool that starts work in another session, whose environment holds the token, with an input that names it: the
// Claude Code remote tools that start or wake a session (any instance form, read as for mail) and SendMessage.
const HANDOFF_SERVER = /^claude_code_remote(?![a-z0-9])/;
const HANDOFF_TOOLS = new Set(["create_session", "send_message", "send_later", "create_trigger", "update_trigger", "fire_trigger"]);
export function handsTokenOn(toolName, input) {
  if (typeof toolName !== "string") return false;
  const parts = mcpNameParts(toolName);
  const handoff = parts ? HANDOFF_SERVER.test(parts.server.replace(/[-\s]/g, "_")) && HANDOFF_TOOLS.has(parts.tool)
    : toolName.toLowerCase() === "sendmessage";
  if (!handoff) return false;
  let text;
  try { text = JSON.stringify(input ?? null) ?? ""; } catch { return true; }
  return PROD_TOKEN.test(unsplit(text));
}
// (M2) A shell command that prints or passes on the whole environment (or runs bws, which loads secrets into one), read
// on the unsplit text. A single variable read by name (`$HOME`, process.env.HOME, os.environ['HOME'], $env:HOME) is not
// a dump. Only these forms are covered; any other way to dump the environment still gets past (SECURITY_CORE §1a, limit 4).
// The bare-command forms (env, set, export, declare) count only as a whole command segment: at the start, after a
// separator, or after a wrapper that runs its argument (sudo, xargs, `sh -c`), so `git commit -m "set the env"` is not one.
// SEG ends in `[ \t]*`, not `\s*`: a newline is itself a separator, so `\s*` would let every newline of a run of them
// rescan the rest of the run (quadratic: 200,000 newlines took 90 s on every Bash command). `-c` counts only after a
// shell that takes it (`bash -lc env`), so `wc -c env` is not a dump.
// A wrapper may take options without a value, and numbers, before its command (`sudo -E env`, `nice -n 5 env`, `timeout 5 env`);
// it never follows an option's value (`sudo -u root env`, `timeout -s KILL 5 env`). A shell may take up to six options (a letter, then letters, digits, `_` or `-`: `--no-config`), each
// with at most one `[A-Za-z]+` word (`bash --norc -c env`, `fish --no-config -c env`, `bash --init-file x -c env`, `bash -o pipefail -c env`, `su -l root -c env`), and the shell
// is followed only by options and `-c` (`su - root -c env`, `su root -c env`, `bash -c -- env` and `builtin set` are not covered).
// `then`, `do` and `else` are keywords, so they count only at a command start (after a line start or `; & | ( ) { }` and
// blanks): `echo then set > log` prints text. (The lookahead comes first so that the lookbehind, which reads back over the blanks, runs
// only at a keyword: tried at every position it was quadratic on a run of blanks.) A run of options or numbers is read by the one wrapper word before it and
// ends at the first word that is neither (a start inside the run is not a wrapper word), a shell's options at six, so no run is
// rescanned by another start.
// `command -v env` and `command -V env` only look the name up (`command` alone takes -p, -v and -V), so a `command` option
// word that holds a v or a V ends the chain; the other wrappers keep every option (`time -v env` runs env).
const SEG = String.raw`(?:^|[;&|(){}\n]|(?:^|\s)(?:sudo|exec|nohup|time|nice|xargs|watch|eval|timeout|busybox)(?:[ \t]+(?:-[\w-]+|\d+[smhd]?))*|(?=(?:then|do|else)\b)(?<=(?:^|[;&|(){}\n])[ \t]*)(?:then|do|else)\b|(?:^|\s)command(?:[ \t]+(?:-(?![\w-]*[vV])[\w-]+|\d+[smhd]?))*|(?:^|[\s/])(?:k?sh|mksh|bash|zsh|dash|fish|su)(?:\s+--?[A-Za-z][\w-]*(?:\s+[A-Za-z]+)?){0,6}\s+-[A-Za-z]*c)[ \t]*`;
// A redirect ends a command too (`set > /tmp/s`, `env 2>&1`, `declare -p > f`).
const SEG_END = String.raw`\s*(?=$|[;&|(){}\n<>]|\d+>)`;
const POWERSHELL_ENV_FORM = "env: (PowerShell)";
const ENV_DUMPS = [
  ["/proc/<pid>/environ", /\/proc\/(?:[^\s;&|/]+\/){1,3}environ\b/i],
  ["os.environ", /\bos\.environ\b(?!\s*\[\s*[A-Za-z_]|\.get\(\s*[A-Za-z_])/],
  ["os.getenv without a name", /\bos\.getenv\(\s*(?![A-Za-z_])/],
  ["process.env", /\bprocess\.env\b(?!\s*\??\.\s*[A-Za-z_$]|\s*\[\s*[A-Za-z_$])/],
  ["%ENV", /%ENV\b/],
  // Ruby: ENV.to_h, ENV.each and the like; a read by name (ENV["HOME"], ENV.fetch("HOME")) is not a dump.
  ["ENV (Ruby)", /\bENV(?:&?\.|::)(?!(?:fetch|dig|values_at|slice|assoc|delete|store)\b|(?:key|has_key|include|member)\?)[a-z_]/],
  // Ruby: the whole ENV handed to a printer or to Hash[] (`p ENV`, `pp(ENV)`, `puts ENV`, `p *ENV`, `puts(*ENV)`, `$stdout.puts ENV`,
  // `STDERR.print(ENV)`, `Hash[ENV]`), not ENV["HOME"] or ENV.fetch, nor `make print ENV=1`. The printer starts a word, or follows
  // `-e` and its cluster of up to six switch letters (`ruby -e'p ENV'` reads `-ep ENV` once the quotes are removed), or follows
  // `$stdout.`, `$stderr.`, `STDOUT.` or `STDERR.`. The `(` is an optional group, not `\(?` beside two blank runs: `p` plus 200,000
  // blanks took 18 s that way. Each part is bounded, so a start never scans further than a few characters before or after it.
  ["ENV (Ruby)", /(?:(?<![\w$@%.:-])|(?<=[ \t]-[A-Za-z]{0,6}e)|(?<![\w$@%])(?:\$std(?:out|err)|STD(?:OUT|ERR))\.)(?:pp?|puts|print)[ \t]*(?:\([ \t]*)?\*{0,2}ENV\b(?!\s*(?:\.|\[|::|&\.|=))|\bHash\s*\[\s*ENV\b(?!\s*(?:\.|\[|::|&\.))/],
  // awk: ENVIRON read as a whole (`for (k in ENVIRON)`); a read by name (ENVIRON["HOME"], quotes already removed) is not.
  ["ENVIRON (awk)", /\bENVIRON\b(?!\s*\[\s*[A-Za-z_])/],
  ["set", new RegExp(`${SEG}set${SEG_END}`)],
  ["printenv", /\bprintenv\b/],
  ["env", new RegExp(`${SEG}(?:(?:/[\\w.-]+)*/)?env(?:\\s+-[-\\w]*)*${SEG_END}`)],
  ["export", new RegExp(`${SEG}export(?:\\s+-p)?${SEG_END}`)],
  ["declare", new RegExp(`${SEG}(?:declare|typeset)(?:\\s+-[a-zA-Z]+)*${SEG_END}`)],
  // PowerShell: the env: drive listed (Get-ChildItem env:, gci env:, dir env:, ls env:) or a bare $env:, not text that
  // happens to contain `env:` (grep -n "env:" ci.yml, a YAML `env:` key).
  // The listing commands may take options first (`Get-ChildItem -Force Env:`, `-LiteralPath Env:`), and so may the commands
  // that move into the drive (`Set-Location Env:`, `sl`, `cd`, `Push-Location`, `pushd`), after which a bare `Get-ChildItem` lists it.
  // The blanks are any whitespace but CR and LF, plus U+0085 (NEL), which \s leaves out: PowerShell's parser separates words at every
  // \s character but U+FEFF, and at NEL (checked with [Parser]::ParseInput). A line break ends the command, so `- run: ls -la` and an
  // `env:` key on the next line is YAML.
  [POWERSHELL_ENV_FORM, /\$env:(?![A-Za-z_{])|(?<![\w$.-])(?:Get-ChildItem|Get-Item|gci|gi|dir|ls|Set-Location|sl|cd|chdir|Push-Location|pushd)(?:(?:[^\S\r\n]|\x85)+-[A-Za-z]+){0,6}(?:[^\S\r\n]|\x85)+env:(?![A-Za-z_])/i],
  ["GetEnvironmentVariables", /\bGetEnvironmentVariables\b/i],
];
// Forms read as a command and its later words within one segment (so `bws project list | grep run` is not one), each
// segment once from the command word on, which keeps the scan linear on a long command (no regex backtracking per word).
const SEGMENT_DUMPS = [
  ["compgen -e", /\bcompgen\b/, /\s-(?:[a-zA-Z]*e\b|A\s*(?:export|variable)\b)/],
  ["bws run", /\bbws\b/, /\srun\b/],
  ["bws --access-token", /\bbws\b/, /\s(?:--access-token|-t)\b/],
];
// The dump form a shell command matches, or null.
export function environmentDump(toolName, input) {
  const raw = rawShellText(toolName, input);
  if (raw === null) return null;
  const text = unsplit(raw);
  // A backtick before a line break continues a PowerShell line (`Get-ChildItem `<LF>Env:`), so for that pattern it is a blank, not a
  // removed quote character that leaves a line break behind (a YAML `- run: ls -la` and an `env:` key below it has no backtick).
  const continued = raw.includes("`") ? unsplit(raw.replace(/`(?:\r\n?|\n)/g, " ")) : text;
  for (const [form, pattern] of ENV_DUMPS) if (pattern.test(form === POWERSHELL_ENV_FORM ? continued : text)) return form;
  for (const segment of text.split(/[;&|\n]/)) {
    for (const [form, command, words] of SEGMENT_DUMPS) {
      const at = segment.search(command);
      if (at >= 0 && words.test(segment.slice(at))) return form;
    }
  }
  return null;
}

const NEVER_MEET = "mail and the production token never meet in one session, since an injected email could send the token out (SECURITY_CORE §1a)";
const TOKEN_INSTEAD = "Ask your master to make the change from a session that has never opened mail (a master starts a fresh session for it); never paste or print the token.";
export const MAIL_THEN_TOKEN = `wow-core: this session has used a mail tool (Gmail or Microsoft 365), so it may not run a command that names BWS_PROD_TOKEN (any mention counts, a grep or a commit message too): ${NEVER_MEET}. ${TOKEN_INSTEAD}`;
export const tokenThenMail = (toolName) => `wow-core: this session has run a command that uses BWS_PROD_TOKEN, so it may not use the mail connector tool ${toolName}: ${NEVER_MEET}. Ask your master to have the mail read from a session that has never used the token (a master starts a fresh session for it); never paste or print the token.`;
export const handoffAfterMail = (toolName) => `wow-core: this session has used a mail tool (Gmail or Microsoft 365), so it may not hand BWS_PROD_TOKEN to another session (${toolName} with an input that names it; any mention counts): ${NEVER_MEET}. ${TOKEN_INSTEAD} Leave the token's name out of what this session sends.`;
export const dumpAfterMail = (form) => `wow-core: this session has used a mail tool (Gmail or Microsoft 365), so it may not print or pass on the whole environment, which holds BWS_PROD_TOKEN (${form}): ${NEVER_MEET}. Read the one variable you need by name instead ($HOME, process.env.HOME, os.environ['HOME'], $env:HOME); for bws or the store, ask your master for a session that has never opened mail.`;
export const tokenFailClosed = (why) => `wow-core: the mail guard could not check this command that uses BWS_PROD_TOKEN (${why}), so it is refused (fail closed): ${NEVER_MEET}. ${TOKEN_INSTEAD}`;

// ENOENT is "no marker"; any other error is a store the guard cannot read, and throws.
function markerSet(file) {
  try { statSync(file); return true; }
  catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}
function createMarker(file) {
  try { closeSync(openSync(file, "wx")); }
  catch (error) { if (error?.code !== "EEXIST") throw error; }
}
const guardDir = (sid, env) => path.join(stateBase(env), `mailguard-${sid}`);
const isGuardedCall = (payload) => isMailTool(payload?.tool_name) || usesProdToken(payload?.tool_name, payload?.tool_input)
  || handsTokenOn(payload?.tool_name, payload?.tool_input) || environmentDump(payload?.tool_name, payload?.tool_input) !== null;

// Record that this mail or token call was refused (it ran nothing), so a transcript read does not count its tool_use.
// Best effort: a record that cannot be written only narrows (the tool_use then counts).
export function recordRefusedCall(payload, env = process.env) {
  try {
    const sid = safeId(payload?.session_id);
    const id = safeId(payload?.tool_use_id);
    if (!sid || !id || !isGuardedCall(payload)) return;
    mkdirSync(guardDir(sid, env), { recursive: true });
    createMarker(path.join(guardDir(sid, env), `refused-${id}`));
  } catch { /* only narrows */ }
}

// A mail call that a deadline or an internal error lets through unchecked still marks the session, when it can.
export function markMailUnchecked(payload, env = process.env) {
  try {
    const sid = safeId(payload?.session_id);
    if (!sid || !isMailTool(payload?.tool_name)) return;
    mkdirSync(guardDir(sid, env), { recursive: true });
    createMarker(path.join(guardDir(sid, env), "mail"));
  } catch (error) { note(`mail guard could not mark this unchecked mail call: ${error?.message ?? error}`); }
}

// Each line of a JSONL file, read once in fixed-size chunks (a transcript can be large); onLine returning true stops early.
const SCAN_CHUNK_BYTES = 1024 * 1024;
function eachLine(file, onLine) {
  const fd = openSync(file, "r");
  try {
    const buffer = Buffer.alloc(SCAN_CHUNK_BYTES);
    let carry = Buffer.alloc(0);
    for (;;) {
      const read = readSync(fd, buffer, 0, buffer.length, null);
      if (read === 0) break;
      const data = carry.length ? Buffer.concat([carry, buffer.subarray(0, read)]) : buffer.subarray(0, read);
      let start = 0;
      for (let nl = data.indexOf(10); nl >= 0; nl = data.indexOf(10, start)) {
        if (onLine(data.toString("utf8", start, nl)) === true) return true;
        start = nl + 1;
      }
      carry = Buffer.from(data.subarray(start));
    }
    return carry.length > 0 && onLine(carry.toString("utf8")) === true;
  } finally { closeSync(fd); }
}

// Any object in a parsed entry that is a tool_use matching `match` and not refused (assistant message content, or one
// nested deeper, as older hosts wrote subagent progress). Finding more only refuses more, so a deep walk cannot loosen.
function hasToolUse(value, match, refused) {
  const stack = [value];
  while (stack.length) {
    const item = stack.pop();
    if (!item || typeof item !== "object") continue;
    if (Array.isArray(item)) { for (const part of item) stack.push(part); continue; }
    if (item.type === "tool_use" && typeof item.name === "string" && !(typeof item.id === "string" && refused.has(item.id))
      && match(item.name, item.input)) return true;
    for (const key of Object.keys(item)) stack.push(item[key]);
  }
  return false;
}

// Whether a Claude Code transcript (JSONL), or a transcript of one of its subagents (<transcript without .jsonl>/subagents/
// *.jsonl), holds a tool_use for which match(name, input) holds, other than the refused ones. A line that does not parse
// is skipped (the last one may be half written); a transcript path that is missing, a file that cannot be read, or a main
// transcript with no line that parses throws.
export function transcriptHasToolUse(transcriptPath, match, refused = new Set()) {
  if (typeof transcriptPath !== "string" || !transcriptPath) {
    throw new Error("the hook payload has no transcript_path, so earlier calls in this session cannot be checked");
  }
  const scan = (file, main) => {
    let parsedAny = false;
    let found;
    try {
      found = eachLine(file, (text) => {
        const line = text.trim();
        // Once the file is known to parse, only a line that names a tool_use needs parsing.
        if (!line || (parsedAny && !line.includes('"tool_use"'))) return false;
        let entry;
        try { entry = JSON.parse(line); } catch { return false; }
        parsedAny = true;
        return hasToolUse(entry, match, refused);
      });
    } catch (error) {
      throw new Error(`the transcript ${file} could not be read (${error?.code ?? error?.message ?? error})`);
    }
    if (!found && main && !parsedAny) throw new Error(`no line of the transcript ${file} parses`);
    return found;
  };
  if (scan(transcriptPath, true)) return true;
  const subagents = path.join(transcriptPath.replace(/\.jsonl$/i, ""), "subagents");
  let names;
  try { names = readdirSync(subagents); }
  catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return false;
    throw new Error(`the subagent transcripts ${subagents} could not be listed (${error?.code ?? error?.message ?? error})`);
  }
  return names.filter((name) => name.endsWith(".jsonl")).sort().some((name) => scan(path.join(subagents, name), false));
}

// The guard's steps for one call, as a generator so a test can interleave several calls exactly: the first next() checks
// the other side (step 1), the second creates this call's marker (step 2), the third checks again (step 3). The value
// is the refusal reason, or null (no decision: the host's normal flow runs; the guard never allows). It throws on a store
// it cannot use, a missing session id, or (token command) a transcript it cannot read; mailGuard maps that.
export function* mailGuardSteps(payload, env = process.env, { tool = "claude" } = {}) {
  const toolName = payload?.tool_name;
  const mail = isMailTool(toolName);
  if (!mail && !usesProdToken(toolName, payload?.tool_input)) return null;
  const [own, other] = mail ? ["mail", "prod"] : ["prod", "mail"];
  const sid = safeId(payload?.session_id);
  if (!sid) throw new Error("no usable session id in the hook payload");
  const dir = guardDir(sid, env);
  mkdirSync(dir, { recursive: true });
  const refuse = () => { recordRefusedCall(payload, env); return mail ? tokenThenMail(toolName) : MAIL_THEN_TOKEN; };
  // Step 1: the other marker, or (Claude Code) the other kind of call in the session's transcript.
  if (markerSet(path.join(dir, other))) return refuse();
  if (tool !== "codex") {
    const refused = new Set(readdirSync(dir).filter((name) => name.startsWith("refused-")).map((name) => name.slice("refused-".length)));
    let earlier = false;
    if (mail) {
      try { earlier = transcriptHasToolUse(payload?.transcript_path, usesProdToken, refused); }
      catch (error) { note(`mail guard could not read the transcript for an earlier token command, so it relies on the markers: ${error?.message ?? error}`); }
    } else {
      earlier = transcriptHasToolUse(payload?.transcript_path, isMailTool, refused);
    }
    if (earlier) {
      try { createMarker(path.join(dir, other)); }
      catch (error) { note(`mail guard could not record the ${other} marker it found in the transcript: ${error?.message ?? error}`); }
      return refuse();
    }
  }
  yield "checked";
  // Step 2: this call's own marker, never removed afterwards.
  createMarker(path.join(dir, own));
  yield "created";
  // Step 3: the other side again, in case a racing call created it after step 1.
  return markerSet(path.join(dir, other)) ? refuse() : null;
}

// A hand-off or dump (handsTokenOn, environmentDump) in a session that has used mail: the mail marker, or (Claude Code)
// a mail tool_use in the transcript, which then records the marker. It creates no marker of its own, so it has no race
// guarantee: a mail call that starts while it runs is not seen (limit 4). It never fails closed (no decision when the
// store or transcript cannot be read), since it is not a token command.
function mailOnlyRefusal(payload, env, { tool = "claude" } = {}, reason) {
  try {
    const sid = safeId(payload?.session_id);
    if (!sid) return null;
    const dir = guardDir(sid, env);
    const refuse = () => { recordRefusedCall(payload, env); return reason; };
    if (markerSet(path.join(dir, "mail"))) return refuse();
    if (tool === "codex") return null;
    let refused = new Set();
    try { refused = new Set(readdirSync(dir).filter((name) => name.startsWith("refused-")).map((name) => name.slice("refused-".length))); }
    catch (error) { if (error?.code !== "ENOENT") throw error; }
    if (!transcriptHasToolUse(payload?.transcript_path, isMailTool, refused)) return null;
    try { mkdirSync(dir, { recursive: true }); createMarker(path.join(dir, "mail")); }
    catch (error) { note(`mail guard could not record the mail marker it found in the transcript: ${error?.message ?? error}`); }
    return refuse();
  } catch (error) {
    note(`mail guard could not check this call for an earlier mail use, giving no decision: ${error?.message ?? error}`);
    return null;
  }
}

// The refusal reason for this call, or null.
export function mailGuard(payload, env = process.env, options = {}) {
  const mail = isMailTool(payload?.tool_name);
  if (!mail && !usesProdToken(payload?.tool_name, payload?.tool_input)) {
    if (handsTokenOn(payload?.tool_name, payload?.tool_input)) return mailOnlyRefusal(payload, env, options, handoffAfterMail(payload.tool_name));
    const form = environmentDump(payload?.tool_name, payload?.tool_input);
    return form ? mailOnlyRefusal(payload, env, options, dumpAfterMail(form)) : null;
  }
  try {
    const steps = mailGuardSteps(payload, env, options);
    let step = steps.next();
    while (!step.done) step = steps.next();
    return step.value;
  } catch (error) {
    if (!mail) return tokenFailClosed(error?.message ?? String(error));
    note(`mail guard could not record this mail call, giving no decision (a later token command is still checked): ${error?.message ?? error}`);
    return null;
  }
}

// ---- no-progress guard (port of the retired hooks/guard-noprogress-loop.ps1) ----
// WoW section 5 mechanical termination guard, no-progress arm (GLES-028/029): the IDENTICAL
// bash command failing N times in a row with no successful run in between halts the loop.
// A success of that command resets the streak, so unrelated failures of a common command
// (`npm test`) minutes apart never accumulate into a false halt (GLES-027). The event itself
// is the pass/fail signal: PostToolUse only fires after success, PostToolUseFailure only
// after failure. A halt is {"decision":"block"} on stdout with exit 0.

export function noProgress({ root, sid, command, failed }) {
  const id = safeId(sid);
  const cmd = String(command ?? "").trim();
  if (!id || !cmd) return null;
  const ledger = ledgerPath(root, id);
  let lastCmd = null;
  let streak = 0;
  if (existsSync(ledger)) {
    try {
      const state = JSON.parse(readFileSync(ledger, "utf8"));
      lastCmd = typeof state.lastCmd === "string" ? state.lastCmd : null;
      streak = Number.isInteger(state.streak) ? state.streak : 0;
    } catch { lastCmd = null; streak = 0; }
  }
  if (!failed) { // SUCCESS = progress: clears the command we were spinning on
    if (cmd === lastCmd) { try { rmSync(ledger, { force: true }); } catch { /* ignore */ } }
    return null;
  }
  streak = cmd === lastCmd ? streak + 1 : 1;
  if (streak >= NOPROGRESS_THRESHOLD) {
    try { rmSync(ledger, { force: true }); } catch { /* ignore */ } // fresh window next time
    return `NO-PROGRESS LOOP (WoW section 5 mechanical termination guard): the identical command has now FAILED ${NOPROGRESS_THRESHOLD} times in a row with no successful run in between:\n  ${cmd}\nThis is a spin, not progress. STOP - do not run this same command again. Per the section 5 stop conditions, surface the blocker to the founder in plain language (what is failing, and the next thing you would try), or change approach. Re-anchor to the frozen spec before continuing.`;
  }
  try {
    mkdirSync(sessionsDir(root), { recursive: true });
    writeFileSync(ledger, JSON.stringify({ lastCmd: cmd, streak }));
  } catch { /* ignore */ }
  return null;
}

// ---- push check (founder 2026-11-04; PACE_CORE §2a "The push check") ----
// Only masters checked the account lease, so lanes of the account the fleet left kept pushing after
// a takeover. Every session whose environment carries WOW_ACCOUNT_LABEL (the `fleet` cloud
// environment, fleet card §5) now reads the newest lease before a `git push` and is refused when the
// lease names another account. Fail open: an unset label, a missing bus.mjs, an unreadable bus or a
// lease nobody has taken never blocks a push (an outage must not stop every session).
const PUSH_TIMEOUT_MS = 5_000;
const ACCOUNT_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;
const GIT_GLOBAL_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--super-prefix", "--config-env"]);
const GH_GLOBAL_WITH_VALUE = new Set(["-R", "--repo"]);
// Words that may stand before `git` or `gh` in a command position: the launchers, each with the options that take a separate
// value (so `sudo -u x git push` is read as the push it is), and the shell keywords and shells (`bash -c '...'`). Follow-up to
// #342 "Not done". The same words, for gh only and without the shells, are LAUNCHER_OPTS in hooks/guard-bash-policy.mjs: a
// launcher added here is added there. A launcher written with a path (`/usr/bin/sudo`) is not recognised, as before.
const LAUNCHER_OPTS = new Map([
  ["env", ["-u", "--unset", "-C", "--chdir", "-a", "--argv0"]], ["command", []], ["exec", ["-a"]], ["nohup", []], ["setsid", []], ["unbuffer", []],
  ["sudo", ["-u", "--user", "-g", "--group", "-p", "--prompt", "-C", "--close-from", "-D", "--chdir", "-R", "--chroot", "-r", "--role", "-t", "--type", "-T", "--command-timeout", "-U", "--other-user"]],
  ["time", ["-f", "--format", "-o", "--output"]], ["timeout", ["-s", "--signal", "-k", "--kill-after"]], ["nice", ["-n", "--adjustment"]],
  ["ionice", ["-c", "--class", "-n", "--classdata", "-p", "--pid", "-P", "--pgid", "-u", "--uid"]], ["stdbuf", ["-i", "--input", "-o", "--output", "-e", "--error"]],
  // No -I here: its value is usually `{}`, which is a blank to the tokenizer, so `xargs -I {} git push` would lose its `git`.
  ["xargs", ["-L", "-n", "-P", "-s", "-d", "-E", "-a", "--max-args", "--max-procs", "--max-lines", "--max-chars", "--delimiter", "--arg-file"]],
  ["if", []], ["elif", []], ["while", []], ["until", []], ["then", []], ["do", []], ["else", []], ["!", []], ["bash", []], ["sh", []], ["zsh", []], ["dash", []],
].map(([name, opts]) => [name, new Set(opts)]));
const ASSIGNMENT = /^[A-Za-z_]\w*=/;
const DURATION = /^\d+(?:\.\d+)?[smhd]?$/;
const GIT_WORD = /^(?:.*[\\/])?git(?:\.exe)?$/i;
const GH_WORD = /^(?:.*[\\/])?gh(?:\.exe)?$/i;
// The GraphQL mutations that merge a pull request, now or when its checks pass.
const GRAPHQL_MERGE = /(?<![A-Za-z0-9])(?:mergePullRequest|enablePullRequestAutoMerge|enqueuePullRequest)(?![A-Za-z0-9])/;
// The GraphQL endpoint as `graphql`, a path (`/graphql`) or a URL (`https://api.github.com/graphql`).
// A trailing slash, query string or fragment is the same endpoint (`graphql/`, `graphql?x=1`).
const GRAPHQL_ENDPOINT = /(?:^|\/)graphql\/?(?:[?#].*)?$/i;
// gh's persistent options before the subcommand and between `pr` and `merge` (`-R o/r`, `--repo o/r`, `-Ro/r`, `--repo=o/r`):
// the index of the first word that is not one of them. -R and --repo take a separate value when written bare.
const skipGhOptions = (tokens, j) => {
  while (j < tokens.length && tokens[j].startsWith("-")) j += GH_GLOBAL_WITH_VALUE.has(tokens[j]) ? 2 : 1;
  return j;
};

// The end of the quoted string that opens at `open`, or -1 when it never closes. A backslash escapes the next character in
// double quotes (`"a \" b"`); single quotes take no escape. One forward scan from `open`.
const DOUBLE_QUOTE_STOP = /[\\"]/g;
function closingQuote(text, open) {
  if (text[open] === "'") return text.indexOf("'", open + 1);
  DOUBLE_QUOTE_STOP.lastIndex = open + 1;
  for (let m = DOUBLE_QUOTE_STOP.exec(text); m; m = DOUBLE_QUOTE_STOP.exec(text)) {
    if (m[0] === '"') return m.index;
    DOUBLE_QUOTE_STOP.lastIndex = m.index + 2;
  }
  return -1;
}

// A backslash-newline is gone before the shell reads a word (inside a word too: `pu\<LF>sh` is `push`), but only after an ODD run
// of backslashes, and never at the end of a comment (`# note\<LF>gh pr merge 5` is a comment and a command). Deciding which is
// which needs a full shell parse, so both readings are checked (round 1 of the #342 follow-up): the text as written, where the
// newline always separates, and the text with every backslash-newline removed. A command found in either one counts; the cost of
// a wrong reading is a refusal on the failure path only. The first two readings alone missed a command with both kinds of
// newline, so the third reading follows the shell (shellJoin, round 2).
// The text as the shell joins it: a backslash-newline is removed only where the backslash is a live escape (outside single quotes,
// not itself escaped by a backslash before it) and never inside a `#` comment, which ends at the newline. One forward pass.
// Round 2 of the #342 follow-up: the raw and the fully joined readings both missed a command that has one real continuation and
// one that is not (`echo a\\<LF>gh pr mer\<LF>ge 5`, `# c\<LF>git \<LF>push`). The same function is in the other file
// (scripts/wow-hook.mjs and hooks/guard-bash-policy.mjs); a test pins that both give the same text.
// `$'` opens ANSI-C quoting only at an unescaped `$` that is not the second of `$$` (`\$'a\'` and `$$'a\'` are plain quotes); with
// ansiC false the text is read as the round-2 reading did, and both readings are checked (final check of #344).
export function shellJoin(text, ansiC = true) {
  let out = "", quote = "", wordStart = true, comment = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (comment) { out += c; if (c === "\n") { comment = false; wordStart = true; } continue; }
    if (quote === "'") { out += c; if (c === "'") quote = ""; continue; }
    // `$'..'` (ANSI-C quoting) takes backslash escapes, so `$'\''` is one string; nothing in it is a continuation.
    if (quote === "$") { out += c; if (c === "\\") { out += text[i + 1] ?? ""; i += 1; } else if (c === "'") quote = ""; continue; }
    if (c === "\\") {
      if (text[i + 1] === "\n") { i += 1; continue; }
      if (text[i + 1] === "\r" && text[i + 2] === "\n") { i += 2; continue; }
      out += c + (text[i + 1] ?? ""); i += 1; wordStart = false; continue;
    }
    if (quote === '"') { out += c; if (c === '"') quote = ""; continue; }
    if (c === "$" && (text[i + 1] === "$" || (ansiC && text[i + 1] === "'"))) {
      if (text[i + 1] === "'") quote = "$";
      out += c + text[i + 1]; i += 1; wordStart = false; continue;
    }
    if (c === "'" || c === '"') { quote = c; out += c; wordStart = false; continue; }
    if (c === "#" && wordStart) { comment = true; out += c; continue; }
    wordStart = /[\s;&|()<>]/.test(c);
    out += c;
  }
  return out;
}
const joinContinuations = (command) => command.replace(/\\\r?\n/g, "");
// Three readings, and a command found in any one counts: as written, with every continuation removed, and as the shell joins it
// (with and without ANSI-C quoting, so a misread `$'` can only add a refusal).
const readings = (command) => [...new Set([command, joinContinuations(command), shellJoin(command), shellJoin(command, false)])];

// The words of each shell segment of a command, shared by isGitPush and isMergeCommand so both read quoting the same way.
// One left-to-right pass, so it is linear in the command's length (every quote is looked up at most once, and a quote with no
// partner is skipped). Words split at whitespace; segments at `;`, `&`, `|` and newlines; `$(`, backticks, parentheses and braces
// are blanks. A quoted string is ONE word (data: the spaces and separators inside it do not split) in exactly two places: right
// after `=` (`A="x;y" git push`, `--git-dir="a b"`) and as the value of an option that takes one (`git -C "a b" push`,
// `sudo -u "x y"`, `gh -R "o/r"`). Anywhere else the quote characters are blanks and the inside is read as code, so
// `bash -c "cd x && git push"` is seen. A double-quoted string that holds a command substitution (`A="$(git push)" true`) is read
// as code in both places, because it runs. `$'..'` and an escaped quote outside a quoted string are not understood (habit
// forms only, as in the policy).
function commandSegments(text) {
  const segments = [];
  // `eq` is whether the word being built ends in `=`. It is tracked, not asked of `cur` (cur.endsWith("=") flattened the growing
  // string on every quote: 600 KB of `A="` took 8 s, round 1 of the #342 follow-up).
  let words = [], cur = null, eq = false, valueOptions = null;
  const endWord = () => {
    if (cur === null) return;
    eq = false;
    words.push(cur);
    if (LAUNCHER_OPTS.has(cur)) valueOptions = LAUNCHER_OPTS.get(cur);
    else if (GIT_WORD.test(cur)) valueOptions = GIT_GLOBAL_WITH_VALUE;
    else if (GH_WORD.test(cur)) valueOptions = GH_GLOBAL_WITH_VALUE;
    cur = null;
  };
  const endSegment = () => { endWord(); if (words.length) segments.push(words); words = []; valueOptions = null; };
  const PLAIN = /[^\s;&|"'`(){}$]+|\$(?!\()/y;
  for (let i = 0; i < text.length;) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const dataPlace = cur === null ? valueOptions !== null && words.length > 0 && valueOptions.has(words[words.length - 1]) : eq;
      const close = dataPlace ? closingQuote(text, i) : -1;
      if (close > i) {
        const inner = text.slice(i + 1, close);
        if (ch === "'" || !(inner.includes("$(") || inner.includes("`"))) {
          cur = (cur ?? "") + inner.replace(/\s+/g, "_");
          if (inner) eq = inner.endsWith("=");
          i = close + 1;
          continue;
        }
      }
      endWord(); i++;
    } else if (ch === ";" || ch === "&" || ch === "|" || ch === "\n" || ch === "\r") {
      endSegment(); i++;
    } else if (ch === "$" && text[i + 1] === "(") {
      endWord(); i += 2;
    } else {
      PLAIN.lastIndex = i;
      const run = PLAIN.exec(text);
      if (run) { cur = (cur ?? "") + run[0]; eq = run[0].endsWith("="); i += run[0].length; } else { endWord(); i++; }
    }
  }
  endSegment();
  return segments;
}

// One pass over a segment: `runs(tokens, i)` says whether the command that starts at word i is the one looked for. A command
// counts only while every word before it is launcher material (a launcher, a launcher option and its value, an assignment, an
// option, a duration), and the first word that is not ends the scan of this segment (a later command could never pass that
// test), so a long command stays linear and a commit message that mentions "git push" is not a push.
function commandInChain(tokens, runs) {
  let valueOptions = null;
  for (let i = 0; i < tokens.length;) {
    const word = tokens[i];
    if (runs(tokens, i)) return true;
    if (LAUNCHER_OPTS.has(word)) { valueOptions = LAUNCHER_OPTS.get(word); i++; }
    else if (ASSIGNMENT.test(word) || DURATION.test(word)) i++;
    else if (word.startsWith("-")) i += valueOptions?.has(word) ? 2 : 1;
    else return false;
  }
  return false;
}

function runsGitPush(tokens, i) {
  if (!GIT_WORD.test(tokens[i])) return false;
  let j = i + 1;
  while (j < tokens.length && tokens[j].startsWith("-")) j += GIT_GLOBAL_WITH_VALUE.has(tokens[j]) ? 2 : 1;
  return tokens[j] === "push";
}

// True when any segment of the command runs `git [global options] push`.
export function isGitPush(command) {
  if (typeof command !== "string") return false;
  return readings(command).some((text) => /push/.test(text) && commandSegments(text).some((tokens) => commandInChain(tokens, runsGitPush)));
}

function runsGhMerge(tokens, i, mutationInText = () => false) {
  if (!GH_WORD.test(tokens[i])) return false;
  // gh's repository option may come before the subcommand, and between `pr` and `merge`, and takes a separate value
  // (`gh -R o/r pr merge 5`, `gh pr -R o/r merge 5`).
  const j = skipGhOptions(tokens, i + 1);
  const sub = (tokens[j] ?? "").toLowerCase();
  if (sub === "pr") return (tokens[skipGhOptions(tokens, j + 1)] ?? "").toLowerCase() === "merge";
  // No `--help` exemption: on the failure path a refused help request costs nothing, and the exemption let real merges through
  // (`gh pr merge 5 -b "--help"`, `gh pr merge 5 > --help`; round 2 of the #342 follow-up).
  if (sub !== "api") return false;
  let graphql = false, mutation = false;
  for (let k = j + 1; k < tokens.length; k++) {
    if (/\/pulls\/\d+\/merge$/i.test(tokens[k])) return true;
    if (GRAPHQL_ENDPOINT.test(tokens[k])) graphql = true;
    if (GRAPHQL_MERGE.test(tokens[k])) mutation = true;
  }
  // A quoted argument that holds a newline (`-f 'query=mutation {<LF> mergePullRequest(...)'`) is split into segments by this
  // tokenizer, so the mutation may sit in a later segment: when this segment names the endpoint, the whole text is read.
  return graphql && (mutation || mutationInText());
}

// True when any segment of the command runs `gh pr merge`, an API merge (`gh api .../pulls/<n>/merge`) or a GraphQL merge
// mutation (`gh api graphql` naming mergePullRequest or enablePullRequestAutoMerge): the merge commands
// hooks/guard-bash-policy.mjs refuses. That policy is not loaded on the failure path (the hook may be the thing that broke), so
// this is a deliberately narrow copy of its shapes, with the same tokenizer and launcher handling as isGitPush. It runs only to
// decide fail-closed, so a miss costs nothing the policy would not also have caught in a healthy run. A plain local `git merge`
// is an ordinary operation, not a hard stop. Left out (follow-up to #342): gh aliases, `$'..'`, a query read from a file
// (`-F query=@file`, `--input`).
export function isMergeCommand(command) {
  if (typeof command !== "string") return false;
  return readings(command).some((text) => {
    if (!/merge|enqueuePullRequest/i.test(text)) return false;
    let anyMutation; // GRAPHQL_MERGE over the whole text, once (a long run of `gh api graphql` segments must not rescan it)
    const mutationInText = () => anyMutation ??= GRAPHQL_MERGE.test(text);
    return commandSegments(text).some((tokens) => commandInChain(tokens, (words, i) => runsGhMerge(words, i, mutationInText)));
  });
}

// A shell call that carries a hard stop (the push and merge stops: AGENTS.md rule 3 and the reserved actions). When the
// hook fails after it started (deadline, internal error), these are DENIED instead of allowed; every other call stays fail-open.
export function isHardStopShell(payload) {
  const name = payload?.tool_name;
  const input = payload?.tool_input;
  const shell = name === "Bash" || ((name === undefined || name === null) && typeof input?.command === "string");
  return shell && typeof input?.command === "string" && (isGitPush(input.command) || isMergeCommand(input.command));
}

// The newest lease as bus.mjs prints it (`lease --json`: {account, sessions: [{project, session}]} or
// null for no lease), read under PUSH_TIMEOUT_MS. Throws a one-line reason when it cannot be read; the
// push check fails open on that. (The trust gate reads the lease authority instead, below, and fails closed.) The bus
// repository must come from the environment, exactly as in readAuthority: the project's .claude/bus.json and the user bus
// config are files the session can edit, so a lease that bus.mjs would read through them is no lease (fail-open here).
async function readLease(cwd, env = process.env, run = runChild) {
  if (!trustedBusRepo(env)) throw new Error("the trusted bus repository (WOW_BUS_REPO) is not set, so the account lease could not be read");
  const bus = path.join(path.dirname(SELF), "bus.mjs");
  if (!existsSync(bus)) throw new Error("bus.mjs is not next to this hook");
  const result = await run(cwd, bus, ["lease", "--json"], "", PUSH_TIMEOUT_MS);
  try {
    if (result.error || result.timedOut || result.code !== 0) throw new Error(result.timedOut ? "timed out" : result.error?.message ?? `bus.mjs exit ${result.code}`);
    return JSON.parse(result.stdout.trim());
  } catch (error) {
    throw new Error(`the account lease could not be read (${String(error?.message ?? error).split("\n")[0]})`);
  }
}

// The deny reason, or null to allow. `run` is injectable for tests.
export async function pushCheck({ command, cwd, env = process.env, run = runChild, fresh = false, transcriptPath, leaseAccount, leaseFailed = false }) {
  if (!isGitPush(command)) return null;
  // Only a weekly Patrol started after the switch may push from another account (founder 2026-11-05, Patrols kept on
  // their own account); any other fresh session there (an old master's routine, an old lane's child) is still refused.
  if (fresh && typeof transcriptPath === "string") {
    let first = "";
    try { first = firstPromptText(transcriptPath); } catch { /* no readable first prompt: not a Patrol */ }
    if (PATROL_PROMPT.test(first)) return null;
  }
  const label = typeof env.WOW_ACCOUNT_LABEL === "string" ? env.WOW_ACCOUNT_LABEL : "";
  if (!label) return null;
  if (!ACCOUNT_NAME.test(label)) { note(`push check skipped: WOW_ACCOUNT_LABEL '${label}' is not a valid account label; allowing the push (fail-open)`); return null; }
  // This call's fence read already failed (a bus outage): reading the lease again would wait out a second timeout and could
  // push the whole hook past its deadline. The outage's contract is to allow, so reuse the failure.
  if (leaseFailed && typeof leaseAccount !== "string") { note("push check skipped: this call's lease read already failed; allowing the push (fail-open)"); return null; }
  let lease;
  try {
    lease = typeof leaseAccount === "string" ? { account: leaseAccount } : await readLease(cwd, env, run);
  } catch (error) {
    note(`push check skipped: ${String(error?.message ?? error).split("\n")[0]}; allowing the push (fail-open)`);
    return null;
  }
  const account = lease && typeof lease === "object" ? lease.account : null;
  if (account === null || account === undefined) return null; // no lease: nothing to fence
  if (typeof account !== "string" || !ACCOUNT_NAME.test(account)) {
    note("push check skipped: the lease names no valid account; allowing the push (fail-open)");
    return null;
  }
  if (account === label) return null;
  return `wow-core: the newest lease (bus channel fleet-lease) names account ${account}, not yours (${label}). If a takeover on your account is in progress, wait for its lease and retry the push. Otherwise the fleet moved to ${account}: stop, do not push and do not continue this session's work; report it on your PR with a comment starting "To orchestrator:" (the fleet moved to ${account}; what you did and did not push), pause (never delete) your own scheduled tasks, and end. Your master on ${account} relaunches whatever is still needed.`;
}

// ---- Old-account fence (founder 2026-11-05) ----
// "We would need a way to close all sessions exactly when we are running out of tokens so that they don't open
// up automatically and resume work." Sessions work until the account runs out (PACE_CORE §2a), so at a takeover
// the old account still holds lanes and masters mid-step; at its reset they wake (5 Nov 02:00: a project's old lanes
// commented and pushed). Nothing can close them at that moment: the old account has no usage left and the new
// one cannot see its sessions. So a session is fenced instead: when the environment's WOW_ACCOUNT_LABEL is not
// the leased account AND the session started before the current lease period began (the takeover), every tool
// call is refused, except the few it needs to go quiet (stop PR wakes, pause its own scheduled tasks). A session
// started after the takeover (the takeover itself before its lease, the cleanup line, a Patrol run) is not
// fenced. Fail-open like the push check: no label, no WOW_BUS_REPO, an unreadable lease, no period start or an
// unreadable session start fence nothing. A stop for well-behaved sessions, not a security boundary (a session
// can edit its own hooks or the cache file). The lease authority is cached for FENCE_CACHE_MS so this costs one
// bus read per five minutes per container, not one per tool call.
const PATROL_PROMPT = /\bScheduled\s+codebase\s+patrol\b|\bexecute\s+the\s+patrol\s+skill\b/i;
export const FENCE_CACHE_MS = 300_000;
export const FENCE_FAIL_CACHE_MS = 60_000;
const FENCE_QUIET_TOOLS = /^mcp__(?:.+_)?claude-code-remote__(?:unsubscribe_pr_activity|list_triggers|get_trigger|update_trigger|get_session)$/;
export const fenceAllows = (name) => name === "ToolSearch" || (typeof name === "string" && FENCE_QUIET_TOOLS.test(name));

// When this session started: the first timestamp in its transcript (the transcript survives a container restart).
export function sessionStartedAt(transcriptPath) {
  if (typeof transcriptPath !== "string" || !transcriptPath || !existsSync(transcriptPath)) return null;
  let fd;
  try {
    fd = openSync(transcriptPath, "r");
    const TS = /"timestamp"\s*:\s*"(\d{4}-\d\d-\d\dT[^"]{1,40})"/;
    let match = null;
    // 64 KB first; a first message larger than that (a long brief, an image) is scanned up to 2 MB.
    for (const size of [65_536, 2_097_152]) {
      const buf = Buffer.alloc(size);
      const n = readSync(fd, buf, 0, size, 0);
      match = buf.subarray(0, n).toString("utf8").match(TS);
      if (match || n < size) break;
    }
    const at = match ? Date.parse(match[1]) : NaN;
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) try { closeSync(fd); } catch { /* ignore */ }
  }
}

async function cachedAuthority(cwd, env, run, now) {
  const key = createHash("sha256").update(String(trustedBusRepo(env))).digest("hex").slice(0, 16);
  const dir = typeof env.WOW_FENCE_CACHE_DIR === "string" && env.WOW_FENCE_CACHE_DIR ? env.WOW_FENCE_CACHE_DIR : os.tmpdir();
  const file = path.join(dir, `wow-fence-${key}.json`);
  try {
    const cached = JSON.parse(readFileSync(file, "utf8"));
    const age = typeof cached?.at === "number" ? now - cached.at : -1;
    // A failed read is cached for a minute too, so a bus outage costs one 5 s wait per minute, not one per tool call.
    // Tagged by property, not by text: a planted error string (one with a newline, say) cannot pass for a fresh failure.
    if (cached?.error && age >= 0 && age < FENCE_FAIL_CACHE_MS) throw Object.assign(new Error(`${cached.error} (cached)`), { cached: true });
    if (!cached?.error && age >= 0 && age < FENCE_CACHE_MS) return cached.authority;
  } catch (error) {
    if (error?.cached === true) throw error;
  }
  let authority;
  try {
    authority = await readAuthority(cwd, env, run);
  } catch (error) {
    try { writeFileSync(file, JSON.stringify({ at: now, error: String(error?.message ?? error).split("\n")[0] })); } catch { /* best effort */ }
    throw error;
  }
  try { writeFileSync(file, JSON.stringify({ at: now, authority })); } catch { /* cache is best effort */ }
  return authority;
}

// { fenced, reason?, fresh, account? } — `fresh` is true when this session started at or after the current lease
// period began on another account than its own; only a fresh weekly Patrol may then push (pushCheck). `account`
// is the leased account when the bus was read, so the push check need not read it again.
export async function fenceCheck({ toolName, transcriptPath, cwd, env = process.env, run = runChild, now = Date.now() }) {
  const label = typeof env.WOW_ACCOUNT_LABEL === "string" ? env.WOW_ACCOUNT_LABEL : "";
  if (!label || !ACCOUNT_NAME.test(label) || !trustedBusRepo(env)) return { fenced: false, fresh: false };
  const startedAt = sessionStartedAt(transcriptPath);
  if (startedAt === null) return { fenced: false, fresh: false };
  let authority;
  try {
    authority = await cachedAuthority(cwd, env, run, now);
  } catch (error) {
    const why = String(error?.message ?? error).split("\n")[0];
    note(`old-account fence skipped: ${why}; allowing (fail-open)`);
    // Only a read this call waited out to its timeout counts: the push check skips its own read just to avoid a second
    // timeout. A failure served from the minute-long cache, or a fast failure (bus.mjs exits 1), cost no time, so the push
    // check still reads the lease itself (a stale or planted cache file must not switch both checks off).
    return { fenced: false, fresh: false, leaseFailed: error?.timedOut === true && error?.cached !== true };
  }
  const account = authority && typeof authority === "object" ? authority.account : null;
  if (typeof account !== "string" || !ACCOUNT_NAME.test(account)) return { fenced: false, fresh: false };
  const at = (value) => Date.parse(typeof value === "string" ? value : "");
  let cutoff;
  if (account === label) {
    // The fleet came back to this account (A to B to A): a session from before it left (before the previous,
    // other-account period began) is as stale as one left behind. The takeover itself started inside that period.
    cutoff = at(authority.prevPeriodStart);
    if (!Number.isFinite(cutoff) || startedAt >= cutoff) return { fenced: false, fresh: false, account };
  } else {
    cutoff = at(authority.periodStart);
    if (!Number.isFinite(cutoff)) return { fenced: false, fresh: false, account };
    if (startedAt >= cutoff) return { fenced: false, fresh: true, account };
  }
  if (fenceAllows(toolName)) return { fenced: false, fresh: false, account };
  const since = new Date(at(authority.periodStart)).toISOString().replace(/\.\d{3}Z$/, "Z");
  return { fenced: true, fresh: false, account, reason: `wow-core: the fleet's lease is on account ${account} since ${since}, and this session (account ${label}) started before the fleet last left this account, so its work has been taken over there. Every action is refused. Go quiet and end: unsubscribe from your PR's activity (unsubscribe_pr_activity), pause (never delete) this session's own scheduled tasks (update_trigger, enabled false), then end your turn with one line saying the fleet moved. Do not push, comment, label or start sessions; the master on ${account} relaunches whatever is still needed (PACE_CORE §2a "Old-account fence").` };
}

// A lease write must name the session's own account (founder 2026-11-05): a `--take` for another account would fence
// every older session of every account but that one. Null to allow.
const TAKE_WRITE = (command) => /\bbus\.mjs\b[^;&|\n]*\blease\b[^;&|\n]*--take\b/.test(command)
  || (/\bLEASE\s+account=/.test(command) && /fleet-lease|\bbus\.mjs\b[^;&|\n]*\bsend\b/.test(command) && !/^\s*(?:git|rg|grep)\b/.test(command));
export function leaseAccountGuard(command, env = process.env) {
  if (typeof command !== "string" || !TAKE_WRITE(command)) return null;
  const label = typeof env.WOW_ACCOUNT_LABEL === "string" ? env.WOW_ACCOUNT_LABEL : "";
  const written = (command.match(/--account[ =]+["']?([A-Za-z0-9][A-Za-z0-9-]*)/)?.[1] ?? command.match(/\bLEASE\s+account=([A-Za-z0-9][A-Za-z0-9-]*)/)?.[1] ?? "").toLowerCase() || null;
  if (!label || !ACCOUNT_NAME.test(label) || !written || written === label) return null;
  return `wow-core: this lease write names account ${written}, but this session runs on ${label} (WOW_ACCOUNT_LABEL). Only a takeover on an account leases that account; a lease for another account would stop every session started before it. Re-run with --account ${label}, or ask the wow-core master.`;
}

// ---- Trust gate (founder 2026-11-06, "yes": no cloud session is ever trusted) ----
// COMMS_CORE §1: the founder's Allow on a trust card limits that session to trusted devices for good, and live on
// 2026-11-06 nothing in the cloud could then send_message into it (elevated_session_untrusted_device, even from another
// trusted session) and scheduled tasks could not fire into it: two project masters and the wow-core master, trusted
// under the masters' route of #263/#266, went deaf to the fleet. PC work goes through the PC desk, a
// local session on the founder's PC that needs no card (docs/fleet-roster.md "PC desk"). So this tool is refused for
// every session, without reading the lease or the roster; the deadline and the internal-error paths in run() deny it
// too (fail closed). The founder still answers any card that gets through, and he declines them all.
export const isConfirmTrust = (name) => typeof name === "string" && /^mcp__(?:.+_)?claude-code-remote(?:-[0-9a-f]+)?__confirm_repository_trust$/.test(name);
export const TRUST_REFUSAL = "wow-core: confirm_repository_trust is refused for every session (founder 2026-11-06): a trusted session opens only on trusted devices, no other session can message it and scheduled tasks cannot fire into it (COMMS_CORE §1). Work that needs the founder's PC goes to the PC desk as a PC job (docs/fleet-roster.md \"PC desk\"): push docs/lanes/pc/<slug>-brief.md with a draft PR and add the label pc-job. Carry on without the card.";
const SESSION_SUFFIX = /^[A-Za-z0-9]+$/;
const suffixOf = (id) => {
  if (typeof id !== "string") return null;
  const suffix = id.slice(id.indexOf("_") + 1);
  return id.includes("_") && SESSION_SUFFIX.test(suffix) ? suffix : null;
};

// The lease authority as `bus.mjs lease --authority` prints it: {account, wowCore, codexDispatcher, ...} or
// null. Anything may post a LEASE line, so only the FIRST entry of each key in the current account period counts
// (bus.mjs leaseAuthority). The bus repository must come from the environment (WOW_BUS_REPO, set by the fleet
// environment); the project's .claude/bus.json and the user bus config are files the session can edit, so these
// gates never rely on them. Throws a one-line reason; every user below fails closed on it.
async function readAuthority(cwd, env, run) {
  if (!trustedBusRepo(env)) throw new Error("the trusted bus repository (WOW_BUS_REPO) is not set, so the account lease could not be read");
  const bus = path.join(path.dirname(SELF), "bus.mjs");
  if (!existsSync(bus)) throw new Error("bus.mjs is not next to this hook, so the account lease could not be read");
  const result = await run(cwd, bus, ["lease", "--authority"], "", PUSH_TIMEOUT_MS);
  try {
    if (result.error || result.timedOut || result.code !== 0) throw new Error(result.timedOut ? "timed out" : result.error?.message ?? `bus.mjs exit ${result.code}`);
    return JSON.parse(result.stdout.trim());
  } catch (error) {
    throw Object.assign(new Error(`the account lease could not be read (${String(error?.message ?? error).split("\n")[0]})`),
      { timedOut: result?.timedOut === true });
  }
}

// This session's label, id and the authority, checked against each other: { ok: true, mine, label, authority } or
// { ok: false, why }. Used by the Codex dispatcher's attach.
async function leasedAuthority({ cwd, env, run }) {
  const label = typeof env.WOW_ACCOUNT_LABEL === "string" ? env.WOW_ACCOUNT_LABEL : "";
  if (!label || !ACCOUNT_NAME.test(label)) return { ok: false, why: "WOW_ACCOUNT_LABEL is unset or invalid" };
  const mine = suffixOf(env.CLAUDE_CODE_REMOTE_SESSION_ID);
  if (!mine) return { ok: false, why: "this session's id (CLAUDE_CODE_REMOTE_SESSION_ID) is missing" };
  let authority;
  try { authority = await readAuthority(cwd, env, run); } catch (error) { return { ok: false, why: String(error?.message ?? error).split("\n")[0] }; }
  if (!authority || typeof authority !== "object" || typeof authority.account !== "string") return { ok: false, why: "there is no lease naming an account" };
  if (authority.account !== label) return { ok: false, why: `the lease names account ${authority.account}, not this session's (${label})` };
  return { ok: true, mine, label, authority };
}

// Rewriting the `wow-core` entry is how a session would make itself the lease authority, and writing a
// `codex-dispatcher` entry is how it would name itself the dispatcher (review 2026-11-04). The authority is the
// `wow-core` session of the account period's FIRST lease (`bus.mjs lease --authority`): it alone writes a
// codex-dispatcher entry or changes a wow-core entry inside the period. A `--take` (or raw LEASE) for a DIFFERENT
// account than the newest lease starts a new period, that is a takeover, and stays allowed. Fail closed when the lease
// cannot be read. A project's entry (a master's `lease --add`) is not guarded: since no session may ask for a trust
// card (founder 2026-11-06), a project's first entry grants nothing. This text match stops honest mistakes and the
// obvious self-grant only (it misses split strings, variables and a body file); a session that edits its own hooks or
// posts through another route is stopped by the first-entry rules in bus.mjs and, for the dispatcher, by the
// `Codex dispatcher:` line the master merges into TASKS.md (codexDispatcherAttachDecision).
const LEASE_WRITE = (command) => (/\bbus\.mjs\b[^;&|\n]*\blease\b[^;&|\n]*--(?:add|take)\b/.test(command))
  || (/\bLEASE\s+account=/.test(command))
  || (/fleet-lease/.test(command) && /\b(?:send|api|POST|comments)\b/.test(command));
export function writesCodexDispatcherLease(command) {
  return typeof command === "string" && /codex-dispatcher/i.test(command) && LEASE_WRITE(command);
}
export function writesWowCoreLease(command) {
  return typeof command === "string" && /wow-core\s*:\s*(?:session|cse)_/i.test(command) && LEASE_WRITE(command);
}
// The account a lease write names (`--account <label>` or `LEASE account=<label>`), or null when it names none.
const writtenAccount = (command) => command.match(/--account[ =]+["']?([a-z0-9][a-z0-9-]*)/)?.[1] ?? command.match(/\bLEASE\s+account=([a-z0-9][a-z0-9-]*)/)?.[1] ?? null;
export async function leaseAuthorityGuard({ command, cwd, env = process.env, run = runChild }) {
  const dispatcherWrite = writesCodexDispatcherLease(command);
  const wowCoreWrite = writesWowCoreLease(command);
  if (!dispatcherWrite && !wowCoreWrite) return null;
  const refuse = (why) => `wow-core: a codex-dispatcher entry, or a change to the wow-core entry inside an account's lease period, may be written only by the takeover (the wow-core session of the period's first lease): ${why}. The Codex dispatcher is the one session allowed to attach fleet repositories with push (MODEL_ROUTING "Codex dispatch"), and the wow-core entry names who may write it (COMMS_CORE §1), so neither is for lanes or masters. Ask the wow-core master.`;
  const mine = suffixOf(env.CLAUDE_CODE_REMOTE_SESSION_ID);
  if (!mine) return refuse("this session's id (CLAUDE_CODE_REMOTE_SESSION_ID) is missing");
  let authority;
  try { authority = await readAuthority(cwd, env, run); } catch (error) { return refuse(String(error?.message ?? error).split("\n")[0]); }
  const isAuthority = Boolean(authority && authority.wowCore) && suffixOf(authority.wowCore) === mine;
  if (dispatcherWrite) {
    if (!authority || !authority.wowCore) return refuse("the newest lease period names no wow-core session");
    if (!isAuthority) return refuse("this session is not the wow-core session of the account's lease period");
  }
  // A wow-core write: allowed for the period's authority, for the very first lease, and for a takeover that starts a
  // new account period (its account differs from the newest lease's).
  if (!wowCoreWrite || !authority || isAuthority) return null;
  const account = writtenAccount(command);
  if (account && account !== authority.account) return null;
  return refuse(`this session is not the wow-core session of the account's lease period (${authority.account}), and the write does not start a new account period`);
}

// ---- Codex dispatcher push attach (founder 2026-11-05; MODEL_ROUTING "Codex dispatch" "Results") ----
// The fleet's one Codex dispatcher pushes each finished Codex Cloud task to `codex/<slug>` of the requesting project,
// so it attaches that repository with add_repo (push access); the auto-mode classifier refused that as a self-granted
// permission, which held every Codex request. This rule allows exactly that attach and nothing wider: the call is
// exactly {owner, repo, access: "push"}; the repository is a row of docs/fleet-roster.md "Active masters" as committed
// on origin/main of this hook's own wow-core checkout (the roster names owner/name for every master the dispatcher
// serves; consumers.json names bare repositories and leaves out comms consumers that have masters); never wow-core
// itself or the bus repository; this session is the FIRST `codex-dispatcher` entry of the account's lease period
// (`bus.mjs lease --authority`, the trust gate's rule, so a later forged entry counts for nothing); AND it is the one
// `Codex dispatcher: <id>` of TASKS.md as committed on the same origin/main. Anything on the account may post a LEASE
// line, so before the master writes the entry any session could be "first" (review 2026-11-05); the TASKS.md line
// lands only through the master's gate-merged state PR, after it checked the dispatcher with get_session. Both must
// name this session. Anything else, and any failure, gives no decision: the classifier decides as before. Like the
// bus attach, it narrows what an honest session attaches; a session that edits its own hooks, settings or
// refs/remotes/origin/main (update-ref, a forced fetch) is outside it (the classifier and review stay that control). Both files are read from the fully qualified remote ref with
// replace objects off, so a local tag or branch named origin/main, or a refs/replace entry, is not read instead.
export const CODEX_DISPATCHER_KEY = "codex-dispatcher";
const ORIGIN_MAIN = "refs/remotes/origin/main";
const ROSTER_SOURCE = `${ORIGIN_MAIN}:docs/fleet-roster.md`;
const STATE_SOURCE = `${ORIGIN_MAIN}:TASKS.md`;

// The one repository the call names, as lower-case owner/name, or null: exactly the own keys owner, repo and access,
// owner and repo plain names, access exactly "push". Anything else is null.
export function dispatcherAttachTarget(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const keys = Object.keys(input);
  if (keys.length !== 3 || !["owner", "repo", "access"].every((key) => keys.includes(key))) return null;
  const { owner, repo, access } = input;
  if (access !== "push" || typeof owner !== "string" || typeof repo !== "string" || !NAME_PART.test(owner) || !NAME_PART.test(repo)) return null;
  return `${owner}/${repo}`.toLowerCase();
}

// The dispatcher id of the live state (TASKS.md), or null: `Codex dispatcher:` must occur exactly once and be followed
// by a session id (session_ or cse_ form, optionally in backticks). None, several or no id → null.
export function stateDispatcher(text) {
  if (typeof text !== "string") return null;
  const labels = [...text.matchAll(/Codex dispatcher:/gi)];
  if (labels.length !== 1) return null;
  return text.slice(labels[0].index).match(/^Codex dispatcher:[ \t]*`?((?:session|cse)_[A-Za-z0-9]+)`?(?![A-Za-z0-9_-])/i)?.[1] ?? null;
}

// A file as committed on refs/remotes/origin/main of a checkout (`source` is `<ref>:<path>`), with replace objects off.
// Throws.
function committedFileAt(root, source) {
  return execFileSync("git", ["-C", root, "--no-replace-objects", "show", source], {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true, timeout: PUSH_TIMEOUT_MS,
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: "1" },
  });
}
// ... of the checkout that holds this hook, only in wow-core's own layout (<root>/scripts/wow-hook.mjs; a consumer's copy
// sits in .claude/scripts and never serves the dispatcher). Throws.
function committedFile(source, self = SELF) {
  const root = ownCheckoutRoot(self);
  if (!root) throw new Error("not wow-core's own checkout");
  return committedFileAt(root, source);
}
const committedRoster = () => committedFile(ROSTER_SOURCE);
const committedState = () => committedFile(STATE_SOURCE);

export async function codexDispatcherAttachDecision({ input, cwd, env = process.env, run = runChild, roster = committedRoster, state = committedState }) {
  const target = dispatcherAttachTarget(input);
  if (!target) return null;
  // From here the call has the dispatcher's shape, so say on stderr why the hook leaves it to the classifier.
  const pass = (why) => { note(`push attach of ${target} left to the permission flow: ${why}`); return null; };
  try {
    const bus = trustedBusRepo(env);
    if (target.split("/")[1] === "wow-core" || !bus || target === bus.toLowerCase()) return pass("wow-core, the bus repository, or no trusted bus repository (WOW_BUS_REPO)");
    let fleet;
    try { fleet = rosterRepos(roster()); } catch (error) { return pass(`the roster could not be read from ${ROSTER_SOURCE} (${String(error?.message ?? error).split("\n")[0]})`); }
    if (!fleet.has(target)) return pass(`not a repository of the roster's Active masters on ${ROSTER_SOURCE}`);
    let recorded;
    try { recorded = stateDispatcher(state()); } catch (error) { return pass(`TASKS.md could not be read from ${STATE_SOURCE} (${String(error?.message ?? error).split("\n")[0]})`); }
    if (!recorded) return pass(`${STATE_SOURCE} does not name exactly one "Codex dispatcher: <session id>" (the wow-core master records it through a merged state PR; fetch origin after it merges)`);
    const who = await leasedAuthority({ cwd, env, run });
    if (!who.ok) return pass(who.why);
    const named = who.authority.codexDispatcher;
    if (!named) return pass(`the lease period has no ${CODEX_DISPATCHER_KEY}:<session id> entry`);
    if (suffixOf(named) !== who.mine) return pass(`the lease names another session as ${CODEX_DISPATCHER_KEY} (only the first entry of the account's lease period counts)`);
    if (suffixOf(recorded) !== who.mine) return pass(`${STATE_SOURCE} names another session as the Codex dispatcher`);
    return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow",
      permissionDecisionReason: `wow-core: this session is the lease-named Codex dispatcher (${CODEX_DISPATCHER_KEY}:${named}, account ${who.label}) and TASKS.md on origin/main records it; attaching the fleet repository ${target} with push access, to push codex/<slug>, is allowed (MODEL_ROUTING "Codex dispatch")` } };
  } catch (error) { return pass(String(error?.message ?? error).split("\n")[0]); }
}

// ---- children ----

function lastLines(text, n = 3) {
  return String(text ?? "").trim().split(/\r?\n/).filter(Boolean).slice(-n).join(" | ");
}

// Runs `node <script> ...args` with the hook JSON on stdin, under a hard deadline. On
// timeout the whole process tree is killed and the result returns at once — it does not
// wait for pipes a grandchild may still hold open.
function runChild(root, rel, args, input, timeoutMs, maxMs = Infinity) {
  const ms = Math.min(OVERRIDE_MS || timeoutMs, maxMs);
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, timeoutMs: ms, ...result });
    };
    let child;
    try {
      child = spawn(process.execPath, [path.resolve(root, rel), ...args], {
        cwd: root, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      resolve({ stdout, stderr, error });
      return;
    }
    const timer = setTimeout(() => {
      if (process.platform === "win32" && child.pid) {
        spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      } else {
        try { child.kill("SIGKILL"); } catch { /* ignore */ }
      }
      for (const stream of [child.stdin, child.stdout, child.stderr]) {
        try { stream?.destroy(); } catch { /* ignore */ }
      }
      settle({ timedOut: true });
    }, ms);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => settle({ error }));
    child.on("close", (code, signal) => settle({ code, signal }));
    child.stdin.on("error", () => { /* child exited before reading stdin */ });
    child.stdin.end(input);
  });
}

function parseJsonObject(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

// Maps one child's Stop result onto {kind, reason?, systemMessage?, stray?}.
function interpret(label, r) {
  if (r.error) return { kind: "error", detail: `${label} could not start: ${r.error.message}` };
  if (r.timedOut) return { kind: "error", detail: `${label} timed out after ${Math.round(r.timeoutMs / 1000)} s` };
  const out = r.stdout.trim();
  const err = r.stderr.trim();
  if (r.code === 2) {
    return { kind: "block", reason: err || out || `${label} blocked the stop (exit 2) without a reason.` };
  }
  if (r.code !== 0) {
    return { kind: "error", detail: `${label} exited ${r.code ?? r.signal}${err || out ? `: ${lastLines(err || out)}` : ""}` };
  }
  if (!out) return { kind: "pass" };
  let parsed = parseJsonObject(out);
  let stray = "";
  if (!parsed) {
    const lines = out.split(/\r?\n/);
    const last = parseJsonObject(lines[lines.length - 1].trim());
    if (last) { parsed = last; stray = lines.slice(0, -1).join("\n").trim(); }
  }
  if (!parsed) return { kind: "pass", stray: out };
  const systemMessage = typeof parsed.systemMessage === "string" && parsed.systemMessage ? parsed.systemMessage : undefined;
  if (parsed.decision === "block") {
    const reason = typeof parsed.reason === "string" && parsed.reason.trim() ? parsed.reason : `${label} blocked the stop without a reason.`;
    return { kind: "block", reason, systemMessage, stray };
  }
  const known = new Set(["decision", "reason", "systemMessage", "suppressOutput"]);
  const unknown = Object.keys(parsed).filter((key) => !known.has(key));
  if (unknown.length) stray = [stray, `ignored JSON fields: ${unknown.join(", ")}`].filter(Boolean).join("\n");
  return { kind: "pass", systemMessage, stray };
}

async function stop(root, input, tool) {
  const children = [
    ...((tool === "codex" || has(root, ".claude/handoff.config.json"))
      ? [{ label: "handoff gate", rel: ".claude/scripts/handoff/handoff-stop.mjs", args: [], ms: CHILD_MS.handoff }]
      : []),
  ].filter((child) => has(root, child.rel));
  const reasons = [];
  const messages = [];
  for (const child of children) {
    const run = await runChild(root, child.rel, child.args, input, child.ms);
    const result = interpret(child.label, run);
    if (run.stderr.trim() && result.kind !== "block") note(`${child.label} stderr: ${run.stderr.trim()}`);
    if (result.stray) note(`${child.label} stdout (not hook JSON): ${result.stray}`);
    if (result.systemMessage) messages.push(result.systemMessage);
    if (result.kind === "block") reasons.push(result.reason.trim());
    if (result.kind === "error") {
      note(`${result.detail} — stop allowed (fail-open)`);
      const command = ["node", child.rel, ...child.args].join(" ");
      messages.push(`wow-core Stop hook: ${result.detail}; the stop was allowed (fail-open). Run \`${command}\` by hand and fix it.`);
    }
  }
  if (reasons.length) {
    const out = { decision: "block", reason: reasons.join("\n\n") };
    if (messages.length) out.systemMessage = messages.join("\n");
    return JSON.stringify(out) + "\n";
  }
  if (messages.length) return JSON.stringify({ systemMessage: messages.join("\n") }) + "\n";
  return "";
}

// ---- session start ----

// A linked worktree reports its own folder as the top level, so name the project after the
// directory that holds the shared .git instead.
function projectName(root) {
  try {
    const common = execFileSync("git", ["-C", root, "rev-parse", "--path-format=absolute", "--git-common-dir"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true, timeout: 10_000,
    }).trim();
    if (path.basename(common).toLowerCase() === ".git") return path.basename(path.dirname(common));
  } catch { /* fall through */ }
  return path.basename(root);
}

function startupContract(root, routing) {
  try {
    const template = readFileSync(path.join(root, ".claude/templates/startup-contract.md"), "utf8").trim();
    if (template) return { text: template, shared: true };
  } catch { /* Older consumers may not have the shared contract yet. */ }
  // Compatibility only: defer all role/review routes to MODEL_ROUTING.
  return { text: `MODEL CHECK: once per session, follow ${routing} for role, tier, provider preference, review rounds and final verification; resolve model and reasoning effort via models.mjs from the registry. A launch with pinned model and effort counts as verified; do not request a relaunch for it. Otherwise verify once and request a relaunch on mismatch with -m <model> -c model_reasoning_effort=<effort>. Pin model AND effort on every child launch. Subscription-included routes only. ASK LAST: try your tools before asking the founder (PACE_CORE §5).`, shared: false };
}

// Codex-only orientation lines (Claude reads CLAUDE.md/AGENTS.md itself).
function codexOrientation(root, shared) {
  const instructions = has(root, "AGENTS.md")
    ? "AGENTS.md is this repo's instruction file"
    : has(root, "CLAUDE.md")
      ? "this repo has no AGENTS.md; CLAUDE.md is its instruction file (Codex reads it as the fallback)"
      : "this repo has no AGENTS.md; ask before assuming house rules";
  const genericFile = firstExisting(root, ["docs/LESSONS_GENERIC.md", "docs/fleet/LESSONS_GENERIC.md", "core/LESSONS_GENERIC.md"]);
  // The lessons store is split into LESSONS_*.md (index in LESSONS_GENERIC.md): name the directory
  // and let rg filter with -g, since PowerShell does not expand a shell glob for rg.
  const lessonsDir = genericFile ? path.posix.dirname(genericFile) : null;
  const builder = firstExisting(root, ["docs/BUILDER_CORE.md", "docs/fleet/BUILDER_CORE.md", "core/BUILDER_CORE.md"]);
  const skills = firstExisting(root, [".claude/skills", "skills"]);
  const lines = [
    `INSTRUCTIONS: ${instructions}. Skills are invoked as $name (for example $sweep, $review)${skills ? `; each skill's source is ${skills}/<name>/SKILL.md - read that file when Codex does not list the skill` : ""}.`,
  ];
  const orient = [];
  if (has(root, "TASKS.md")) orient.push("read TASKS.md In progress + Open only (Closed is archived)");
  if (has(root, "docs/PRODUCT.md")) orient.push("consult docs/PRODUCT.md when direction is in question");
  if (orient.length) lines.push(`ORIENTATION: ${orient.join("; ")}.`);
  const lessonPaths = [lessonsDir, has(root, "LESSONS.md") ? "LESSONS.md" : null].filter(Boolean);
  if (lessonPaths.length) lines.push(`LESSONS: before design/review work run rg -n -i '<task nouns>' -g 'LESSONS*.md' ${lessonPaths.join(" ")}; read hits and the always-on tier, never whole files.`);
  if (builder) lines.push(`Delegated builds follow ${builder}.`);
  if (!shared) lines.push("AFTER A COMPACTION OR RESUME: re-establish the working set (modified files, active DEC/LES/TASK ids, current sprint item) before continuing.");
  const gates = [
    has(root, ".claude/scripts/handoff/handoff-stop.mjs") ? "the handoff gate" : null,
  ].filter(Boolean);
  if (!shared) lines.push("Before ending the session, commit, push and rewrite the next-action line; run $sweep at milestones, phase seams and before an agent switch.");
  if (gates.length) lines.push(`The Stop hook runs ${gates.join(" and ")}: a block lists what to fix before you stop again.`);
  return lines;
}

const clip = (line, max = 220) => (line.length > max ? `${line.slice(0, max - 1)}…` : line);

// Required lines are never cut; optional lines are added in priority order while the line and
// character budgets hold, so health is trimmed first (it comes last).
export function composeBlock(required, optional, budget = BUDGET) {
  const out = [...required];
  let chars = out.join("\n").length;
  for (const raw of optional) {
    const line = clip(String(raw).replace(/\s+$/, ""));
    if (!line) continue;
    if (out.length + 1 > budget.lines || chars + 1 + line.length > budget.chars) continue;
    out.push(line);
    chars += 1 + line.length;
  }
  return out.join("\n");
}

async function healthLines(root, input) {
  const health = ".claude/scripts/health.mjs";
  if (!has(root, health)) return [];
  const run = await runChild(root, health, ["--brief"], input, CHILD_MS.health, CHILD_MS.health);
  if (run.error || run.timedOut || run.code !== 0) return [];
  return run.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function sessionStartOutput(tool, text) {
  if (tool === "codex") return `${text}\n`;
  return `${JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text } })}\n`;
}

async function sessionStart(root, payload, raw, tool, lane, cwd) {
  if (tool === "claude") writeMarker(root, payload.session_id, cwd);
  const source = typeof payload.source === "string" ? payload.source : "";
  if (source === "resume" || source === "compact") {
    // Re-state the spawn depth while the first prompt is still readable, so a rebuilt transcript keeps it (spawnDepth).
    let depthLine = "";
    if (tool === "claude" && typeof payload.transcript_path === "string" && payload.transcript_path) {
      try {
        const { depth, source: from } = readSpawnDepth(payload.transcript_path);
        if (from !== "fallback") depthLine = ` ${sessionDepthLine(depth)}`; // never make a guess permanent
      } catch { /* no depth to keep */ }
    }
    return sessionStartOutput(tool, `${RESUME_LINE}${depthLine}`);
  }
  const input = raw.trim() ? raw : "{}";
  const routing = firstExisting(root, ["docs/MODEL_ROUTING.md", "core/MODEL_ROUTING.md", "docs/fleet/MODEL_ROUTING.md"])
    ?? "the fleet routing table (wow-core core/MODEL_ROUTING.md)";
  const contract = startupContract(root, routing);
  let contractText = contract.text;
  // Live Codex lane runs 2026-10-05: the lane protocol owns close-out, not repo-wide gates.
  // A lane's model was pinned by the master at launch, and Codex cannot see its own model id:
  // the MODEL CHECK line made the first doctrine lane stop and ask for a relaunch, so lanes
  // get a statement instead of the check.
  if (lane) {
    contractText = contractText.replace(/^MODEL CHECK\b.*$/m, "MODEL: pinned by the master at launch (MODEL_ROUTING sub-orchestrator row); treat it as verified - do not stop to check it or ask for a relaunch.");
    contractText = contractText.replace(/\bthe model check\b/gi, "launch verification");
  }
  const required = [];
  if (tool === "codex") required.push(`${projectName(root)} session start (wow-core, Codex).`);
  required.push(...contractText.split(/\r?\n/));
  const aboveFrontier = tool === "claude" ? aboveFrontierNote(payload.model) : null;
  if (aboveFrontier) required.push(aboveFrontier);
  const optional = [...(tool === "codex" ? codexOrientation(root, contract.shared) : []), ...(await healthLines(root, input))];
  // Lines that must survive the budget (lane statement, project handoff context) are reserved
  // first; orientation and health then fill whatever room is left, health last.
  const reserved = [];
  if (lane) reserved.push(LANE_LINE);
  if (tool === "codex" || has(root, ".claude/handoff.config.json")) reserved.push(...(await handoffLines(root, input)));
  const room = {
    lines: BUDGET.lines - reserved.length,
    chars: BUDGET.chars - reserved.reduce((sum, line) => sum + line.length + 1, 0),
  };
  const text = [composeBlock(required, optional, room), ...reserved].join("\n");
  return sessionStartOutput(tool, text);
}

const LANE_LINE = "LANE: you are a lane sub-orchestrator; follow your lane protocol for delivery and close-out. The master verifies the lane; session-end gates do not run here.";
const HANDOFF_REL = ".claude/scripts/handoff/handoff-session-start.mjs";
const HANDOFF_POINTER = `full context: node ${HANDOFF_REL}`;

// The repo's handoff context, clipped to a few lines: the first two, the session-contract line
// when it would otherwise be cut, and a pointer to the full output. A project's context command
// can emit thousands of characters (one consumer ~13.6k); the startup block stays bounded.
export function clipHandoff(stdout) {
  const all = String(stdout ?? "").split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.trim());
  const lines = all.slice(0, 2).map((line) => clip(line, 160));
  const truncated = all.length > 2 || all.slice(0, 2).some((line) => line.length > 160);
  if (all.length > 2) {
    const contract = all.slice(2).reverse().find((line) => /^Session contract/i.test(line));
    if (contract) lines.push(clip(contract, 180));
  }
  if (truncated) lines.push(HANDOFF_POINTER);
  return lines;
}

async function handoffLines(root, input) {
  if (!has(root, HANDOFF_REL)) return [];
  const run = await runChild(root, HANDOFF_REL, [], input, CHILD_MS.sessionStart);
  if (run.stderr.trim()) note(`handoff session-start stderr: ${run.stderr.trim()}`);
  if (run.error || run.timedOut || run.code !== 0) {
    const why = run.error ? run.error.message : run.timedOut ? `timed out after ${Math.round(run.timeoutMs / 1000)} s` : `exit ${run.code ?? run.signal}`;
    note(`handoff session-start failed: ${why}`);
    return [clip(`(handoff session-start hook failed: ${why}; run \`node ${HANDOFF_REL}\` by hand.)`, 200), ...clipHandoff(run.stdout).slice(0, 2)];
  }
  return clipHandoff(run.stdout);
}

// ---- routine reads approved by the hook (design docs/reviews/2026-11-06-permission-prompts-design.md, step 2) ----
// A hook `allow` on Bash skips the auto-mode classifier (probe 2026-11-11, same cloud session: refused without it, ran
// with it), so the exact, fully parsed read commands below pass without a prompt. Settings carry no wildcard for them
// (a `*` in an allow entry matches spaces and slashes: review of #275/#276). Anything this grammar does not match
// returns null: no decision, never a deny and never an allow, so the host's normal flow runs as before.

// Words of a one-line command, or null when it is anything but plain words: an unquoted ; & | < > ( ) { } * ? [ ] ~ # !,
// a backslash, `$`, a backtick, a newline or an unbalanced quote means the shell would do more than pass the words on.
export function plainWords(command) {
  if (typeof command !== "string" || !command.trim() || /[\\$`\r\n\u0000]/.test(command)) return null;
  const words = [];
  let word = null;
  let quote = null;
  for (const ch of command) {
    if (quote) {
      if (ch === quote) quote = null; else word += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch; word ??= "";
    } else if (ch === " " || ch === "\t") {
      if (word !== null) { words.push(word); word = null; }
    } else if (/[;&|<>(){}*?\[\]~#!]/.test(ch)) {
      return null;
    } else word = (word ?? "") + ch;
  }
  if (quote) return null;
  if (word !== null) words.push(word);
  return words;
}

const allowResponse = (reason) => ({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow",
  permissionDecisionReason: `wow-core: ${reason}` } });
const SEARCH_PATH = /^search\/(?:code|repositories|issues|commits|users|topics|labels)(?:\?[A-Za-z0-9_.:@%=&,+\/~-]*)?$/;
const REPO_PATH = /^repos\/([A-Za-z0-9](?:-?[A-Za-z0-9])*)\/([A-Za-z0-9_.-]+)((?:\/[A-Za-z0-9_.:@,+~-]+)*)(?:\?[A-Za-z0-9_.:@%=&,+\/~-]*)?$/;
// Two layers for a fleet repository's endpoints (review 2026-11-11: a list of bad names keeps leaking, e.g.
// actions/organization-variables, secret-scanning/alerts). Layer 1: the path is the repository itself or starts with one
// of these resource families. Layer 2: no segment after the repository contains a name that returns values or unmasked output.
const ALLOWED_RESOURCES = new Set(["pulls", "issues", "commits", "contents", "branches", "compare", "check-runs", "check-suites", "statuses",
  "status", "actions", "labels", "releases", "git", "tags", "milestones", "rulesets", "rules"]);
const SENSITIVE_SEGMENT = /variables|secret|logs|hooks|keys|zip|tarball/i;
const UNSAFE_JQ = /\benv\b|\$ENV|\binputs?\b|input_filename|\$__|\bdebug\b|\bstderr\b/;

// `gh api ...` that can only be a GET of a fleet repository (or search): the grammar in the design.
export function ghApiReadDecision(words, fleet) {
  if (words[0] !== "gh" || words[1] !== "api") return null;
  let method = null;
  let endpoint = null;
  for (let i = 2; i < words.length; i++) {
    const w = words[i];
    if (w === "-X" || w === "--method") {
      if (method !== null || words[++i] !== "GET") return null;
      method = "GET";
    } else if (w === "--paginate") {
      continue;
    } else if (w === "--jq") {
      const expr = words[++i];
      if (typeof expr !== "string" || UNSAFE_JQ.test(expr)) return null;
    } else if (w === "-H") {
      if (!/^Accept: [A-Za-z0-9.+\/;=_ -]+$/.test(words[++i] ?? "")) return null;
    } else if (w === "--cache") {
      if (!/^\d{1,4}[smh]$/.test(words[++i] ?? "")) return null;
    } else if (w.startsWith("-") || endpoint !== null) {
      return null;
    } else endpoint = w;
  }
  if (endpoint === null || endpoint.split("?")[0].split("/").some((part) => part === ".." || part === ".")) return null;
  if (SEARCH_PATH.test(endpoint)) return allowResponse("`gh api` GET of search/... is allowed (routine read, design 2026-11-06)");
  const m = endpoint.match(REPO_PATH);
  if (!m || !fleet.has(`${m[1]}/${m[2]}`.toLowerCase())) return null;
  const rest = m[3].split("/").filter(Boolean);
  if (rest.length && !ALLOWED_RESOURCES.has(rest[0])) return null;
  if (rest.some((part) => SENSITIVE_SEGMENT.test(part))) return null;
  return allowResponse(`\`gh api\` GET of ${m[1]}/${m[2]} is allowed (fleet repository, routine read, design 2026-11-06)`);
}

export function readCommandDecision(command, { fleet = new Set() } = {}) {
  const words = plainWords(command);
  if (!words) return null;
  return ghApiReadDecision(words, fleet);
}

// The repositories whose GET reads are allowed: wow-core and the bus repository (WOW_BUS_REPO's owner), plus the Active
// masters of wow-core's roster as committed on origin/main (readable only in wow-core's own checkout; elsewhere, and on
// any error, the roster adds nothing and a read of a roster repository gets no decision).
function fleetForReads(env = process.env) {
  const fleet = new Set();
  const bus = trustedBusRepo(env);
  if (bus) { fleet.add(bus.toLowerCase()); fleet.add(`${bus.split("/")[0]}/${WOW_CORE_REPO_NAME}`.toLowerCase()); }
  try { for (const repo of rosterRepos(committedRoster())) fleet.add(repo); } catch { /* no roster here */ }
  return fleet;
}

// ---- dispatch ----

// root is null when the payload cwd is outside any wow-core consumer: the shell policy and marker
// refresh are skipped, but a `git -C <primary-checkout> commit` is still guarded against the
// TARGET repo's presence markers. workDir is where the shell policy and the bus children look: the
// payload cwd, or this hook's checkout when the cwd is that checkout's parent folder.
// Codex sends its shell payload without a tool_name: a payload with no name and a string command is its Bash.
const ROUTED_TOOL = (name, input) => name === "Bash" || ((name === undefined || name === null) && typeof input?.command === "string")
  || name === ADD_REPO_TOOL || isCreateSession(name) || isSetSessionTitle(name) || isConfirmTrust(name);

// A heredoc's body is text, not commands: a master writes PR bodies, commit messages and `To orchestrator:` comments
// that way, and their lines often name `pnpm verify` (review of #422). Same reading as withoutHeredocBodies in
// hooks/guard-bash-policy.mjs; copied, because that policy is loaded per install and this rule must not depend on it.
function suiteWithoutHeredocBodies(command) {
  let delimiter = null;
  return command.split(/(\r?\n)/).map((part) => {
    if (/^\r?\n$/.test(part)) return delimiter ? "" : part;
    if (delimiter) { if (part.trim() === delimiter) delimiter = null; return ""; }
    // `<<<` is a here-string, not a heredoc: it opens no body (delta review of #422).
    const match = /(?<!<)<<(?!<)-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(part);
    if (match) delimiter = match[2];
    return part;
  }).join("");
}

// Split only at shell operators outside quotes, then return dequoted words. This is deliberately a small recognizer,
// not a shell parser: it identifies commands the tripwire names without treating words inside `echo "..."` as commands.
function suiteSegments(command) {
  const source = suiteWithoutHeredocBodies(String(command ?? ""));
  const segments = [];
  let words = [], word = [], quote = null, escaped = false;
  const pushWord = () => { if (word.length) words.push(word.join("")); word = []; };
  const pushSegment = () => { pushWord(); if (words.length) segments.push(words); words = []; };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (escaped) { word.push(ch); escaped = false; continue; }
    if (ch === "\\" && quote !== "'") { escaped = true; continue; }
    if (quote) { if (ch === quote) quote = null; else word.push(ch); continue; }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === "\n" || ch === ";" || ch === "|" || (ch === "&" && source[i + 1] === "&")) {
      pushSegment();
      if ((ch === "|" && source[i + 1] === "|") || (ch === "&" && source[i + 1] === "&")) i++;
      continue;
    }
    if (/\s/.test(ch)) pushWord(); else word.push(ch);
  }
  pushSegment();
  return segments;
}

const TEST_FILE = /\.(?:test\.(?:ts|tsx|js|mjs)|spec\.(?:ts|js))$/i;
// Cheap questions to a runner, not runs (review of #422).
const SUITE_QUESTION = /^(?:--help|--version|--listTests)$/;
const SUITE_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=(.*)$/s;
function suiteForm(rawWords) {
  const words = [...rawWords];
  let i = 0, override = null;
  const takeAssignments = () => {
    while (i < words.length && SUITE_ASSIGNMENT.test(words[i])) {
      const match = words[i].match(SUITE_ASSIGNMENT);
      if (words[i].startsWith("WOW_MASTER_SUITE_REASON=")) override = match[1];
      i++;
    }
  };
  takeAssignments();
  while (["env", "time", "nice"].includes(words[i])) { i++; takeAssignments(); }
  if (words[i] === "timeout") { i++; if (i < words.length) i++; takeAssignments(); }
  const command = words[i];
  if (!command) return null;
  const rest = words.slice(i + 1);
  let form = null;
  if (rest.some((arg) => /(?:^|[/\\])ci-local\.sh$/i.test(arg))) form = "ci-local.sh";
  if (rest.some((arg) => /(?:^|[/\\])(?:\.claude[/\\])?templates[/\\]test-stack[/\\]verify\.mjs$/i.test(arg))) form = "test-stack verify.mjs";
  if (/(?:^|[/\\])ci-local\.sh$/i.test(command)) form = "ci-local.sh";
  if (/(?:^|[/\\])(?:\.claude[/\\])?templates[/\\]test-stack[/\\]verify\.mjs$/i.test(command)) form = "test-stack verify.mjs";

  const direct = (() => {
    if (["vitest", "jest"].includes(command)) return { name: command, args: rest };
    if (command === "playwright" && rest[0] === "test") return { name: "playwright test", args: rest.slice(1) };
    if (["npx", "bunx"].includes(command)) return rest[0] === "playwright" && rest[1] === "test"
      ? { name: "playwright test", args: rest.slice(2) } : ["vitest", "jest"].includes(rest[0]) ? { name: rest[0], args: rest.slice(1) } : null;
    if (["pnpm", "yarn"].includes(command) && ["exec", "dlx"].includes(rest[0])) return rest[1] === "playwright" && rest[2] === "test"
      ? { name: "playwright test", args: rest.slice(3) } : ["vitest", "jest"].includes(rest[1]) ? { name: rest[1], args: rest.slice(2) } : null;
    if (["yarn", "bun"].includes(command)) return rest[0] === "playwright" && rest[1] === "test"
      ? { name: "playwright test", args: rest.slice(2) } : ["vitest", "jest"].includes(rest[0]) ? { name: rest[0], args: rest.slice(1) } : null;
    return null;
  })();
  if (direct && !(["vitest", "jest"].includes(direct.name) && direct.args.some((arg) => TEST_FILE.test(arg)))) form = direct.name;

  if (["pnpm", "npm", "yarn", "bun"].includes(command)) {
    let p = 0;
    const valued = new Set(["--filter", "-F", "-C", "--dir", "--prefix", "--workspace"]);
    while (p < rest.length && rest[p].startsWith("-")) { const flag = rest[p++]; if (valued.has(flag)) p++; }
    if (rest[p] === "run") p++;
    const script = rest[p];
    const scriptArgs = rest.slice(p + 1);
    const named = script && (script === "verify" || script === "check" || script === "ci:local" || script === "test" || /^test[:-]/.test(script));
    // A test script given test file paths runs those files only, with or without `--` (pnpm passes both on).
    const isTest = script === "test" || /^test[:-]/.test(script ?? "");
    const oneFile = isTest && scriptArgs.some((arg) => TEST_FILE.test(arg));
    if (named && !oneFile) form = `${command} ${script}`;
  }
  if (form && rest.some((arg) => SUITE_QUESTION.test(arg))) return null;
  return form ? { form, override } : null;
}

export function masterSuiteDenial({ command, depth, env = {} }) {
  if (env.CLAUDE_CODE_REMOTE !== "true" || depth !== 0) return null;
  for (const segment of suiteSegments(command)) {
    const match = suiteForm(segment);
    if (!match) continue;
    if (match.override !== null && match.override.length >= 12) continue;
    const short = match.override !== null ? " The WOW_MASTER_SUITE_REASON value is too short; it must be at least 12 characters." : "";
    return `wow-core: ${match.form} is a whole-suite command, and a master runs no suites in its own container (PACE_CORE §2a, "Check runners"). Give the run to the lane that owns the PR, or start a check-runner session for it (CHECK_RUNNER_BRIEF.md); it posts the pnpm verify receipt on the PR, and the label guard reads that posted receipt.${short} To override this tripwire, put WOW_MASTER_SUITE_REASON=<at least 12 characters> in the segment's leading assignments.`;
  }
  return null;
}

function masterSuiteGuard(payload, env, tool) {
  if (tool !== "claude" || payload?.tool_name !== "Bash" || env?.CLAUDE_CODE_REMOTE !== "true") return null;
  try {
    // Match first and read the depth only on a hit: a compacted transcript is scanned whole (up to 512 MB), and this
    // runs before the shell policy, inside the watchdog's deadline for push and merge commands (review of #422).
    const command = payload?.tool_input?.command;
    if (!masterSuiteDenial({ command, depth: 0, env })) return null;
    return masterSuiteDenial({ command, depth: readSpawnDepth(payload?.transcript_path).depth, env });
  } catch {
    // Fail open: this is a habit tripwire, and an odd or unreadable transcript must never block a lane.
    return null;
  }
}
// How far this call's pre-tool-use got: run()'s watchdog and catch read it (one call per process).
const STAGE = { shellPolicyDecided: false };
async function preToolUse(root, payload, cwd, workDir = cwd, stops = {}, tool = "claude", env = process.env) {
  // The settings route every tool here ("*") for the old-account fence; everything else below is per tool.
  const fence = await fenceCheck({ toolName: payload?.tool_name, transcriptPath: payload?.transcript_path, cwd: workDir });
  // A refused mail or token call ran nothing: the mail guard does not count its tool_use (recordRefusedCall).
  if (fence.fenced) { recordRefusedCall(payload); return `${JSON.stringify(denyResponse(fence.reason))}\n`; }
  // Before the hard stops: the deny lists carry this tool too (the static backup), but its own reason says what to do.
  if (isConfirmTrust(payload?.tool_name)) return `${JSON.stringify(denyResponse(TRUST_REFUSAL))}\n`;
  if (typeof payload?.tool_name === "string" && payload.tool_name.startsWith("mcp__")) {
    const { deny, unreadable } = hardStopDeny(stops);
    const entry = hardStopEntry(payload.tool_name, deny);
    if (entry) { recordRefusedCall(payload); return `${JSON.stringify(denyResponse(hardStopReason(payload.tool_name, entry)))}\n`; }
    // A settings file that exists and cannot be read hides entries this call may match: fail closed, naming the file.
    if (unreadable.length) { recordRefusedCall(payload); return `${JSON.stringify(denyResponse(unreadableSettingsReason(payload.tool_name, unreadable[0])))}\n`; }
  }
  // The mail guard (SECURITY_CORE §1a): after the fence, the trust refusal and the hard stops (a call they refuse runs
  // nothing, so it records no marker, only its refused tool_use_id), before every other rule, on every tool (the "*"
  // wiring) and with no consumer root, so a consumer or comms copy runs it too. Not before the fence's bus read (review of
  // #278, L4): a marker is never removed, so it may be written only once every earlier refusal has passed; a mail call the
  // deadline lets through is marked by run() instead.
  const mailReason = mailGuard(payload, process.env, { tool });
  if (mailReason) return `${JSON.stringify(denyResponse(mailReason))}\n`;
  if (!ROUTED_TOOL(payload?.tool_name, payload?.tool_input)) return "";
  if (payload?.tool_name === ADD_REPO_TOOL) {
    const decision = busAttachDecision(payload.tool_input) ?? wowCoreAttachDecision(payload.tool_input)
      ?? await codexDispatcherAttachDecision({ input: payload.tool_input, cwd: workDir });
    return decision ? `${JSON.stringify(decision)}\n` : "";
  }
  if (isCreateSession(payload?.tool_name)) {
    return `${JSON.stringify(spawnDecision(payload, process.env, Date.now()))}\n`;
  }
  if (isSetSessionTitle(payload?.tool_name)) {
    const badTitle = titleDenial(payload?.tool_input?.title);
    return badTitle ? `${JSON.stringify(denyResponse(badTitle))}\n` : "";
  }
  const command = payload?.tool_input?.command;
  const leaseAccount = leaseAccountGuard(command);
  if (leaseAccount) return `${JSON.stringify(denyResponse(leaseAccount))}\n`;
  const authorityWrite = await leaseAuthorityGuard({ command, cwd: workDir });
  if (authorityWrite) return `${JSON.stringify(denyResponse(authorityWrite))}\n`;
  const suiteReason = masterSuiteGuard(payload, env, tool);
  if (suiteReason) return `${JSON.stringify(denyResponse(suiteReason))}\n`;
  if (root) touchMarker(root, payload.session_id);
  // The shell policy carries the merge and send stops. It is taken from this hook's own install first (the checkout that
  // holds this script), then from the cwd's repository: a repository the shell has moved into can neither swap in its own
  // policy (a no-op copy would switch the stops off) nor lock every Bash call by lacking one (review round 2 on #340, M1).
  // Where the install ships the policy (a full consumer, stamped .claude/wow-core.version, or wow-core itself), its absence,
  // an import failure or a throw is a refusal, never a pass (round 1, F3). Only Bash is refused: Edit and Write still work,
  // so the session can restore the file. A `lessons` consumer ships no policy, and a comms consumer is no consumer here
  // (root is null): neither is refused. A user-level copy takes the policy copied beside it, never the cwd's repository's (below). The install's
  // policy applies wherever the shell is, also in a plain folder or an unstamped repository (root is null there; deferred by
  // the review of #340), so moving out of the consumer cannot switch the merge and send stops off.
  const POLICY = [".claude/hooks/guard-bash-policy.mjs", "hooks/guard-bash-policy.mjs"];
  const install = stops.own ?? null;
  const ships = (dir) => Boolean(dir) && (has(dir, ".claude/wow-core.version") || isWowCore(dir));
  // An install with no checkout (the user-level Codex copy in ~/.codex/wow-core) has the policy that scripts/install.ps1 copied
  // beside this script, and only that one: the cwd's repository is attacker-influenced input, so it never supplies the policy
  // (a planted copy would also run at import). Follow-up to #342 "Not done".
  const installDir = install ?? path.dirname(SELF);
  const BESIDE = "guard-bash-policy.mjs";
  const installPolicy = firstExisting(installDir, install ? POLICY : [BESIDE]);
  const expected = install ? ships(install) : ships(root);
  // An install that ships the policy never falls back to the cwd's copy: its own missing file is the refusal below.
  const rootPolicy = install && !installPolicy && root && !expected ? firstExisting(root, POLICY) : null;
  const policyBase = installPolicy ? installDir : root;
  const policy = installPolicy ?? rootPolicy;
  const policyUnavailable = (why, base, rel) => {
    const how = !install && base === installDir
      ? "re-run scripts/install.ps1 from wow-core, which copies the policy beside this hook"
      : `from a terminal in ${toPosix(base)}, \`git checkout -- ${rel}\`), or re-sync that checkout from wow-core.`;
    const ending = !install && base === installDir ? `${how}).` : how;
    return `${JSON.stringify(denyResponse(`wow-core: the shell policy is unavailable (${why}), so this Bash call is refused: the merge and send stops cannot run without it. Restore ${toPosix(path.join(base, rel))} (Edit or Write still work; ${ending}`))}\n`;
  };
  if (policy) {
    try {
      const { evaluate, response } = await import(pathToFileURL(path.resolve(policyBase, policy)).href);
      const reason = evaluate(command, workDir);
      if (reason) return `${JSON.stringify(response(reason))}\n`;
    } catch (error) {
      const why = String(error?.message ?? error).split("\n")[0].slice(0, 160);
      note(`bash policy failed, refusing the call: ${why}`);
      return policyUnavailable(`${policy} failed: ${why}`, policyBase, policy);
    }
  } else if (expected) {
    note("bash policy missing, refusing the call");
    if (!install) return policyUnavailable("guard-bash-policy.mjs is missing beside this hook", installDir, BESIDE);
    return policyUnavailable("guard-bash-policy.mjs is missing", install, isWowCore(install) ? "hooks/guard-bash-policy.mjs" : ".claude/hooks/guard-bash-policy.mjs");
  }
  // The merge and send stops have decided (none applied or none was due). What follows is the shared-tree guard, which
  // refuses on its own failures, and the push check, whose lease read is fail-open by contract: so run()'s failure paths
  // stop denying push and merge commands from here on.
  STAGE.shellPolicyDecided = true;
  const guard = guardSharedTree({ command, sid: payload.session_id, cwd, workDir });
  for (const warning of guard.warnings) note(warning);
  if (guard.reason) return `${JSON.stringify(denyResponse(guard.reason))}\n`;
  const pushReason = await pushCheck({ command, cwd: workDir, fresh: fence.fresh, transcriptPath: payload?.transcript_path, leaseAccount: fence.account, leaseFailed: fence.leaseFailed });
  if (pushReason) return `${JSON.stringify(denyResponse(pushReason))}\n`;
  // Last, so no deny above is ever overridden: a routine read the grammar fully parsed is allowed (no decision otherwise).
  const read = readCommandDecision(command, { fleet: fleetForReads() });
  return read ? `${JSON.stringify(read)}\n` : "";
}

export async function dispatch(mode, raw, tool, { viaParent = false, env = process.env } = {}) {
  const payload = parsePayload(raw);
  const cwd = typeof payload.cwd === "string" && payload.cwd && existsSync(payload.cwd) ? payload.cwd : process.cwd();
  const found = findRoot(cwd);
  const own = hookCheckoutRoot();
  // The copy wired into the parent folder acts only in a turn whose project is that folder (no hook runs twice).
  if (viaParent && !parentWiringApplies({ own, found, env })) return "";
  // A cwd that is this hook's checkout's parent folder (no repository there) resolves to that checkout, so a turn that
  // starts in the parent gets the same root, shell policy, markers and Stop gate as one started in the checkout.
  const fromParent = !found && Boolean(own) && sameDir(path.dirname(own), cwd);
  const repoRoot = fromParent ? own : found;
  const root = repoRoot && isConsumer(repoRoot) ? repoRoot : null;
  const workDir = fromParent ? own : cwd;
  // Keep the parent folder wired for turns that start there: from the checkout's own wiring (the host's project is the
  // checkout and the cwd is in it; a by-hand run must pass CLAUDE_PROJECT_DIR=<checkout>, so a script or an attached
  // repository's hook cannot make the wrong checkout the owner), and from the parent wiring itself, so a session whose
  // turns all start in the parent still follows the checkout's settings (ownership limits that write to this checkout's file).
  const seeding = !viaParent && sameDir(found, own) && sameDir(env.CLAUDE_PROJECT_DIR, own);
  if (tool === "claude" && (mode === "pre-tool-use" || mode === "session-start") && (seeding || viaParent)) ensureParentHooks({ root: own, env, create: seeding });
  if (mode === "pre-tool-use") return preToolUse(root, payload, cwd, workDir, { own, repoRoot, parentTurn: viaParent || fromParent }, tool, env);
  if (!root) return "";
  switch (mode) {
    case "post-tool-use":
    case "post-tool-use-failure": {
      const reason = noProgress({ root, sid: payload.session_id, command: payload?.tool_input?.command, failed: mode === "post-tool-use-failure" });
      if (reason) return `${JSON.stringify({ decision: "block", reason })}\n`;
      return "";
    }
    case "session-end":
      removeSessionFiles(root, payload.session_id);
      return "";
    case "session-start":
      return sessionStart(root, payload, raw, tool, isLane(root), cwd);
    case "stop":
      if (isLane(root)) return "";
      // A fenced session cannot act, so the handoff gate would only make it spend more turns on the old account.
      if ((await fenceCheck({ toolName: "Stop", transcriptPath: payload?.transcript_path, cwd: workDir })).fenced) return "";
      return stop(root, raw.trim() ? raw : "{}", tool);
    default:
      return "";
  }
}

// The calls whose failure must not fall back to the host's normal flow: if the hook cannot finish in time, or breaks,
// confirm_repository_trust is DENIED (fail closed), and so is a command that names BWS_PROD_TOKEN (the mail guard,
// SECURITY_CORE §1a), at any stage. So is a Bash git push or merge command, the two shell hard stops (deferred by the review
// of #340), while the shell policy has not yet decided; the other calls, and the push or merge after the policy has run,
// fail open as before.
const denyTrustOnFailure = (why) => `${JSON.stringify(denyResponse(`wow-core: confirm_repository_trust is refused: the trust gate ${why}, so it fails closed (COMMS_CORE §1).`))}\n`;

const denyTokenOnFailure = (why) => `${JSON.stringify(denyResponse(tokenFailClosed(`the hook ${why}`)))}\n`;

const denyShellOnFailure = (why) => `${JSON.stringify(denyResponse(`wow-core: this shell call is refused: the hook ${why}, so a git push or merge command fails closed (the push and merge stops cannot be checked; AGENTS.md rule 3). Retry the call; if it keeps failing, restore the hook (re-sync this checkout from wow-core) or hand the push or merge to the founder. Only push and merge commands are refused this way (a gh api call to a pulls/<n>/merge path included, whatever its method).`))}\n`;

export async function run(forcedTool) {
  const mode = process.argv[2];
  if (!MODES.includes(mode)) {
    note(`unknown mode '${mode ?? ""}'; doing nothing`);
    finish("");
    return;
  }
  // Known limit (review 2026-11-04): the tool name is in the stdin payload, so a hook that hangs before stdin
  // arrives cannot know it is the trust call (or a push or merge) and fails open like every other tool (the watchdog below allows). That
  // outcome is the host's normal permission flow, not an allow: the settings' permissions.deny refuses the tool there
  // too, and the founder, who answers any card, declines every one (COMMS_CORE §1). A hook that crashes before this
  // line (a syntax error) never reaches this code: with onFailure block on the wired PreToolUse entry the host blocks
  // the call, whatever the tool.
  let trustCall = false;
  let tokenCall = null;
  let shellStop = false;
  let mailCall = null;
  // A push or merge command is denied on failure only until the shell policy (the merge and send stops) has decided; the
  // lease checks after it (shared-tree guard, push check) keep their fail-open contract, so a bus outage never refuses a push.
  const denyShell = () => shellStop && !STAGE.shellPolicyDecided;
  // A token command is denied on failure at any stage (the mail guard; its refused tool_use is not counted as use). A mail
  // tool fails open there, so it records the session's mail marker first (review of #278, L4).
  const failClosed = (why) => {
    if (trustCall) return denyTrustOnFailure(why);
    if (tokenCall) { recordRefusedCall(tokenCall); return denyTokenOnFailure(why); }
    if (denyShell()) return denyShellOnFailure(why);
    if (mailCall) markMailUnchecked(mailCall);
    return "";
  };
  const failing = () => (trustCall ? "denying the trust call (fail-closed)" : tokenCall ? "denying the token command (fail-closed)"
    : denyShell() ? "denying the push or merge command (fail-closed)" : "fail-open");
  const watchdog = setTimeout(() => {
    note(`${mode} exceeded its ${DEADLINE_MS[mode] / 1000} s deadline; ${failing().replace("fail-open", "allowing (fail-open)")}`);
    finish(failClosed(`exceeded its ${DEADLINE_MS[mode] / 1000} s deadline`));
  }, DEADLINE_MS[mode]);
  watchdog.unref();
  try {
    const raw = await readStdin();
    const parsed = parsePayload(raw);
    trustCall = mode === "pre-tool-use" && isConfirmTrust(parsed?.tool_name);
    // Known before anything that can hang or throw: a token command and a push or merge command are also refused on failure.
    tokenCall = mode === "pre-tool-use" && !trustCall && usesProdToken(parsed?.tool_name, parsed?.tool_input) ? parsed : null;
    shellStop = mode === "pre-tool-use" && !trustCall && isHardStopShell(parsed);
    mailCall = mode === "pre-tool-use" && isMailTool(parsed?.tool_name) ? parsed : null;
    const tool = forcedTool ?? detectTool(process.argv, process.env, parsed);
    finish(await dispatch(mode, raw, tool, { viaParent: process.argv.includes(VIA_PARENT) }));
  } catch (error) {
    note(`internal error, ${failing()}: ${String(error?.stack ?? error).split("\n")[0]}`);
    finish(failClosed("hit an internal error"));
  }
}

// Both sides by real path: SELF comes from import.meta.url, which node resolves through symlinks, while argv[1] is only
// made absolute, so a CLAUDE_PROJECT_DIR that goes through a symlink would never match and run() would be skipped, exit 0
// with no output, every hard stop off (security review 2026-11-14, F1). realpathSync.native also unifies Windows 8.3 names.
const realFile = (file) => { try { return realpathSync.native(file); } catch { try { return realpathSync(file); } catch { return path.resolve(file); } } };
if (process.argv[1] && realFile(process.argv[1]) === realFile(SELF)) await run();
