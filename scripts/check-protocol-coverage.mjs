#!/usr/bin/env node
// CLI: validates docs/project/protocol-coverage.yaml (T6 M3 batch 7) against
// its schema, proves every full_body / decision_record / enforced_by path
// exists, proves every mirror file under docs/governance/protocols/ and
// every protocol-shaped or already-mirrored CLAUDE.md heading has a row, and
// proves docs/project/PROTOCOL-ROUTER.md (generated from this manifest) is
// up to date. Exit 1 on any finding. Warnings (DECISION_ID_UNCOVERED) are
// report-only today and become blocking at the M4 cutover -- see
// scripts/protocol-coverage-lib.mjs's header. Never edits CLAUDE.md, a
// mirror file, the manifest, or the router.
//
// Usage: node scripts/check-protocol-coverage.mjs [--json]
import { checkAllProtocolCoverage, repoRootFrom, MANIFEST_PATH } from "./protocol-coverage-lib.mjs";

const root = repoRootFrom(import.meta.url);
const json = process.argv.includes("--json");
const { findings, warnings, protocolCount } = checkAllProtocolCoverage(root);

if (json) {
  console.log(
    JSON.stringify(
      {
        ok: findings.length === 0,
        findings,
        warnings,
        protocol_count: protocolCount,
      },
      null,
      2,
    ),
  );
} else {
  console.log(`checked ${protocolCount} protocol row(s) in ${MANIFEST_PATH}`);
  for (const w of warnings) console.log(`  warn ${w.code} ${w.file}: ${w.detail}`);
  if (findings.length === 0) {
    console.log("ok   protocol coverage");
  } else {
    console.log(`FAIL protocol coverage (${findings.length} finding${findings.length === 1 ? "" : "s"})`);
    for (const f of findings) console.log(`  ${f.code} ${f.file}: ${f.detail}`);
  }
}

process.exit(findings.length === 0 ? 0 : 1);
