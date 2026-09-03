// Tests for the session-end handoff gate. Each test builds a throwaway
// repository: a bare "origin", a trunk clone on main, and one batch worktree
// on a feature branch — the exact model WORKTREES.md describes — then plants
// one failure mode and asserts the gate names it and that the stated fix
// clears it.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  baselineReport,
  loadBaseline,
  normalizePath,
  parseWorktrees,
  pushRangesFor,
  readPushRefs,
  runChecks,
} from "./handoff-check.mjs";

const REGISTER = [
  "schema_version: 1",
  "program: p",
  "program_status: active",
  "tracks:",
  "  - id: T1",
  "    title: Test track",
  "    status: active",
  "    next_action: continue the stored plan from its handoff.",
  "",
].join("\n");

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

function commitAll(cwd, message) {
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", message);
}

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "strale-handoff-"));
  const remote = join(dir, "origin.git");
  const trunk = join(dir, "trunk");
  const batch = join(dir, "batch");
  git(dir, "init", "--bare", "-q", "-b", "main", remote);
  git(dir, "clone", "-q", remote, trunk);
  git(trunk, "config", "user.email", "t@example.com");
  git(trunk, "config", "user.name", "t");
  git(trunk, "config", "commit.gpgsign", "false");
  git(trunk, "checkout", "-q", "-b", "main");
  mkdirSync(join(trunk, "docs", "programs", "p"), { recursive: true });
  mkdirSync(join(trunk, "apps"), { recursive: true });
  mkdirSync(join(trunk, "handoff", "_general", "from-code"), { recursive: true });
  writeFileSync(join(trunk, "docs", "programs", "p", "tracks.yaml"), REGISTER);
  writeFileSync(join(trunk, "apps", "a.ts"), "export const a = 1;\n");
  writeFileSync(join(trunk, "handoff", "_general", "from-code", "2026-01-01-init.md"), "Intent: init\n");
  commitAll(trunk, "init");
  git(trunk, "push", "-q", "-u", "origin", "main");
  git(trunk, "worktree", "add", "-q", "-b", "feat/x", batch, "main");
  git(batch, "push", "-q", "-u", "origin", "feat/x");
  const baseline = join(dir, "baseline.json");
  writeFileSync(baseline, JSON.stringify({ canonicalWorktree: trunk, knownWorktrees: [], knownBranches: [] }));
  const check = (root, extra = {}) => runChecks({ root, baseline, fetch: false, ...extra });
  return { dir, remote, trunk, batch, baseline, check, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function codes(result) {
  return result.failures.map((f) => f.code);
}

function finding(result, code) {
  return result.failures.find((f) => f.code === code);
}

test("a clean trunk on main plus one pushed batch worktree passes from both checkouts", async () => {
  const r = makeRepo();
  try {
    const fromBatch = await r.check(r.batch);
    assert.equal(fromBatch.ok, true, JSON.stringify(fromBatch));
    assert.equal(fromBatch.kind, "batch");
    const fromTrunk = await r.check(r.trunk);
    assert.equal(fromTrunk.ok, true, JSON.stringify(fromTrunk));
    assert.equal(fromTrunk.kind, "trunk");
  } finally { r.cleanup(); }
});

test("uncommitted and untracked paths fail as dirty, naming the path", async () => {
  const r = makeRepo();
  try {
    writeFileSync(join(r.batch, "stray.txt"), "x");
    const result = await r.check(r.batch);
    assert.ok(codes(result).includes("dirty"));
    assert.match(finding(result, "dirty").message, /stray\.txt/);
  } finally { r.cleanup(); }
});

test("a dirty sibling worktree is a note for the session that owns it, not a failure here", async () => {
  const r = makeRepo();
  try {
    writeFileSync(join(r.batch, "stray.txt"), "x");
    const result = await r.check(r.trunk);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.ok(result.warnings.some((w) => /carries 1 uncommitted/.test(w)));
  } finally { r.cleanup(); }
});

test("unpushed commits fail as ahead; pushing clears it", async () => {
  const r = makeRepo();
  try {
    writeFileSync(join(r.batch, "notes.md"), "notes\n");
    commitAll(r.batch, "docs: notes");
    assert.ok(codes(await r.check(r.batch)).includes("ahead"));
    git(r.batch, "push", "-q");
    assert.equal((await r.check(r.batch)).ok, true);
  } finally { r.cleanup(); }
});

test("a branch that tracks origin/main counts as having no upstream", async () => {
  const r = makeRepo();
  try {
    git(r.batch, "branch", "--set-upstream-to=origin/main");
    const result = await r.check(r.batch);
    assert.ok(codes(result).includes("ahead"));
    assert.match(finding(result, "ahead").message, /no upstream of its own \(it tracks origin\/main\)/);
    assert.match(finding(result, "ahead").fix, /git push -u origin feat\/x/);
    git(r.batch, "push", "-q", "-u", "origin", "feat/x");
    assert.equal((await r.check(r.batch)).ok, true);
  } finally { r.cleanup(); }
});

test("a branch without an upstream fails as ahead with the push -u fix", async () => {
  const r = makeRepo();
  try {
    git(r.batch, "switch", "-q", "-c", "feat/y");
    const result = await r.check(r.batch);
    assert.ok(codes(result).includes("ahead"));
    assert.match(finding(result, "ahead").fix, /git push -u origin feat\/y/);
  } finally { r.cleanup(); }
});

test("code changed on the branch without a register or handoff update fails; a handoff file clears it", async () => {
  const r = makeRepo();
  try {
    writeFileSync(join(r.batch, "apps", "a.ts"), "export const a = 2;\n");
    commitAll(r.batch, "feat: change");
    git(r.batch, "push", "-q");
    const result = await r.check(r.batch);
    assert.deepEqual(codes(result), ["resume-surface"]);
    assert.match(finding(result, "resume-surface").message, /apps\/a\.ts/);
    writeFileSync(join(r.batch, "handoff", "_general", "from-code", "2026-01-02-change.md"), "Intent: change\n");
    commitAll(r.batch, "docs: handoff");
    git(r.batch, "push", "-q");
    assert.equal((await r.check(r.batch)).ok, true);
  } finally { r.cleanup(); }
});

test("a program register update also satisfies the resume-surface rule", async () => {
  const r = makeRepo();
  try {
    writeFileSync(join(r.batch, "apps", "a.ts"), "export const a = 2;\n");
    writeFileSync(join(r.batch, "docs", "programs", "p", "tracks.yaml"), REGISTER.replace("continue the stored plan", "ship the change"));
    commitAll(r.batch, "feat: change with register");
    git(r.batch, "push", "-q");
    assert.equal((await r.check(r.batch)).ok, true);
  } finally { r.cleanup(); }
});

test("--since scopes the code-change rule to this session's commits", async () => {
  const r = makeRepo();
  try {
    writeFileSync(join(r.batch, "apps", "a.ts"), "export const a = 2;\n");
    commitAll(r.batch, "feat: earlier session");
    const start = git(r.batch, "rev-parse", "HEAD");
    writeFileSync(join(r.batch, "README.md"), "docs only\n");
    commitAll(r.batch, "docs: this session");
    git(r.batch, "push", "-q");
    assert.ok(codes(await r.check(r.batch)).includes("resume-surface"), "the whole branch still lacks a record");
    assert.equal((await r.check(r.batch, { since: start })).ok, true, "this session changed no code");
  } finally { r.cleanup(); }
});

test("an active track without a next action fails", async () => {
  const r = makeRepo();
  try {
    writeFileSync(join(r.batch, "docs", "programs", "p", "tracks.yaml"), REGISTER.replace("continue the stored plan from its handoff.", '""'));
    commitAll(r.batch, "docs: blank next action");
    git(r.batch, "push", "-q");
    const result = await r.check(r.batch);
    assert.ok(codes(result).includes("resume-surface"));
    assert.match(finding(result, "resume-surface").message, /T1 has no next_action/);
  } finally { r.cleanup(); }
});

test("a second batch worktree fails; recording it in the baseline turns it into a note", async () => {
  const r = makeRepo();
  try {
    const second = join(r.dir, "second");
    git(r.trunk, "worktree", "add", "-q", "-b", "feat/second", second, "main");
    const result = await r.check(r.batch);
    assert.ok(codes(result).includes("worktree"));
    assert.match(finding(result, "worktree").message, /2 batch worktrees/);
    writeFileSync(r.baseline, JSON.stringify({ canonicalWorktree: r.trunk, knownWorktrees: [{ path: second, reason: "test" }], knownBranches: [] }));
    const after = await r.check(r.batch);
    assert.equal(after.ok, true, JSON.stringify(after));
    assert.ok(after.warnings.some((w) => /1 worktree\(s\) recorded/.test(w)));
  } finally { r.cleanup(); }
});

test("a detached extra worktree fails as holding no batch branch", async () => {
  const r = makeRepo();
  try {
    const idle = join(r.dir, "idle");
    git(r.trunk, "worktree", "add", "-q", "--detach", idle, "main");
    const result = await r.check(r.batch);
    const f = result.failures.filter((x) => x.code === "worktree");
    assert.ok(f.some((x) => /holds no batch branch \(detached HEAD\)/.test(x.message)), JSON.stringify(result));
  } finally { r.cleanup(); }
});

// ── A worktree the gate does not own ────────────────────────────────────────
// On 2026-09-03 this finding told a session three times to `git worktree
// remove` a directory in active use: once a rebase in progress carrying an
// unpushed commit, twice a review agent mid-check. A detached HEAD is what an
// abandoned checkout looks like AND what live work looks like. Each time the
// instruction was disobeyed by a session that checked first; had it been
// followed, work would have been destroyed.

test("a detached worktree with uncommitted work is never reported as removable", async () => {
  const r = makeRepo();
  try {
    const live = join(r.dir, "live");
    git(r.trunk, "worktree", "add", "-q", "--detach", live, "main");
    writeFileSync(join(live, "apps", "a.ts"), "export const a = 2; // mid-edit\n");

    const result = await r.check(r.batch);
    const removal = result.failures.filter((x) => x.code === "worktree" && normalizePath(x.message).includes(normalizePath(live)));
    assert.deepEqual(removal, [], `must not instruct removal: ${JSON.stringify(result.failures)}`);
    assert.ok(
      result.warnings.some((w) => normalizePath(w).includes(normalizePath(live)) && /do NOT remove it/.test(w)),
      `expected a live-work warning, got ${JSON.stringify(result.warnings)}`,
    );
  } finally { r.cleanup(); }
});

test("a detached worktree with uncommitted work does not count toward the batch limit", async () => {
  // It is a tool's scratch checkout, not a second batch. Counting it made the
  // gate demand the removal of exactly the thing it must not remove.
  const r = makeRepo();
  try {
    const live = join(r.dir, "live");
    git(r.trunk, "worktree", "add", "-q", "--detach", live, "main");
    writeFileSync(join(live, "apps", "a.ts"), "export const a = 2;\n");
    const result = await r.check(r.batch);
    assert.ok(
      !result.failures.some((x) => /batch worktrees exist/.test(x.message)),
      JSON.stringify(result.failures),
    );
    assert.ok(result.warnings.some((w) => /excluded from the batch count/.test(w)));
  } finally { r.cleanup(); }
});

test("a clean detached worktree still fails, but the fix refuses to call it idle", async () => {
  // Cleanliness is sound in one direction only: dirty proves live, clean
  // proves nothing. The same review worktree went clean while still in use,
  // between finishing its mutations and writing its verdict.
  const r = makeRepo();
  try {
    const idle = join(r.dir, "idle");
    git(r.trunk, "worktree", "add", "-q", "--detach", idle, "main");
    const result = await r.check(r.batch);
    const f = result.failures.find((x) => x.code === "worktree" && normalizePath(x.message).includes(normalizePath(idle)));
    assert.ok(f, JSON.stringify(result.failures));
    assert.match(f.message, /holds no batch branch \(detached HEAD\)/);
    assert.match(f.fix, /A clean tree is NOT proof it is idle/);
    assert.match(f.fix, /ask its owner rather than removing it/);
  } finally { r.cleanup(); }
});

test("the dirty finding names the first path in full", async () => {
  // git status --porcelain writes " M path" for an unstaged change, and the
  // git helper trims the whole output, eating that leading space. A fixed
  // 3-character slice therefore removed the first character of the FIRST path
  // in every dirty finding: "cripts/handoff/handoff-check.mjs".
  const r = makeRepo();
  try {
    writeFileSync(join(r.batch, "apps", "a.ts"), "export const a = 3;\n");
    const result = await r.check(r.batch);
    const f = finding(result, "dirty");
    assert.ok(f, JSON.stringify(result.failures));
    assert.match(f.message, /apps\/a\.ts/);
    assert.ok(!/pps\/a\.ts/.test(f.message.replace(/apps\/a\.ts/g, "")), f.message);
  } finally { r.cleanup(); }
});

test("a fully merged local branch fails until deleted", async () => {
  const r = makeRepo();
  try {
    git(r.trunk, "branch", "old/merged", "main");
    const result = await r.check(r.batch);
    assert.ok(codes(result).includes("merged-branch"));
    assert.match(finding(result, "merged-branch").message, /old\/merged has landed on main \(ancestor\)/);
    assert.match(finding(result, "merged-branch").fix, /git branch -d old\/merged/);
    git(r.trunk, "branch", "-d", "old/merged");
    assert.equal((await r.check(r.batch)).ok, true);
  } finally { r.cleanup(); }
});

test("a fully merged remote branch fails until deleted on the remote", async () => {
  const r = makeRepo();
  try {
    git(r.trunk, "push", "-q", "origin", "main:refs/heads/old/remote");
    const result = await r.check(r.batch);
    const f = finding(result, "merged-branch");
    assert.ok(f, JSON.stringify(result));
    assert.match(f.message, /origin\/old\/remote/);
    assert.match(f.fix, /git push origin --delete old\/remote/);
    git(r.trunk, "push", "-q", "origin", "--delete", "old/remote");
    assert.equal((await r.check(r.batch)).ok, true);
  } finally { r.cleanup(); }
});

test("a checked-out branch with no commits beyond main is a note (fresh or fast-forwarded: git cannot tell)", async () => {
  const r = makeRepo();
  try {
    writeFileSync(join(r.batch, "docs.md"), "x\n");
    commitAll(r.batch, "docs: landed");
    git(r.batch, "push", "-q");
    git(r.trunk, "merge", "-q", "--ff-only", "feat/x");
    git(r.trunk, "push", "-q");
    const result = await r.check(r.trunk);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.ok(result.warnings.some((w) => /no commits beyond main/.test(w) && /git worktree remove/.test(w)), JSON.stringify(result));
    const own = await r.check(r.batch);
    assert.ok(own.warnings.some((w) => /has landed on main \(ancestor\)/.test(w)), JSON.stringify(own));
  } finally { r.cleanup(); }
});

test("a branch whose commits were rebased onto main has landed (patch-equivalent) and fails until deleted", async () => {
  const r = makeRepo();
  try {
    writeFileSync(join(r.batch, "docs.md"), "x\n");
    commitAll(r.batch, "docs: landed by rebase");
    git(r.batch, "push", "-q");
    const sha = git(r.batch, "rev-parse", "HEAD");
    // main moves first, so the cherry-pick gets a different parent and cannot
    // reproduce the branch commit's SHA byte for byte (same tree, same
    // parent, same second would make it an ancestor instead)
    writeFileSync(join(r.trunk, "main.md"), "moved\n");
    commitAll(r.trunk, "docs: main moved");
    git(r.trunk, "cherry-pick", sha);
    git(r.trunk, "push", "-q");
    const fromTrunk = await r.check(r.trunk);
    const f = finding(fromTrunk, "merged-branch");
    assert.ok(f, JSON.stringify(fromTrunk));
    assert.match(f.message, /feat\/x has landed on main \(patch-equivalent\)/);
    assert.match(f.fix, /git worktree remove .* then git branch -D feat\/x/);
    const remote = fromTrunk.failures.filter((x) => x.code === "merged-branch" && /origin\/feat\/x/.test(x.message));
    assert.equal(remote.length, 1, "the pushed copy is reported too");
    const own = await r.check(r.batch);
    assert.ok(own.warnings.some((w) => /has landed on main \(patch-equivalent\)/.test(w)), JSON.stringify(own));
    git(r.trunk, "worktree", "remove", "--force", r.batch);
    git(r.trunk, "branch", "-D", "feat/x");
    git(r.trunk, "push", "-q", "origin", "--delete", "feat/x");
    assert.equal((await r.check(r.trunk)).ok, true);
  } finally { r.cleanup(); }
});

test("the trunk must be on main or detached exactly at origin/main", async () => {
  const r = makeRepo();
  try {
    git(r.trunk, "switch", "-q", "--detach", "origin/main");
    const idle = await r.check(r.trunk);
    assert.equal(idle.ok, true, JSON.stringify(idle));
    assert.ok(idle.warnings.some((w) => /detached at origin\/main \(idle\)/.test(w)));
    git(r.trunk, "switch", "-q", "-c", "stray/branch");
    git(r.trunk, "push", "-q", "-u", "origin", "stray/branch");
    const off = await r.check(r.trunk);
    assert.ok(codes(off).includes("branch"));
    assert.match(finding(off, "branch").message, /is on stray\/branch; it stays on main/);
  } finally { r.cleanup(); }
});

test("a batch worktree on main fails as branch", async () => {
  const r = makeRepo();
  try {
    const onMain = join(r.dir, "onmain");
    git(r.trunk, "switch", "-q", "--detach", "origin/main");
    git(r.trunk, "worktree", "add", "-q", onMain, "main");
    git(r.trunk, "worktree", "remove", "--force", r.batch);
    const result = await r.check(onMain);
    assert.ok(codes(result).includes("branch"));
    assert.match(finding(result, "branch").message, /is on main/);
  } finally { r.cleanup(); }
});

test("local commits on main in the trunk fail as ahead with the move-to-a-branch fix", async () => {
  const r = makeRepo();
  try {
    writeFileSync(join(r.trunk, "docs.md"), "x\n");
    commitAll(r.trunk, "docs: direct on main");
    const result = await r.check(r.trunk);
    assert.ok(codes(result).includes("ahead"));
    assert.match(finding(result, "ahead").fix, /reviewed PRs/);
  } finally { r.cleanup(); }
});

test("pre-push blocks main unless a human allows it, and does not run the dirty check", async () => {
  const r = makeRepo();
  try {
    writeFileSync(join(r.batch, "stray.txt"), "x");
    const sha = git(r.batch, "rev-parse", "HEAD");
    const refs = readPushRefs(`refs/heads/feat/x ${sha} refs/heads/main ${sha}\n`);
    const blocked = await r.check(r.batch, { mode: "pre-push", pushedRefs: refs, pushRanges: pushRangesFor(refs), env: {} });
    assert.deepEqual(codes(blocked), ["release-push"]);
    const allowed = await r.check(r.batch, { mode: "pre-push", pushedRefs: refs, pushRanges: pushRangesFor(refs), env: { STRALE_ALLOW_MAIN_PUSH: "1" } });
    assert.equal(allowed.ok, true, JSON.stringify(allowed));
    const feature = readPushRefs(`refs/heads/feat/x ${sha} refs/heads/feat/x ${sha}\n`);
    const routine = await r.check(r.batch, { mode: "pre-push", pushedRefs: feature, pushRanges: pushRangesFor(feature), env: {} });
    assert.equal(routine.ok, true, JSON.stringify(routine));
  } finally { r.cleanup(); }
});

test("pre-push does not apply the resume-surface rule (a backup push is routine); the session gate does", async () => {
  const r = makeRepo();
  try {
    const before = git(r.batch, "rev-parse", "HEAD");
    writeFileSync(join(r.batch, "apps", "a.ts"), "export const a = 3;\n");
    commitAll(r.batch, "feat: code only");
    const sha = git(r.batch, "rev-parse", "HEAD");
    const refs = readPushRefs(`refs/heads/feat/x ${sha} refs/heads/feat/x ${before}\n`);
    const push = await r.check(r.batch, { mode: "pre-push", pushedRefs: refs, pushRanges: pushRangesFor(refs), env: {} });
    assert.equal(push.ok, true, JSON.stringify(push));
    git(r.batch, "push", "-q");
    assert.deepEqual(codes(await r.check(r.batch)), ["resume-surface"]);
  } finally { r.cleanup(); }
});

test("pre-commit blocks commits on main and skips the dirty check", async () => {
  const r = makeRepo();
  try {
    writeFileSync(join(r.trunk, "stray.txt"), "x");
    const blocked = await r.check(r.trunk, { mode: "pre-commit", env: {}, inventoryTargets: [] });
    assert.deepEqual(codes(blocked), ["release-commit"]);
    const allowed = await r.check(r.trunk, { mode: "pre-commit", env: { STRALE_ALLOW_MAIN_PUSH: "1" }, inventoryTargets: [] });
    assert.equal(allowed.ok, true, JSON.stringify(allowed));
    const feature = await r.check(r.batch, { mode: "pre-commit", env: {}, inventoryTargets: [] });
    assert.equal(feature.ok, true, JSON.stringify(feature));
  } finally { r.cleanup(); }
});

test("pre-commit runs the project context check only when inventory targets are staged", async () => {
  const r = makeRepo();
  try {
    let calls = 0;
    const failing = () => { calls += 1; return { status: 0, stdout: JSON.stringify({ mode: "warning-only", findings: [{ severity: "warning", code: "INVENTORY_HASH_DRIFT", path: "docs/project/legacy-authority-inventory.json" }] }), stderr: "" }; };
    const none = await r.check(r.batch, { mode: "pre-commit", env: {}, stagedFiles: ["apps/a.ts"], inventoryTargets: ["CLAUDE.md", "handoff"], inventoryCheck: failing });
    assert.equal(none.ok, true);
    assert.equal(calls, 0);
    const hit = await r.check(r.batch, { mode: "pre-commit", env: {}, stagedFiles: ["handoff/_general/from-code/x.md"], inventoryTargets: ["CLAUDE.md", "handoff"], inventoryCheck: failing });
    assert.deepEqual(codes(hit), ["inventory"]);
    assert.match(finding(hit, "inventory").message, /INVENTORY_HASH_DRIFT docs\/project\/legacy-authority-inventory\.json/);
    assert.equal(calls, 1);
    const passing = () => ({ status: 0, stdout: JSON.stringify({ mode: "warning-only", findings: [] }), stderr: "" });
    const ok = await r.check(r.batch, { mode: "pre-commit", env: {}, stagedFiles: ["CLAUDE.md"], inventoryTargets: ["CLAUDE.md"], inventoryCheck: passing });
    assert.equal(ok.ok, true);
  } finally { r.cleanup(); }
});

test("baseline records the extra worktree and merged branch that already exist", async () => {
  const r = makeRepo();
  try {
    const second = join(r.dir, "second");
    git(r.trunk, "worktree", "add", "-q", "--detach", second, "main");
    git(r.trunk, "branch", "old/merged", "main");
    const report = await baselineReport({ root: r.batch, baseline: r.baseline, fetch: false, write: true, reason: "test" });
    assert.deepEqual(report.added.worktrees.map((w) => normalizePath(w.path)), [normalizePath(second)]);
    assert.deepEqual(report.added.branches.map((b) => b.name), ["old/merged"]);
    const stored = loadBaseline(r.baseline);
    assert.equal(stored.knownWorktrees.length, 1);
    assert.equal(stored.knownBranches.length, 1);
    const after = await r.check(r.batch);
    assert.equal(after.ok, true, JSON.stringify(after));
  } finally { r.cleanup(); }
});

test("pre-push never refuses the push that deletes a landed branch, nor a routine backup push", async () => {
  const r = makeRepo();
  try {
    git(r.trunk, "push", "-q", "origin", "main:refs/heads/old/a");
    git(r.trunk, "push", "-q", "origin", "main:refs/heads/old/b");
    const zeros = "0".repeat(40);
    // unlanded code on the batch branch must not be judged by a delete-only push
    writeFileSync(join(r.batch, "apps", "a.ts"), "export const a = 9;\n");
    commitAll(r.batch, "feat: unlanded code");
    git(r.batch, "push", "-q");
    const sha = git(r.batch, "rev-parse", "HEAD");
    const del = readPushRefs(`(delete) ${zeros} refs/heads/old/a ${sha}\n`);
    const deleting = await r.check(r.batch, { mode: "pre-push", pushedRefs: del, pushRanges: pushRangesFor(del), env: {} });
    assert.equal(deleting.ok, true, JSON.stringify(deleting));
    assert.ok(!deleting.warnings.some((w) => /origin\/old\/a/.test(w)), "the branch being deleted is not reported");
    assert.ok(deleting.warnings.some((w) => /\[merged-branch\] remote branch origin\/old\/b/.test(w)), "the other landed branch is a note");
    const routine = readPushRefs(`refs/heads/feat/x ${sha} refs/heads/feat/x ${sha}\n`);
    const backup = await r.check(r.batch, { mode: "pre-push", pushedRefs: routine, pushRanges: pushRangesFor(routine), env: {} });
    assert.equal(backup.ok, true, JSON.stringify(backup), "an up-to-date ref pushes an empty range");
    const session = await r.check(r.batch);
    assert.ok(codes(session).includes("merged-branch"), "the session gate still fails on them");
  } finally { r.cleanup(); }
});

test("a baseline canonical path that is not one of this clone's worktrees is ignored", async () => {
  const r = makeRepo();
  try {
    writeFileSync(r.baseline, JSON.stringify({ canonicalWorktree: "C:/somewhere/else/strale", knownWorktrees: [], knownBranches: [] }));
    const fromTrunk = await r.check(r.trunk);
    assert.equal(fromTrunk.kind, "trunk", JSON.stringify(fromTrunk));
    assert.equal(fromTrunk.ok, true, JSON.stringify(fromTrunk));
    const fromBatch = await r.check(r.batch);
    assert.equal(fromBatch.kind, "batch");
    assert.equal(fromBatch.ok, true, JSON.stringify(fromBatch));
  } finally { r.cleanup(); }
});

test("a Claude Code agent worktree under .claude/worktrees/ is a note, not a batch worktree", async () => {
  const r = makeRepo();
  try {
    const agent = join(r.trunk, ".claude", "worktrees", "agent-1");
    git(r.trunk, "worktree", "add", "-q", "-b", "claude/agent-1", agent, "main");
    const result = await r.check(r.batch);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.ok(result.warnings.some((w) => /1 Claude Code agent worktree/.test(w)), JSON.stringify(result));
  } finally { r.cleanup(); }
});

test("a gone upstream after a merged PR is a note; a gone upstream with unlanded work is an ahead failure", async () => {
  const r = makeRepo();
  try {
    writeFileSync(join(r.batch, "docs.md"), "x\n");
    commitAll(r.batch, "docs: landed");
    git(r.batch, "push", "-q");
    git(r.trunk, "merge", "-q", "--ff-only", "feat/x");
    git(r.trunk, "push", "-q");
    git(r.trunk, "push", "-q", "origin", "--delete", "feat/x");
    git(r.batch, "fetch", "-q", "--prune", "origin");
    const landed = await r.check(r.batch);
    assert.equal(landed.ok, true, JSON.stringify(landed));
    assert.ok(landed.warnings.some((w) => /remote branch is deleted \(PR merged\)/.test(w) && /do not push it again/.test(w)), JSON.stringify(landed));
    writeFileSync(join(r.batch, "more.md"), "y\n");
    commitAll(r.batch, "docs: unlanded");
    const unlanded = await r.check(r.batch);
    assert.ok(codes(unlanded).includes("ahead"), JSON.stringify(unlanded));
    assert.match(finding(unlanded, "ahead").message, /remote branch is gone and its work has not landed/);
  } finally { r.cleanup(); }
});

test("path comparison is separator-insensitive, and case-insensitive on Windows", () => {
  assert.equal(normalizePath("C:\\Users\\x\\repo\\"), normalizePath("C:/Users/x/repo"));
  if (process.platform === "win32") assert.equal(normalizePath("c:/users/X/REPO"), normalizePath("C:/Users/x/repo"));
});

test("worktree porcelain parsing and push-range derivation", () => {
  const entries = parseWorktrees("worktree C:/a\nHEAD 1111\nbranch refs/heads/main\n\nworktree C:/b\nHEAD 2222\ndetached\n\n");
  assert.deepEqual(entries.map((e) => [e.path, e.branch, e.detached]), [["C:/a", "main", false], ["C:/b", null, true]]);
  const refs = readPushRefs("refs/heads/f 2222 refs/heads/f 1111\n(delete) 0000000000 refs/heads/gone 3333\nrefs/heads/new 4444 refs/heads/new 0000000000\n");
  assert.deepEqual(pushRangesFor(refs), ["1111..2222", "origin/main...4444"]);
});
