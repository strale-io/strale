// Tests for scheduled mechanism OUTCOMES (scripts/scheduled-outcomes-lib.mjs,
// scripts/check-scheduled-outcomes.mjs).
//
// The case this exists for is reproduced below from `weekly-drift.yml`'s
// real run history on 2026-09-17: four consecutive failed scheduled runs
// (2026-08-24, 08-31, 09-07, 09-14) whose nearest green is a manual
// `workflow_dispatch` re-run on 08-18, with another failed scheduled run
// beneath it. A check that counted the dispatch re-run as a success would
// have read that history as a four-week problem that had already been fixed
// once, which is why `classifyRuns` filters on `event === "schedule"` and why
// one of these tests plants exactly that shape.
//
// Every test drives the library or the CLI with run lists as data — no
// network, no `gh`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assessAll,
  assessWorkflow,
  classifyRuns,
  repoRootFrom,
  scheduledWorkflows,
  CONSECUTIVE_FAILURE_THRESHOLD,
} from "./scheduled-outcomes-lib.mjs";

const root = repoRootFrom(import.meta.url);
const CLI = resolve(dirname(fileURLToPath(import.meta.url)), "check-scheduled-outcomes.mjs");

const run = (conclusion, createdAt, event = "schedule", databaseId = 1) => ({
  conclusion,
  createdAt,
  event,
  databaseId,
});

// The real weekly-drift.yml history, newest first, as `gh run list` returned
// it on 2026-09-17.
const WEEKLY_DRIFT_HISTORY = [
  run("failure", "2026-09-14T13:40:56Z", "schedule", 34850745140),
  run("failure", "2026-09-07T13:18:10Z", "schedule", 34126632942),
  run("failure", "2026-08-31T14:51:59Z", "schedule", 33405123478),
  run("failure", "2026-08-24T14:30:00Z", "schedule", 32703876720),
  run("success", "2026-08-18T12:00:00Z", "workflow_dispatch", 32134081484),
  run("failure", "2026-08-17T14:20:00Z", "schedule", 32007709257),
  run("success", "2026-08-10T14:20:00Z", "schedule", 31370032352),
];

test("classifyRuns counts consecutive failed SCHEDULED runs and ignores a manual re-run", () => {
  const facts = classifyRuns(WEEKLY_DRIFT_HISTORY);
  // Five, not four: the 08-18 green is a workflow_dispatch and does not
  // interrupt the scheduled streak, and 08-17's scheduled run failed too.
  assert.equal(facts.consecutiveFailures, 5);
  assert.equal(facts.lastSuccessAt, "2026-08-10T14:20:00Z");
  assert.equal(facts.latestConclusion, "failure");
  assert.equal(facts.latestRunId, 34850745140);
});

test("classifyRuns would read the same history as healthy if the dispatch re-run counted", () => {
  // Discriminates the event filter: relabel the manual re-run as scheduled
  // and the streak stops at four. The filter is the only thing separating
  // these two answers.
  const relabelled = WEEKLY_DRIFT_HISTORY.map((r) =>
    r.event === "workflow_dispatch" ? { ...r, event: "schedule" } : r,
  );
  assert.equal(classifyRuns(relabelled).consecutiveFailures, 4);
  assert.equal(classifyRuns(relabelled).lastSuccessAt, "2026-08-18T12:00:00Z");
});

test("classifyRuns skips a run still in flight rather than counting it either way", () => {
  const inFlight = [run(null, "2026-09-21T13:40:00Z"), ...WEEKLY_DRIFT_HISTORY];
  assert.equal(classifyRuns(inFlight).latestRunId, 34850745140);
  assert.equal(classifyRuns(inFlight).consecutiveFailures, 5);
});

test("assessWorkflow reports FAILING at the threshold and not below it", () => {
  const one = assessWorkflow({
    workflow: "w.yml",
    mechanisms: ["m1"],
    runs: [run("failure", "2026-09-14T00:00:00Z"), run("success", "2026-09-07T00:00:00Z")],
  });
  assert.equal(one.code, "SCHEDULED_WORKFLOW_FLAKY");
  assert.equal(one.severity, "warning");

  const two = assessWorkflow({
    workflow: "w.yml",
    mechanisms: ["m1"],
    runs: [
      run("failure", "2026-09-14T00:00:00Z"),
      run("failure", "2026-09-07T00:00:00Z"),
      run("success", "2026-08-31T00:00:00Z"),
    ],
  });
  assert.equal(two.code, "SCHEDULED_WORKFLOW_FAILING");
  assert.equal(two.severity, "failure");
  assert.equal(CONSECUTIVE_FAILURE_THRESHOLD, 2);
});

