import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { overdueJobs, stockholmToday, validateRecurring } from "./recurring.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const job = (over = {}) => ({ id: "daily-run", title: "Daily run", runs_as: "due-list", cadence_days: 1, last_run: "2026-11-01", procedure: "docs/company/DAILY-RUN.md", ...over });

test("the repository's RECURRING.yaml is valid", () => {
  const doc = YAML.parse(readFileSync(join(root, "docs", "company", "RECURRING.yaml"), "utf8"));
  assert.deepEqual(validateRecurring(doc), []);
});

test("a daily job last run yesterday is due today; one run today is not", () => {
  const doc = { version: 1, jobs: [job({ id: "a", last_run: "2026-11-05" }), job({ id: "b", last_run: "2026-11-06" })] };
  assert.deepEqual(overdueJobs(doc, "2026-11-06").map((j) => j.id), ["a"]);
});

test("a weekly job is due on day 7, not day 6", () => {
  const doc = { version: 1, jobs: [job({ cadence_days: 7, last_run: "2026-11-01" })] };
  assert.equal(overdueJobs(doc, "2026-11-07").length, 0);
  assert.equal(overdueJobs(doc, "2026-11-08")[0].daysSince, 7);
});

test("the most overdue job, relative to its cadence, comes first", () => {
  const doc = { version: 1, jobs: [job({ id: "weekly", cadence_days: 7, last_run: "2026-08-23" }), job({ id: "daily", last_run: "2026-11-04" })] };
  assert.deepEqual(overdueJobs(doc, "2026-11-06").map((j) => j.id), ["weekly", "daily"]);
});

test("api-job and github-action rows are never reported as due", () => {
  const doc = { version: 1, jobs: [{ id: "x", title: "X", runs_as: "github-action", where: ".github/workflows/x.yml" }] };
  assert.deepEqual(overdueJobs(doc, "2026-11-06"), []);
});

test("a last_run parsed as a Date (yaml 1.1) still counts", () => {
  const doc = { version: 1, jobs: [job({ last_run: new Date("2026-11-01T00:00:00Z") })] };
  assert.equal(overdueJobs(doc, "2026-11-06")[0].daysSince, 5);
  assert.deepEqual(validateRecurring(doc), []);
});

test("validation refuses the malformed shapes", () => {
  const problems = validateRecurring({ version: 1, jobs: [
    job({ last_run: "2026-13-01" }),
    job({ id: "daily-run", cadence_days: 0 }),
    { id: "y", title: "Y", runs_as: "api-job" },
    { id: "z", title: "Z", runs_as: "github-action", where: "w", last_run: "2026-11-01" },
    { id: "q", title: "Q", runs_as: "cron" },
  ] });
  assert.ok(problems.some((p) => p.includes("last_run must be")));
  assert.ok(problems.some((p) => p.includes("duplicate id")));
  assert.ok(problems.some((p) => p.includes("cadence_days")));
  assert.ok(problems.some((p) => p.includes("(y): where")));
  assert.ok(problems.some((p) => p.includes("(z): only due-list rows")));
  assert.ok(problems.some((p) => p.includes("(q): runs_as")));
  assert.deepEqual(validateRecurring({ jobs: [] }), ["RECURRING.yaml must have version: 1 and a jobs list"]);
});

test("today is the Stockholm calendar date, not UTC", () => {
  assert.equal(stockholmToday(new Date("2026-11-06T23:30:00Z")), "2026-11-07");
  assert.equal(stockholmToday(new Date("2026-07-01T22:30:00Z")), "2026-07-02");
});
