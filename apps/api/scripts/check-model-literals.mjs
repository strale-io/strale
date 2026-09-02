#!/usr/bin/env node
/**
 * Fail CI if a Claude/GPT/Voyage model-id literal lives anywhere in
 * apps/api/src outside apps/api/src/lib/models.ts, *.test.ts, and the
 * small documented DATA_FILE_ALLOWLIST of capabilities that legitimately
 * catalogue OTHER vendors' model ids as reference data rather than call
 * one themselves. Also validates that every models.ts registry entry
 * carries a non-empty id, pinned_at (a real calendar date), and decision.
 *
 * Usage: node apps/api/scripts/check-model-literals.mjs [--json]
 * Wired at the repo root as `npm run models:check`.
 */
import { checkAllModels, repoRootFrom, MODELS_PATH, SCAN_ROOT, DATA_FILE_ALLOWLIST } from "./model-literals-lib.mjs";

const root = repoRootFrom(import.meta.url);
const json = process.argv.includes("--json");
const { findings, scannedFileCount } = checkAllModels(root);

if (json) {
  console.log(JSON.stringify({ ok: findings.length === 0, findings, scanned_file_count: scannedFileCount }, null, 2));
} else {
  console.log(`checked ${scannedFileCount} files under ${SCAN_ROOT} (excluding ${MODELS_PATH}, *.test.ts, ${Object.keys(DATA_FILE_ALLOWLIST).length} allowlisted data files)`);
  if (findings.length === 0) {
    console.log("ok   model registry contract");
  } else {
    console.log(`FAIL model registry contract (${findings.length} finding${findings.length === 1 ? "" : "s"})`);
    for (const f of findings) console.log(`  ${f.code} ${f.file}: ${f.detail}`);
  }
}

process.exit(findings.length === 0 ? 0 : 1);
