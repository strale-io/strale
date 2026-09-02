#!/usr/bin/env node
// Session-end handoff gate (provider-neutral; Node >= 18; the only dependency
// is the root devDependency `yaml`, used to read the program registers).
//
// The gate fails, with an exact fix per finding, whenever the repository is
// not in a state the next session (Claude Code or Codex) can resume from:
//
//   dirty            uncommitted or untracked paths in this worktree
//   branch           the trunk is off main, or a batch worktree is on main /
//                    detached
//   ahead            commits not pushed to the branch's upstream (or none set)
//   worktree         more than one batch worktree, or a batch worktree that
//                    holds no branch (the trunk is the only checkout that idles)
//   merged-branch    a local or remote branch whose work has landed on main
//                    (ancestor, or every commit patch-equivalent) and which
//                    still exists
//   resume-surface   a program register without a next action, or code changed
//                    without a program register (docs/programs/*/tracks.yaml)
//                    or a handoff file (handoff/_general/from-code/) update
//   release-commit   a commit directly on main (pre-commit)
//   release-push     a push to main without a human's STRALE_ALLOW_MAIN_PUSH=1
//                    (pre-push)
//   inventory        inventory targets staged without a regenerated project
//                    context inventory (pre-commit; the CI `context:test` rule,
//                    caught before the commit exists)
//
// Worktree model (WORKTREES.md): the trunk (`C:/Users/pette/Projects/strale`,
// on main, clean, never carrying work) plus at most one batch worktree on a
// feature branch. Worktrees recorded in scripts/handoff/baseline.json with a
// reason are tolerated and reported as notes, never deleted by anything here.
//
// Modes:
//   session     the full gate (Claude Code Stop hook, Codex notify wrapper,
//               `npm run handoff:check`)
//   pre-commit  fast structural checks (release-commit, inventory)
//   pre-push    everything except dirty/ahead, over the refs being pushed,
//               plus release-push
//   baseline    print or, with --write, record the worktrees and merged
//               branches that already exist and wait for a founder decision
//
// Usage:
//   node scripts/handoff/handoff-check.mjs [--mode session|pre-commit|pre-push]
//        [--since <sha>] [--range <a...b>] [--json] [--no-fetch] [--root <dir>]
//        [--baseline <file>]
//   node scripts/handoff/handoff-check.mjs baseline [--write] [--reason "<text>"]
//
// Nothing in this file deletes, resets, or checks out anything. It reads and
// reports; the fixes are for the session to apply.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const DEFAULTS = Object.freeze({
  releaseBranch: "main",
  remote: "origin",
  allowReleaseEnv: "STRALE_ALLOW_MAIN_PUSH",
  registerPattern: /^docs\/programs\/[^/]+\/tracks\.yaml$/,
  programsDir: "docs/programs",
  handoffPrefix: "handoff/_general/from-code/",
  codePrefixes: [
    "apps/",
    "packages/",
    "scripts/",
    "manifests/",
    ".github/",
    ".githooks/",
    ".claude/hooks/",
    "package.json",
    "package-lock.json",
    "Dockerfile",
  ],
  maxBatchWorktrees: 1,
  minNextAction: 10,
});

export function normalizePath(p) {
  let s = String(p).replace(/\\/g, "/").replace(/\/+$/, "");
  if (process.platform === "win32") s = s.toLowerCase();
  return s;
}

function makeGit(root) {
  return (args, { allowFail = false, input, timeout } = {}) => {
    try {
      return execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        input,
        timeout,
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
    } catch (error) {
      if (allowFail) return null;
      throw new Error(`git ${args.join(" ")} failed: ${error.stderr?.toString().trim() || error.message}`);
    }
  };
}

export function loadBaseline(file) {
  if (!file || !existsSync(file)) return { canonicalWorktree: null, knownWorktrees: [], knownBranches: [] };
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  return {
    canonicalWorktree: parsed.canonicalWorktree ?? null,
    knownWorktrees: parsed.knownWorktrees ?? [],
    knownBranches: parsed.knownBranches ?? [],
  };
}

