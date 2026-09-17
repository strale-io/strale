// Tests for scheduled mechanism OUTCOMES (scripts/scheduled-outcomes-lib.mjs,
// scripts/check-scheduled-outcomes.mjs).
//
// The case this exists for is `weekly-drift.yml`'s run history, copied
// VERBATIM below from `gh run list --workflow weekly-drift.yml --limit 12` on
// 2026-09-17 — every id, timestamp, event and conclusion exactly as returned,
// including the two FAILED workflow_dispatch runs on 08-18 that an earlier
// version of this fixture silently dropped and the rounded timestamps it
// invented. Five consecutive failed scheduled runs (08-17, 08-24, 08-31,
// 09-07, 09-14); the nearest green is a manual `workflow_dispatch` re-run on
// 08-18; the last successful SCHEDULED run is 08-10. A check that counted the
// dispatch re-run as a success would have read that history as a problem
// already fixed once, which is why `classifyRuns` filters on
// `event === "schedule"` and why one of these tests plants exactly that shape.
//
// Note on the prose elsewhere: the five failures do NOT share one cause. The
// 08-17 run failed with ECONNREFUSED to localhost:5432 (an unset DATABASE_URL
// falling back to a local socket); only the four from 08-24 carry
// `password authentication failed for user "postgres"`. This library counts
// consecutive failures and does not claim a cause, which is the right
// division — but the fixture is real history, so the distinction is recorded
// here rather than lost.
//
// Every test drives the library or the CLI with run lists as data — no
// network, no `gh`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assessAll,
  assessWorkflow,
  classifyRuns,
  fetchRunsPerWorkflow,
  ghRunListArgs,
  repoRootFrom,
  scheduledWorkflows,
  CONSECUTIVE_FAILURE_THRESHOLD,
  DEFAULT_RUN_LIMIT,
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
  run("failure", "2026-08-24T07:57:08Z", "schedule", 32703876720),
  run("success", "2026-08-18T11:54:40Z", "workflow_dispatch", 32134081484),
  run("failure", "2026-08-18T11:29:39Z", "workflow_dispatch", 32131992897),
  run("failure", "2026-08-18T10:15:12Z", "workflow_dispatch", 32125828728),
  run("failure", "2026-08-17T07:52:17Z", "schedule", 32007709257),
  run("success", "2026-08-10T08:25:53Z", "schedule", 31370032352),
  run("success", "2026-08-03T10:41:45Z", "schedule", 30806576259),
  run("success", "2026-07-27T10:42:37Z", "schedule", 30259105783),
  run("success", "2026-07-20T10:10:23Z", "schedule", 29734122518),
];

