#!/usr/bin/env node
/**
 * scripts/m2-quote-fidelity.mjs
 *
 * Operator report for the M2 decision-record candidates: for every double-
 * quoted span in a record's body, checks whether the quoted text actually
 * appears, in order, in at least one candidate source. It is not a CI gate
 * (it needs the private Notion export to be complete) — run it by hand, or
 * from a fresh review agent that has the export.
 *
 * Declared normalization convention (apply in this order before comparing
 * any two pieces of text):
 *   1. Transliterate: "EUR" for U+20AC (EUR), "x" for U+00D7 (x), ">=" for
 *      U+2265 (>=), "<=" for U+2264 (<=), "->" for U+2192 (arrow), "..." for
 *      U+2026 (ellipsis).
 *   2. Lowercase.
 *   3. Delete every character that is not a Unicode letter or digit
 *      (this removes spaces, punctuation, markdown emphasis markers, curly
 *      vs. straight quote/apostrophe differences, and trailing periods at a
 *      truncation point, all in one step).
 *
 * A quoted span containing an ellipsis ("..." or the transliterated "…") is
 * split into ordered segments. The span is FAITHFUL to a source when every
 * segment's normalized text is found in that source's normalized text, in
 * non-decreasing order (segments need not be contiguous — that is what the
 * ellipsis is for — but they must not appear out of order).
 *
 * Usage:
 *   node scripts/m2-quote-fidelity.mjs [--root <repo root>]
 *     [--records <dir>] [--export <path>] [--frontend <sibling checkout>]
 *     [--only <record file or key>]... [--json <out file>] [--min-chars 25]
 *     [--strict]
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, join, resolve } from "node:path";

import { parseDecisionRecord, readDecisionRecords } from "./decision-records-lib.mjs";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    records: "docs/decisions/records",
    export: null,
    frontend: null,
    only: [],
    json: null,
    minChars: 25,
    strict: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const next = () => argv[(i += 1)];
    if (flag === "--root") args.root = next();
    else if (flag === "--records") args.records = next();
    else if (flag === "--export") args.export = next();
    else if (flag === "--frontend") args.frontend = next();
    else if (flag === "--only") args.only.push(next());
    else if (flag === "--json") args.json = next();
    else if (flag === "--min-chars") args.minChars = Number(next());
    else if (flag === "--strict") args.strict = true;
  }
  return args;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

const TRANSLITERATIONS = [
  ["€", "EUR"],
  ["×", "x"],
  ["≥", ">="],
  ["≤", "<="],
  ["→", "->"],
  ["…", "..."],
];

export function normalize(text) {
  let out = text;
  for (const [from, to] of TRANSLITERATIONS) out = out.split(from).join(to);
  out = out.toLowerCase();
  out = out.replace(/[^\p{L}\p{N}]/gu, "");
  return out;
}

// ---------------------------------------------------------------------------
// Code-span masking (fenced blocks + inline code are never scanned for
// quotes, but their contents are preserved verbatim elsewhere in the body).
// ---------------------------------------------------------------------------

/**
 * Ranges of `body` that are fenced code blocks or inline code spans, as
 * [start, end) pairs. A quote is "inside code" when its opening `"` falls in
 * one of these ranges — content of a legitimate prose quote that happens to
 * mention a backticked identifier is NOT masked; only a quote whose own
 * delimiters sit inside a code region is excluded.
 */
