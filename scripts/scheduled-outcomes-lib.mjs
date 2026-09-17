/**
 * Scheduled mechanism OUTCOMES — the half `scheduled:check` cannot see.
 *
 * `config/scheduled-mechanisms.yaml` and `scripts/check-scheduled-reachability.mjs`
 * prove a scheduled mechanism is *reachable*: the workflow exists, carries a
 * cron trigger, has a step that invokes the script, and that step reads the
 * secrets the register names. Every one of those facts is static, and every
 * one of them was true on 2026-09-17 for three mechanisms that had not
 * completed a single successful run since 2026-08-18.
 *
 * `weekly-drift.yml` failed on five consecutive scheduled runs, 2026-08-17 to
 * 2026-09-14; its last successful cron run was 2026-08-10. The four from
 * 2026-08-24 fail with `password authentication failed for user "postgres"`
 * (2026-08-17 failed earlier, on ECONNREFUSED to a local socket — the streak
 * is real, the single cause was not, and an independent review caught that
 * conflation). The register's `DATABASE_URL: DATABASE_URL` declaration was
 * still correct throughout: the step does read that secret. The secret's
 * *value* had stopped authenticating, and a declaration cannot carry a value.
 * Three production-reading drift mechanisms — `weekly-drift-manifest-drift`,
 * `weekly-drift-toast-readability`, `weekly-drift-output-schema` — last read
 * production on 2026-08-18, via a manual re-run that succeeded, so the
 * blindness is a month rather than the five weeks the streak suggests. Nothing
 * in the morning run looked at a scheduled workflow's conclusion, so nobody
 * read the red.
 *
 * This library answers the other question: when the mechanism last ran, did
 * it succeed? It is deliberately pure — it takes run lists as data, so the
 * tests can drive it without the network — and the CLI is the only part that
 * talks to `gh`.
 *
 * Why this is not a CI gate, for the same reason `fixtures:drift` is not: the
 * evidence lives in GitHub's run history, not in the repository, and a pull
 * request that has changed nothing about a workflow cannot be the thing that
 * fails because a credential expired on Sunday. It is a morning-sweep report
 * (docs/company/DAILY-RUN.md step B).
 *
 * Severity, and why one failure is not the threshold: a single failed run is
 * routinely a flake (a runner hiccup, a rate limit, a transient upstream).
 * Two consecutive failures of a *scheduled* run is a pattern — it survived a
 * full cron period without anyone fixing it. That is the finding. Reporting
 * every one-off failure would produce a weekly false alarm and train the
 * reader to skip the section, which is how the four weeks happened in the
 * first place.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

import { hasScheduleTrigger, parseWorkflowFile } from "./scheduled-reachability-lib.mjs";
import { repoRootFrom } from "./program-tracks-lib.mjs";

export { repoRootFrom };

export const REGISTER_PATH = "config/scheduled-mechanisms.yaml";
export const WORKFLOWS_DIR = ".github/workflows";

/** Consecutive failed scheduled runs before a workflow is a finding, not a warning. */
export const CONSECUTIVE_FAILURE_THRESHOLD = 2;

/**
 * Every workflow whose outcome this check watches, with the register
 * mechanism ids that depend on each.
 *
 * The scope is deliberately WIDER than the register: every `.github/workflows`
 * file carrying an `on.schedule` trigger, whether or not it invokes a
 * repository script. `stale-branches.yml` is the case in point — every one of
 * its steps is an inline `gh` command, so the reachability register
 * legitimately holds no entry for it, and a version scoped to the register
 * would have watched every scheduled workflow except that one. The register
 * supplies mechanism names where it has them; a scheduled workflow with no
 * register entry is still watched, with an empty mechanism list.
 *
 * Register entries marked `verifiable: false` (the Railway cron, which is not
 * a GitHub Actions workflow at all) contribute nothing: there is no run
 * history to read.
 */
