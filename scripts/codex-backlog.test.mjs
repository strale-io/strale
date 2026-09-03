// Every failure mode of the Codex re-review backlog is planted in a throwaway
// fixture and must fail there; the clean counterpart must pass.
//
// The standing rule (LESSONS F5): no checker ships until it has failed on a
// planted case. A register that records a debt is worth exactly as much as the
// check that refuses to let it rot.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stringify } from "yaml";
import { checkBacklog, BACKLOG_PATH } from "./codex-backlog-lib.mjs";

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

function makeFixture(entries, policy = {}) {
  const dir = mkdtempSync(join(tmpdir(), "codex-backlog-"));
  mkdirSync(join(dir, dirname(BACKLOG_PATH)), { recursive: true });
  writeFileSync(
    join(dir, BACKLOG_PATH),
    stringify({
      schema_version: 1,
      policy: { decision: "DEC-20260903-A", raised: "2026-09-03", review_by: "2026-09-07", ...policy },
      entries,
    }),
    "utf8",
  );
  return dir;
}

const clean = { today: "2026-09-04", gitAvailable: false };

test("a well-formed pending row before the review date passes", () => {
  const dir = makeFixture([baseEntry()]);
  assert.deepEqual(checkBacklog(dir, clean).findings, []);
  rmSync(dir, { recursive: true, force: true });
});

test("REVIEW_OVERDUE: still pending after the review date", () => {
  // The whole point of the register. Without this it is a note nobody re-reads.
  const dir = makeFixture([baseEntry()]);
  const { findings } = checkBacklog(dir, { today: "2026-09-08", gitAvailable: false });
  assert.ok(findings.some((f) => f.code === "REVIEW_OVERDUE" && f.detail.includes("CX-1")), JSON.stringify(findings));
  rmSync(dir, { recursive: true, force: true });
});

test("a reviewed row is not overdue, whatever the date", () => {
  const dir = makeFixture([
    baseEntry({ status: "reviewed", codex_verdict: "PASS", codex_reviewed_on: "2026-09-07" }),
  ]);
  const { findings } = checkBacklog(dir, { today: "2026-09-30", gitAvailable: false });
  assert.deepEqual(findings, []);
  rmSync(dir, { recursive: true, force: true });
});

test("VERDICT_MISSING: reviewed with no verdict", () => {
  // "Reviewed" without a verdict means somebody said so, which is the shape
  // this register exists to refuse.
  const dir = makeFixture([baseEntry({ status: "reviewed" })]);
  const { findings } = checkBacklog(dir, clean);
  assert.ok(findings.some((f) => f.code === "VERDICT_MISSING"), JSON.stringify(findings));
  rmSync(dir, { recursive: true, force: true });
});

test("VERDICT_MISSING: reviewed with a verdict but no date", () => {
  const dir = makeFixture([baseEntry({ status: "reviewed", codex_verdict: "FAIL" })]);
  const { findings } = checkBacklog(dir, clean);
  assert.ok(findings.some((f) => f.code === "VERDICT_MISSING" && f.detail.includes("reviewed_on")), JSON.stringify(findings));
  rmSync(dir, { recursive: true, force: true });
});

test("WAIVER_UNEXPLAINED: waived with no reason", () => {
  const dir = makeFixture([baseEntry({ status: "waived" })]);
  const { findings } = checkBacklog(dir, clean);
  assert.ok(findings.some((f) => f.code === "WAIVER_UNEXPLAINED"), JSON.stringify(findings));
  rmSync(dir, { recursive: true, force: true });
});

test("COMMIT_MISSING: the row names a commit this repository does not have", () => {
  const dir = makeFixture([baseEntry({ commit: "0000000" })]);
  execFileSync("git", ["init", "-q", dir], { stdio: ["pipe", "pipe", "pipe"] });
  const { findings } = checkBacklog(dir, { today: "2026-09-04" });
  assert.ok(findings.some((f) => f.code === "COMMIT_MISSING"), JSON.stringify(findings));
  rmSync(dir, { recursive: true, force: true });
});

test("ENTRY_INVALID: a missing required field, an unknown status, a bad date", () => {
  const dir = makeFixture([
    baseEntry({ id: "CX-1", why_codex: undefined }),
    baseEntry({ id: "CX-2", status: "probably-fine" }),
    baseEntry({ id: "CX-3", merged: "September" }),
  ]);
  const { findings } = checkBacklog(dir, clean);
  const details = findings.filter((f) => f.code === "ENTRY_INVALID").map((f) => f.detail).join(" | ");
  assert.match(details, /CX-1 is missing why_codex/);
  assert.match(details, /CX-2 has status probably-fine/);
  assert.match(details, /CX-3 merged must be/);
  rmSync(dir, { recursive: true, force: true });
});

test("DUPLICATE_ID: the same id twice", () => {
  const dir = makeFixture([baseEntry(), baseEntry()]);
  const { findings } = checkBacklog(dir, clean);
  assert.ok(findings.some((f) => f.code === "DUPLICATE_ID"), JSON.stringify(findings));
  rmSync(dir, { recursive: true, force: true });
});

test("POLICY_INVALID: no review date means nothing can ever be overdue", () => {
  const dir = makeFixture([baseEntry()], { review_by: "soon" });
  const { findings } = checkBacklog(dir, clean);
  assert.ok(findings.some((f) => f.code === "POLICY_INVALID"), JSON.stringify(findings));
  rmSync(dir, { recursive: true, force: true });
});

test("real repo: the backlog is currently clean", () => {
  const { findings, entries } = checkBacklog(realRoot, { today: "2026-09-04" });
  assert.deepEqual(findings, [], JSON.stringify(findings));
  assert.ok(entries.length > 0, "the register should not be empty while Codex is out");
});
