#!/usr/bin/env node
// CLI: validates docs/company/claims.yaml against the T14 claims-register
// contract, then scans README.md, packages/*/README.md, manifests/*.yaml
// description fields, apps/api/src/lib/platform-facts.ts, and (read-only,
// when present) ../strale-frontend/public/llms.txt for `forbidden`
// claims. Exit 1 on any failing finding; `needs_evidence` claims whose
// evidence doesn't resolve are warnings, not failures.
//
// Usage: node scripts/check-claims.mjs [--json]
import { checkAllClaims, repoRootFrom, REGISTER_PATH } from "./claims-lib.mjs";

const root = repoRootFrom(import.meta.url);
const json = process.argv.includes("--json");
const { findings, warnings, rowCount } = checkAllClaims(root);

if (json) {
  console.log(JSON.stringify({ ok: findings.length === 0, findings, warnings, row_count: rowCount }, null, 2));
} else {
  console.log(`checked ${rowCount} rows in ${REGISTER_PATH} against README.md, packages/*/README.md, manifests/*.yaml, platform-facts.ts, and the frontend llms.txt when present`);
  if (findings.length === 0) {
    console.log("ok   claims register contract");
  } else {
    console.log(`FAIL claims register contract (${findings.length} finding${findings.length === 1 ? "" : "s"})`);
    for (const f of findings) console.log(`  ${f.code} ${f.file}: ${f.detail}`);
  }
  if (warnings.length > 0) {
    console.log(`warn (${warnings.length}):`);
    for (const w of warnings) console.log(`  ${w.code} ${w.file}: ${w.detail}`);
  }
}

process.exit(findings.length === 0 ? 0 : 1);
