#!/usr/bin/env node
// Regenerates .env.example (root) and apps/api/.env.example from
// config/env-manifest.yaml. Mirrors generate-research-index.mjs /
// generate-design-tokens.mjs:
//
//   (default) — write both files
//   --check   — diff against the committed files, exit 2 on drift
//
// Only rows whose required_in includes "local" are written — a variable
// only needed in production or CI has no business in a local template.
// Comments are regenerated from the manifest's purpose field every time;
// this file is generated output, not a place to hand-edit prose.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isDirectInvocation,
  loadManifest,
  repoRootFrom,
  ROOT_EXAMPLE_PATH,
  API_EXAMPLE_PATH,
} from "./env-lib.mjs";

const HEADER = [
  "# Auto-generated from config/env-manifest.yaml — do not hand-edit.",
  "# Regenerate with: npm run env:example",
  "# Checked in CI by: npm run env:check (fails when this file is stale).",
  "#",
  "# Every value below is a placeholder. Real values live in Railway (production)",
  "# or a local .env this file is never allowed to contain.",
  "",
];

function placeholderFor(row) {
  if (row.example_value) return row.example_value;
  if (row.cost_class === "none" && row.provider === "internal") return "";
  return "...";
}

function renderExample(rows) {
  const local = rows.filter((r) => r.required_in?.includes("local") && !r.retired);
  local.sort((a, b) => a.name.localeCompare(b.name));

  const lines = [...HEADER];
  for (const row of local) {
    lines.push(`# ${row.purpose}`);
    if (row.cost_note) lines.push(`# ${row.cost_note}`);
    lines.push(`${row.name}=${placeholderFor(row)}`);
    lines.push("");
  }
  // Trim the trailing blank line, keep exactly one final newline.
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n") + "\n";
}

function normalize(s) {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function generate(root, { check = false } = {}) {
  const rows = loadManifest(root);
  const content = renderExample(Array.isArray(rows) ? rows : []);
  const targets = [ROOT_EXAMPLE_PATH, API_EXAMPLE_PATH];
  const results = [];

  for (const relPath of targets) {
    const abs = resolve(root, relPath);
    if (!check) {
      writeFileSync(abs, content, "utf8");
      results.push({ path: relPath, written: true, stale: false, missing: false });
      continue;
    }
    if (!existsSync(abs)) {
      results.push({ path: relPath, written: false, stale: true, missing: true });
      continue;
    }
    const committed = readFileSync(abs, "utf8");
    const stale = normalize(committed) !== normalize(content);
    results.push({ path: relPath, written: false, stale, missing: false });
  }

  return { results, stale: results.some((r) => r.stale), rowCount: rows.length };
}

if (isDirectInvocation(import.meta.url)) {
  const root = repoRootFrom(import.meta.url);
  const check = process.argv.includes("--check");
  const result = generate(root, { check });
  if (!check) {
    for (const r of result.results) console.log(`Wrote ${r.path}`);
  } else {
    let bad = false;
    for (const r of result.results) {
      if (r.missing) {
        console.error(`${r.path} missing`);
        bad = true;
      } else if (r.stale) {
        console.error(`${r.path} is stale. Regenerate with: npm run env:example (then commit it).`);
        bad = true;
      } else {
        console.log(`${r.path} up to date`);
      }
    }
    if (bad) process.exit(2);
  }
}
