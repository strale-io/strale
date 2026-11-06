import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { overdueJobs, stockholmToday, validateRecurring } from "./recurring.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const job = (over = {}) => ({ id: "daily-run", title: "Daily run", runs_as: "due-list", cadence_days: 1, last_run: "2026-11-01", procedure: "docs/company/DAILY-RUN.md", ...over });

test("the repository's RECURRING.yaml is valid, and lists every scheduled workflow", () => {
  const doc = YAML.parse(readFileSync(join(root, "docs", "company", "RECURRING.yaml"), "utf8"));
  assert.deepEqual(validateRecurring(doc, stockholmToday()), []);
  const listed = new Set(doc.jobs.filter((j) => j.runs_as === "github-action").map((j) => j.where));
  const workflows = join(root, ".github", "workflows");
  for (const file of readdirSync(workflows)) {
    if (/^\s+- cron:/m.test(readFileSync(join(workflows, file), "utf8"))) assert.ok(listed.has(`.github/workflows/${file}`), `${file} runs on a schedule but is not in RECURRING.yaml`);
  }
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
  // daily: 4 days late = 4 cadences; weekly: 14 days = 2 cadences. Listed in the
  // opposite order, and raw days would put weekly first.
  const doc = { version: 1, jobs: [job({ id: "weekly", cadence_days: 7, last_run: "2026-10-23" }), job({ id: "daily", last_run: "2026-11-02" })] };
  assert.deepEqual(overdueJobs(doc, "2026-11-06").map((j) => j.id), ["daily", "weekly"]);
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

test("an impossible calendar date is refused and never counted", () => {
  const doc = { version: 1, jobs: [job({ last_run: "2026-02-30" })] };
  assert.ok(validateRecurring(doc)[0].includes("last_run must be"));
  assert.deepEqual(overdueJobs(doc, "2026-11-06"), []);
});

test("a last_run in the future is refused when today is known", () => {
  const doc = { version: 1, jobs: [job({ last_run: "2027-01-01" })] };
  assert.deepEqual(validateRecurring(doc), []);
  assert.ok(validateRecurring(doc, "2026-11-06")[0].includes("in the future"));
});

test("a jobs value that is not a list yields no due jobs rather than a throw", () => {
  assert.deepEqual(overdueJobs({ version: 1, jobs: { a: 1 } }, "2026-11-06"), []);
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
