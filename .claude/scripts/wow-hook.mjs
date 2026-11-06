#!/usr/bin/env node
// wow-core — the ONE hook dispatcher for Claude Code and Codex. Source of truth: wow-core
// scripts/wow-hook.mjs; consumers receive it by sync as .claude/scripts/wow-hook.mjs, and
// scripts/install.ps1 copies it (with the thin scripts/codex-hook.mjs wrapper) to
// ~/.codex/wow-core/ for the user-level Codex hooks. Edit it HERE; never in a consumer or
// in the installed copy.
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
//                   source resume/compact: ONE short line.
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
//                   Bash: a lease write must name WOW_ACCOUNT_LABEL; hooks/guard-bash-policy.mjs, then the shared-tree commit guard
//                   (BLOCK `git commit` in the PRIMARY checkout while another live session
//                   holds it; worktrees and solo sessions are never blocked), then the push
//                   check (`git push` in any form, with WOW_ACCOUNT_LABEL set: DENY when the
//                   newest account lease, `bus.mjs lease --json`, names another account, so a
//                   session left on the old account stops itself; FAIL OPEN with one stderr
//                   line when the label is unset or the bus cannot be read in 5 s). Deny JSON.
//                   mcp__claude-code-remote__add_repo: ALLOW when the call is exactly {owner,
//                   repo} or {repo: "owner/name"} naming the repository in WOW_BUS_REPO; files
//                   the session can edit are never read. In wow-core's own checkout also the Codex
//                   dispatcher's push attach of a roster repository (codexDispatcherAttachDecision).
//                   Anything else gets no decision: the host's normal permission flow runs.
//                   mcp__claude-code-remote__confirm_repository_trust: ALLOW only for the lease-named
//                   master of a project the roster lists under "Needs the founder's PC" (trustGate:
//                   WOW_ACCOUNT_LABEL is the leased account's AND the period's first lease entry for
//                   that project is this session, CLAUDE_CODE_REMOTE_SESSION_ID), or for the period's
//                   first wow-core entry in wow-core's own checkout (founder 2026-11-06); DENY for everything
//                   else and whenever that cannot be established (fail CLOSED), citing COMMS_CORE §1.
//                   Founder 2026-11-06, "Masters use PC directly"; replaces the PC helper of 2026-11-04.
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
// The dispatcher's own errors fail open too (exit 0, stderr note), and every child and the
// dispatcher itself run under a deadline below the host's hook timeout.
//
// Environment (tests): WOW_HOOK_CHILD_TIMEOUT_MS (alias WOW_CODEX_HOOK_CHILD_TIMEOUT_MS)
// overrides every child timeout; WOW_SESSION_MARKER_TTL_HOURS bounds peer-marker age.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  closeSync, existsSync, linkSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, realpathSync, renameSync, rmSync, statSync, utimesSync, writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
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
export const RESUME_LINE = "wow-core: restore the working set (modified files, active ids, current task); the model check is already done.";
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
// Compared after realpath: the hook's own path is the real one (node resolves the main module), while a payload cwd or
// CLAUDE_PROJECT_DIR may go through a symlink or, on Windows, an 8.3 short name (RUNNER~1).
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
  try { owner = JSON.parse(readFileSync(path.join(dir, ".claude", "settings.json"), "utf8"))?.[PARENT_OWNER_KEY]?.checkout ?? null; } catch { /* no parent file */ }
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
// else is copied: no allow, ask or defaultMode, status line or project-owned hook. Ownership: the file carries PARENT_OWNER_KEY naming the checkout; a file without it is never touched
// (one warning line per container). First checkout wins: a file owned by another checkout is left alone, silently, so a
// second repository in the same session never replaces the first's wiring; only the owning checkout rewrites it, and
// only when its derived entries change. One exception (review 2026-11-06, M2): a consumer's seeding call takes over a
// file owned by a wow-core checkout or by a checkout that no longer exists, because consumers own the parent (the fleet
// setup script seeds them first, and a master session's primary repository is its project); otherwise wow-core's copy
// would decide a consumer master's turns. A failure prints one line and the hook carries on.
export const PARENT_OWNER_KEY = "$wow-core-parent-hooks";
export const VIA_PARENT = "--via-parent";
const DISPATCHER_COMMAND = /^node\s+(?:"\$CLAUDE_PROJECT_DIR\/((?:\.claude\/)?scripts\/wow-hook\.mjs)"|((?:\.claude\/)?scripts\/wow-hook\.mjs))\s+([a-z-]+)(?:\s+--tool\s+claude)?$/;
const SAFE_PATH = /^[A-Za-z0-9._@+~/: -]+$/; // the path goes inside double quotes in a shell command: no $, `, ", \ or !
const toPosix = (p) => p.replace(/\\/g, "/");

