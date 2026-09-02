#!/usr/bin/env node
// CLI: validates archive/receipts/*.json against the T15 receipt contract —
// schema, immutability (git fact), and dangling evidence paths cited from
// decision records, program tracks, and remediation packages. Warns on
// handoffs since 2026-09-02 that state a bare test count with no receipt.
//
// Usage: node scripts/check-receipts.mjs [--json]
import { checkAllReceipts, repoRootFrom } from "./receipts-lib.mjs";

const root = repoRootFrom(import.meta.url);
const json = process.argv.includes("--json");
const { failures, warnings, records } = checkAllReceipts(root);

if (json) {
  console.log(JSON.stringify({ ok: failures.length === 0, failures, warnings, receipt_count: records.length }, null, 2));
} else {
  console.log(`checked ${records.length} archive/receipts/*.json files`);
  if (failures.length === 0) {
    console.log("ok   receipts contract");
  } else {
    console.log(`FAIL receipts contract (${failures.length} finding${failures.length === 1 ? "" : "s"})`);
    for (const f of failures) console.log(`  ${f.code} ${f.file}: ${f.detail}`);
  }
  if (warnings.length > 0) {
    console.log(`warn (${warnings.length}) — handoffs stating a bare test count with no receipt:`);
    for (const w of warnings) console.log(`  ${w.code} ${w.file}: ${w.detail}`);
  }
}

process.exit(failures.length === 0 ? 0 : 1);
