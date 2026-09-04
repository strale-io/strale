// Every failure mode of the Codex re-review backlog is planted in a throwaway
// fixture and must fail there; the clean counterpart must pass.
//
// The standing rule (LESSONS F5): no checker ships until it has failed on a
// planted case. A register that records a debt is worth exactly as much as the
// check that refuses to let it rot — and the first version of this checker
// was drained to green five ways by an independent review, because it read
// only the file's shape. The HISTORY tests below plant each of those five
// drains in a real git repository and assert the checker refuses them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stringify } from "yaml";
import { checkBacklog, stripFences, BACKLOG_PATH } from "./codex-backlog-lib.mjs";

const realRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function baseEntry(overrides = {}) {
  return {
    id: "CX-1",
    subject: "a merged batch",
    commit: "deadbee",
    merged: "2026-09-03",
    priority: "high",
    status: "pending",
    why_codex: "because",
    what_to_attack: "this",
    ...overrides,
  };
}

const POLICY = { decision: "DEC-20260903-A", raised: "2026-09-03", review_by: "2026-09-07" };

function registerText(entries, policy = {}) {
  return stringify({ schema_version: 1, policy: { ...POLICY, ...policy }, entries });
}

/** Shape-only fixture: no git, history rules skipped. */
const KNOWN_DECISIONS = "#### Current Decisions\n- **DEC-20260903-A** (global, active): ship without Codex.\n- **DEC-20260903-B** (global, active): a waiver.\n- **DEC-20260907-A** (global, active): an extension.\n";

function makeFixture(entries, policy = {}) {
  const dir = mkdtempSync(join(tmpdir(), "codex-backlog-"));
  mkdirSync(join(dir, dirname(BACKLOG_PATH)), { recursive: true });
  writeFileSync(join(dir, BACKLOG_PATH), registerText(entries, policy), "utf8");
  writeFileSync(join(dir, "CLAUDE.md"), KNOWN_DECISIONS, "utf8");
  return dir;
}

/** An archived verdict for a row: says the verdict and names the commit. */
function verdictText(verdict, commit = "deadbee") {
  return `# Codex review of ${commit}\n\nFindings: none.\n\nVERDICT: ${verdict}\n`;
}

const clean = { today: "2026-09-04", gitAvailable: false };

function git(dir, ...args) {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

/**
 * Every fixture below is a real repository that `execFileSync` commits into
 * synchronously and a test then deletes a moment later. `git commit` itself
 * can spawn `git gc --auto` (and, through it, `git maintenance run --auto`),
 * and when `gc.autoDetach` is on (the default outside Windows) that spawns as
 * a background child the parent process does not wait for — it can still be
 * writing under `.git/objects/` (holding `.git/objects/maintenance.lock` or
 * repacking) after the synchronous `git commit`/`git switch` call has already
 * returned. `rmSync`'s own retry loop then races that late writer and loses
 * often enough to flake CI: ENOTEMPTY on `.git` mid-teardown. Every fixture
 * repository therefore turns all three auto-maintenance triggers off right
 * after `git init`, so no fixture ever spawns a background git process in
 * the first place. `checkBacklog` itself only ever shells out via
 * `execFileSync` (see codex-backlog-lib.mjs) — it does not spawn anything
 * asynchronously, so this is entirely a fixture-repository concern.
 */
function disableGitMaintenance(dir) {
  git(dir, "config", "gc.auto", "0");
  git(dir, "config", "gc.autoDetach", "false");
  git(dir, "config", "maintenance.auto", "false");
}

/**
 * Best-effort fixture teardown. `rmSync`'s built-in retry (maxRetries/
 * retryDelay) already covers a transient ENOTEMPTY/EBUSY/EPERM from a late
 * writer under `.git/`; this widens the backoff for the rare case that isn't
 * enough, and if the directory still won't go, warns and leaves it rather
 * than failing the test over a teardown artifact. Any other error (a real
 * bug, not a race) still throws.
 */
function cleanup(dir) {
  if (!dir) return;
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch (error) {
    if (error && ["ENOTEMPTY", "EBUSY", "EPERM"].includes(error.code)) {
      console.warn(
        `[codex-backlog.test.mjs] could not remove fixture ${dir} after retrying (${error.code}); ` +
          "leaving it on disk for manual cleanup instead of failing the test — " +
          "see disableGitMaintenance() for the known late-writer race this guards against.",
      );
      return;
    }
    throw error;
  }
}

/**
 * History fixture: a real repository with the register committed on `main`,
 * then edited on a branch. `checkBacklog` compares HEAD against the
 * merge-base with `main`, exactly as CI compares against origin/main.
 */
function makeHistoryFixture(baseEntries, headEntries, { basePolicy = {}, headPolicy = {}, extraFiles = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "codex-backlog-git-"));
  git(dir, "init", "-q", "-b", "main");
  disableGitMaintenance(dir);
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
  mkdirSync(join(dir, dirname(BACKLOG_PATH)), { recursive: true });
  writeFileSync(join(dir, BACKLOG_PATH), registerText(baseEntries, basePolicy), "utf8");
  writeFileSync(join(dir, "CLAUDE.md"), KNOWN_DECISIONS, "utf8");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  git(dir, "switch", "-q", "-c", "work");
  for (const [rel, content] of Object.entries(extraFiles)) {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    writeFileSync(join(dir, rel), content, "utf8");
  }
  writeFileSync(join(dir, BACKLOG_PATH), registerText(headEntries, headPolicy), "utf8");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "--allow-empty", "-m", "edit");
  return dir;
}

