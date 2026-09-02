#!/usr/bin/env node
// CLI: validates every docs/programs/*/tracks.yaml. Exit 1 on any finding.
import { checkAllRegisters, repoRootFrom } from "./program-tracks-lib.mjs";

const root = repoRootFrom(import.meta.url);
const results = checkAllRegisters(root);
let failed = false;
for (const { path, findings } of results) {
  if (findings.length === 0) {
    console.log(`ok   ${path}`);
    continue;
  }
  failed = true;
  console.log(`FAIL ${path}`);
  for (const f of findings) console.log(`  ${f.code}: ${f.detail}`);
}
if (results.length === 0) console.log("no program registers found");
process.exit(failed ? 1 : 0);