export function parseWorktrees(porcelain) {
  const entries = [];
  let current = null;
  for (const raw of String(porcelain ?? "").split("\n")) {
    const line = raw.trim();
    if (!line) {
      if (current) entries.push(current);
      current = null;
      continue;
    }
    if (line.startsWith("worktree ")) {
      current = { path: line.slice("worktree ".length), head: null, branch: null, detached: false, bare: false };
    } else if (!current) {
      continue;
    } else if (line.startsWith("HEAD ")) current.head = line.slice(5);
    else if (line.startsWith("branch ")) current.branch = line.slice(7).replace(/^refs\/heads\//, "");
    else if (line === "detached") current.detached = true;
    else if (line === "bare") current.bare = true;
  }
  if (current) entries.push(current);
  return entries;
}

function listWorktrees(git) {
  return parseWorktrees(git(["worktree", "list", "--porcelain"], { allowFail: true }) ?? "");
}

function refExists(git, ref) {
  return git(["show-ref", "--verify", "--quiet", ref], { allowFail: true }) !== null;
}

function mergedBranches(git, target, { remote = false } = {}) {
  if (!refExists(git, target)) return [];
  const args = ["branch", "--format=%(refname:short)", "--merged", target];
  if (remote) args.splice(1, 0, "-r");
  const out = git(args, { allowFail: true }) ?? "";
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

function diffNames(git, args) {
  const out = git(["diff", "--name-only", ...args], { allowFail: true });
  return out ? out.split("\n").map((s) => s.trim()).filter(Boolean) : [];
}

function statusPaths(git) {
  const out = git(["status", "--porcelain", "--untracked-files=all"], { allowFail: true }) ?? "";
  return out.split("\n").filter(Boolean).map((l) => {
    const p = l.slice(3).trim();
    const arrow = p.indexOf(" -> ");
    return arrow >= 0 ? p.slice(arrow + 4) : p;
  });
}

function isCode(path, prefixes) {
  return prefixes.some((p) => path === p || path.startsWith(p));
}

function isResumeSurface(path, cfg) {
  return cfg.registerPattern.test(path) || path.startsWith(cfg.handoffPrefix);
}

function listRegisters(root, cfg) {
  const dir = resolve(root, cfg.programsDir);
  if (!existsSync(dir)) return [];
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const rel = `${cfg.programsDir}/${entry.name}/tracks.yaml`;
    if (existsSync(resolve(root, rel))) found.push(rel);
  }
  return found.sort();
}

async function loadYaml() {
  try {
    const mod = await import("yaml");
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

async function loadInventoryTargets() {
  try {
    const mod = await import("../project-context-lib.mjs");
    return (mod.INVENTORY_TARGETS ?? []).map((t) => t.path);
  } catch {
    return null;
  }
}

function summarize(list, n = 4) {
  return `${list.slice(0, n).join(", ")}${list.length > n ? `, … (${list.length} total)` : ""}`;
}

export async function runChecks(options = {}) {
  const root = resolve(options.root ?? process.cwd());
  const git = makeGit(root);
  const mode = options.mode ?? "session";
  const cfg = { ...DEFAULTS, ...(options.config ?? {}) };
  const baselineFile = options.baseline === undefined ? resolve(here, "baseline.json") : options.baseline;
  const baseline = loadBaseline(baselineFile);
  const env = options.env ?? process.env;
  const failures = [];
  const warnings = [];
  const fail = (code, message, fix) => failures.push({ code, message, fix });
  const note = (message) => warnings.push(message);

  const toplevel = git(["rev-parse", "--show-toplevel"], { allowFail: true });
  if (!toplevel) {
    return { ok: false, mode, failures: [{ code: "not-a-repo", message: `${root} is not a git repository`, fix: "run the gate from a checkout of the repository" }], warnings };
  }

  const worktrees = listWorktrees(git);
  const canonical = normalizePath(baseline.canonicalWorktree ?? worktrees[0]?.path ?? toplevel);
  const known = new Map(baseline.knownWorktrees.map((w) => [normalizePath(w.path), w.reason ?? "recorded"]));
  const me = normalizePath(toplevel);
  const kind = me === canonical ? "trunk" : known.has(me) ? "known" : "batch";

  if (mode === "session" && options.fetch !== false) {
    const fetched = git(["fetch", "--prune", "--quiet", cfg.remote], { allowFail: true, timeout: 30_000 });
    if (fetched === null) note(`could not fetch ${cfg.remote}; remote-branch findings may be stale`);
  }

  const releaseRef = refExists(git, `refs/remotes/${cfg.remote}/${cfg.releaseBranch}`)
    ? `refs/remotes/${cfg.remote}/${cfg.releaseBranch}`
    : `refs/heads/${cfg.releaseBranch}`;
  const releaseSha = git(["rev-parse", releaseRef], { allowFail: true });
  const branch = git(["branch", "--show-current"], { allowFail: true }) || "";
  const head = git(["rev-parse", "HEAD"], { allowFail: true }) || "";

  // ── dirty ──────────────────────────────────────────────────────────────
  if (mode === "session") {
    const dirty = statusPaths(git);
    if (dirty.length) {
      fail("dirty", `${dirty.length} uncommitted or untracked path(s) in ${toplevel}: ${summarize(dirty, 5)}`,
        "commit them (Conventional Commit message) or delete stray files; nothing may stay uncommitted when a session ends");
    }
  }

  // ── branch ─────────────────────────────────────────────────────────────
  if (mode === "session") {
    if (kind === "batch") {
      if (!branch) {
        fail("branch", `HEAD is detached in batch worktree ${toplevel}`,
          "check out the batch branch (git switch <branch>), or remove this worktree from the trunk if its work is merged (git worktree remove <path>; never rm -rf)");
      } else if (branch === cfg.releaseBranch) {
        fail("branch", `batch worktree ${toplevel} is on ${cfg.releaseBranch}`,
          "batch work happens on a feature branch: git switch -c <type>/<kebab-description>");
      }
    } else if (!branch) {
      if (head && releaseSha && head === releaseSha) {
        note(`${kind === "trunk" ? "trunk" : "recorded worktree"} ${toplevel} is detached at ${cfg.remote}/${cfg.releaseBranch} (idle)`);
      } else {
        fail("branch", `${kind === "trunk" ? "trunk" : "recorded worktree"} ${toplevel} is detached at ${head.slice(0, 8)}, which is not ${cfg.remote}/${cfg.releaseBranch}`,
          `git switch ${cfg.releaseBranch} && git pull --ff-only (move any work to a batch worktree first)`);
      }
    } else if (branch !== cfg.releaseBranch) {
      fail("branch", `${kind === "trunk" ? "trunk" : "recorded worktree"} ${toplevel} is on ${branch}; it stays on ${cfg.releaseBranch}`,
        `finish that branch in a batch worktree (git worktree add ../strale-wt-<track> ${branch}) and git switch ${cfg.releaseBranch} here`);
    }
  }

  // ── ahead ──────────────────────────────────────────────────────────────
  if (mode === "session" && branch) {
    const upstream = git(["rev-parse", "--abbrev-ref", "@{upstream}"], { allowFail: true });
    // `git worktree add -b x <path> origin/main` makes the new branch track
    // origin/main; that is not a backup of the branch, so it counts as no
    // upstream (the push -u below re-points the tracking to origin/<branch>).
    const borrowed = upstream && branch !== cfg.releaseBranch && upstream === `${cfg.remote}/${cfg.releaseBranch}`;
    if (!upstream || borrowed) {
      fail("ahead", `branch ${branch} has no upstream of its own${borrowed ? ` (it tracks ${upstream})` : ""}`, `git push -u ${cfg.remote} ${branch}`);
    } else {
      const ahead = Number(git(["rev-list", "--count", `${upstream}..HEAD`], { allowFail: true }) ?? "0");
      const behind = Number(git(["rev-list", "--count", `HEAD..${upstream}`], { allowFail: true }) ?? "0");
      if (ahead > 0 && branch === cfg.releaseBranch) {
        fail("ahead", `${ahead} local commit(s) on ${cfg.releaseBranch} that are not on ${upstream}`,
          `${cfg.releaseBranch} changes only through reviewed PRs: git branch <type>/<name> && git reset --hard ${upstream}, then open a PR from that branch`);
      } else if (ahead > 0) {
        fail("ahead", `${ahead} commit(s) on ${branch} not pushed to ${upstream}`,
          `git push ${cfg.remote} ${branch} (pushing the working branch is routine backup; only ${cfg.releaseBranch} needs approval)`);
      }
      if (behind > 0 && branch === cfg.releaseBranch) note(`${branch} is ${behind} commit(s) behind ${upstream}: git pull --ff-only`);
    }
  }

  // ── worktrees ──────────────────────────────────────────────────────────
  const batch = [];
  let knownCount = 0;
  if (mode !== "pre-commit") {
    for (const wt of worktrees) {
      const n = normalizePath(wt.path);
      if (n === canonical) continue;
      if (known.has(n)) { knownCount += 1; continue; }
      batch.push(wt);
      if (wt.detached || wt.branch === cfg.releaseBranch) {
        fail("worktree", `worktree ${wt.path} holds no batch branch (${wt.detached ? "detached HEAD" : `on ${cfg.releaseBranch}`})`,
          `the trunk is the only checkout that idles: git -C ${worktrees[0]?.path ?? toplevel} worktree remove ${wt.path} (never rm -rf; delete any node_modules junction inside first)`);
      }
    }
    if (batch.length > cfg.maxBatchWorktrees) {
      fail("worktree", `${batch.length} batch worktrees exist (${batch.map((w) => `${w.path} [${w.branch ?? "detached"}]`).join(", ")}); the model allows ${cfg.maxBatchWorktrees}`,
        "one batch at a time: finish and remove the others (git worktree remove <path>; never rm -rf), or record one in scripts/handoff/baseline.json with a reason");
    }
    if (knownCount) note(`${knownCount} worktree(s) recorded in scripts/handoff/baseline.json wait for a founder decision; nothing is deleted without it`);
    if (mode === "session") {
      for (const wt of worktrees) {
        if (normalizePath(wt.path) === me || wt.bare) continue;
        const dirty = git(["-C", wt.path, "status", "--porcelain", "--untracked-files=all"], { allowFail: true });
        const count = dirty ? dirty.split("\n").filter(Boolean).length : 0;
        if (count) note(`worktree ${wt.path} carries ${count} uncommitted path(s); the session that owns it must clear them before it ends`);
      }
    }
  }

  // ── landed branches ────────────────────────────────────────────────────
  // A branch has landed when main already contains its work: either it is
  // an ancestor of main (fast-forward or merge-commit merge, or it never
  // received a commit) or every commit on it is patch-equivalent to one on
  // main (`git cherry`; rebase merges and single-commit squash merges). A
  // multi-commit squash merge leaves no git-visible trace, so the batch loop
  // deletes the branch explicitly after merging (PROGRAM.md); git alone cannot
  // tell a freshly cut branch from a fast-forwarded one when both sit at
  // main's tip, so a checked-out branch with no commits beyond main is a note,
  // never a failure.
  if (mode !== "pre-commit") {
    const knownBranches = new Map(baseline.knownBranches.map((b) => [b.name, b.reason ?? "recorded"]));
    const byBranch = new Map(worktrees.filter((w) => w.branch).map((w) => [w.branch, w.path]));
    const exclude = new Set([cfg.releaseBranch, branch].filter(Boolean));
    const aheadOf = (ref) => Number(git(["rev-list", "--count", `${releaseRef}..${ref}`], { allowFail: true }) ?? "0");
    const patchEquivalent = (ref) => {
      const out = git(["cherry", releaseRef, ref], { allowFail: true });
      if (!out) return false;
      const lines = out.split("\n").filter(Boolean);
      return lines.length > 0 && lines.every((l) => l.startsWith("-"));
    };
    const landedHow = (ref) => (aheadOf(ref) === 0 ? "ancestor" : patchEquivalent(ref) ? "patch-equivalent" : null);
    let waiting = 0;
    const localBranches = (git(["branch", "--format=%(refname:short)"], { allowFail: true }) ?? "").split("\n").map((s) => s.trim()).filter((b) => b && !b.startsWith("("));
    for (const b of localBranches) {
      if (exclude.has(b)) continue;
      if (knownBranches.has(b)) { waiting += 1; continue; }
      if (!releaseSha) break;
      const how = landedHow(b);
      if (!how) continue;
      const wt = byBranch.get(b);
      if (wt && how === "ancestor") {
        note(`worktree ${wt} is on ${b}, which has no commits beyond ${cfg.releaseBranch}: freshly cut, or its work already landed; if no session is using it, git worktree remove ${wt} then git branch -d ${b}`);
        continue;
      }
      const del = how === "ancestor" ? `git branch -d ${b} (nothing is lost: every commit is reachable from ${cfg.releaseBranch})` : `git branch -D ${b} (safe: every commit on it is patch-equivalent to one on ${cfg.releaseBranch})`;
      fail("merged-branch", `local branch ${b} has landed on ${cfg.releaseBranch} (${how}) and still exists${wt ? ` (checked out in ${wt})` : ""}`,
        wt ? `git worktree remove ${wt} from the trunk, then ${del}` : del);
    }
    const remoteSkip = new Set([`${cfg.remote}/${cfg.releaseBranch}`, `${cfg.remote}/HEAD`, ...(branch ? [`${cfg.remote}/${branch}`] : [])]);
    const remoteBranches = (git(["branch", "-r", "--format=%(refname:short)"], { allowFail: true }) ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
    for (const rb of remoteBranches) {
      if (remoteSkip.has(rb) || !rb.startsWith(`${cfg.remote}/`)) continue;
      const short = rb.slice(cfg.remote.length + 1);
      if (knownBranches.has(short)) { waiting += 1; continue; }
      if (!releaseSha) break;
      const how = landedHow(rb);
      if (!how) continue;
      if (byBranch.has(short) && how === "ancestor") continue; // the note above covers the checked-out branch
      fail("merged-branch", `remote branch ${rb} has landed on ${cfg.releaseBranch} (${how}) and still exists`,
        `git push ${cfg.remote} --delete ${short} (its PR is merged, or it never diverged from ${cfg.releaseBranch})`);
    }
    if (waiting) note(`${waiting} landed branch(es) recorded in scripts/handoff/baseline.json wait for a founder decision`);
    if (branch && branch !== cfg.releaseBranch && releaseSha && head) {
      const how = landedHow("HEAD");
      if (how) note(`this branch (${branch}) has landed on ${cfg.releaseBranch} (${how}) or has no commits yet; once its PR is merged, the next session removes this worktree and deletes the branch from the trunk`);
    }
  }

  // ── resume surface ─────────────────────────────────────────────────────
  if (mode !== "pre-commit") {
    const registers = listRegisters(root, cfg);
    if (!registers.length) {
      fail("resume-surface", `no program register found under ${cfg.programsDir}/*/tracks.yaml`,
        "the register is the resume surface; restore docs/programs/ from main");
    } else {
      const YAML = await loadYaml();
      if (!YAML) {
        fail("gate-error", "the `yaml` package is not installed, so the program registers cannot be read", "npm ci at the repository root");
      } else {
        for (const rel of registers) {
          let doc;
          try { doc = YAML.parse(readFileSync(resolve(root, rel), "utf8")); } catch (error) {
            fail("resume-surface", `${rel} does not parse: ${error.message.split("\n")[0]}`, `fix the YAML, then npm run programs:check`);
            continue;
          }
          const tracks = Array.isArray(doc?.tracks) ? doc.tracks : [];
          for (const t of tracks.filter((x) => x && x.status === "active")) {
            const text = typeof t.next_action === "string" ? t.next_action.trim() : "";
            if (text.length < cfg.minNextAction) {
              fail("resume-surface", `${rel}: active track ${t.id ?? "?"} has no next_action`,
                `write the exact next action for ${t.id ?? "the active track"} in ${rel}, then npm run programs:check`);
            }
          }
        }
      }
    }

    const ranges = [];
    if (options.range) ranges.push(options.range);
    else if (options.since) ranges.push(`${options.since}..HEAD`);
    else if (options.pushRanges?.length) ranges.push(...options.pushRanges);
    else if (branch && branch !== cfg.releaseBranch && releaseSha) ranges.push(`${releaseRef}...HEAD`);
    else {
      const upstream = git(["rev-parse", "--abbrev-ref", "@{upstream}"], { allowFail: true });
      if (upstream) ranges.push(`${upstream}..HEAD`);
    }
    const changed = new Set();
    for (const r of ranges) for (const f of diffNames(git, [r])) changed.add(f);
    if (mode === "session") for (const p of statusPaths(git)) changed.add(p);
    const code = [...changed].filter((f) => isCode(f, cfg.codePrefixes));
    const resume = [...changed].filter((f) => isResumeSurface(f, cfg));
    if (code.length && !resume.length) {
      fail("resume-surface", `code changed (${summarize(code)})${ranges.length ? ` in ${ranges.join(" ")}` : ""} but no program register or handoff file was updated`,
        `update the active track's next_action in ${cfg.programsDir}/<program>/tracks.yaml (then npm run programs:check), or write ${cfg.handoffPrefix}YYYY-MM-DD-<topic>.md starting with "Intent:" (then npm run context:generate in the same commit); commit that as the last commit of the session`);
    }
  }

  // ── release commit / inventory (pre-commit) ────────────────────────────
  if (mode === "pre-commit") {
    if (branch === cfg.releaseBranch && env[cfg.allowReleaseEnv] !== "1") {
      fail("release-commit", `committing directly on ${cfg.releaseBranch}, which deploys production`,
        `commit on a feature branch in a batch worktree and open a PR; a human sets ${cfg.allowReleaseEnv}=1 for a deliberate release action`);
    }
    const staged = options.stagedFiles ?? diffNames(git, ["--cached", "--diff-filter=ACMRD"]);
    const targets = options.inventoryTargets ?? (await loadInventoryTargets());
    if (targets) {
      const hits = staged.filter((f) => targets.some((t) => f === t || f.startsWith(`${t}/`)));
      if (hits.length) {
        // The checker is warning-only by contract until M4 (exit 0 with
        // findings); CI's context:test is what fails on them. Read its JSON
        // and treat any finding as a failure here, so the commit never exists.
        const check = options.inventoryCheck ?? (() => spawnSync(process.execPath, [resolve(root, "scripts/check-project-context.mjs"), "--json"], { cwd: root, encoding: "utf8" }));
        const run = check();
        let findings = null;
        try { findings = JSON.parse(run.stdout).findings ?? []; } catch { findings = null; }
        if (run.status !== 0 || findings === null || findings.length) {
          const detail = findings?.length
            ? findings.map((f) => `${f.code} ${f.path ?? ""}`.trim()).join("; ")
            : `${run.stdout ?? ""}${run.stderr ?? ""}`.trim().split("\n").slice(-3).join(" ");
          fail("inventory", `inventory targets staged (${summarize(hits)}) but the project context check reports: ${detail}`,
            "npm run context:generate, then stage its output in the same commit (the CI context:test rule)");
        }
      }
    }
  }

  // ── release push (pre-push) ────────────────────────────────────────────
  if (mode === "pre-push") {
    for (const ref of options.pushedRefs ?? []) {
      if (ref.remoteRef === `refs/heads/${cfg.releaseBranch}` && env[cfg.allowReleaseEnv] !== "1") {
        fail("release-push", `pushing ${ref.localRef} to ${cfg.releaseBranch}, which deploys production`,
          `${cfg.releaseBranch} changes only through reviewed PRs merged on GitHub; a human runs the push with ${cfg.allowReleaseEnv}=1 after explicit approval`);
      }
    }
  }

  return { ok: failures.length === 0, mode, worktree: toplevel, kind, branch, failures, warnings };
}

export function formatResult(result) {
  const lines = [];
  if (result.ok) {
    lines.push(`Handoff gate passed (${result.mode})${result.branch ? `: ${result.branch}` : ""}${result.kind ? ` in the ${result.kind} worktree` : ""}.`);
  } else {
    lines.push(`HANDOFF GATE FAILED (${result.mode}) — ${result.failures.length} thing(s) to fix before this session may end:`);
    for (const f of result.failures) lines.push(`- [${f.code}] ${f.message}`, `    fix: ${f.fix}`);
  }
  for (const w of result.warnings ?? []) lines.push(`  note: ${w}`);
  return lines.join("\n");
}

export function parseArgs(argv) {
  const opts = { mode: "session", json: false, write: false, positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--mode") opts.mode = next();
    else if (a === "--since") opts.since = next();
    else if (a === "--range") opts.range = next();
    else if (a === "--root") opts.root = next();
    else if (a === "--baseline") opts.baseline = next();
    else if (a === "--reason") opts.reason = next();
    else if (a === "--json") opts.json = true;
    else if (a === "--write") opts.write = true;
    else if (a === "--no-fetch") opts.fetch = false;
    else opts.positional.push(a);
  }
  return opts;
}

export function readPushRefs(stdinText) {
  return String(stdinText ?? "").split("\n").filter(Boolean).map((line) => {
    const [localRef, localSha, remoteRef, remoteSha] = line.trim().split(/\s+/);
    return { localRef, localSha, remoteRef, remoteSha };
  });
}

export function pushRangesFor(refs, releaseBranch = DEFAULTS.releaseBranch, remote = DEFAULTS.remote) {
  const ranges = [];
  for (const r of refs) {
    if (!r.localSha || /^0+$/.test(r.localSha)) continue; // a branch deletion pushes nothing
    ranges.push(/^0+$/.test(r.remoteSha ?? "") ? `${remote}/${releaseBranch}...${r.localSha}` : `${r.remoteSha}..${r.localSha}`);
  }
  return ranges;
}

export async function baselineReport(options = {}) {
  const root = resolve(options.root ?? process.cwd());
  const git = makeGit(root);
  const file = options.baseline ?? resolve(here, "baseline.json");
  const current = loadBaseline(file);
  const result = await runChecks({ ...options, mode: "session" });
  const reason = options.reason ?? "inventoried; waits for a founder decision";
  const worktrees = result.failures
    .filter((f) => f.code === "worktree" && f.message.startsWith("worktree "))
    .map((f) => ({ path: f.message.replace(/^worktree /, "").replace(/ holds no batch branch.*$/, ""), reason }));
  const branches = result.failures
    .filter((f) => f.code === "merged-branch")
    .map((f) => ({ name: f.message.split(" ")[2].replace(new RegExp(`^${DEFAULTS.remote}/`), ""), reason }));
  const next = {
    canonicalWorktree: current.canonicalWorktree ?? git(["rev-parse", "--show-toplevel"]),
    recordedAt: new Date().toISOString().slice(0, 10),
    knownWorktrees: [...current.knownWorktrees, ...worktrees],
    knownBranches: [...current.knownBranches, ...branches],
  };
  if (options.write) writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  return { added: { worktrees, branches }, baseline: next, file };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.positional[0] === "baseline") {
    const report = await baselineReport(opts);
    console.log(`${opts.write ? "Recorded" : "Would record"} ${report.added.worktrees.length} worktree(s) and ${report.added.branches.length} merged branch(es) in ${report.file}`);
    for (const w of report.added.worktrees) console.log(`  worktree ${w.path}`);
    for (const b of report.added.branches) console.log(`  branch ${b.name}`);
    process.exit(0);
  }
  if (opts.mode === "pre-push") {
    let stdin = "";
    try { stdin = readFileSync(0, "utf8"); } catch { stdin = ""; }
    opts.pushedRefs = readPushRefs(stdin);
    opts.pushRanges = pushRangesFor(opts.pushedRefs);
  }
  const result = await runChecks(opts);
  console.log(opts.json ? JSON.stringify(result, null, 2) : formatResult(result));
  process.exit(result.ok ? 0 : 1);
}