export function codeRanges(body) {
  const ranges = [];
  const fenceRe = /```[\s\S]*?```/g;
  let match;
  while ((match = fenceRe.exec(body))) {
    ranges.push([match.index, match.index + match[0].length]);
  }
  const chars = body.split("");
  for (const [start, end] of ranges) {
    for (let i = start; i < end; i += 1) {
      if (chars[i] !== "\n") chars[i] = " ";
    }
  }
  const maskedForInline = chars.join("");
  const inlineRe = /`[^`\n]+`/g;
  while ((match = inlineRe.exec(maskedForInline))) {
    ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
}

function isInCode(ranges, index) {
  return ranges.some(([start, end]) => index >= start && index < end);
}

// ---------------------------------------------------------------------------
// Quote-span extraction
// ---------------------------------------------------------------------------

export function splitEllipsisSegments(rawSpanText) {
  const withDots = rawSpanText.split("…").join("...");
  const segments = withDots
    .split(/\.{3,}/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  return segments.length > 0 ? segments : [rawSpanText];
}

function lineNumberAt(body, index) {
  let line = 1;
  for (let i = 0; i < index && i < body.length; i += 1) {
    if (body[i] === "\n") line += 1;
  }
  return line;
}

/**
 * Returns every double-quoted span in `body` that is not inside a fenced
 * code block or inline code span and whose normalized length is at least
 * `minChars`. Each entry: { raw, segments, line, index }.
 */
export function extractQuoteSpans(body, minChars = 25) {
  const ranges = codeRanges(body);
  const spans = [];
  const quoteRe = /"([^"]*)"/g;
  let match;
  while ((match = quoteRe.exec(body))) {
    if (isInCode(ranges, match.index)) continue;
    const raw = match[1];
    const segments = splitEllipsisSegments(raw);
    const normalizedLength = normalize(segments.join(" ")).length;
    if (normalizedLength < minChars) continue;
    spans.push({
      raw,
      segments,
      line: lineNumberAt(body, match.index),
      index: match.index,
    });
  }
  return spans;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** True when every (already-normalized) segment appears, in order, in `sourceNormalized`. */
export function matchSegmentsInOrder(normalizedSegments, sourceNormalized) {
  let cursor = 0;
  for (const segment of normalizedSegments) {
    if (segment.length === 0) continue;
    const idx = sourceNormalized.indexOf(segment, cursor);
    if (idx === -1) return false;
    cursor = idx + segment.length;
  }
  return true;
}

/**
 * Longest prefix of `spanNormalized` that appears verbatim, starting at some
 * position, in `sourceNormalized`. Uses exponential + binary search over
 * `String#includes` so a long source document stays cheap to scan.
 */
export function longestMatchingPrefix(spanNormalized, sourceNormalized) {
  if (spanNormalized.length === 0 || sourceNormalized.length === 0) return 0;
  let low = 0;
  let high = spanNormalized.length;
  if (!sourceNormalized.includes(spanNormalized.slice(0, 1))) return 0;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (sourceNormalized.includes(spanNormalized.slice(0, mid))) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return low;
}

/**
 * Checks one extracted span against a Map<label, normalizedText>.
 * Returns { faithful, bestMatch: { label, prefixLength } | null }.
 */
export function checkSpanAgainstSources(span, sources) {
  const normalizedSegments = span.segments.map(normalize);
  const spanNormalized = normalizedSegments.join("");
  let bestMatch = null;
  for (const [label, sourceNormalized] of sources) {
    if (matchSegmentsInOrder(normalizedSegments, sourceNormalized)) {
      return { faithful: true, matchedSource: label, bestMatch: null };
    }
    const prefixLength = longestMatchingPrefix(spanNormalized, sourceNormalized);
    if (!bestMatch || prefixLength > bestMatch.prefixLength) {
      bestMatch = { label, prefixLength };
    }
  }
  return { faithful: false, matchedSource: null, bestMatch };
}

// ---------------------------------------------------------------------------
// Notion export parsing (mirrors dump_rows.py exactly: the raw export is
// JSON inside JSON — every `"text": "<escaped JSON>"` occurrence decodes,
// on a second JSON.parse, into an object carrying a `results` array of
// Notion rows. Nulls stay null; we never regex-slice a row's fields.)
// ---------------------------------------------------------------------------

const TEXT_FIELD_RE = /"text":\s*("(?:[^"\\]|\\.)*")/g;

