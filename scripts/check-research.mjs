#!/usr/bin/env node
// CLI: validates docs/research/*.md against the T12 research contract.
// Exit 1 on any failing finding. Warnings (research-looking files outside
// the contract) never fail the build.
//
// Usage: node scripts/check-research.mjs [--json]
import { checkAllResearch, repoRootFrom, README_PATH } from "./research-lib.mjs";
import { generateIndex } from "./generate-research-index.mjs";

const root = repoRootFrom(import.meta.url);
const json = process.argv.includes("--json");
const { failures, warnings, records } = checkAllResearch(root);

const indexResult = generateIndex(root, { check: true });
if (indexResult.stale) {
  failures.push({
    code: "README_STALE",
    file: README_PATH,
    detail: indexResult.missing
      ? `${README_PATH} is missing — fix: npm run research:index`
      : `${README_PATH} does not match the front matter — fix: npm run research:index (then commit it)`,
  });
}

if (json) {
  console.log(JSON.stringify({ ok: failures.length === 0, failures, warnings, file_count: records.length }, null, 2));
} else {
  console.log(`checked ${records.length} docs/research/*.md files`);
  if (failures.length === 0) {
    console.log("ok   research contract");
  } else {
    console.log(`FAIL research contract (${failures.length} finding${failures.length === 1 ? "" : "s"})`);
    for (const f of failures) console.log(`  ${f.code} ${f.file}: ${f.detail}`);
  }
  if (warnings.length > 0) {
    console.log(`warn (${warnings.length}) — research-looking files outside docs/research:`);
    for (const w of warnings) console.log(`  ${w.code} ${w.file}: ${w.detail}`);
  }
}

process.exit(failures.length === 0 ? 0 : 1);
