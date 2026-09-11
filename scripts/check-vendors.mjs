#!/usr/bin/env node
// CLI: validates config/vendors.yaml (M3 batch 3, T6, shadow mode, not
// authoritative) against config/vendors.schema.json and its cross-checks.
// Exit 1 on any failing finding.
//
// Usage: node scripts/check-vendors.mjs [--json]
import { checkAllVendors, checkVendorViewFresh, repoRootFrom, REGISTER_PATH } from "./vendors-lib.mjs";

const root = repoRootFrom(import.meta.url);
const json = process.argv.includes("--json");
const { findings, warnings, vendorCount } = checkAllVendors(root);
findings.push(...checkVendorViewFresh(root));

if (json) {
  console.log(
    JSON.stringify(
      {
        ok: findings.length === 0,
        findings,
        warnings,
        vendor_count: vendorCount,
      },
      null,
      2,
    ),
  );
} else {
  console.log(`checked ${vendorCount} vendors in ${REGISTER_PATH}`);
  for (const w of warnings) console.log(`  warn ${w.code} ${w.file}: ${w.detail}`);
  if (findings.length === 0) {
    console.log("ok   vendor register contract");
  } else {
    console.log(`FAIL vendor register contract (${findings.length} finding${findings.length === 1 ? "" : "s"})`);
    for (const f of findings) console.log(`  ${f.code} ${f.file}: ${f.detail}`);
  }
}

process.exit(findings.length === 0 ? 0 : 1);