test("assessWorkflow returns null for a healthy workflow", () => {
  assert.equal(
    assessWorkflow({
      workflow: "w.yml",
      mechanisms: ["m1"],
      runs: [run("success", "2026-09-14T00:00:00Z"), run("failure", "2026-09-07T00:00:00Z")],
    }),
    null,
  );
});

test("a workflow with no scheduled runs warns rather than reading clean", () => {
  const f = assessWorkflow({
    workflow: "w.yml",
    mechanisms: ["m1"],
    runs: [run("success", "2026-09-14T00:00:00Z", "workflow_dispatch")],
  });
  assert.equal(f.code, "SCHEDULED_WORKFLOW_NO_RUNS");
  assert.equal(f.severity, "warning");
});

test("assessAll treats a workflow missing from the fetch as no-runs, never as clean", () => {
  const { findings, warnings } = assessAll({
    workflows: [{ workflow: "a.yml", mechanisms: ["m1"] }],
    runsByWorkflow: {},
  });
  assert.equal(findings.length, 0);
  assert.equal(warnings[0].code, "SCHEDULED_WORKFLOW_NO_RUNS");
});

test("the real workflows and register together yield every scheduled workflow", () => {
  const workflows = scheduledWorkflows(root);
  const paths = workflows.map((w) => w.workflow);
  assert.ok(paths.includes(".github/workflows/weekly-drift.yml"));
  assert.ok(paths.includes(".github/workflows/m3-digest-shadow.yml"));
  // The scope is wider than the register on purpose: stale-branches.yml is
  // scheduled but every step is an inline `gh` command, so it has no register
  // entry and a register-scoped version would have left it unwatched.
  const stale = workflows.find((w) => w.workflow === ".github/workflows/stale-branches.yml");
  assert.ok(stale, "stale-branches.yml is scheduled and must be watched");
  assert.deepEqual(stale.mechanisms, []);
  // railway-digest-cron is `verifiable: false` and names no workflow file.
  assert.ok(paths.every((p) => p.startsWith(".github/workflows/")));
  // ci.yml is not scheduled and must not appear.
  assert.ok(!paths.includes(".github/workflows/ci.yml"));
  // The three DATABASE_URL-reading drift mechanisms hang off one workflow,
  // which is why one dead credential blinded three checks at once.
  const drift = workflows.find((w) => w.workflow === ".github/workflows/weekly-drift.yml");
  assert.ok(drift.mechanisms.includes("weekly-drift-manifest-drift"));
  assert.ok(drift.mechanisms.includes("weekly-drift-toast-readability"));
  assert.ok(drift.mechanisms.includes("weekly-drift-output-schema"));
});

test("CLI exits 1 on the real failing history and names the blinded mechanisms", () => {
  const dir = mkdtempSync(join(tmpdir(), "sched-outcomes-"));
  try {
    const fixture = join(dir, "runs.json");
    writeFileSync(
      fixture,
      JSON.stringify({
        ".github/workflows/weekly-drift.yml": WEEKLY_DRIFT_HISTORY,
        ".github/workflows/m3-digest-shadow.yml": [run("success", "2026-09-17T10:58:34Z")],
      }),
    );
    let code = 0;
    let out = "";
    try {
      out = execFileSync(process.execPath, [CLI, "--runs-json", fixture], { encoding: "utf8" });
    } catch (e) {
      code = e.status;
      out = e.stdout ?? "";
    }
    assert.equal(code, 1);
    assert.match(out, /SCHEDULED_WORKFLOW_FAILING/);
    assert.match(out, /weekly-drift-toast-readability/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI exits 0 when every scheduled workflow's last cron run succeeded", () => {
  const dir = mkdtempSync(join(tmpdir(), "sched-outcomes-"));
  try {
    const fixture = join(dir, "runs.json");
    const green = [run("success", "2026-09-14T13:40:56Z"), run("success", "2026-09-07T13:18:10Z")];
    const all = Object.fromEntries(
      scheduledWorkflows(root).map((w) => [w.workflow, green]),
    );
    writeFileSync(fixture, JSON.stringify(all));
    const out = execFileSync(process.execPath, [CLI, "--runs-json", fixture], { encoding: "utf8" });
    assert.match(out, /ok {3}every scheduled workflow/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI exits 2 when the run history cannot be read at all", () => {
  // A check that cannot see must not exit 0. `fixtures:drift` shipped one
  // flag away from exactly this silent-clean failure.
  let code = 0;
  try {
    execFileSync(process.execPath, [CLI, "--runs-json", join(tmpdir(), "does-not-exist.json")], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    code = e.status;
  }
  assert.equal(code, 2);
});

test("CLI refuses a nonsense --limit rather than silently defaulting", () => {
  let code = 0;
  try {
    execFileSync(process.execPath, [CLI, "--limit", "0"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    code = e.status;
  }
  assert.equal(code, 2);
});