const history = { today: "2026-09-04", baseRef: "main" };
const codes = (r) => r.findings.map((f) => f.code);

// ── shape ────────────────────────────────────────────────────────────────────

test("a well-formed pending row before the review date passes", (t) => {
  const dir = makeFixture([baseEntry()]);
  t.after(() => cleanup(dir));
  assert.deepEqual(checkBacklog(dir, clean).findings, []);
});

test("REVIEW_OVERDUE: still pending after the review date", (t) => {
  const dir = makeFixture([baseEntry()]);
  t.after(() => cleanup(dir));
  const { findings } = checkBacklog(dir, { today: "2026-09-08", gitAvailable: false });
  assert.ok(findings.some((f) => f.code === "REVIEW_OVERDUE" && f.detail.includes("CX-1")), JSON.stringify(findings));
});

test("the review date itself is not overdue; the day after is", (t) => {
  const dir = makeFixture([baseEntry()]);
  t.after(() => cleanup(dir));
  assert.equal(codes(checkBacklog(dir, { today: "2026-09-07", gitAvailable: false })).includes("REVIEW_OVERDUE"), false);
  assert.equal(codes(checkBacklog(dir, { today: "2026-09-08", gitAvailable: false })).includes("REVIEW_OVERDUE"), true);
});

test("a reviewed row with an archived verdict is not overdue, whatever the date", (t) => {
  const dir = makeFixture([
    baseEntry({ status: "reviewed", codex_verdict: "PASS", codex_reviewed_on: "2026-09-07", codex_evidence: "archive/sessions/cx-1.md" }),
  ]);
  t.after(() => cleanup(dir));
  mkdirSync(join(dir, "archive/sessions"), { recursive: true });
  writeFileSync(join(dir, "archive/sessions/cx-1.md"), verdictText("PASS"), "utf8");
  assert.deepEqual(checkBacklog(dir, { today: "2026-09-30", gitAvailable: false }).findings, []);
});

test("VERDICT_MISSING: reviewed with no verdict, or a verdict with no date", (t) => {
  const dir = makeFixture([
    baseEntry({ id: "CX-1", status: "reviewed", codex_evidence: "archive/x.md" }),
    baseEntry({ id: "CX-2", status: "reviewed", codex_verdict: "FAIL", codex_evidence: "archive/x.md" }),
  ]);
  t.after(() => cleanup(dir));
  const found = checkBacklog(dir, clean).findings.filter((f) => f.code === "VERDICT_MISSING").map((f) => f.detail).join(" | ");
  assert.match(found, /CX-1 is reviewed but codex_verdict/);
  assert.match(found, /CX-2 is reviewed but codex_reviewed_on/);
});