export function scheduledWorkflows(root, { listFiles = (dir) => readdirSync(dir) } = {}) {
  const mechanismsByWorkflow = new Map();
  const unreadable = [];

  let doc = null;
  try {
    doc = parseYaml(readFileSync(resolve(root, REGISTER_PATH), "utf8"));
  } catch (err) {
    // The register is evidence, not the subject. A malformed one must not
    // stop the check reading run history; it becomes its own finding.
    unreadable.push({
      code: "REGISTER_UNREADABLE",
      severity: "warning",
      workflow: REGISTER_PATH,
      mechanisms: [],
      detail: `could not read ${REGISTER_PATH}: ${err.message} — mechanism names are omitted, workflows are still watched`,
      facts: null,
    });
  }
  for (const m of doc?.mechanisms ?? []) {
    if (m?.verifiable === false) continue;
    if (m?.trigger !== "schedule") continue;
    if (typeof m.workflow !== "string") continue;
    mechanismsByWorkflow.set(m.workflow, [...(mechanismsByWorkflow.get(m.workflow) ?? []), m.id]);
  }

  const out = [];
  let files;
  try {
    // Not sorted here: the single source of ordering is the sort on the way
    // out. `listFiles` is injectable only so a test can hand this an unsorted
    // listing — readdirSync happens to return alphabetical order on the
    // filesystems we run on, which made the sort look redundant to a mutation
    // run against real directories. POSIX does not promise that order.
    files = listFiles(resolve(root, WORKFLOWS_DIR));
  } catch (err) {
    unreadable.push({
      code: "WORKFLOWS_DIR_UNREADABLE",
      severity: "failure",
      workflow: WORKFLOWS_DIR,
      mechanisms: [],
      detail: `could not list ${WORKFLOWS_DIR}: ${err.message}`,
      facts: null,
    });
    return { workflows: out, unreadable };
  }

  for (const file of files) {
    if (!/\.ya?ml$/.test(file)) continue;
    const path = `${WORKFLOWS_DIR}/${file}`;
    // parseWorkflowFile never throws — it returns a finding instead. A
    // workflow this check cannot parse is one whose schedule it cannot see,
    // which is a finding, never a silent exclusion.
    const parsed = parseWorkflowFile(root, path);
    if (!parsed.ok) {
      unreadable.push({
        code: "WORKFLOW_UNREADABLE",
        severity: "failure",
        workflow: path,
        mechanisms: mechanismsByWorkflow.get(path) ?? [],
        detail: `${parsed.finding.detail} — this check cannot tell whether it is scheduled`,
        facts: null,
      });
      continue;
    }
    if (!hasScheduleTrigger(parsed.workflow)) continue;
    out.push({ workflow: path, mechanisms: mechanismsByWorkflow.get(path) ?? [] });
  }
  return { workflows: out.sort((a, b) => a.workflow.localeCompare(b.workflow)), unreadable };
}

/**
 * Reduce a workflow's run list to the facts a finding needs.
 *
 * `runs` is what `gh run list --json conclusion,createdAt,event,databaseId`
 * returns: newest first. Only `event === "schedule"` runs count — a manual
 * `workflow_dispatch` re-run that someone kicked off to look at the failure
 * is not evidence the cron is healthy, and on 2026-08-18 exactly such a
 * re-run is the last green in `weekly-drift.yml`'s history. A run still in
 * flight (`conclusion` null or empty) is skipped rather than counted either
 * way.
 */
export function classifyRuns(runs) {
  const scheduled = (runs ?? []).filter(
    (r) => r?.event === "schedule" && typeof r.conclusion === "string" && r.conclusion !== "",
  );

  let consecutiveFailures = 0;
  for (const r of scheduled) {
    if (r.conclusion === "success") break;
    consecutiveFailures += 1;
  }

  const lastSuccess = scheduled.find((r) => r.conclusion === "success") ?? null;

  return {
    scheduledRunCount: scheduled.length,
    latestConclusion: scheduled[0]?.conclusion ?? null,
    latestRunAt: scheduled[0]?.createdAt ?? null,
    latestRunId: scheduled[0]?.databaseId ?? null,
    consecutiveFailures,
    lastSuccessAt: lastSuccess?.createdAt ?? null,
  };
}

/**
 * One workflow's finding, or null when it is healthy.
 *
 * Codes:
 *   SCHEDULED_WORKFLOW_FAILING   — failure. `CONSECUTIVE_FAILURE_THRESHOLD`+
 *                                  consecutive failed scheduled runs.
 *   SCHEDULED_WORKFLOW_FLAKY     — warning. Exactly one failed scheduled run
 *                                  at the head; could be a flake, could be
 *                                  the start of the above.
 *   SCHEDULED_WORKFLOW_NO_RUNS   — warning. Declared as scheduled, but no
 *                                  completed scheduled run in the window
 *                                  read. Either the window is shorter than
 *                                  the cron period, or the cron is not
 *                                  firing; this check cannot tell which, and
 *                                  says so rather than guessing.
 */
