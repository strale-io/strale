#!/usr/bin/env node
// CLI: validates config/env-manifest.yaml against the T14 environment
// manifest contract. Exit 1 on any failing finding.
//
// Usage: node scripts/check-env.mjs [--json]
import { checkAllEnv, repoRootFrom, MANIFEST_PATH, ROOT_EXAMPLE_PATH, API_EXAMPLE_PATH } from "./env-lib.mjs";
import { generate } from "./generate-env-example.mjs";

const root = repoRootFrom(import.meta.url);
const json = process.argv.includes("--json");
const { findings, usageCount, rowCount } = checkAllEnv(root);

const genResult = generate(root, { check: true });
for (const r of genResult.results) {
  if (r.missing) {
    findings.push({
      code: "STALE_ENV_EXAMPLE",
      file: r.path,
      detail: `${r.path} is missing — fix: npm run env:example`,
    });
  } else if (r.stale) {
    findings.push({
      code: "STALE_ENV_EXAMPLE",
      file: r.path,
      detail: `${r.path} does not match ${MANIFEST_PATH} — fix: npm run env:example (then commit it)`,
    });
  }
}

if (json) {
  console.log(
    JSON.stringify(
      {
        ok: findings.length === 0,
        findings,
        variable_count: usageCount,
        row_count: rowCount,
      },
      null,
      2,
    ),
  );
} else {
  console.log(`checked ${usageCount} process.env names against ${rowCount} rows in ${MANIFEST_PATH}`);
  console.log(`example files: ${ROOT_EXAMPLE_PATH}, ${API_EXAMPLE_PATH}`);
  if (findings.length === 0) {
    console.log("ok   environment manifest contract");
  } else {
    console.log(`FAIL environment manifest contract (${findings.length} finding${findings.length === 1 ? "" : "s"})`);
    for (const f of findings) console.log(`  ${f.code} ${f.file}: ${f.detail}`);
  }
}

process.exit(findings.length === 0 ? 0 : 1);
