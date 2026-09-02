#!/usr/bin/env node
// Regenerates docs/research/README.md from front matter across
// docs/research/*.md. Mirrors regenerate-coverage-matrix-summary.mjs:
//
//   (default) — write README.md
//   --check   — diff against the committed README.md, exit 2 on drift
//
// One row per topic (its current file, question, date, and the count of
// superseded files on that topic), then a table of historical files.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isDirectInvocation, loadResearchFiles, repoRootFrom, README_PATH, RESEARCH_DIR } from "./research-lib.mjs";

function escapeCell(text) {
  return String(text ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function render(records) {
  const valid = records.filter((r) => !r.error && r.metadata);
  const byTopic = new Map();
  for (const r of valid) {
    const topic = r.metadata.topic;
    if (!byTopic.has(topic)) byTopic.set(topic, []);
    byTopic.get(topic).push(r);
  }

  const currentRows = [];
  for (const [topic, group] of [...byTopic.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const current = group.find((r) => r.metadata.status === "current");
    if (!current) continue;
    const supersededCount = group.filter((r) => r.metadata.status === "superseded").length;
    currentRows.push(
      `| ${escapeCell(topic)} | [${escapeCell(current.name)}](${current.name}) | ${escapeCell(current.metadata.question)} | ${current.metadata.date} | ${supersededCount} |`,
    );
  }

  const historical = valid
    .filter((r) => r.metadata.status === "historical")
    .sort((a, b) => a.name.localeCompare(b.name));
  const historicalRows = historical.map(
    (r) => `| [${escapeCell(r.name)}](${r.name}) | ${escapeCell(r.metadata.topic)} | ${r.metadata.date} | ${escapeCell(r.metadata.question)} |`,
  );

  const parts = [
    "# Research index — auto-generated",
    "",
    "> Auto-generated from front matter across `docs/research/*.md`. Do not edit",
    "> by hand. Regenerate with `npm run research:index`. Checked in CI by",
    "> `npm run research:check` (fails when this file is stale — same pattern",
    "> as `apps/api/coverage-matrix/COVERAGE.md`).",
    ">",
    "> Research is evidence, never authority. One `current` file per topic; a",
    "> finding that changes direction produces a decision record",
    "> (`docs/decisions/records/`), not a rewrite of the research file.",
    ">",
    "> Contract: [research.schema.json](research.schema.json). Checker:" +
      " `scripts/check-research.mjs`.",
    "",
    `Total files: ${valid.length} (${currentRows.length} topics with a current answer, ${historicalRows.length} historical).`,
    "",
    "## Current, by topic",
    "",
    "| topic | current file | question | date | superseded count |",
    "| --- | --- | --- | --- | --- |",
    ...currentRows,
    "",
    "## Historical",
    "",
    historicalRows.length > 0
      ? ["| file | topic | date | question |", "| --- | --- | --- | --- |", ...historicalRows].join("\n")
      : "_None._",
    "",
  ];
  return parts.join("\n");
}

export function generateIndex(root, { check = false } = {}) {
  const outPath = resolve(root, README_PATH);
  const records = loadResearchFiles(root);
  const content = render(records) + "\n";

  if (!check) {
    writeFileSync(outPath, content, "utf8");
    return { written: true, path: README_PATH, fileCount: records.length };
  }

  if (!existsSync(outPath)) {
    return { written: false, stale: true, missing: true, path: README_PATH };
  }
  const committed = readFileSync(outPath, "utf8");
  const normalize = (s) => s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const stale = normalize(committed) !== normalize(content);
  return { written: false, stale, missing: false, path: README_PATH, fileCount: records.length };
}

if (isDirectInvocation(import.meta.url)) {
  const root = repoRootFrom(import.meta.url);
  const check = process.argv.includes("--check");
  const result = generateIndex(root, { check });
  if (!check) {
    console.log(`Wrote ${README_PATH} (${result.fileCount} files indexed) from ${RESEARCH_DIR}`);
  } else if (result.missing) {
    console.error(`${README_PATH} missing`);
    process.exit(2);
  } else if (result.stale) {
    console.error(`${README_PATH} is stale. Regenerate with: npm run research:index (then commit it).`);
    process.exit(2);
  } else {
    console.log(`${README_PATH} up to date`);
  }
}