export function parseNotionExport(rawText) {
  const rows = [];
  let match;
  TEXT_FIELD_RE.lastIndex = 0;
  while ((match = TEXT_FIELD_RE.exec(rawText))) {
    let obj;
    try {
      const inner = JSON.parse(match[1]);
      obj = JSON.parse(inner);
    } catch {
      continue;
    }
    if (obj && Array.isArray(obj.results)) {
      for (const row of obj.results) rows.push(row);
    }
  }
  return rows;
}

const HEX32_RE = /[0-9a-f]{32}/gi;

function pageIdOf(row) {
  return String(row.id ?? "").replace(/-/g, "").toLowerCase();
}

/** Every string field value in a row, concatenated for source-text purposes. */
export function rowText(row) {
  const parts = [];
  for (const value of Object.values(row)) {
    if (typeof value === "string" && value.length > 0) parts.push(value);
  }
  return parts.join("\n");
}

function notionQualifierId(recordKey) {
  const match = /--notion-([0-9a-f]{32})$/.exec(recordKey ?? "");
  return match ? match[1].toLowerCase() : null;
}

function pageIdsMentionedIn(text) {
  const ids = new Set();
  const pageRe = /PAGE:([0-9a-f]{32})/gi;
  let match;
  while ((match = pageRe.exec(text))) ids.add(match[1].toLowerCase());
  const bareRe = new RegExp(HEX32_RE.source, HEX32_RE.flags);
  while ((match = bareRe.exec(text))) ids.add(match[0].toLowerCase());
  return ids;
}

/** Which 32-hex Notion page ids does this record reference, from any source? */
export function pageIdsForRecord(record) {
  const ids = new Set();
  const qualifier = notionQualifierId(record.metadata.record_key);
  if (qualifier) ids.add(qualifier);
  for (const entry of record.metadata.evidence ?? []) {
    const urlMatch = /^https:\/\/app\.notion\.com\/([0-9a-f]{32})$/.exec(entry);
    if (urlMatch) ids.add(urlMatch[1].toLowerCase());
  }
  for (const id of pageIdsMentionedIn(record.body)) ids.add(id);
  return ids;
}

export function findNotionRowsForRecord(record, rows) {
  const ids = pageIdsForRecord(record);
  if (ids.size === 0) return [];
  return rows.filter((row) => ids.has(pageIdOf(row)));
}

// ---------------------------------------------------------------------------
// Repository-path and paragraph helpers
// ---------------------------------------------------------------------------

