#!/usr/bin/env node
// Generates stable directory navigation in archive/README.md and handoff/README.md.
// Independent evidence additions must never edit a shared generated hunk.
// Hand-written archive prose above the marker is preserved.
//
// --detail prints the full archive statistics and dated handoff table to stdout.
// --check exits 2 on missing/stale navigation; CI retains its warning-only gate.
// The hook uses the same generator on the staged snapshot.
import { requireInputs } from "./require-inputs.mjs";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ARCHIVE_DIR = "archive";
export const ARCHIVE_README_PATH = "archive/README.md";
export const HANDOFF_DIR = "handoff";
export const HANDOFF_README_PATH = "handoff/README.md";

export const ARCHIVE_MARKER_BEGIN = "<!-- BEGIN GENERATED ARCHIVE INDEX (npm run archive:index) -->";
export const ARCHIVE_MARKER_END = "<!-- END GENERATED ARCHIVE INDEX -->";

const DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})-/;
const INTENT_LINE = /^#{0,6}\s*\**Intent:\**\s*(.+?)\s*$/;

export function repoRootFrom(importMetaUrl) {
  return resolve(dirname(fileURLToPath(importMetaUrl)), "..");
}

/** True when this module was invoked directly, not imported. */
export function isDirectInvocation(importMetaUrl) {
  if (!process.argv[1]) return false;
  const invoked = resolve(process.argv[1]).toLowerCase();
  const modulePath = fileURLToPath(importMetaUrl).toLowerCase();
  return invoked === modulePath;
}

function normalizeNewlines(value) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function truncate(text, max = 120) {
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - 3)).trimEnd() + "...";
}

function extractDate(filename) {
  const match = DATE_PREFIX.exec(filename);
  return match ? match[1] : null;
}

