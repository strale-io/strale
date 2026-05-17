#!/usr/bin/env node
/**
 * Regenerate apps/api/coverage-matrix/COVERAGE.md from all *.yaml in
 * coverage-matrix/. Three sections: by country, by evidence type, by status.
 *
 * Modes:
 *   (default) — write COVERAGE.md
 *   --check   — write to a temp buffer, diff against committed COVERAGE.md,
 *               exit 2 on diff. Used by CI to catch stale summaries.
 *
 * Pairs with validate-coverage-matrix.mjs. Together they form the matrix
 * structural-enforcement layer per DEC-20260517-A.
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..");
const matrixDir = resolve(repoRoot, "apps", "api", "coverage-matrix");
const outPath = resolve(matrixDir, "COVERAGE.md");
const check = process.argv.includes("--check");

function loadRows() {
  // Convention is .yaml only; mirror the validator's filter.
  const files = readdirSync(matrixDir).filter((f) => f.endsWith(".yaml")).sort();
  return files
    .map((f) => yaml.load(readFileSync(resolve(matrixDir, f), "utf8")))
    .filter((r) => r && typeof r === "object");
}

function formatPrice(p) {
  if (p === null || p === undefined) return "—";
  if (p === 0) return "€0";
  return `€${p}`;
}

function row(r) {
  return `| ${r.capability_slug} | ${r.country} | ${r.evidence_type} | ${r.provider} | ${r.status} | ${formatPrice(r.per_call_price_eur)} | ${r.evidence_grade ?? "—"} | ${r.last_verified ?? "—"} |`;
}

const TABLE_HEADER =
  "| capability_slug | country | evidence_type | provider | status | per_call_price_eur | evidence_grade | last_verified |\n" +
  "| --- | --- | --- | --- | --- | --- | --- | --- |";

function sectionByCountry(rows) {
  const grouped = new Map();
  for (const r of rows) {
    if (!grouped.has(r.country)) grouped.set(r.country, []);
    grouped.get(r.country).push(r);
  }
  const countries = [...grouped.keys()].sort();
  const parts = ["## By country\n"];
  for (const c of countries) {
    parts.push(`### ${c} (${grouped.get(c).length})\n`);
    parts.push(TABLE_HEADER);
    for (const r of grouped.get(c).sort((a, b) => a.capability_slug.localeCompare(b.capability_slug))) {
      parts.push(row(r));
    }
    parts.push("");
  }
  return parts.join("\n");
}

function sectionByEvidence(rows) {
  const grouped = new Map();
  for (const r of rows) {
    if (!grouped.has(r.evidence_type)) grouped.set(r.evidence_type, []);
    grouped.get(r.evidence_type).push(r);
  }
  const types = [...grouped.keys()].sort();
  const parts = ["## By evidence type\n"];
  for (const t of types) {
    parts.push(`### ${t} (${grouped.get(t).length})\n`);
    parts.push(TABLE_HEADER);
    for (const r of grouped.get(t).sort((a, b) => a.country.localeCompare(b.country))) {
      parts.push(row(r));
    }
    parts.push("");
  }
  return parts.join("\n");
}

function sectionByStatus(rows) {
  const counts = { Live: 0, Committed: 0 };
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return [
    "## By status",
    "",
    `- Live: ${counts.Live}`,
    `- Committed: ${counts.Committed}`,
    "",
  ].join("\n");
}

function render(rows) {
  return [
    "# Coverage matrix — auto-generated summary",
    "",
    "> Auto-generated. Do not edit by hand. Regenerate via `npm run coverage-matrix:summary`.",
    "",
    `Total rows: ${rows.length}`,
    "",
    sectionByStatus(rows),
    sectionByEvidence(rows),
    sectionByCountry(rows),
  ].join("\n");
}

const rows = loadRows();
const content = render(rows) + "\n";

if (check) {
  if (!existsSync(outPath)) {
    console.error(`COVERAGE.md missing at ${outPath}`);
    process.exit(2);
  }
  const committed = readFileSync(outPath, "utf8");
  if (committed !== content) {
    console.error(
      "COVERAGE.md is stale. Regenerate with: npm run coverage-matrix:summary  " +
        "(then commit the updated COVERAGE.md)",
    );
    process.exit(2);
  }
  console.log(`COVERAGE.md up to date (${rows.length} rows)`);
} else {
  writeFileSync(outPath, content, "utf8");
  console.log(`Wrote COVERAGE.md (${rows.length} rows) to ${outPath}`);
}