function isRepoPathLike(value) {
  if (/^https?:\/\//.test(value)) return false;
  if (/^[0-9a-f]{32}$/i.test(value)) return false;
  return /[\\/]/.test(value) || /\.[A-Za-z0-9]{1,6}$/.test(value);
}

function readRepoFile(root, relativePath) {
  const absolute = resolve(root, relativePath);
  if (!existsSync(absolute)) return null;
  try {
    return readFileSync(absolute, "utf8");
  } catch {
    return null;
  }
}

/** Split body into paragraphs (runs of lines separated by a blank line); each entry: { start, end, text }. */
function paragraphsOf(body) {
  const paragraphs = [];
  const blankLineRe = /\n[ \t]*\n+/g;
  let cursor = 0;
  let match;
  while ((match = blankLineRe.exec(body))) {
    const text = body.slice(cursor, match.index);
    if (text.trim().length > 0) paragraphs.push({ start: cursor, end: match.index, text });
    cursor = match.index + match[0].length;
  }
  const tail = body.slice(cursor);
  if (tail.trim().length > 0) paragraphs.push({ start: cursor, end: body.length, text: tail });
  return paragraphs;
}

function paragraphContaining(paragraphs, index) {
  for (const paragraph of paragraphs) {
    if (index >= paragraph.start && index <= paragraph.end) return paragraph;
  }
  return null;
}

function backtickedRepoPathsInParagraph(root, paragraph) {
  if (!paragraph) return [];
  const paths = [];
  const re = /`([^`\n]+)`/g;
  let match;
  while ((match = re.exec(paragraph.text))) {
    const candidate = match[1];
    if (isRepoPathLike(candidate) && existsSync(resolve(root, candidate))) {
      paths.push(candidate);
    }
  }
  return paths;
}

function frontendEvidenceEntries(evidence) {
  const entries = [];
  const re = /^strale-io\/strale-frontend@([0-9a-f]{7,40}):(.+)$/;
  for (const entry of evidence ?? []) {
    const match = re.exec(entry);
    if (match) entries.push({ sha: match[1], path: match[2] });
  }
  return entries;
}

function readFrontendFile(frontendRoot, sha, path) {
  try {
    return execFileSync("git", ["-C", frontendRoot, "show", `${sha}:${path}`], {
      encoding: "utf8",
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Building the candidate source set for one record
// ---------------------------------------------------------------------------

/**
 * @param record one entry from readDecisionRecords()
 * @param context { root, allRecords, notionRows, frontendRoot, cache }
 *   cache: shared Map<label, normalizedText> so root-level sources (CLAUDE.md,
 *   AGENTS.md, other records) are normalized once for the whole run.
 * @returns Map<label, normalizedText>
 */
export function gatherSourcesForRecord(record, context) {
  const { root, allRecords, notionRows = [], frontendRoot, cache } = context;
  const sources = new Map();

  const addStatic = (label, text) => {
    if (text == null) return;
    if (!cache.has(label)) cache.set(label, normalize(text));
    sources.set(label, cache.get(label));
  };

  // (a) Notion row fields.
  for (const row of findNotionRowsForRecord(record, notionRows)) {
    const label = `notion:${row["userDefined:ID"] ?? pageIdOf(row)}`;
    sources.set(label, normalize(rowText(row)));
  }

  // (b) evidence entries that are repository paths.
  for (const entry of record.metadata.evidence ?? []) {
    if (isRepoPathLike(entry) && !/^strale-io\//.test(entry)) {
      const text = readRepoFile(root, entry);
      if (text != null) addStatic(`evidence:${entry}`, text);
    }
  }

  // (c) repository paths mentioned in backticks in the same paragraph as
  // each quoted span is handled per-span by the caller (paragraphs differ
  // per span); expose the paragraph list on the record for that purpose.

  // (d) CLAUDE.md, AGENTS.md.
  addStatic("CLAUDE.md", readRepoFile(root, "CLAUDE.md"));
  addStatic("AGENTS.md", readRepoFile(root, "AGENTS.md"));

  // (e) every other record.
  for (const other of allRecords) {
    if (other.file === record.file) continue;
    addStatic(`record:${other.file}`, other.content);
  }

  // (f) strale-frontend evidence, when --frontend is given.
  if (frontendRoot) {
    for (const { sha, path } of frontendEvidenceEntries(record.metadata.evidence)) {
      const label = `frontend:${sha.slice(0, 12)}:${path}`;
      if (!cache.has(label)) {
        const text = readFrontendFile(frontendRoot, sha, path);
        if (text != null) cache.set(label, normalize(text));
      }
      if (cache.has(label)) sources.set(label, cache.get(label));
    }
  }

  return sources;
}

// ---------------------------------------------------------------------------
// Running the check
// ---------------------------------------------------------------------------

export function checkRecord(record, context) {
  const spans = extractQuoteSpans(record.body, context.minChars);
  const paragraphs = paragraphsOf(record.body);
  const baseSources = gatherSourcesForRecord(record, context);
  const results = [];
  for (const span of spans) {
    const paragraph = paragraphContaining(paragraphs, span.index);
    const sources = new Map(baseSources);
    for (const path of backtickedRepoPathsInParagraph(context.root, paragraph)) {
      const label = `paragraph-path:${path}`;
      if (!context.cache.has(label)) {
        const text = readRepoFile(context.root, path);
        if (text != null) context.cache.set(label, normalize(text));
      }
      if (context.cache.has(label)) sources.set(label, context.cache.get(label));
    }
    const outcome = checkSpanAgainstSources(span, sources);
    results.push({
      record: record.file,
      line: span.line,
      span: span.raw,
      faithful: outcome.faithful,
      matchedSource: outcome.matchedSource,
      bestMatch: outcome.bestMatch,
    });
  }
  return results;
}

export function runFidelityCheck(args) {
  const root = resolve(args.root);
  const recordsDir = resolve(root, args.records);
  const allRecords =
    recordsDir === resolve(root, "docs/decisions/records")
      ? readDecisionRecords(root)
      : readCustomRecordsDir(recordsDir);

  let records = allRecords;
  if (args.only.length > 0) {
    const wanted = new Set(args.only);
    records = allRecords.filter(
      (record) =>
        wanted.has(basename(record.file)) ||
        wanted.has(record.file) ||
        wanted.has(record.metadata.record_key) ||
        wanted.has(record.metadata.id)
    );
  }

  let notionRows = [];
  if (args.export) {
    const rawText = readFileSync(resolve(args.export), "utf8");
    notionRows = parseNotionExport(rawText);
  }

  const cache = new Map();
  const context = {
    root,
    allRecords,
    notionRows,
    frontendRoot: args.frontend ? resolve(args.frontend) : null,
    cache,
    minChars: args.minChars,
  };

  const perRecord = [];
  for (const record of records) {
    const results = checkRecord(record, context);
    perRecord.push({
      file: record.file,
      spans: results.length,
      faithful: results.filter((r) => r.faithful).length,
      residual: results.filter((r) => !r.faithful),
    });
  }

  const totals = perRecord.reduce(
    (acc, entry) => {
      acc.records += 1;
      acc.spans += entry.spans;
      acc.faithful += entry.faithful;
      acc.residual += entry.residual.length;
      return acc;
    },
    { records: 0, spans: 0, faithful: 0, residual: 0 }
  );

  return { perRecord, totals };
}

// readDecisionRecords() hardcodes docs/decisions/records under root; support
// a custom --records directory for tests and for pointing at a scratch copy.
function readCustomRecordsDir(recordsDir) {
  if (!existsSync(recordsDir)) return [];
  return readdirSync(recordsDir)
    .filter((file) => /^DEC-.*\.md$/.test(file))
    .sort()
    .map((name) => {
      const file = join(recordsDir, name);
      return parseDecisionRecord(file, readFileSync(file, "utf8"));
    });
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function printHumanReport(report) {
  for (const entry of report.perRecord) {
    console.log(
      `${entry.file}: ${entry.spans} spans checked, ${entry.faithful} faithful, ${entry.residual.length} residual`
    );
    for (const residual of entry.residual) {
      const hint = residual.bestMatch
        ? `${residual.bestMatch.label} (prefix ${residual.bestMatch.prefixLength})`
        : "no partial match found";
      console.log(`  line ${residual.line}: "${residual.span}"`);
      console.log(`    best match: ${hint}`);
    }
  }
  console.log(
    `\nTotals: ${report.totals.records} records, ${report.totals.spans} spans, ` +
      `${report.totals.faithful} faithful, ${report.totals.residual} residual`
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function isMain() {
  if (!process.argv[1]) return false;
  const entry = process.argv[1].replace(/\\/g, "/");
  return import.meta.url === `file://${entry}` || import.meta.url === `file:///${entry}`;
}

if (isMain()) {
  const args = parseArgs(process.argv.slice(2));
  const report = runFidelityCheck(args);
  printHumanReport(report);
  if (args.json) {
    writeFileSync(resolve(args.json), JSON.stringify(report, null, 2));
  }
  process.exit(args.strict && report.totals.residual > 0 ? 1 : 0);
}