/** Top-level directories directly under archive/, sorted. */
export function listArchiveSubtrees(root) {
  const dir = resolve(root, ARCHIVE_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

/** Recursively lists files (relative paths, forward-slash) under a directory. */
function listFilesRecursive(absoluteDir, relativePrefix) {
  const out = [];
  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    const rel = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
    const abs = resolve(absoluteDir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(abs, rel));
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
  return out;
}

/**
 * Stats for one archive/ subtree: total file count and the file with the
 * latest YYYY-MM-DD filename-prefix date (nulls when no file in the subtree
 * carries a dated prefix).
 */
export function collectSubtreeStats(root, subtree) {
  const abs = resolve(root, ARCHIVE_DIR, subtree);
  const files = listFilesRecursive(abs, "").sort();
  let newestFile = null;
  let newestDate = null;
  for (const file of files) {
    const base = file.split("/").pop();
    const date = extractDate(base);
    if (date && (newestDate === null || date >= newestDate)) {
      newestDate = date;
      newestFile = file;
    }
  }
  return { subtree, fileCount: files.length, newestFile, newestDate };
}

export function collectAllSubtreeStats(root) {
  return listArchiveSubtrees(root).map((subtree) => collectSubtreeStats(root, subtree));
}

function renderGeneratedArchiveBlock(root) {
  const stats = collectAllSubtreeStats(root);
  const totalFiles = stats.reduce((sum, s) => sum + s.fileCount, 0);
  const rows = stats.map((s) => {
    const newest = s.newestFile ? `\`${s.newestFile}\` (${s.newestDate})` : "_(no dated filenames)_";
    return `| \`${ARCHIVE_DIR}/${s.subtree}/\` | ${s.fileCount} | ${newest} |`;
  });
  return [
    ARCHIVE_MARKER_BEGIN,
    "",
    "## Generated index",
    "",
    "> Detailed listing printed on demand by `npm run archive:index -- --detail`;",
    "> it is not tracked, so independent additions never conflict in this file.",
    "> \"Newest file\" is read from a `YYYY-MM-DD-` filename prefix; a subtree",
    "> with no dated filenames is marked accordingly rather than guessed.",
    "",
    `${stats.length} subtree${stats.length === 1 ? "" : "s"}, ${totalFiles} file${totalFiles === 1 ? "" : "s"} total.`,
    "",
    "| subtree | files | newest (by filename date) |",
    "| --- | --- | --- |",
    ...rows,
    "",
    ARCHIVE_MARKER_END,
    "",
  ].join("\n");
}

/** Splits existing archive/README.md into the hand-written prose above the marker. */
function existingProse(content) {
  const idx = content.indexOf(ARCHIVE_MARKER_BEGIN);
  if (idx === -1) return content.replace(/\n*$/, "\n");
  return content.slice(0, idx).replace(/\n*$/, "\n");
}

export function renderDetailedArchiveReadme(root, existingContent) {
  const prose = existingProse(normalizeNewlines(existingContent));
  const generated = renderGeneratedArchiveBlock(root);
  return `${prose}\n${generated}`;
}

// ---------------------------------------------------------------------------
// handoff/README.md
// ---------------------------------------------------------------------------

/** handoff/_general/<category>/*.md files, excluding README.md, sorted. */
export function listHandoffFiles(root) {
  const generalDir = resolve(root, HANDOFF_DIR, "_general");
  if (!existsSync(generalDir)) return [];
  const out = [];
  for (const category of readdirSync(generalDir, { withFileTypes: true })) {
    if (!category.isDirectory()) continue;
    const categoryDir = resolve(generalDir, category.name);
    for (const entry of readdirSync(categoryDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      if (entry.name === "README.md") continue;
      out.push({
        category: category.name,
        name: entry.name,
        relativePath: `${HANDOFF_DIR}/_general/${category.name}/${entry.name}`,
      });
    }
  }
  return out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function firstIntentLine(content) {
  for (const line of normalizeNewlines(content).split("\n")) {
    const match = INTENT_LINE.exec(line);
    if (match && match[1]) return match[1];
  }
  return null;
}

/** One entry per handoff file: date (or null), path, category, intent (or null). */
export function collectHandoffEntries(root) {
  return listHandoffFiles(root).map((f) => {
    const date = extractDate(f.name);
    const content = readFileSync(resolve(root, f.relativePath), "utf8");
    const intent = firstIntentLine(content);
    return { ...f, date, intent: intent ? truncate(intent, 120) : null };
  });
}

export function renderDetailedHandoffReadme(entries) {
  const dated = entries.filter((e) => e.date).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.relativePath.localeCompare(b.relativePath) * -1));
  const undated = entries.filter((e) => !e.date).sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const ordered = [...dated, ...undated];
  const withIntent = entries.filter((e) => e.intent).length;
  const withoutIntent = entries.length - withIntent;

  const rows = ordered.map((e) => {
    const date = e.date ?? "—";
    const intent = e.intent ? e.intent.replace(/\|/g, "\\|") : "_(no Intent: line found — predates the convention)_";
    return `| ${date} | [\`${e.relativePath}\`](${e.relativePath.slice(HANDOFF_DIR.length + 1)}) | ${intent} |`;
  });

  return [
    "# handoff/ — session handoffs, auto-generated index",
    "",
    "> Detailed listing printed on demand by `npm run archive:index -- --detail`;",
    "> it is not tracked, so independent additions never conflict. Do not edit by hand.",
    ">",
    "> Session handoffs are historical: each describes the repo as it was when",
    "> written. See `handoff/_general/README.md` for paths the 2026-08-17 sweep",
    "> relocated. Session-start reading order is `docs/README.md` →",
    "> `docs/programs/README.md`, never a sweep through this table.",
    "",
    `${entries.length} file${entries.length === 1 ? "" : "s"} (${withIntent} with a recorded intent, ${withoutIntent} without).`,
    "",
    "| date | file | intent |",
    "| --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

// Tracked navigation is deliberately independent of file additions. GitHub
// cannot use merge drivers; even sorted per-file rows conflict at the same hunk.
// Directory links always expose the current tree. Detailed listings are stdout
// only, so readers can request them without creating a shared merge hot spot.
export function renderArchiveReadme(root, existingContent) {
  return `${existingProse(normalizeNewlines(existingContent))}\n${[
    ARCHIVE_MARKER_BEGIN, "", "## Index", "",
    "[Browse all archive files and directories](./)", "",
    "For file counts and newest entries, run `npm run archive:index -- --detail`.", "",
    ARCHIVE_MARKER_END, "",
  ].join("\n")}`;
}

export function renderHandoffReadme() {
  return ["# handoff/ — session handoffs", "",
    "[Browse all handoffs](./)", "",
    "[Code handoffs](_general/from-code/) · [Chat handoffs](_general/from-chat/)", "",
    "Session handoffs are historical. Start with `docs/README.md` and",
    "`docs/programs/README.md` for current work. See [_general/README.md](_general/README.md)",
    "for relocated history. For a dated table with intents, run",
    "`npm run archive:index -- --detail`. This navigation is generated; do not edit by hand.", "",
  ].join("\n");
}

export function generateArchiveReadme(root, { check = false } = {}) {
  const outPath = resolve(root, ARCHIVE_README_PATH);
  const existing = existsSync(outPath) ? readFileSync(outPath, "utf8") : "";
  const content = renderArchiveReadme(root, existing);

  if (!check) {
    writeFileSync(outPath, content, "utf8");
    return { written: true, path: ARCHIVE_README_PATH };
  }
  if (!existsSync(outPath)) return { written: false, stale: true, missing: true, path: ARCHIVE_README_PATH };
  const stale = normalizeNewlines(readFileSync(outPath, "utf8")) !== normalizeNewlines(content);
  return { written: false, stale, missing: false, path: ARCHIVE_README_PATH };
}

export function generateHandoffReadme(root, { check = false } = {}) {
  const outPath = resolve(root, HANDOFF_README_PATH);
  const entries = collectHandoffEntries(root);
  const content = renderHandoffReadme(entries) ;

  if (!check) {
    writeFileSync(outPath, content, "utf8");
    return { written: true, path: HANDOFF_README_PATH, fileCount: entries.length };
  }
  if (!existsSync(outPath)) return { written: false, stale: true, missing: true, path: HANDOFF_README_PATH, fileCount: entries.length };
  const stale = normalizeNewlines(readFileSync(outPath, "utf8")) !== normalizeNewlines(content);
  return { written: false, stale, missing: false, path: HANDOFF_README_PATH, fileCount: entries.length };
}

export function generateAll(root, { check = false } = {}) {
  return {
    archive: generateArchiveReadme(root, { check }),
    handoff: generateHandoffReadme(root, { check }),
  };
}

if (isDirectInvocation(import.meta.url)) {
  const root = repoRootFrom(import.meta.url);
  const check = process.argv.includes("--check");
  // Archive and handoff are established inputs, even though an individual
  // category can legitimately contain no files.
  requireInputs(collectAllSubtreeStats(root), "archive index: subtrees");
  requireInputs(collectHandoffEntries(root), "handoff index: entries");
  if (process.argv.includes("--detail")) {
    console.log(renderDetailedArchiveReadme(root, "# Archive details\n"));
    console.log(renderDetailedHandoffReadme(collectHandoffEntries(root)));
    process.exit(0);
  }
  const result = generateAll(root, { check });

  if (!check) {
    console.log(`Wrote ${ARCHIVE_README_PATH} and ${HANDOFF_README_PATH} (${result.handoff.fileCount} handoff files available)`);
  } else {
    const staleFiles = Object.values(result).filter((r) => r.stale);
    if (staleFiles.length > 0) {
      for (const r of staleFiles) {
        console.error(
          r.missing
            ? `${r.path} missing — fix: npm run archive:index`
            : `${r.path} is stale — fix: npm run archive:index (then commit it)`,
        );
      }
      process.exit(2);
    }
    console.log(`${ARCHIVE_README_PATH} and ${HANDOFF_README_PATH} up to date`);
  }
}
