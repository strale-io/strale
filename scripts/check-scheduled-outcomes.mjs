#!/usr/bin/env node
// CLI: did each scheduled workflow actually succeed the last time its cron
// fired?
//
// `npm run scheduled:check` proves the wiring exists. This proves the wiring
// works. They are different questions, and on 2026-09-17 the first answered
// clean while three mechanisms had been failing every Sunday for five weeks
// on a database credential that no longer authenticated. The scope is every
// scheduled workflow, not only the ones config/scheduled-mechanisms.yaml
// declares — that register covers script-invoking steps, and a workflow made
// entirely of inline `gh` commands would otherwise be the one thing unwatched.
// The rationale, the severity rule, and why this is a morning-sweep report
// rather than a CI gate are in scripts/scheduled-outcomes-lib.mjs.
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
//   1 — at least one workflow has CONSECUTIVE_FAILURE_THRESHOLD+ consecutive
//       failed scheduled runs
//   2 — the run history could not be read at all (gh missing, not
//       authenticated, or a fixture that will not parse). Deliberately NOT 0:
//       a check that cannot see is not a check that found nothing.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

import {
  assessAll,
  repoRootFrom,
  scheduledWorkflows,
} from "./scheduled-outcomes-lib.mjs";

const argv = process.argv.slice(2);
const json = argv.includes("--json");
const limitArg = argv[argv.indexOf("--limit") + 1];
const limit = argv.includes("--limit") ? Number(limitArg) : 20;
const runsJsonPath = argv.includes("--runs-json") ? argv[argv.indexOf("--runs-json") + 1] : null;

if (!Number.isInteger(limit) || limit < 1) {
  console.error(`--limit must be a positive integer, got ${JSON.stringify(limitArg)}`);
  process.exit(2);
}

const root = repoRootFrom(import.meta.url);
const workflows = scheduledWorkflows(root);

/** Run history per workflow path. Throws rather than returning {}. */
function fetchRuns() {
  if (runsJsonPath) {
    return JSON.parse(readFileSync(runsJsonPath, "utf8"));
  }
  const out = {};
  for (const w of workflows) {
    const raw = execFileSync(
      "gh",
      [
        "run",
        "list",
        "--workflow",
        basename(w.workflow),
        "--limit",
        String(limit),
        "--json",
        "conclusion,createdAt,event,databaseId",
      ],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    out[w.workflow] = JSON.parse(raw);
  }
  return out;
}

let runsByWorkflow;
try {
  runsByWorkflow = fetchRuns();
} catch (err) {
  console.error(
    `could not read scheduled run history: ${err?.message ?? err}\n` +
      "This is exit 2, not a pass: the check could not see, so it found nothing for " +
      "the wrong reason. Check that `gh` is installed and authenticated.",
  );
  process.exit(2);
}

const { findings, warnings, workflowCount } = assessAll({ workflows, runsByWorkflow });

if (json) {
  console.log(JSON.stringify({ ok: findings.length === 0, findings, warnings, workflowCount }, null, 2));
} else {
  console.log(
    `scheduled outcomes — ${workflowCount} scheduled workflow(s) in .github/workflows`,
  );
  for (const w of warnings) {
    console.log(`  warn ${w.code} ${w.workflow}: ${w.detail}`);
    console.log(`       register mechanisms blind meanwhile: ${w.mechanisms.length ? w.mechanisms.join(", ") : "(none declared; watched because it is scheduled)"}`);
  }
  if (findings.length === 0) {
    console.log("ok   every scheduled workflow's last cron run succeeded");
  } else {
    console.log(`FAIL ${findings.length} scheduled workflow(s) failing on their own schedule`);
    for (const f of findings) {
      console.log(`  ${f.code} ${f.workflow}: ${f.detail}`);
      console.log(`       register mechanisms blind meanwhile: ${f.mechanisms.length ? f.mechanisms.join(", ") : "(none declared; watched because it is scheduled)"}`);
      if (f.facts.latestRunId) console.log(`       latest run: ${f.facts.latestRunId} (${f.facts.latestRunAt})`);
    }
  }
}

process.exit(findings.length === 0 ? 0 : 1);