export function assessWorkflow({ workflow, mechanisms, runs }) {
  const facts = classifyRuns(runs);

  if (facts.scheduledRunCount === 0) {
    return {
      code: "SCHEDULED_WORKFLOW_NO_RUNS",
      severity: "warning",
      workflow,
      mechanisms,
      detail:
        "declared as scheduled, but the run history read here holds no completed scheduled run — " +
        "either the window is shorter than its cron period or the schedule is not firing",
      facts,
    };
  }

  if (facts.consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD) {
    const since = facts.lastSuccessAt
      ? `last successful scheduled run ${facts.lastSuccessAt}`
      : "no successful scheduled run in the window read";
    return {
      code: "SCHEDULED_WORKFLOW_FAILING",
      severity: "failure",
      workflow,
      mechanisms,
      detail: `${facts.consecutiveFailures} consecutive failed scheduled runs; ${since}`,
      facts,
    };
  }

  if (facts.consecutiveFailures === 1) {
    return {
      code: "SCHEDULED_WORKFLOW_FLAKY",
      severity: "warning",
      workflow,
      mechanisms,
      detail:
        "the most recent scheduled run failed; one failure is not yet a pattern, " +
        "but a second consecutive one is a finding",
      facts,
    };
  }

  return null;
}

/**
 * The `gh` argv for one workflow's run history. Extracted so a test can
 * assert on it: the whole network half of this tool was untested until a
 * review pointed out that lowering the default `--limit` to 1 made the real
 * five-failure history read as a single flake — a warning, exit 0 — with all
 * twelve tests still green.
 */
export function ghRunListArgs(workflowPath, limit) {
  return [
    "run",
    "list",
    "--workflow",
    workflowPath.slice(workflowPath.lastIndexOf("/") + 1),
    "--limit",
    String(limit),
    "--json",
    "conclusion,createdAt,event,databaseId",
  ];
}

/**
 * The default number of runs fetched per workflow. It must comfortably
 * exceed the longest failure streak worth reporting: at 1 a five-run streak
 * reads as a flake and the check exits 0.
 */
export const DEFAULT_RUN_LIMIT = 20;

/**
 * Fetch each workflow's history, isolating the failures.
 *
 * `run` is injected (`(args) => string`) so tests drive it without `gh`. One
 * workflow that cannot be read — renamed, added on a branch, `gh` returning
 * 404 — becomes its own finding and the others are still read. Before this,
 * a single 404 aborted the whole fetch and the morning sweep printed
 * "could not read scheduled run history", making the weekly-drift finding
 * disappear from the tool built to surface it.
 */
function firstLine(err) {
  const text = String(err?.message ?? err);
  const nl = text.indexOf(String.fromCharCode(10));
  return (nl === -1 ? text : text.slice(0, nl)).trim();
}

export function fetchRunsPerWorkflow({ workflows, limit, run }) {
  const runsByWorkflow = {};
  const unreadable = [];
  for (const w of workflows) {
    try {
      const parsed = JSON.parse(run(ghRunListArgs(w.workflow, limit)));
      if (!Array.isArray(parsed)) throw new Error("run list was not an array");
      runsByWorkflow[w.workflow] = parsed;
    } catch (err) {
      unreadable.push({
        code: "RUN_HISTORY_UNREADABLE",
        severity: "failure",
        workflow: w.workflow,
        mechanisms: w.mechanisms,
        detail: `could not read this workflow's run history: ${firstLine(err)}`,
        facts: null,
      });
    }
  }
  return { runsByWorkflow, unreadable };
}

/**
 * Assess every scheduled workflow. `runsByWorkflow` maps the workflow path to
 * its run list; a workflow absent from the map is reported as having no runs
 * rather than skipped, so a fetch that silently returned nothing cannot read
 * as clean. A workflow that already has an `unreadable` finding is skipped
 * here, so one problem is not reported twice under two codes.
 */
export function assessAll({ workflows, runsByWorkflow, unreadable = [] }) {
  const alreadyReported = new Set(unreadable.map((u) => u.workflow));
  const results = [...unreadable];
  for (const w of workflows) {
    if (alreadyReported.has(w.workflow)) continue;
    const finding = assessWorkflow({
      workflow: w.workflow,
      mechanisms: w.mechanisms,
      runs: runsByWorkflow?.[w.workflow] ?? [],
    });
    if (finding) results.push(finding);
  }
  return {
    findings: results.filter((f) => f.severity === "failure"),
    warnings: results.filter((f) => f.severity === "warning"),
    workflowCount: workflows.length,
  };
}
