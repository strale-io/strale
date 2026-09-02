#!/usr/bin/env node
// CLI: validates design/tokens/*.json and the internal-report consumer
// files against the T13 design-tokens contract. Exit 1 on any failing
// finding; warnings never fail the build.
//
// Usage: node scripts/check-design.mjs [--json]
import { checkAllDesign, repoRootFrom, GENERATED_PATH } from "./design-lib.mjs";
import { generate } from "./generate-design-tokens.mjs";

const root = repoRootFrom(import.meta.url);
const json = process.argv.includes("--json");
const { failures, warnings, tokenFileCount, lintCurrentCount, lintRawCount, lintAllowlistCount } = checkAllDesign(root);

const genResult = generate(root, { check: true });
if (genResult.stale) {
  failures.push({
    code: "GENERATED_STALE",
    file: GENERATED_PATH,
    detail: genResult.missing
      ? `${GENERATED_PATH} is missing — fix: npm run design:tokens:generate`
      : `${GENERATED_PATH} does not match design/tokens/active.json — fix: npm run design:tokens:generate (then commit it)`,
  });
}

if (json) {
  console.log(JSON.stringify({
    ok: failures.length === 0,
    failures,
    warnings,
    token_file_count: tokenFileCount,
    lint_current_count: lintCurrentCount,
    lint_raw_count: lintRawCount,
    lint_allowlist_count: lintAllowlistCount,
  }, null, 2));
} else {
  console.log(`checked ${tokenFileCount} design/tokens/*.json files, ${lintCurrentCount} distinct off-token literals (${lintRawCount} raw occurrences) across the internal-report consumers, ${lintAllowlistCount} allowlisted`);
  if (failures.length === 0) {
    console.log("ok   design tokens contract");
  } else {
    console.log(`FAIL design tokens contract (${failures.length} finding${failures.length === 1 ? "" : "s"})`);
    for (const f of failures) console.log(`  ${f.code} ${f.file}: ${f.detail}`);
  }
  if (warnings.length > 0) {
    console.log(`warn (${warnings.length}):`);
    for (const w of warnings) console.log(`  ${w.code} ${w.file}: ${w.detail}`);
  }
}

process.exit(failures.length === 0 ? 0 : 1);