test("VERDICT_EVIDENCE_MISSING: a status flip with no archived verdict is somebody saying so", (t) => {
  // The fabricate-a-verdict drain. Status, verdict and date are all the
  // right shape; nothing on disk backs them.
  const dir = makeFixture([baseEntry({ status: "reviewed", codex_verdict: "PASS", codex_reviewed_on: "2026-09-03" })]);
  const dir2 = makeFixture([baseEntry({ status: "reviewed", codex_verdict: "PASS", codex_reviewed_on: "2026-09-03", codex_evidence: "archive/sessions/nope.md" })]);
  t.after(() => {
    cleanup(dir);
    cleanup(dir2);
  });
  assert.ok(codes(checkBacklog(dir, clean)).includes("VERDICT_EVIDENCE_MISSING"));
  // Naming a path that does not exist is the same claim.
  assert.ok(checkBacklog(dir2, clean).findings.some((f) => f.code === "VERDICT_EVIDENCE_MISSING" && f.detail.includes("does not exist")));
});

test("WAIVER_UNAUTHORISED: a waiver needs a reason, the founder, and a decision", (t) => {
  // The waive-it drain: 'looks fine to me' closed the highest-priority row.
  const dir = makeFixture([
    baseEntry({ id: "CX-1", status: "waived" }),
    baseEntry({ id: "CX-2", status: "waived", waived_reason: "looks fine to me" }),
    baseEntry({ id: "CX-3", status: "waived", waived_reason: "r", waived_by: "claude", waived_decision: "DEC-20260903-B" }),
  ]);
  t.after(() => cleanup(dir));
  const found = checkBacklog(dir, clean).findings.filter((f) => f.code === "WAIVER_UNAUTHORISED").map((f) => f.detail).join(" | ");
  assert.match(found, /CX-1 is waived with no waived_reason/);
  assert.match(found, /CX-2 is waived but waived_by is null/);
  assert.match(found, /CX-3 is waived but waived_by is "claude"/);
});

test("a founder waiver naming its decision passes", (t) => {
  const dir = makeFixture([
    baseEntry({ status: "waived", waived_reason: "superseded by the rewrite", waived_by: "petter", waived_decision: "DEC-20260903-B" }),
  ]);
  t.after(() => cleanup(dir));
  assert.deepEqual(checkBacklog(dir, clean).findings, []);
});

test("COMMIT_MISSING: the row names a commit this repository does not have", (t) => {
  const dir = makeFixture([baseEntry({ commit: "0000000" })]);
  t.after(() => cleanup(dir));
  git(dir, "init", "-q");
  disableGitMaintenance(dir);
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "x");
  const { findings } = checkBacklog(dir, { today: "2026-09-04", skipHistory: true });
  assert.ok(findings.some((f) => f.code === "COMMIT_MISSING"), JSON.stringify(findings));
});