test("classifyRuns counts consecutive failed SCHEDULED runs and ignores a manual re-run", () => {
  const facts = classifyRuns(WEEKLY_DRIFT_HISTORY);
  // Five, not four: the 08-18 green is a workflow_dispatch and does not
  // interrupt the scheduled streak, and 08-17's scheduled run failed too.
  assert.equal(facts.consecutiveFailures, 5);
  assert.equal(facts.lastSuccessAt, "2026-08-10T08:25:53Z");
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
  // Relabelled, the 08-18 green stops the streak at four — and the two FAILED
  // dispatch runs beneath it would then count too. Either way the answer
  // changes, which is the point: the filter is load-bearing.
  assert.equal(classifyRuns(relabelled).consecutiveFailures, 4);
  assert.equal(classifyRuns(relabelled).lastSuccessAt, "2026-08-18T11:54:40Z");
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
  const { workflows, unreadable } = scheduledWorkflows(root);
  assert.deepEqual(unreadable, [], "every committed workflow must parse");
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
      scheduledWorkflows(root).workflows.map((w) => [w.workflow, green]),
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

// ─── the network half ───────────────────────────────────────────────────────
//
// Everything above this line drives the pure library. An independent review
// found four mutations that survived the original suite, all of them here:
// the default --limit, the two sorts, the warning/finding partition, and the
// register's own filters. The first is the one that mattered — at limit 1 the
// real five-failure history reads as a single flake, a warning, exit 0, with
// every other test still green.

test("the default run limit is large enough that a real streak is not read as a flake", () => {
  // The mutation: DEFAULT_RUN_LIMIT 20 -> 1. `gh run list --limit 1` returns
  // only 2026-09-14, consecutiveFailures 1, FLAKY, exit 0 — the tool reporting
  // "all clear" on the exact history it was built for.
  assert.ok(DEFAULT_RUN_LIMIT >= 10, "a short window hides the streak it exists to find");
  const truncated = WEEKLY_DRIFT_HISTORY.slice(0, 1);
  assert.equal(assessWorkflow({ workflow: "w", mechanisms: [], runs: truncated }).severity, "warning");
  const full = WEEKLY_DRIFT_HISTORY.slice(0, DEFAULT_RUN_LIMIT);
  assert.equal(assessWorkflow({ workflow: "w", mechanisms: [], runs: full }).severity, "failure");
});

test("ghRunListArgs asks for the fields the classifier needs, at the given limit", () => {
  const args = ghRunListArgs(".github/workflows/weekly-drift.yml", 20);
  assert.deepEqual(args, [
    "run", "list",
    "--workflow", "weekly-drift.yml",
    "--limit", "20",
    "--json", "conclusion,createdAt,event,databaseId",
  ]);
  // `event` is the field the manual-re-run filter depends on; dropping it from
  // the request would make every run look scheduled.
  assert.ok(args[args.length - 1].includes("event"));
  assert.equal(ghRunListArgs("a/b/c.yml", 3)[5], "3");
});

test("one unreadable workflow becomes its own finding and the others are still read", () => {
  // The mutation this kills: a single try around the whole fetch loop. A
  // renamed workflow used to abort everything and print "could not read
  // scheduled run history", hiding the finding the tool exists for.
  const workflows = [
    { workflow: "a.yml", mechanisms: ["m-a"] },
    { workflow: "gone.yml", mechanisms: ["m-gone"] },
  ];
  const { runsByWorkflow, unreadable } = fetchRunsPerWorkflow({
    workflows,
    limit: 20,
    run: (args) => {
      if (args.includes("gone.yml")) {
        throw new Error(["HTTP 404: workflow gone.yml not found", "second line"].join("\n"));
      }
      return JSON.stringify(WEEKLY_DRIFT_HISTORY);
    },
  });
  assert.deepEqual(Object.keys(runsByWorkflow), ["a.yml"]);
  assert.equal(unreadable.length, 1);
  assert.equal(unreadable[0].code, "RUN_HISTORY_UNREADABLE");
  assert.equal(unreadable[0].severity, "failure");
  assert.ok(!unreadable[0].detail.includes("second line"), "only the first line of the error");

  const { findings } = assessAll({ workflows, runsByWorkflow, unreadable });
  const codes = findings.map((f) => f.code).sort();
  assert.deepEqual(codes, ["RUN_HISTORY_UNREADABLE", "SCHEDULED_WORKFLOW_FAILING"]);
});

test("a workflow that is both unreadable and runless is reported once, not twice", () => {
  const workflows = [{ workflow: "gone.yml", mechanisms: [] }];
  const { runsByWorkflow, unreadable } = fetchRunsPerWorkflow({
    workflows,
    limit: 20,
    run: () => {
      throw new Error("404");
    },
  });
  const { findings, warnings } = assessAll({ workflows, runsByWorkflow, unreadable });
  assert.equal(findings.length, 1);
  assert.equal(warnings.length, 0, "no duplicate SCHEDULED_WORKFLOW_NO_RUNS for the same workflow");
});

test("a run list that is not an array is unreadable, not an empty history", () => {
  const { unreadable } = fetchRunsPerWorkflow({
    workflows: [{ workflow: "a.yml", mechanisms: [] }],
    limit: 20,
    run: () => JSON.stringify({ message: "Not Found" }),
  });
  assert.equal(unreadable[0].code, "RUN_HISTORY_UNREADABLE");
});

test("assessAll separates warnings from findings rather than returning both as warnings", () => {
  // The mutation: `warnings: results`. Nothing caught it, because no test had
  // a warning and a finding in the same call.
  const { findings, warnings } = assessAll({
    workflows: [
      { workflow: "failing.yml", mechanisms: [] },
      { workflow: "flaky.yml", mechanisms: [] },
    ],
    runsByWorkflow: {
      "failing.yml": WEEKLY_DRIFT_HISTORY,
      "flaky.yml": [run("failure", "2026-09-14T00:00:00Z"), run("success", "2026-09-07T00:00:00Z")],
    },
  });
  assert.deepEqual(findings.map((f) => f.workflow), ["failing.yml"]);
  assert.deepEqual(warnings.map((f) => f.workflow), ["flaky.yml"]);
});

test("workflows come back in a stable order", () => {
  // The mutation: drop the sorts. Nothing asserted order, so a reordering
  // would have changed the report silently every run.
  const paths = scheduledWorkflows(root).workflows.map((w) => w.workflow);
  assert.deepEqual(paths, [...paths].sort());
});

const SCHEDULED_WORKFLOW_YAML = [
  "on:",
  "  schedule:",
  '    - cron: "0 1 * * 1"',
  "jobs:",
  "  a:",
  "    steps:",
  "      - run: echo hi",
  "",
].join("\n");

test("an unparseable workflow is a finding, never a silent exclusion", () => {
  const dir = mkdtempSync(join(tmpdir(), "sched-outcomes-root-"));
  try {
    mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
    mkdirSync(join(dir, "config"), { recursive: true });
    writeFileSync(join(dir, "config", "scheduled-mechanisms.yaml"), "schema_version: 1\nmechanisms: []\n");
    writeFileSync(join(dir, ".github", "workflows", "broken.yml"), "on:\n  schedule:\n   - cron: [oops\n");
    writeFileSync(join(dir, ".github", "workflows", "fine.yml"), SCHEDULED_WORKFLOW_YAML);
    const { workflows, unreadable } = scheduledWorkflows(dir);
    assert.deepEqual(workflows.map((w) => w.workflow), [".github/workflows/fine.yml"]);
    assert.equal(unreadable.length, 1);
    assert.equal(unreadable[0].code, "WORKFLOW_UNREADABLE");
    assert.equal(unreadable[0].severity, "failure");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an unreadable register still lets every scheduled workflow be watched", () => {
  const dir = mkdtempSync(join(tmpdir(), "sched-outcomes-root-"));
  try {
    mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
    mkdirSync(join(dir, "config"), { recursive: true });
    writeFileSync(join(dir, "config", "scheduled-mechanisms.yaml"), "mechanisms: [oops\n");
    writeFileSync(join(dir, ".github", "workflows", "fine.yml"), SCHEDULED_WORKFLOW_YAML);
    const { workflows, unreadable } = scheduledWorkflows(dir);
    assert.deepEqual(workflows.map((w) => w.workflow), [".github/workflows/fine.yml"]);
    assert.equal(unreadable[0].code, "REGISTER_UNREADABLE");
    assert.equal(unreadable[0].severity, "warning", "the register is evidence, not the subject");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


test("--runs-json with no value is refused rather than silently going to the network", () => {
  let code = 0;
  let err = "";
  try {
    execFileSync(process.execPath, [CLI, "--runs-json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    code = e.status;
    err = e.stderr ?? "";
  }
  assert.equal(code, 2);
  assert.match(err, /--runs-json needs a file path/);
});

test("the register's verifiable:false and non-schedule entries are filtered, on a planted register", () => {
  // The committed register cannot discriminate these two filters: its only
  // verifiable:false entry (the Railway cron) also has no `workflow` field, so
  // the `typeof m.workflow !== "string"` guard already excludes it, and every
  // other entry is trigger: schedule. Both mutations therefore survived
  // against real data. A planted register makes them load-bearing: here each
  // excluded entry DOES name a real workflow, so dropping either filter
  // attaches a mechanism id to a workflow that does not own it.
  const dir = mkdtempSync(join(tmpdir(), "sched-outcomes-root-"));
  try {
    mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
    mkdirSync(join(dir, "config"), { recursive: true });
    writeFileSync(
      join(dir, "config", "scheduled-mechanisms.yaml"),
      [
        "schema_version: 1",
        "mechanisms:",
        "  - id: real-one",
        "    workflow: .github/workflows/fine.yml",
        "    trigger: schedule",
        "  - id: not-scheduled",
        "    workflow: .github/workflows/fine.yml",
        "    trigger: push",
        "  - id: not-verifiable",
        "    workflow: .github/workflows/fine.yml",
        "    trigger: schedule",
        "    verifiable: false",
        "",
      ].join("\n"),
    );
    writeFileSync(join(dir, ".github", "workflows", "fine.yml"), SCHEDULED_WORKFLOW_YAML);
    const { workflows } = scheduledWorkflows(dir);
    assert.deepEqual(workflows[0].mechanisms, ["real-one"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("workflow order does not depend on the order the directory happens to list", () => {
  // Pins the one remaining sort. Files are written in an order whose
  // alphabetical sort differs from creation order, so a dropped sort shows up.
  const dir = mkdtempSync(join(tmpdir(), "sched-outcomes-root-"));
  try {
    mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
    mkdirSync(join(dir, "config"), { recursive: true });
    writeFileSync(join(dir, "config", "scheduled-mechanisms.yaml"), "schema_version: 1\nmechanisms: []\n");
    for (const name of ["zulu.yml", "alpha.yml", "mike.yml"]) {
      writeFileSync(join(dir, ".github", "workflows", name), SCHEDULED_WORKFLOW_YAML);
    }
    // readdirSync returns alphabetical order on the filesystems we run on, so
    // a real directory cannot discriminate this. The listing is injected
    // unsorted instead — POSIX does not promise readdir order, and the sort
    // is what makes the report stable if it ever changes.
    const paths = scheduledWorkflows(dir, {
      listFiles: () => ["zulu.yml", "alpha.yml", "mike.yml"],
    }).workflows.map((w) => w.workflow);
    assert.deepEqual(paths, [
      ".github/workflows/alpha.yml",
      ".github/workflows/mike.yml",
      ".github/workflows/zulu.yml",
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
