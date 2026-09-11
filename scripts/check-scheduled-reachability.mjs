#!/usr/bin/env node
// CLI: validates config/scheduled-mechanisms.yaml (T6 M3 batch 5) against
// config/scheduled-mechanisms.schema.json and checks it in both directions
// against every .github/workflows/*.yml file: every declared entry
// resolves to a real, scheduled, script-invoking step with the secrets it
// claims, and every scheduled step that invokes a repository script is
// declared. Exit 1 on any finding. Never edits a workflow.
//
// Usage: node scripts/check-scheduled-reachability.mjs [--json]
import { checkAllScheduledReachability, repoRootFrom, REGISTER_PATH } from "./scheduled-reachability-lib.mjs";

const root = repoRootFrom(import.meta.url);
const json = process.argv.includes("--json");
const { findings, warnings, mechanismCount } = checkAllScheduledReachability(root);

if (json) {
  console.log(
    JSON.stringify(
      {
        ok: findings.length === 0,
        findings,
        warnings,
        mechanism_count: mechanismCount,
      },
      null,
      2,
    ),
  );
} else {
  console.log(`checked ${mechanismCount} scheduled mechanisms in ${REGISTER_PATH}`);
  for (const w of warnings) console.log(`  warn ${w.code} ${w.file}: ${w.detail}`);
  if (findings.length === 0) {
    console.log("ok   scheduled mechanism reachability");
  } else {
    console.log(`FAIL scheduled mechanism reachability (${findings.length} finding${findings.length === 1 ? "" : "s"})`);
    for (const f of findings) console.log(`  ${f.code} ${f.file}: ${f.detail}`);
  }
}

process.exit(findings.length === 0 ? 0 : 1);
