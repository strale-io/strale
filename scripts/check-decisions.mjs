#!/usr/bin/env node
// Decision-record validation, carved out of the project-context check
// (way-of-working review §3 group G, §4 step 3; DEC-20261024-A).
//
// The project-context layer existed to prove the M4 cutover and retires with
// it, but it also carried the only mechanical guard on docs/decisions/: record
// schema, id collisions, collision-resolution evidence, and immutability of an
// active decision's protected sections against the merge-base on main. That
// guard is kept here, blocking, together with the freshness of the generated
// decision index (docs/project/DECISIONS.md and its two schemas).
//
// Usage: node scripts/check-decisions.mjs [--json]
// Exit 0 when clean, 1 with one line per finding.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  decisionGeneratedFiles,
  readDecisionRecords,
  validateDecisionRepository,
} from "./decision-records-lib.mjs";

export function checkDecisions(root) {
  const findings = validateDecisionRepository(root, readDecisionRecords(root)).map((item) => ({
    code: item.code,
    path: item.path,
    ...(item.detail ? { detail: item.detail } : {}),
  }));
  let expected = {};
  try {
    expected = decisionGeneratedFiles(root);
  } catch (error) {
    findings.push({ code: "DECISION_INDEX_UNGENERATABLE", path: "docs/decisions", detail: error.message });
  }
  for (const [file, content] of Object.entries(expected)) {
    const absolute = resolve(root, file);
    if (!existsSync(absolute)) findings.push({ code: "GENERATED_FILE_MISSING", path: file });
    else if (readFileSync(absolute, "utf8") !== content) findings.push({ code: "GENERATED_FILE_DRIFT", path: file });
  }
  return findings;
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (invokedDirectly) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const findings = checkDecisions(root);
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ findings }, null, 2));
  } else if (findings.length) {
    for (const f of findings) console.error(`${f.code} ${f.path}${f.detail ? ` ${f.detail}` : ""}`);
    console.error("fix: correct the record (a new record supersedes, never an edit to an active one), or regenerate the decision index with npm run decisions:generate");
  } else {
    console.log("ok   decision records and the generated decision index");
  }
  process.exit(findings.length ? 1 : 0);
}