test("a shallow checkout reports the commit as unverifiable, not missing", (t) => {
  // A false COMMIT_MISSING failing every build would be worse than no check.
  const src = mkdtempSync(join(tmpdir(), "codex-backlog-src-"));
  const shallow = mkdtempSync(join(tmpdir(), "codex-backlog-shallow-"));
  t.after(() => {
    cleanup(src);
    cleanup(shallow);
  });
  git(src, "init", "-q", "-b", "main");
  disableGitMaintenance(src);
  git(src, "config", "user.email", "t@example.com");
  git(src, "config", "user.name", "t");
  writeFileSync(join(src, "a.txt"), "1\n", "utf8");
  git(src, "add", "-A");
  git(src, "commit", "-q", "-m", "one");
  const first = git(src, "rev-parse", "HEAD");
  writeFileSync(join(src, "a.txt"), "2\n", "utf8");
  git(src, "commit", "-q", "-am", "two");
  cleanup(shallow);
  execFileSync("git", ["clone", "-q", "--depth", "1", `file:///${src.replace(/\\/g, "/")}`, shallow], { stdio: ["pipe", "pipe", "pipe"] });
  disableGitMaintenance(shallow);
  mkdirSync(join(shallow, dirname(BACKLOG_PATH)), { recursive: true });
  writeFileSync(join(shallow, BACKLOG_PATH), registerText([baseEntry({ commit: first.slice(0, 8) })]), "utf8");
  const r = checkBacklog(shallow, { today: "2026-09-04", skipHistory: true });
  assert.equal(codes(r).includes("COMMIT_MISSING"), false, JSON.stringify(r.findings));
  assert.ok(r.warnings.some((w) => w.code === "COMMIT_UNVERIFIABLE"), JSON.stringify(r.warnings));
});

test("ENTRY_INVALID: a missing required field, an unknown status, a bad date", (t) => {
  const dir = makeFixture([
    baseEntry({ id: "CX-1", why_codex: undefined }),
    baseEntry({ id: "CX-2", status: "probably-fine" }),
    baseEntry({ id: "CX-3", merged: "September" }),
  ]);
  t.after(() => cleanup(dir));
  const details = checkBacklog(dir, clean).findings.filter((f) => f.code === "ENTRY_INVALID").map((f) => f.detail).join(" | ");
  assert.match(details, /CX-1 is missing why_codex/);
  assert.match(details, /CX-2 has status probably-fine/);
  assert.match(details, /CX-3 merged must be/);
});

test("DUPLICATE_ID: the same id twice", (t) => {
  const dir = makeFixture([baseEntry(), baseEntry()]);
  t.after(() => cleanup(dir));
  assert.ok(codes(checkBacklog(dir, clean)).includes("DUPLICATE_ID"));
});

test("POLICY_INVALID: no review date, or a decision that is not a decision id", (t) => {
  const dir = makeFixture([baseEntry()], { review_by: "soon" });
  const dir2 = makeFixture([baseEntry()], { decision: "the founder said so" });
  t.after(() => {
    cleanup(dir);
    cleanup(dir2);
  });
  assert.ok(codes(checkBacklog(dir, clean)).includes("POLICY_INVALID"));
  assert.ok(checkBacklog(dir2, clean).findings.some((f) => f.code === "POLICY_INVALID" && f.detail.includes("decision id")));
});

// ── the fabrication drains the second review found ──────────────────────────

test("DECISION_UNKNOWN: a well-formed policy.decision this repository does not record", (t) => {
  // The second review fabricated DEC-20260903-Z and the checker accepted it. A
  // format check is not an existence check.
  const dir = makeFixture([baseEntry()], { decision: "DEC-20260903-Z" });
  t.after(() => cleanup(dir));
  assert.ok(codes(checkBacklog(dir, clean)).includes("DECISION_UNKNOWN"));
});

test("a decision recorded as a formal record is known even if CLAUDE.md does not name it", (t) => {
  const dir = makeFixture([baseEntry()], { decision: "DEC-20260101-Q" });
  t.after(() => cleanup(dir));
  mkdirSync(join(dir, "docs/decisions/records"), { recursive: true });
  writeFileSync(join(dir, "docs/decisions/records/DEC-20260101-Q.md"), "---\nid: DEC-20260101-Q\n---\n", "utf8");
  assert.deepEqual(checkBacklog(dir, clean).findings, []);
});

test("WAIVER_UNAUTHORISED: a founder waiver citing a decision that does not exist", (t) => {
  const dir = makeFixture([
    baseEntry({ status: "waived", waived_reason: "r", waived_by: "petter", waived_decision: "DEC-20260903-Z" }),
  ]);
  t.after(() => cleanup(dir));
  assert.ok(checkBacklog(dir, clean).findings.some((f) => f.code === "WAIVER_UNAUTHORISED" && f.detail.includes("does not record")));
});

