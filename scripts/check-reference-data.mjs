#!/usr/bin/env node
// CLI for the reference-data register (robustness R2), config/reference-data.yaml.
//
//   node scripts/check-reference-data.mjs          structural check (PR CI). Exit 1 on
//                                                  any finding; due rows are counted
//                                                  but never fail this mode.
//   node scripts/check-reference-data.mjs --due    lists rows whose check against their
//                                                  source is due; exit 1 if any (the
//                                                  weekly-drift step, which opens the
//                                                  weekly drift issue).
//   --today YYYY-MM-DD   pin the date (tests, replays); default today in Sweden
//   --json               machine-readable output
import { requireInputs } from "./require-inputs.mjs";
import { checkRegister, dueRows, isDate, loadRegister, repoRootFrom, REGISTER_PATH, stockholmToday } from "./reference-data-lib.mjs";

const args = process.argv.slice(2);
const json = args.includes("--json");
const dueMode = args.includes("--due");
const ti = args.indexOf("--today");
const today = ti >= 0 ? args[ti + 1] : stockholmToday();
if (!isDate(today)) {
  console.error(`--today needs a YYYY-MM-DD date, got ${JSON.stringify(today)}`);
  process.exit(2);
}

const root = repoRootFrom(import.meta.url);
const { findings, rows } = checkRegister(root, loadRegister(root), { today });
// A schema finding (wrong version, no list) explains an empty register better
// than the empty-input guard does, so only guard when nothing else is wrong.
if (findings.length === 0) requireInputs(rows.length, "reference-data: register rows");
const due = dueRows(rows, today);

if (json) {
  console.log(JSON.stringify({ ok: findings.length === 0 && (!dueMode || due.length === 0), today, findings, due, dataset_count: rows.length }, null, 2));
} else {
  console.log(`checked ${rows.length} datasets in ${REGISTER_PATH} (today ${today})`);
  if (findings.length === 0) console.log("ok   reference-data register matches the code");
  else {
    console.log(`FAIL reference-data register (${findings.length} finding${findings.length === 1 ? "" : "s"})`);
    for (const f of findings) console.log(`  ${f.code} ${f.file}: ${f.detail}`);
  }
  if (dueMode) {
    if (due.length === 0) console.log("ok   no dataset is due for a check against its source");
    else {
      console.log(`DUE  ${due.length} dataset${due.length === 1 ? "" : "s"} due for a check against the source (harm A first):`);
      for (const d of due) {
        console.log(`  [${d.harm}] ${d.id}: ${d.kind}, due ${d.due}${d.checked_on ? `, last checked ${d.checked_on}` : ""} — re-check against ${d.recheck_against} (${d.file})`);
      }
      console.log("To clear a row: check the values against the source, fix the code, move its *_AS_OF constant and the row's as_of together, and cite the evidence.");
    }
  } else if (due.length > 0) {
    console.log(`note ${due.length} dataset${due.length === 1 ? "" : "s"} due for a source check (weekly-drift reports these; not a PR failure)`);
  }
}

process.exit(findings.length > 0 || (dueMode && due.length > 0) ? 1 : 0);