// The parent's hooks object for the checkout's settings text: only this hook's own entries, rewritten by absolute path.
export function parentHooksFor(settingsText, root, self = SELF) {
  const settings = JSON.parse(settingsText);
  const out = {};
  for (const [event, groups] of Object.entries(settings?.hooks ?? {})) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      const hooks = [];
      for (const hook of Array.isArray(group?.hooks) ? group.hooks : []) {
        const m = hook?.type === "command" && typeof hook.command === "string" ? hook.command.trim().match(DISPATCHER_COMMAND) : null;
        if (!m || !MODES.includes(m[3]) || !sameDir(path.resolve(root, m[1] ?? m[2]), self)) continue;
        hooks.push({ type: "command", command: `node "${toPosix(self)}" ${m[3]} --tool claude ${VIA_PARENT}`, ...(Number.isFinite(hook.timeout) ? { timeout: hook.timeout } : {}) });
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
export function mcpRuleParts(name) {
  if (typeof name !== "string" || !name.startsWith("mcp__")) return null;
  const rest = name.slice("mcp__".length);
  const cut = rest.indexOf("__");
  // Plugin servers are mcp__plugin_<plugin>_<server> (plugin names are kebab-case, so the lazy match stops at the first
  // underscore after the plugin name). Only the -<hex> instance suffix has been seen live; other shapes (_2, (2)) are not
  // covered, and an over-strip can only add a deny, never remove one.
  const server = (cut < 0 ? rest : rest.slice(0, cut)).toLowerCase().replace(/^plugin_[a-z0-9-]+?_/, "").replace(/^claude_ai_/, "").replace(/-[0-9a-f]+$/, "");
  const tool = cut < 0 ? "*" : rest.slice(cut + 2).toLowerCase();
  return server && tool ? { server, tool } : null;
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
// settings file that cannot be read or parsed adds nothing.
function hardStopDeny({ own, repoRoot, parentTurn }) {
  const deny = [];
  for (const root of [...new Set([own, repoRoot].filter(Boolean))]) {
    try {
      const text = readFileSync(path.join(root, ".claude", "settings.json"), "utf8");
      deny.push(...(parentTurn && root === own ? parentDenyUnion(text, own) : parentDenyFor(text)));
    } catch { /* adds nothing */ }
  }
  return deny;
}

export const hardStopReason = (toolName, entry) => `wow-core: ${toolName} is a hard stop: it matches the deny entry ${entry}, which covers every account and instance of that connector (permissions.deny; the founder's hard stops, 2026-11-05: never send, post or invite, never pay or accept terms, never delete or publish without his yes). The founder does this himself: prepare a draft or the exact step and ask him.`;

// The parent file's deny list: the owner's list exactly, then each new entry of every other existing primary checkout directly
// under the parent that has wow-core wiring (a consumer's .claude/scripts/wow-hook.mjs or wow-core's scripts/wow-hook.mjs),
// in folder order, each once. Several checkouts share one container's parent folder, and a parent turn must keep every
// one's hard stops (review 2026-11-06, Strale orchestrator, for #262). A union can only narrow; the hook entries stay
// the owner's. A sibling whose settings cannot be read or parsed adds nothing.
export function parentDenyUnion(ownText, root) {
  const deny = parentDenyFor(ownText); // exactly, as before: a single checkout's parent file is unchanged
  const seen = new Set(deny);
  let names = [];
  try { names = readdirSync(path.dirname(root)).sort(); } catch { /* the owner's list alone */ }
  for (const name of names) {
    const dir = path.join(path.dirname(root), name);
    if (sameDir(dir, root) || !(has(dir, ".claude/scripts/wow-hook.mjs") || (has(dir, "scripts/wow-hook.mjs") && isWowCore(dir)))) continue;
    let list;
    try {
      if (!statSync(path.join(dir, ".git")).isDirectory()) continue;
      list = parentDenyFor(readFileSync(path.join(dir, ".claude", "settings.json"), "utf8"));
    } catch { continue; }
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
    try { existing = readFileSync(file, "utf8"); } catch (error) { if (error?.code !== "ENOENT") throw error; }
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
    const checkoutText = readFileSync(path.join(root, ".claude", "settings.json"), "utf8");
    const hooks = parentHooksFor(checkoutText, root, self);
    const deny = parentDenyUnion(checkoutText, root);
    if (existing === null && !Object.keys(hooks).length) return { status: "skipped", file };
    // A consumer whose settings wire no wow-hook entry would take over and leave the parent with no hook at all.
    if (takeover && !Object.keys(hooks).length) return { status: "other-checkout", file };
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

// A command start (line start, ; & | or a subshell paren), optionally prefixed by `env`/`command`
// and VAR=value assignments (`GIT_EDITOR=true git commit`), then `git ... commit`.
const GIT_COMMIT = /(?:^|[;&|(])\s*(?:(?:env|command)\s+)?(?:[A-Za-z_]\w*=(?:"[^"\r\n]*"|'[^'\r\n]*'|\S*)\s+)*git(?:\.exe)?(?<args>\s[^\r\n;&|]*\bcommit\b[^\r\n;&|]*)/ims;

// The directory the command's `git ... commit` actually targets (`git -C <path>` resolved
// against the payload cwd), or null when the command has no git commit.
export function commitProbeDir(command, cwd) {
  const match = GIT_COMMIT.exec(String(command ?? ""));
  if (!match) return null;
  let before = match.groups.args;
  const at = before.search(/commit/i);
  if (at >= 0) before = before.slice(0, at);
  let probe = path.resolve(cwd);
  for (const found of before.matchAll(/(?:^|\s)-C(?:\s+|=)(?:"([^"]+)"|'([^']+)'|(\S+))/g)) {
    const target = found[1] ?? found[2] ?? found[3];
    probe = path.isAbsolute(target) ? path.resolve(target) : path.resolve(probe, target);
  }
  return probe;
}

export function guardSharedTree({ command, sid, cwd, env = process.env, now = Date.now() }) {
  const result = { reason: null, warnings: [] };
  const probe = commitProbeDir(command, cwd);
  if (!probe) return result;
  const root = findRoot(probe, env);
  if (!root || isLinkedWorktree(root)) return result; // not a repo, or a worktree: the safe path
  const dir = sessionsDir(root);
  if (!existsSync(dir)) return result;
  touchMarker(root, sid);
  let ttlHours = 4;
  const configured = env.WOW_SESSION_MARKER_TTL_HOURS;
  if (configured !== undefined && String(configured).trim() !== "") {
    const value = Number(configured);
    if (Number.isFinite(value) && value > 0) ttlHours = value;
    else result.warnings.push(`WARNING (multi-session safeguard): invalid WOW_SESSION_MARKER_TTL_HOURS='${configured}'; using default 4 h.`);
  }
  const mine = safeId(sid);
  const peers = [];
  let names = [];
  try { names = readdirSync(dir).filter((name) => name.endsWith(".lock")).sort(); } catch { return result; }
  for (const name of names) {
    const id = name.slice(0, -".lock".length);
    if (id === mine) continue;
    let ageHours;
    try { ageHours = (now - statSync(path.join(dir, name)).mtimeMs) / 3_600_000; } catch { continue; }
    if (ageHours >= ttlHours) {
      result.warnings.push(`WARNING (multi-session safeguard): stale marker '${name}' in '${root}' is older than the ${ttlHours} h TTL; ignoring it and allowing the commit.`);
      continue;
    }
    peers.push(id);
  }
  if (peers.length) {
    result.reason = `BLOCKED (multi-session safeguard): another agent session is active in this PRIMARY checkout (${root}). Peer session(s): ${peers.join(", ")}. Two sessions sharing one tree clobber each other's commits and swap HEAD (GLES-016). Isolate: create a worktree (git worktree add ../<name> -b <branch>) and commit there. Stale markers are ignored after ${ttlHours} h (WOW_SESSION_MARKER_TTL_HOURS).`;
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

export const SPAWN_LIMITS = Object.freeze({ perSession: 10, perContainerDay: 25, maxDepth: 2 });
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

// The roster's fixed PC prompt (docs/fleet-roster.md "A master's PC session" step 3), as a master sends it.
const PC_JOB_PROMPT = /^Run git fetch and git checkout --detach [0-9a-f]{7,40}, read docs\/lanes\/pc\/[a-z0-9-]+-brief\.md there, do that one job; report on the PR of \S+ with To orchestrator: comments; end\.$/;
export function spawnDecision(payload, env = process.env, now = Date.now()) {
  try {
    const sid = safeId(payload?.session_id);
    const transcript = payload?.transcript_path;
    if (!sid || typeof transcript !== "string" || !transcript) throw new Error("no session id or transcript path in the hook payload");
    const depth = depthOf(firstPromptText(transcript));
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
    // A master's PC session (create_session on its project's bridge environment with the roster's fixed PC prompt,
    // docs/fleet-roster.md "A master's PC session") does not count toward the per-session cap (founder 2026-11-06,
    // "yes": short PC jobs used up the Strale orchestrator's 10 starts and it handed the work to him); the PC limits
    // them (PACE_CORE §2a, two heavy jobs) and the per-container day cap, depth and tags still apply.
    // Only a master (depth 0) starts PC sessions (roster), and only the whole fixed prompt counts, depth tag removed.
    const pcJob = depth === 0 && typeof input.environment_id === "string" && input.environment_id !== ""
      && PC_JOB_PROMPT.test(String(input.prompt ?? "").replace(DEPTH_TAG, "").trim());
    const base = env.WOW_SPAWN_DIR || path.join(os.homedir(), ".wow-core", "spawn");
    const container = safeId(env.CLAUDE_CODE_CONTAINER_ID) || safeId(os.hostname()) || "local";
    const today = new Date(now).toISOString().slice(0, 10);
    pruneOldDays(base, today);
    const sessionSlot = pcJob ? null : claimSlot(path.join(base, `session-${sid}`), SPAWN_LIMITS.perSession);
    if (!pcJob && !sessionSlot) return denyResponse(`wow-core: this session has started ${SPAWN_LIMITS.perSession} sessions, the cap (founder 2026-11-01). Use a subagent, or ask the founder.`);
    let daySlot;
    try { daySlot = claimSlot(path.join(base, `container-${container}-${today}`), SPAWN_LIMITS.perContainerDay); }
    catch (error) { if (sessionSlot) rmSync(sessionSlot, { force: true }); throw error; }
    if (!daySlot) {
      if (sessionSlot) rmSync(sessionSlot, { force: true });
      return denyResponse(`wow-core: this container has started ${SPAWN_LIMITS.perContainerDay} sessions today (UTC ${today}), the cap (founder 2026-11-01). Use a subagent, or ask the founder.`);
    }
    const prompt = String(input.prompt ?? "").replace(DEPTH_TAG, "").trimEnd();
    // The archive tag (founder 2026-11-02): every session started here is a task the starter
    // archives when it is done, and the sweep archives it if the starter does not. The caller
    // cannot choose.
    const tags = (Array.isArray(input.tags) ? input.tags : []).filter((t) => typeof t === "string" && !ARCHIVE_TAGS.includes(t));
    const updatedInput = { ...input, prompt: `${prompt}${prompt ? "\n\n" : ""}[wow-spawn-depth: ${childDepth}]`,
      tags: [...tags, "wow-task"] };
    return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow",
      permissionDecisionReason: `wow-core: ${pcJob ? "PC job (not counted toward the per-session cap)" : `session start ${Number(path.basename(sessionSlot)) + 1}/${SPAWN_LIMITS.perSession} for this session`}, ${Number(path.basename(daySlot)) + 1}/${SPAWN_LIMITS.perContainerDay} for this container today, child depth ${childDepth}`,
      updatedInput } };
  } catch (error) {
    return denyResponse(`wow-core: the session-start cap could not check this call (${error?.message ?? error}), so it is refused (fail closed). Use a subagent, or ask the founder.`);
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
// Words that may stand before `git` in a command position: shell keywords and launchers.
const LAUNCHER = new Set(["env", "command", "sudo", "exec", "nohup", "time", "timeout", "nice", "ionice", "xargs", "if", "elif", "while", "until",
  "then", "do", "else", "!", "bash", "sh", "zsh", "dash", "-c", "-lc", "-ec", "-e"]);
const launcherMaterial = (word) => LAUNCHER.has(word) || /^[A-Za-z_]\w*=/.test(word) || /^-/.test(word) || /^\d+(?:\.\d+)?[smhd]?$/.test(word);

// True when any segment of the command runs `git [global options] push`. Quotes are dropped first, so
// `bash -c "cd x && git push"` is seen; every word before `git` must be a launcher, a keyword, an
// option, a duration or an assignment, so a commit message that mentions "git push" is not. A quoted
// value of git's `-c` (`-c k='a b'`) is squeezed into one word first.
export function isGitPush(command) {
  if (typeof command !== "string" || !/push/.test(command)) return false;
  const squeezed = command
    .replace(/=(["'])((?:(?!\1)[^])*)\1/g, (_, q, inner) => `=${inner.replace(/\s+/g, "_")}`)
    .replace(/(\s-c\s+)(["'])((?:(?!\2)[^])*)\2/g, (whole, lead, q, inner) =>
      /^[\w.-]+=/.test(inner) && !/\bgit\b/.test(inner) ? `${lead}${inner.replace(/\s+/g, "_")}` : whole);
  const flat = squeezed.replace(/\$\(|[`"'(){}]/g, " ");
  for (const segment of flat.split(/[;&|\r\n]+/)) {
    const tokens = segment.split(/\s+/).filter(Boolean);
    for (let i = 0; i < tokens.length; i++) {
      if (!/^(?:.*[\\/])?git(?:\.exe)?$/i.test(tokens[i])) continue;
      if (!tokens.slice(0, i).every(launcherMaterial)) continue;
      let j = i + 1;
      while (j < tokens.length && tokens[j].startsWith("-")) {
        j += GIT_GLOBAL_WITH_VALUE.has(tokens[j]) ? 2 : 1;
      }
      if (tokens[j] === "push") return true;
    }
  }
  return false;
}

// The newest lease as bus.mjs prints it (`lease --json`: {account, sessions: [{project, session}]} or
// null for no lease), read under PUSH_TIMEOUT_MS. Throws a one-line reason when it cannot be read; the
// push check fails open on that. (The trust gate reads the lease authority instead, below, and fails closed.)
async function readLease(cwd, run = runChild) {
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
export async function pushCheck({ command, cwd, env = process.env, run = runChild, fresh = false, transcriptPath, leaseAccount }) {
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
  let lease;
  try {
    lease = typeof leaseAccount === "string" ? { account: leaseAccount } : await readLease(cwd, run);
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
    if (cached?.error && age >= 0 && age < FENCE_FAIL_CACHE_MS) throw new Error(`${cached.error} (cached)`);
    if (!cached?.error && age >= 0 && age < FENCE_CACHE_MS) return cached.authority;
  } catch (error) {
    if (/\(cached\)$/.test(String(error?.message))) throw error;
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
    note(`old-account fence skipped: ${String(error?.message ?? error).split("\n")[0]}; allowing (fail-open)`);
    return { fenced: false, fresh: false };
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

// ---- Trust gate (founder 2026-11-06, "Masters use PC directly"; replaces the PC helper of 2026-11-04) ----
// COMMS_CORE §1: the founder's Allow on a trust card limits that session to trusted devices for good, so no lane or
// other session calls confirm_repository_trust. A master whose project needs the founder's PC starts its own PC
// sessions (docs/fleet-roster.md "Needs the founder's PC"), so it is the one session of its project that asks, once
// per account switch. ALLOW only when all hold: WOW_ACCOUNT_LABEL is the leased account's; the roster's "Needs the
// founder's PC" table, as committed on refs/remotes/origin/main of a wow-core checkout (this hook's own, or, for a
// consumer's copy in <checkout>/.claude/scripts, the wow-core checkout beside that checkout, which every master
// session has as its second repository), lists a repository whose lease key (the name after the slash) has this
// session as its FIRST entry in the account's lease period (`bus.mjs lease --authority` `masters`; ids compare after
// the first underscore: the platform shows one session as session_<x> and cse_<x>); OR this session is the period's
// first wow-core entry (`wowCore`) and this copy is wow-core's own checkout (founder 2026-11-06: only a trusted session
// can message the trusted masters). The hook does not care which
// checkout's copy runs: every copy reads the same roster and lease. Everything else, including any failure to
// establish that, DENIES. The founder still answers the card, and he is the boundary: anything on the account can post
// a LEASE line, so a session that posts the period's first entry for a project by a route the Bash guard below
// (leaseAuthorityGuard) does not see passes this gate AND locks the real master out of the PC until the next account
// switch; the card then shows that session's title, not the master's (COMMS_CORE §1).
export const CONFIRM_TRUST_TOOL = "mcp__claude-code-remote__confirm_repository_trust";
export const isConfirmTrust = (name) => typeof name === "string" && /^mcp__(?:.+_)?claude-code-remote__confirm_repository_trust$/.test(name);
const SESSION_SUFFIX = /^[A-Za-z0-9]+$/;
const suffixOf = (id) => {
  if (typeof id !== "string") return null;
  const suffix = id.slice(id.indexOf("_") + 1);
  return id.includes("_") && SESSION_SUFFIX.test(suffix) ? suffix : null;
};
export const PC_SECTION = "Needs the founder's PC";

// The repositories of the roster's "Needs the founder's PC" table (rows that start with one `owner/name`), lower-case.
export function rosterPcRepos(text) {
  const section = String(text ?? "").split(/^## /m).slice(1).find((part) => part.startsWith(PC_SECTION)) ?? "";
  return new Set([...section.matchAll(/^\|\s*`([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)`\s*\|/gm)].map((m) => m[1].toLowerCase()));
}

// The wow-core checkout whose committed roster the trust gate reads: this hook's own in wow-core's layout; for a
// consumer's copy, `<parent>/wow-core` beside the hook's checkout, when it is a wow-core checkout. null otherwise.
export function rosterCheckout(self = SELF) {
  const own = ownCheckoutRoot(self);
  if (own) return own;
  const root = hookCheckoutRoot(self);
  if (!root) return null;
  const sibling = path.join(path.dirname(root), "wow-core");
  return existsSync(path.join(sibling, ".git")) && isWowCore(sibling) ? sibling : null;
}
const committedPcRoster = () => {
  const root = rosterCheckout();
  if (!root) throw new Error("no wow-core checkout beside this one (a master session has wow-core as its second repository)");
  return committedFileAt(root, ROSTER_SOURCE);
};

// The lease authority as `bus.mjs lease --authority` prints it: {account, wowCore, masters, codexDispatcher, ...} or
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
    throw new Error(`the account lease could not be read (${String(error?.message ?? error).split("\n")[0]})`);
  }
}

// This session's label, id and the authority, checked against each other: { ok: true, mine, label, authority } or
// { ok: false, why }. Shared by the trust gate and the Codex dispatcher's attach.
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

// { allow, reason }. `run` and `roster` are injectable for tests.
// The period's wow-core session (the lease authority) may also ask, from wow-core's own checkout only (founder
// 2026-11-06): once the masters are trusted, the platform accepts messages into them only from trusted sessions, so an
// untrusted wow-core master could no longer steer them and the founder became the messenger.
export async function trustGate({ cwd, env = process.env, run = runChild, roster = committedPcRoster, self = SELF }) {
  const refuse = (why) => ({ allow: false, reason: `wow-core: confirm_repository_trust is refused: ${why}. Only the lease-named master of a project the roster lists under "${PC_SECTION}", or the period's wow-core master in wow-core's own checkout, asks for the founder's trust card, once per account switch; a lane or any other session never does, because the card limits that session to trusted devices for good (COMMS_CORE §1). Carry on without it, or ask your master.` });
  try {
    const first = await leasedAuthority({ cwd, env, run });
    if (first.ok && !first.authority.flipped && first.authority.wowCore && suffixOf(first.authority.wowCore) === first.mine && ownCheckoutRoot(self)) {
      return { allow: true, reason: `wow-core: this session is the wow-core master of the account's lease period (wow-core:${first.authority.wowCore}, account ${first.label}), asking so it can still reach the trusted masters; the founder answers the card, from the desktop app or a browser on a trusted device` };
    }
    let pcRepos;
    try { pcRepos = rosterPcRepos(roster()); } catch (error) { return refuse(`the roster could not be read from ${ROSTER_SOURCE} (${String(error?.message ?? error).split("\n")[0]})`); }
    if (!pcRepos.size) return refuse(`the roster on ${ORIGIN_MAIN} lists no repository under "${PC_SECTION}"`);
    const who = first;
    if (!who.ok) return refuse(who.why);
    if (who.authority.flipped) return refuse("the account's lease period began within 24 hours of an earlier period of the same account (an A to B to A switch), so it names no master");
    const masters = who.authority.masters && typeof who.authority.masters === "object" ? who.authority.masters : {};
    for (const repo of pcRepos) {
      const key = repo.split("/")[1];
      const named = Object.hasOwn(masters, key) ? masters[key] : null;
      if (suffixOf(named) === who.mine) {
        return { allow: true, reason: `wow-core: this session is the lease-named master of ${repo} (${key}:${named}, account ${who.label}), which the roster lists under "${PC_SECTION}"; the founder answers the card, from the desktop app or a browser on a trusted device` };
      }
    }
    return refuse(`this session is not the first lease entry, in the account's lease period, of a project listed there (${[...pcRepos].join(", ")})`);
  } catch (error) { return refuse(String(error?.message ?? error).split("\n")[0]); }
}

// Rewriting the `wow-core` entry is how a session would make itself the lease authority, writing a `codex-dispatcher`
// entry is how it would name itself the dispatcher (review 2026-11-04), and writing the period's first entry for a
// project under the roster's "Needs the founder's PC" is how it would name itself that project's master for the trust
// gate, locking the real master out of the PC for the whole period (review 2026-11-06, M1). The authority is the
// `wow-core` session of the account period's FIRST lease (`bus.mjs lease --authority`): it alone writes a
// codex-dispatcher entry, changes a wow-core entry inside the period, or writes a PC project's entry while
// `lease --authority` `masters` has none for it yet (the takeover's step-6 re-take). Once the project has its first
// entry, a later write changes nothing for the trust gate and stays allowed (a restarted master's `lease --add`). A
// `--take` (or raw LEASE) for a DIFFERENT account than the newest lease starts a new period, that is a takeover, and
// stays allowed. Fail closed when the lease cannot be read, and treat an unclaimed project as a PC project when the
// committed roster cannot be read. This text
// match stops honest mistakes and the obvious self-grant only (it misses split strings, variables and a body file); a
// session that edits its own hooks or posts through another route is stopped by the first-entry rules in bus.mjs, for
// the dispatcher by the `Codex dispatcher:` line the master merges into TASKS.md (codexDispatcherAttachDecision), and
// for the trust card by the founder.
const LEASE_WRITE = (command) => (/\bbus\.mjs\b[^;&|\n]*\blease\b[^;&|\n]*--(?:add|take)\b/.test(command))
  || (/\bLEASE\s+account=/.test(command))
  || (/fleet-lease/.test(command) && /\b(?:send|api|POST|comments)\b/.test(command));
export function writesCodexDispatcherLease(command) {
  return typeof command === "string" && /codex-dispatcher/i.test(command) && LEASE_WRITE(command);
}
export function writesWowCoreLease(command) {
  return typeof command === "string" && /wow-core\s*:\s*(?:session|cse)_/i.test(command) && LEASE_WRITE(command);
}
// The project keys (every `<key>:<session id>` but wow-core and codex-dispatcher) a lease write names, lower-case.
export function leaseProjectKeys(command) {
  if (typeof command !== "string" || !LEASE_WRITE(command)) return [];
  const keys = [...command.matchAll(/(?<![A-Za-z0-9-])([A-Za-z0-9][A-Za-z0-9-]{0,62})\s*:\s*(?:session|cse)_/g)].map((m) => m[1].toLowerCase());
  return [...new Set(keys)].filter((key) => key !== "wow-core" && key !== "codex-dispatcher");
}
// The account a lease write names (`--account <label>` or `LEASE account=<label>`), or null when it names none.
const writtenAccount = (command) => command.match(/--account[ =]+["']?([a-z0-9][a-z0-9-]*)/)?.[1] ?? command.match(/\bLEASE\s+account=([a-z0-9][a-z0-9-]*)/)?.[1] ?? null;
export async function leaseAuthorityGuard({ command, cwd, env = process.env, run = runChild, roster = committedPcRoster }) {
  const dispatcherWrite = writesCodexDispatcherLease(command);
  const wowCoreWrite = writesWowCoreLease(command);
  const projectKeys = leaseProjectKeys(command);
  if (!dispatcherWrite && !wowCoreWrite && !projectKeys.length) return null;
  let authority;
  let authorityError = null;
  try { authority = await readAuthority(cwd, env, run); } catch (error) { authorityError = String(error?.message ?? error).split("\n")[0]; }
  const refuse = (why) => `wow-core: a codex-dispatcher entry, a change to the wow-core entry, or the first entry of a project under the roster's "${PC_SECTION}", inside an account's lease period, may be written only by the takeover (the wow-core session of the period's first lease): ${why}. The Codex dispatcher is the one session allowed to attach fleet repositories with push (MODEL_ROUTING "Codex dispatch"), a PC project's first entry is the one master allowed to ask for the founder's trust card, and the wow-core entry names who may write both (COMMS_CORE §1), so none of them is for lanes or masters. Ask the wow-core master.`;
  // Only an unclaimed key matters: a key that already has its first entry in the period cannot change who the trust gate
  // honours, and a flipped (A to B to A) period names no master at all (the gate refuses everyone there), so neither is
  // guarded (review 2026-11-06: a restarted master's --add must not be refused all period). The roster is read only for
  // the unclaimed keys; when it cannot be read, each unclaimed key is treated as a PC project (fail closed), so a write
  // the period already covers still goes through.
  let pcWrite = [];
  if (projectKeys.length && !authority?.flipped) {
    const masters = authority?.masters && typeof authority.masters === "object" ? authority.masters : {};
    const unclaimed = projectKeys.filter((key) => !Object.hasOwn(masters, key));
    if (unclaimed.length) {
      try { const pcKeys = new Set([...rosterPcRepos(roster())].map((repo) => repo.split("/")[1])); pcWrite = unclaimed.filter((key) => pcKeys.has(key)); }
      catch (error) {
        pcWrite = unclaimed;
        note(`the roster could not be read from ${ROSTER_SOURCE} (${String(error?.message ?? error).split("\n")[0]}); treating ${unclaimed.join(", ")} as projects under "${PC_SECTION}"`);
      }
    }
  }
  if (!dispatcherWrite && !wowCoreWrite && !pcWrite.length) return null;
  const mine = suffixOf(env.CLAUDE_CODE_REMOTE_SESSION_ID);
  if (!mine) return refuse("this session's id (CLAUDE_CODE_REMOTE_SESSION_ID) is missing");
  if (authorityError) return refuse(authorityError);
  const isAuthority = Boolean(authority && authority.wowCore) && suffixOf(authority.wowCore) === mine;
  if (dispatcherWrite) {
    if (!authority || !authority.wowCore) return refuse("the newest lease period names no wow-core session");
    if (!isAuthority) return refuse("this session is not the wow-core session of the account's lease period");
  }
  // A wow-core or PC project write: allowed for the period's authority, for the very first lease, and for a takeover
  // that starts a new account period (its account differs from the newest lease's).
  if (!authority || isAuthority) return null;
  const account = writtenAccount(command);
  if (account && account !== authority.account) return null;
  if (wowCoreWrite) return refuse(`this session is not the wow-core session of the account's lease period (${authority.account}), and the write does not start a new account period`);
  if (pcWrite.length) return refuse(`this session is not the wow-core session of the account's lease period (${authority.account}), and the period has no entry yet for ${pcWrite.join(", ")} (a project under "${PC_SECTION}"): the takeover's re-take writes it`);
  return null;
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
  if (source === "resume" || source === "compact") return sessionStartOutput(tool, RESUME_LINE);
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

// ---- dispatch ----

// root is null when the payload cwd is outside any wow-core consumer: the shell policy and marker
// refresh are skipped, but a `git -C <primary-checkout> commit` is still guarded against the
// TARGET repo's presence markers. workDir is where the shell policy and the bus children look: the
// payload cwd, or this hook's checkout when the cwd is that checkout's parent folder.
// Codex sends its shell payload without a tool_name: a payload with no name and a string command is its Bash.
const ROUTED_TOOL = (name, input) => name === "Bash" || ((name === undefined || name === null) && typeof input?.command === "string")
  || name === ADD_REPO_TOOL || isCreateSession(name) || isConfirmTrust(name);
async function preToolUse(root, payload, cwd, workDir = cwd, stops = {}) {
  // The settings route every tool here ("*") for the old-account fence; everything else below is per tool.
  const fence = await fenceCheck({ toolName: payload?.tool_name, transcriptPath: payload?.transcript_path, cwd: workDir });
  if (fence.fenced) return `${JSON.stringify(denyResponse(fence.reason))}\n`;
  if (typeof payload?.tool_name === "string" && payload.tool_name.startsWith("mcp__")) {
    const entry = hardStopEntry(payload.tool_name, hardStopDeny(stops));
    if (entry) return `${JSON.stringify(denyResponse(hardStopReason(payload.tool_name, entry)))}\n`;
  }
  if (!ROUTED_TOOL(payload?.tool_name, payload?.tool_input)) return "";
  if (payload?.tool_name === ADD_REPO_TOOL) {
    const decision = busAttachDecision(payload.tool_input) ?? await codexDispatcherAttachDecision({ input: payload.tool_input, cwd: workDir });
    return decision ? `${JSON.stringify(decision)}\n` : "";
  }
  if (isCreateSession(payload?.tool_name)) {
    return `${JSON.stringify(spawnDecision(payload, process.env, Date.now()))}\n`;
  }
  if (isConfirmTrust(payload?.tool_name)) {
    const gate = await trustGate({ cwd: workDir });
    const hookSpecificOutput = { hookEventName: "PreToolUse", permissionDecision: gate.allow ? "allow" : "deny", permissionDecisionReason: gate.reason };
    return `${JSON.stringify({ hookSpecificOutput })}\n`;
  }
  const command = payload?.tool_input?.command;
  const leaseAccount = leaseAccountGuard(command);
  if (leaseAccount) return `${JSON.stringify(denyResponse(leaseAccount))}\n`;
  const authorityWrite = await leaseAuthorityGuard({ command, cwd: workDir });
  if (authorityWrite) return `${JSON.stringify(denyResponse(authorityWrite))}\n`;
  if (root) touchMarker(root, payload.session_id);
  const policy = root ? firstExisting(root, [".claude/hooks/guard-bash-policy.mjs", "hooks/guard-bash-policy.mjs"]) : null;
  if (policy) {
    try {
      const { evaluate, response } = await import(pathToFileURL(path.resolve(root, policy)).href);
      const reason = evaluate(command, workDir);
      if (reason) return `${JSON.stringify(response(reason))}\n`;
    } catch (error) {
      note(`bash policy failed, allowing: ${error?.message ?? error}`);
    }
  }
  const guard = guardSharedTree({ command, sid: payload.session_id, cwd });
  for (const warning of guard.warnings) note(warning);
  if (guard.reason) return `${JSON.stringify(denyResponse(guard.reason))}\n`;
  const pushReason = await pushCheck({ command, cwd: workDir, fresh: fence.fresh, transcriptPath: payload?.transcript_path, leaseAccount: fence.account });
  return pushReason ? `${JSON.stringify(denyResponse(pushReason))}\n` : "";
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
  if (mode === "pre-tool-use") return preToolUse(root, payload, cwd, workDir, { own, repoRoot, parentTurn: viaParent || fromParent });
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

// The one tool whose failure must not fall back to the host's normal flow: if the hook cannot finish in time, or
// breaks, confirm_repository_trust is DENIED (fail closed; the other tools fail open as before).
const denyTrustOnFailure = (why) => `${JSON.stringify(denyResponse(`wow-core: confirm_repository_trust is refused: the trust gate ${why}, so it fails closed (COMMS_CORE §1).`))}\n`;

export async function run(forcedTool) {
  const mode = process.argv[2];
  if (!MODES.includes(mode)) {
    note(`unknown mode '${mode ?? ""}'; doing nothing`);
    finish("");
    return;
  }
  // Known limit (review 2026-11-04): the tool name is in the stdin payload, so a hook that hangs before stdin
  // arrives, or crashes at startup before this line, cannot know it is the trust call and fails open like every
  // other tool. That outcome is the host's normal permission flow, not an allow: there is no allow rule for the
  // tool, wow-core's settings carry no deny only so the hook's allow can work, and the founder's own card remains.
  let trustCall = false;
  const watchdog = setTimeout(() => {
    note(`${mode} exceeded its ${DEADLINE_MS[mode] / 1000} s deadline; ${trustCall ? "denying the trust call (fail-closed)" : "allowing (fail-open)"}`);
    finish(trustCall ? denyTrustOnFailure(`exceeded its ${DEADLINE_MS[mode] / 1000} s deadline`) : "");
  }, DEADLINE_MS[mode]);
  watchdog.unref();
  try {
    const raw = await readStdin();
    trustCall = mode === "pre-tool-use" && isConfirmTrust(parsePayload(raw)?.tool_name);
    const tool = forcedTool ?? detectTool(process.argv, process.env, parsePayload(raw));
    finish(await dispatch(mode, raw, tool, { viaParent: process.argv.includes(VIA_PARENT) }));
  } catch (error) {
    note(`internal error, ${trustCall ? "denying the trust call (fail-closed)" : "fail-open"}: ${String(error?.stack ?? error).split("\n")[0]}`);
    finish(trustCall ? denyTrustOnFailure("hit an internal error") : "");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) await run();