test("VERDICT_EVIDENCE_MISSING: an existing archive file that is not a verdict for this row", (t) => {
  // archive/README.md closed the highest-priority row in the second review.
  const dir = makeFixture([baseEntry({ status: "reviewed", codex_verdict: "PASS", codex_reviewed_on: "2026-09-07", codex_evidence: "archive/README.md" })]);
  t.after(() => cleanup(dir));
  mkdirSync(join(dir, "archive"), { recursive: true });
  writeFileSync(join(dir, "archive/README.md"), "# Archive index\n", "utf8");
  const r = checkBacklog(dir, clean);
  assert.ok(r.findings.some((f) => f.code === "VERDICT_EVIDENCE_MISSING" && f.detail.includes("VERDICT: PASS")), JSON.stringify(r.findings));
});

test("VERDICT_EVIDENCE_MISSING: a verdict file for a different verdict, or a different commit", (t) => {
  const dir = makeFixture([
    baseEntry({ id: "CX-1", status: "reviewed", codex_verdict: "PASS", codex_reviewed_on: "2026-09-07", codex_evidence: "archive/a.md" }),
    baseEntry({ id: "CX-2", status: "reviewed", codex_verdict: "PASS", codex_reviewed_on: "2026-09-07", codex_evidence: "archive/b.md" }),
  ]);
  t.after(() => cleanup(dir));
  mkdirSync(join(dir, "archive"), { recursive: true });
  writeFileSync(join(dir, "archive/a.md"), verdictText("FAIL"), "utf8");
  writeFileSync(join(dir, "archive/b.md"), verdictText("PASS", "0123456"), "utf8");
  const found = checkBacklog(dir, clean).findings.filter((f) => f.code === "VERDICT_EVIDENCE_MISSING").map((f) => f.detail).join(" | ");
  assert.match(found, /CX-1 cites archive\/a.md, which does not contain a line "VERDICT: PASS"/);
  assert.match(found, /CX-2 cites archive\/b.md, which does not mention commit deadbee/);
});

test("REVIEW_DATE_MOVED: an extension citing a decision that does not exist", (t) => {
  const dir = makeHistoryFixture([baseEntry()], [baseEntry()], {
    headPolicy: { review_by: "2099-01-01", review_by_extension: { decision: "DEC-20260903-Z", reason: "quota return slipped" } },
  });
  t.after(() => cleanup(dir));
  const r = checkBacklog(dir, { ...history, today: "2030-01-01" });
  assert.ok(r.findings.some((f) => f.code === "REVIEW_DATE_MOVED" && f.detail.includes("does not record")), JSON.stringify(r.findings));
});

