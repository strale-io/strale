#!/usr/bin/env node
// CLI: did each scheduled workflow actually succeed the last time its cron
// fired?
//
// `npm run scheduled:check` proves the wiring exists. This proves the wiring
// works. They are different questions, and on 2026-09-17 the first answered
// clean while weekly-drift.yml had failed five consecutive scheduled runs and
// three production-reading drift mechanisms had been blind for a month. The
// scope is every scheduled workflow, not only the ones
// config/scheduled-mechanisms.yaml declares — that register covers
// script-invoking steps, and a workflow made entirely of inline `gh` commands
// would otherwise be the one thing unwatched. The rationale, the severity
// rule, and why this is a morning-sweep report rather than a CI gate are in
// scripts/scheduled-outcomes-lib.mjs.
//
// Run history comes from `gh run list` unless --runs-json is given, which is
// how the tests drive it without the network.
//
// Usage:
//   npm run scheduled:outcomes                 # last 20 runs per workflow
//   node scripts/check-scheduled-outcomes.mjs --limit 30 --json
//   node scripts/check-scheduled-outcomes.mjs --runs-json fixture.json
//
// Exit codes:
//   0 — no failure-level finding (warnings may still be printed)
//   1 — at least one failure-level finding: a workflow with
//       CONSECUTIVE_FAILURE_THRESHOLD+ consecutive failed scheduled runs, a
//       workflow whose run history could not be read, or a workflow file this
//       check cannot parse
//   2 — the check could not start: a bad flag, or a --runs-json fixture that
//       will not parse. Deliberately NOT 0: a check that cannot see is not a
//       check that found nothing. An individual workflow that cannot be read
//       is exit 1 and a named finding, never a blanket exit 2 — one renamed
//       workflow must not hide every other workflow's result.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  assessAll,
  fetchRunsPerWorkflow,
  repoRootFrom,
  scheduledWorkflows,
  DEFAULT_RUN_LIMIT,
} from "./scheduled-outcomes-lib.mjs";

const argv = process.argv.slice(2);
const json = argv.includes("--json");

function flagValue(name) {
  const i = argv.indexOf(name);
  if (i === -1) return { present: false, value: null };
  const value = argv[i + 1];
  // A flag whose value is missing, or is itself another flag, is a mistake
  // rather than an absent flag: `--runs-json` with nothing after it used to
  // read as "no fixture" and quietly go to the network instead.
  if (value === undefined || value.startsWith("--")) return { present: true, value: null };
  return { present: true, value };
}

const limitFlag = flagValue("--limit");
const runsJsonFlag = flagValue("--runs-json");

const limit = limitFlag.present ? Number(limitFlag.value) : DEFAULT_RUN_LIMIT;
if (limitFlag.present && (!Number.isInteger(limit) || limit < 1)) {
  console.error(`--limit must be a positive integer, got ${JSON.stringify(limitFlag.value)}`);
  process.exit(2);
}
if (runsJsonFlag.present && runsJsonFlag.value === null) {
  console.error("--runs-json needs a file path. Refusing rather than silently falling back to `gh`.");
  process.exit(2);
}

const root = repoRootFrom(import.meta.url);
const { workflows, unreadable: discoveryFindings } = scheduledWorkflows(root);

let runsByWorkflow;
let fetchFindings = [];
if (runsJsonFlag.value) {
  try {
    runsByWorkflow = JSON.parse(readFileSync(runsJsonFlag.value, "utf8"));
  } catch (err) {
    console.error(
      `could not read the --runs-json fixture: ${err?.message ?? err}\n` +
        "This is exit 2, not a pass: the check could not see, so it found nothing for " +
        "the wrong reason.",
    );
    process.exit(2);
  }
} else {
  const fetched = fetchRunsPerWorkflow({
    workflows,
    limit,
    run: (args) =>
      execFileSync("gh", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
  });
  runsByWorkflow = fetched.runsByWorkflow;
  fetchFindings = fetched.unreadable;
}

const { findings, warnings, workflowCount } = assessAll({
  workflows,
  runsByWorkflow,
  unreadable: [...discoveryFindings, ...fetchFindings],
});

const mechanismLine = (f) =>
  `       register mechanisms blind meanwhile: ${
    f.mechanisms.length ? f.mechanisms.join(", ") : "(none declared; watched because it is scheduled)"
  }`;

if (json) {
  console.log(JSON.stringify({ ok: findings.length === 0, findings, warnings, workflowCount }, null, 2));
} else {
  console.log(`scheduled outcomes — ${workflowCount} scheduled workflow(s) in .github/workflows`);
  for (const w of warnings) {
    console.log(`  warn ${w.code} ${w.workflow}: ${w.detail}`);
    console.log(mechanismLine(w));
  }
  if (findings.length === 0) {
    console.log("ok   every scheduled workflow's last cron run succeeded");
  } else {
    console.log(`FAIL ${findings.length} scheduled workflow(s) failing on their own schedule or unreadable`);
    for (const f of findings) {
      console.log(`  ${f.code} ${f.workflow}: ${f.detail}`);
      console.log(mechanismLine(f));
      if (f.facts?.latestRunId) console.log(`       latest run: ${f.facts.latestRunId} (${f.facts.latestRunAt})`);
    }
  }
}

process.exit(findings.length === 0 ? 0 : 1);
