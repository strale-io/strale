#!/usr/bin/env node
// CLI: validates docs/operations/distribution-registry.yaml (M3 batch 3, T6,
// shadow mode, not authoritative) against
// docs/operations/distribution-registry.schema.json and its cross-checks.
// Exit 1 on any failing finding.
//
// Usage: node scripts/check-distribution.mjs [--json]
import { checkAllDistribution, repoRootFrom, REGISTER_PATH } from "./distribution-lib.mjs";

const root = repoRootFrom(import.meta.url);
const json = process.argv.includes("--json");
const { findings, warnings, surfaceCount } = checkAllDistribution(root);

if (json) {
  console.log(
    JSON.stringify(
      {
        ok: findings.length === 0,
        findings,
        warnings,
        surface_count: surfaceCount,
      },
      null,
      2,
    ),
  );
} else {
  console.log(`checked ${surfaceCount} surfaces in ${REGISTER_PATH}`);
  for (const w of warnings) console.log(`  warn ${w.code} ${w.file}: ${w.detail}`);
  if (findings.length === 0) {
    console.log("ok   distribution register contract");
  } else {
    console.log(`FAIL distribution register contract (${findings.length} finding${findings.length === 1 ? "" : "s"})`);
    for (const f of findings) console.log(`  ${f.code} ${f.file}: ${f.detail}`);
  }
}

process.exit(findings.length === 0 ? 0 : 1);