test("VERDICT_EVIDENCE_MISSING: a `..` segment escapes archive/ and is refused", (t) => {
  // The third review: archive/../notes/fake-verdict.md passed the prefix
  // regex and closed the highest-priority row; enough `..` left the
  // repository entirely. Containment is a property of the resolved path.
  const dir = makeFixture([
    baseEntry({ id: "CX-1", status: "reviewed", codex_verdict: "PASS", codex_reviewed_on: "2026-09-07", codex_evidence: "archive/../notes/fake.md" }),
    baseEntry({ id: "CX-2", status: "reviewed", codex_verdict: "PASS", codex_reviewed_on: "2026-09-07", codex_evidence: "archive/../../../../tmp/evil.md" }),
  ]);
  t.after(() => cleanup(dir));
  mkdirSync(join(dir, "notes"), { recursive: true });
  writeFileSync(join(dir, "notes/fake.md"), verdictText("PASS"), "utf8");
  const found = checkBacklog(dir, clean).findings.filter((f) => f.code === "VERDICT_EVIDENCE_MISSING").map((f) => f.detail).join(" | ");
  assert.match(found, /CX-1 cites archive\/\.\.\/notes\/fake\.md, which is not a path inside archive\//);
  assert.match(found, /CX-2 cites .* which is not a path inside archive\//);
});

test("VERDICT_EVIDENCE_MISSING: a link inside archive/ that points outside is refused", (t) => {
  // Fourth review: `..` was refused but a junction placed inside archive/
  // and pointing at a directory outside passed the lexical check, and the
  // forged verdict behind it was read. Containment is judged on real paths.
  const dir = makeFixture([
    baseEntry({ status: "reviewed", codex_verdict: "PASS", codex_reviewed_on: "2026-09-07", codex_evidence: "archive/link/forged.md" }),
  ]);
  const outside = mkdtempSync(join(tmpdir(), "codex-backlog-outside-"));
  t.after(() => {
    cleanup(dir);
    cleanup(outside);
  });
  writeFileSync(join(outside, "forged.md"), verdictText("PASS"), "utf8");
  mkdirSync(join(dir, "archive"), { recursive: true });
  try {
    symlinkSync(outside, join(dir, "archive", "link"), "junction");
  } catch (error) {
    throw new Error(`could not create a directory link in the fixture: ${error}`);
  }
  const r = checkBacklog(dir, clean);
  assert.ok(r.findings.some((f) => f.code === "VERDICT_EVIDENCE_MISSING" && /link that leaves archive/.test(f.detail)), JSON.stringify(r.findings));
});

test("a link inside archive/ that stays inside archive/ is allowed", (t) => {
  const dir = makeFixture([
    baseEntry({ status: "reviewed", codex_verdict: "PASS", codex_reviewed_on: "2026-09-07", codex_evidence: "archive/alias/v.md" }),
  ]);
  t.after(() => cleanup(dir));
  mkdirSync(join(dir, "archive", "real"), { recursive: true });
  writeFileSync(join(dir, "archive", "real", "v.md"), verdictText("PASS"), "utf8");
  symlinkSync(join(dir, "archive", "real"), join(dir, "archive", "alias"), "junction");
  assert.deepEqual(checkBacklog(dir, clean).findings, []);
});

test("DECISION_UNKNOWN: a decision bullet inside a fenced code block does not count", (t) => {
  const dir = makeFixture([baseEntry()], { decision: "DEC-20260903-Z" });
  t.after(() => cleanup(dir));
  writeFileSync(join(dir, "CLAUDE.md"), KNOWN_DECISIONS + "\nExample:\n\n```markdown\n- **DEC-20260903-Z** (global, active): an example entry.\n```\n", "utf8");
  assert.ok(codes(checkBacklog(dir, clean)).includes("DECISION_UNKNOWN"));
});

test("fence stripping: unclosed, tilde, and indented fences are all stripped; text after a closed fence survives", (t) => {
  // Fifth review: a lazy match needing a closing fence stripped NOTHING when
  // the fence was never closed, reopening the hole this was meant to close;
  // ~~~ and indented fences were not recognised at all.
  const kept = "- **DEC-20260903-A** real\n";
  assert.equal(stripFences("```\n- **DEC-20260903-Z** in an unclosed fence\n" ), "");
  assert.equal(stripFences("~~~md\n- **DEC-20260903-Z**\n~~~\n" + kept), "\n" + kept);
  assert.equal(stripFences("   ```\n- **DEC-20260903-Z**\n   ```\n" + kept), "\n" + kept);
  assert.equal(stripFences("```\nx\n```\n" + kept), "\n" + kept);
  const dirs = [];
  t.after(() => dirs.forEach(cleanup));
  for (const fence of ["```\n- **DEC-20260903-Z** never closed\n", "~~~\n- **DEC-20260903-Z**\n~~~\n", "  ```\n- **DEC-20260903-Z**\n  ```\n"]) {
    const dir = makeFixture([baseEntry()], { decision: "DEC-20260903-Z" });
    dirs.push(dir);
    writeFileSync(join(dir, "CLAUDE.md"), KNOWN_DECISIONS + "\n" + fence, "utf8");
    assert.ok(codes(checkBacklog(dir, clean)).includes("DECISION_UNKNOWN"), JSON.stringify(fence));
  }
});

test("VERDICT_EVIDENCE_MISSING: archive/ itself being a link is refused", (t) => {
  const dir = makeFixture([
    baseEntry({ status: "reviewed", codex_verdict: "PASS", codex_reviewed_on: "2026-09-07", codex_evidence: "archive/v.md" }),
  ]);
  const elsewhere = mkdtempSync(join(tmpdir(), "codex-backlog-elsewhere-"));
  t.after(() => {
    cleanup(dir);
    cleanup(elsewhere);
  });
  writeFileSync(join(elsewhere, "v.md"), verdictText("PASS"), "utf8");
  symlinkSync(elsewhere, join(dir, "archive"), "junction");
  const r = checkBacklog(dir, clean);
  assert.ok(r.findings.some((f) => f.code === "VERDICT_EVIDENCE_MISSING"), JSON.stringify(r.findings));
});

test("DECISION_UNKNOWN: a bold mention outside the decision list does not count", (t) => {
  // The third review satisfied the first existence check with a throwaway
  // appendix sentence. Only a list entry — a bullet starting with the bold
  // id — records a decision.
  const dir = makeFixture([baseEntry()], { decision: "DEC-20260903-Z" });
  t.after(() => cleanup(dir));
  writeFileSync(join(dir, "CLAUDE.md"), KNOWN_DECISIONS + "\nSome appendix note mentioning **DEC-20260903-Z** in passing.\n", "utf8");
  assert.ok(codes(checkBacklog(dir, clean)).includes("DECISION_UNKNOWN"));
});

// ── history: the five drains ────────────────────────────────────────────────

test("history: an unchanged register passes against its base", (t) => {
  const dir = makeHistoryFixture([baseEntry()], [baseEntry()]);
  t.after(() => cleanup(dir));
  const r = checkBacklog(dir, history);
  assert.deepEqual(r.findings.filter((f) => f.code !== "COMMIT_MISSING"), [], JSON.stringify(r.findings));
});

test("ROW_DELETED: a row that existed at the base is gone", (t) => {
  const dir = makeHistoryFixture([baseEntry({ id: "CX-1" }), baseEntry({ id: "CX-2" })], [baseEntry({ id: "CX-2" })]);
  t.after(() => cleanup(dir));
  assert.ok(checkBacklog(dir, history).findings.some((f) => f.code === "ROW_DELETED" && f.detail.includes("CX-1")));
});

test("ROW_DELETED: emptying the register is the maximal deletion", (t) => {
  const dir = makeHistoryFixture([baseEntry({ id: "CX-1" }), baseEntry({ id: "CX-2" })], []);
  t.after(() => cleanup(dir));
  const deleted = checkBacklog(dir, history).findings.filter((f) => f.code === "ROW_DELETED");
  assert.equal(deleted.length, 2, JSON.stringify(deleted));
});

test("STATUS_REGRESSED: a row moves backward, or a closed row is reopened or re-closed", (t) => {
  const closed = baseEntry({ status: "reviewed", codex_verdict: "FAIL", codex_reviewed_on: "2026-09-07", codex_evidence: "archive/v.md" });
  const dir = makeHistoryFixture(
    [baseEntry({ id: "CX-1", status: "in_review" }), { ...closed, id: "CX-2" }, { ...closed, id: "CX-3" }],
    [
      baseEntry({ id: "CX-1", status: "pending" }),
      baseEntry({ id: "CX-2", status: "pending" }),
      { ...closed, id: "CX-3", codex_verdict: "PASS" },
    ],
    { extraFiles: { "archive/v.md": verdictText("FAIL") } },
  );
  t.after(() => cleanup(dir));
  const found = checkBacklog(dir, history).findings.filter((f) => f.code === "STATUS_REGRESSED").map((f) => f.detail).join(" | ");
  assert.match(found, /CX-1 moved from in_review back to pending/);
  assert.match(found, /CX-2 was closed as reviewed and is now pending/);
  assert.match(found, /CX-3 changed codex_verdict from "FAIL" to "PASS"/);
});

test("history: moving a row forward with archived evidence is the honest close, and passes", (t) => {
  const dir = makeHistoryFixture(
    [baseEntry()],
    [baseEntry({ status: "reviewed", codex_verdict: "PASS", codex_reviewed_on: "2026-09-07", codex_evidence: "archive/sessions/cx-1.md" })],
    { extraFiles: { "archive/sessions/cx-1.md": verdictText("PASS") } },
  );
  t.after(() => cleanup(dir));
  const r = checkBacklog(dir, { ...history, today: "2026-09-30" });
  assert.deepEqual(r.findings.filter((f) => f.code !== "COMMIT_MISSING"), [], JSON.stringify(r.findings));
});

test("COMMIT_CHANGED: a row now names a different commit", (t) => {
  const dir = makeHistoryFixture([baseEntry({ commit: "aaaaaaa" })], [baseEntry({ commit: "bbbbbbb" })]);
  t.after(() => cleanup(dir));
  assert.ok(codes(checkBacklog(dir, history)).includes("COMMIT_CHANGED"));
});

test("REVIEW_DATE_MOVED: pushing the date out defuses every row at once", (t) => {
  const dir = makeHistoryFixture([baseEntry()], [baseEntry()], { headPolicy: { review_by: "2099-01-01" } });
  t.after(() => cleanup(dir));
  const r = checkBacklog(dir, { ...history, today: "2030-01-01" });
  assert.ok(codes(r).includes("REVIEW_DATE_MOVED"), JSON.stringify(r.findings));
  // ...and the original date still governs overdue-ness in the meantime.
});

test("an extension that names a founder decision and a reason is allowed", (t) => {
  const dir = makeHistoryFixture([baseEntry()], [baseEntry()], {
    headPolicy: { review_by: "2026-09-14", review_by_extension: { decision: "DEC-20260907-A", reason: "quota return slipped a week" } },
  });
  t.after(() => cleanup(dir));
  assert.equal(codes(checkBacklog(dir, history)).includes("REVIEW_DATE_MOVED"), false);
});

test("history: a stale branch missing rows main added later is not a deletion", (t) => {
  // Compare against the merge-base, not the tip of main, or every branch cut
  // before a new row was added would fail.
  const dir = makeHistoryFixture([baseEntry({ id: "CX-1" })], [baseEntry({ id: "CX-1" })]);
  t.after(() => cleanup(dir));
  git(dir, "switch", "-q", "main");
  writeFileSync(join(dir, BACKLOG_PATH), registerText([baseEntry({ id: "CX-1" }), baseEntry({ id: "CX-2" })]), "utf8");
  git(dir, "commit", "-q", "-am", "main adds CX-2");
  git(dir, "switch", "-q", "work");
  assert.equal(codes(checkBacklog(dir, history)).includes("ROW_DELETED"), false);
});

test("history: first introduction (no register at the base) skips history rules", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "codex-backlog-intro-"));
  t.after(() => cleanup(dir));
  git(dir, "init", "-q", "-b", "main");
  disableGitMaintenance(dir);
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
  writeFileSync(join(dir, "README.md"), "x\n", "utf8");
  writeFileSync(join(dir, "CLAUDE.md"), KNOWN_DECISIONS, "utf8");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  git(dir, "switch", "-q", "-c", "work");
  mkdirSync(join(dir, dirname(BACKLOG_PATH)), { recursive: true });
  writeFileSync(join(dir, BACKLOG_PATH), registerText([baseEntry()]), "utf8");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "introduce");
  const r = checkBacklog(dir, history);
  assert.deepEqual(r.findings.filter((f) => f.code !== "COMMIT_MISSING"), [], JSON.stringify(r.findings));
});

test("real repo: the backlog is currently clean", () => {
  const { findings, entries } = checkBacklog(realRoot, { today: "2026-09-04" });
  assert.deepEqual(findings, [], JSON.stringify(findings));
  assert.ok(entries.length > 0, "the register should not be empty while Codex is out");
});
