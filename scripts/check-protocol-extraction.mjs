#!/usr/bin/env node
// CLI: checks every extracted protocol mirror under
// docs/governance/protocols/*.md against the CLAUDE.md section it claims to
// copy (T6 M3 batch 6a). CLAUDE.md stays the sole authority; this only
// proves the two copies have not silently diverged. Exit 1 on any finding.
// Never edits CLAUDE.md or a protocol file.
//
// Usage: node scripts/check-protocol-extraction.mjs [--json]
import { checkAllProtocolExtraction, repoRootFrom, PROTOCOLS_DIR } from "./protocol-extraction-lib.mjs";

const root = repoRootFrom(import.meta.url);
const json = process.argv.includes("--json");
const { findings, fileCount } = checkAllProtocolExtraction(root);

if (json) {
  console.log(
    JSON.stringify(
      {
        ok: findings.length === 0,
        findings,
        candidate_file_count: fileCount,
      },
      null,
      2,
    ),
  );
} else {
  console.log(`checked ${fileCount} candidate protocol mirror(s) under ${PROTOCOLS_DIR}`);
  if (findings.length === 0) {
    console.log("ok   protocol extraction");
  } else {
    console.log("FAIL protocol extraction");
    for (const f of findings) console.log(`  ${f.code} ${f.file}: ${f.detail}`);
  }
}

process.exit(findings.length === 0 ? 0 : 1);
