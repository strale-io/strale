// Pure functions behind the T15 schema-migration ledger
// (apps/api/src/lib/startup-migrations.ledger.json). Spec:
// archive/sessions/2026-09-02-t15-receipts-and-migration-ledger-plan.md
//
// Block delimiter (read from the file, not assumed): every migration block
// is its own top-level `export async function runMigrationNNNN_name(...)`
// declaration — 54 of them, in file order, mixed with 34 leading comment
// banners (`// ─── Block N: ... ───`), two non-exported/differently-named
// helpers (hasImmutableTrigger, parseEpochFromCheck), the orchestrator
// (runStartupMigrations), and several top-level `const`/`interface` data
// declarations shared across blocks (e.g. PHASE_B2_FREE_QUOTA_HIGH_CONF).
// The function declaration is the one delimiter every block has; banners do
// not (20 of 54 blocks have none), so a block's *hashed* source text runs
// from its own `export async function` line through the line before the
// next top-level declaration of any kind (function, const, let, type,
// interface), backing up over blank lines, `//` line comments, and
// `/** ... */` block comments so a shared data const or the next block's
// banner never gets glued onto the current block. Verified mechanically:
// every one of the 54 computed blocks ends on a bare `}` line.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE_PATH = "apps/api/src/lib/startup-migrations.ts";
export const LEDGER_PATH = "apps/api/src/lib/startup-migrations.ledger.json";

const BLOCK_DECL_RE = /^export async function (runMigration\d+_\w+|runStartupMigrations)\(/;
// Any other top-level declaration — a boundary marker only; never itself
// ledgered. Column 0 (no leading whitespace) is what makes it top-level:
// everything inside a function body in this file is indented.
const OTHER_TOPLEVEL_RE = /^(export )?(async function|function|const|let|type|interface)\s+\S/;
const BANNER_RE = /^\/\/\s*(?:─+\s*)?Block\s+(\d+|[A-Za-z]+)\s*:\s*(.+?)\s*(?:─+\s*)?$/;

export function repoRootFrom(importMetaUrl) {
  return resolve(dirname(fileURLToPath(importMetaUrl)), "../../..");
}

export function isDirectInvocation(importMetaUrl) {
  if (!process.argv[1]) return false;
  const invoked = resolve(process.argv[1]).toLowerCase();
  const modulePath = fileURLToPath(importMetaUrl).toLowerCase();
  return invoked === modulePath;
}

function normalizeNewlines(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** True for a blank line, a `//` line comment, or any line inside/opening/closing a JSDoc-style block comment. */
function isSkippableForBoundary(line) {
  const t = line.trim();
  return t === "" || t.startsWith("//") || t.startsWith("/*") || t.startsWith("*");
}

export function readSourceLines(root) {
  return normalizeNewlines(readFileSync(resolve(root, SOURCE_PATH), "utf8")).split("\n");
}

/**
 * Every top-level declaration start (0-based line index) in file order:
 * migration blocks (kind "migration") and everything else that can serve
 * as a boundary marker (kind "other").
 */
export function findTopLevelStarts(lines) {
  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const declMatch = BLOCK_DECL_RE.exec(line);
    if (declMatch) {
      starts.push({ line: i, kind: "migration", functionName: declMatch[1] });
    } else if (OTHER_TOPLEVEL_RE.test(line)) {
      starts.push({ line: i, kind: "other" });
    }
  }
  return starts;
}

/** Walks backward from `nextStartLine` (0-based, exclusive) to the last real content line, inclusive. */
function realEndLine(lines, nextStartLine) {
  let end = nextStartLine - 1;
  while (end >= 0 && isSkippableForBoundary(lines[end])) end--;
  return end;
}

/**
 * Parses every migration block from source lines. Returns, in file order:
 * { functionName, startLine, endLine } (0-based, inclusive) for each of the
 * 54 `runMigrationNNNN_*` blocks. `runStartupMigrations` (the orchestrator)
 * is a boundary marker only and is not itself a block.
 */
export function parseBlockRanges(lines) {
  const starts = findTopLevelStarts(lines);
  const ranges = [];
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i];
    if (s.kind !== "migration" || s.functionName === "runStartupMigrations") continue;
    const nextLine = i + 1 < starts.length ? starts[i + 1].line : lines.length;
    const endLine = realEndLine(lines, nextLine);
    ranges.push({ functionName: s.functionName, startLine: s.line, endLine });
  }
  return ranges;
}

export function blockSourceText(lines, range) {
  return lines.slice(range.startLine, range.endLine + 1).join("\n");
}

export function hashBlockSource(sourceText) {
  return createHash("sha256").update(normalizeNewlines(sourceText), "utf8").digest("hex");
}

/**
 * Best-effort title: the nearest contiguous `//` banner comment
 * immediately preceding the block's start line, if it matches the
 * "Block <n>: <title>" convention; otherwise a humanized function name.
 * Purely descriptive — never part of the hash, never checked for drift.
 */
export function extractTitle(lines, range) {
  let i = range.startLine - 1;
  while (i >= 0 && lines[i].trim() === "") i--;
  // Walk up through a contiguous run of `//` lines (the banner block).
  let bannerEnd = i;
  while (i >= 0 && lines[i].trim().startsWith("//")) i--;
  const bannerLines = lines.slice(i + 1, bannerEnd + 1);
  for (const line of bannerLines) {
    const m = BANNER_RE.exec(line.trim());
    if (m) return m[2].replace(/─+$/, "").trim();
  }
  return humanizeFunctionName(range.functionName);
}

export function humanizeFunctionName(functionName) {
  const stripped = functionName.replace(/^runMigration\d*_?/, "");
  const words = stripped
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_]+/)
    .filter(Boolean);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ---------------------------------------------------------------------------
// columns_written extraction — literal ALTER TABLE ADD/DROP COLUMN,
// UPDATE ... SET (including `ON CONFLICT (...) DO UPDATE SET`, attributed
// to the paired INSERT INTO's table), and INSERT INTO (...) column lists,
// read out of every `sql\`...\`` / `sql.raw(\`...\`)` chunk in the block.
// Returns ["unknown"] — never a partial list — the moment any chunk's
// column identifier itself (not a value/argument) is interpolated
// (`${...}`), since a partially-literal read is worse than an honest gap.
// ---------------------------------------------------------------------------

const SQL_CHUNK_RE = /sql(?:\.raw)?\(?`([^`]*)`/g;

function stripSqlLineComments(sqlText) {
  return sqlText.replace(/--[^\n]*/g, "");
}

/** Removes parenthesized spans (function calls, subqueries), replacing them with spaces so depth-0 structure survives for regex matching. */
function stripParens(text) {
  let depth = 0;
  let out = "";
  for (const ch of text) {
    if (ch === "(") {
      depth++;
      continue;
    }
    if (ch === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    out += depth === 0 ? ch : " ";
  }
  return out;
}

export function extractColumnsWritten(blockSourceText) {
  const cols = new Set();
  let unknown = false;
  const reasons = [];
  let m;
  const chunkRe = new RegExp(SQL_CHUNK_RE);
  while ((m = chunkRe.exec(blockSourceText))) {
    const chunk = stripSqlLineComments(m[1]);

    // ALTER TABLE <table> ADD|DROP COLUMN <col> — possibly several ALTER
    // TABLE statements in one chunk; split on each occurrence.
    const alterSegments = chunk.split(/(?=ALTER\s+TABLE)/i).filter((seg) => /^\s*ALTER\s+TABLE/i.test(seg));
    for (const seg of alterSegments) {
      const tableMatch = /ALTER\s+TABLE\s+"?(\w+)"?/i.exec(seg);
      if (!tableMatch) continue;
      const table = tableMatch[1];
      const addRe = /ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+"?(\w+)"?/gi;
      const dropRe = /DROP\s+COLUMN(?:\s+IF\s+EXISTS)?\s+"?(\w+)"?/gi;
      let cm;
      while ((cm = addRe.exec(seg))) cols.add(`${table}.${cm[1]}`);
      while ((cm = dropRe.exec(seg))) cols.add(`${table}.${cm[1]}`);
      if (/ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+\$\{/i.test(seg) || /DROP\s+COLUMN(?:\s+IF\s+EXISTS)?\s+\$\{/i.test(seg)) {
        unknown = true;
        reasons.push(`ALTER TABLE ${table}: dynamic (interpolated) column name`);
      }
    }

    // UPDATE <table> SET <col> = ...  — including the `INSERT INTO x (...)
    // ... ON CONFLICT (...) DO UPDATE SET col = ...` upsert shape, where
    // "UPDATE" is immediately followed by "SET" (no table name of its
    // own) and the real target is the chunk's INSERT INTO table.
    const updateMatch = /\bUPDATE\s+"?(\w+)"?(?:\s+AS\s+\w+)?/i.exec(chunk);
    if (updateMatch && /\bSET\b/i.test(chunk)) {
      let table = updateMatch[1];
      if (/^SET$/i.test(table)) {
        const insertTableMatch = /INSERT\s+INTO\s+"?(\w+)"?/i.exec(chunk);
        table = insertTableMatch ? insertTableMatch[1] : null;
      }
      if (table) {
        const setIdx = chunk.search(/\bSET\b/i);
        const rest = chunk.slice(setIdx + 3);
        const stopMatch = /\b(FROM|WHERE)\b/i.exec(rest);
        const setClause = stopMatch ? rest.slice(0, stopMatch.index) : rest;
        const flatSetClause = stripParens(setClause);
        if (/(?:^|,)\s*\$\{/.test(flatSetClause)) {
          unknown = true;
          reasons.push(`UPDATE ${table}: dynamic (interpolated) column name in SET`);
        }
        const assignRe = /(?:^|,)\s*"?(\w+)"?\s*=/g;
        let am;
        while ((am = assignRe.exec(flatSetClause))) cols.add(`${table}.${am[1]}`);
      }
    }

    // INSERT INTO <table> (<col>, <col>, ...)
    const insertRe = /INSERT\s+INTO\s+"?(\w+)"?\s*\(([^)]*)\)/gi;
    let im;
    while ((im = insertRe.exec(chunk))) {
      const table = im[1];
      if (/\$\{/.test(im[2])) {
        unknown = true;
        reasons.push(`INSERT INTO ${table}: dynamic (interpolated) column in column list`);
        continue;
      }
      for (const col of im[2].split(",").map((c) => c.trim().replace(/^"|"$/g, "")).filter(Boolean)) {
        cols.add(`${table}.${col}`);
      }
    }
  }

  if (unknown) return { columns_written: ["unknown"], reasons };
  return { columns_written: [...cols].sort(), reasons: [] };
}

// ---------------------------------------------------------------------------
// git blame / date lookup — used only by the generator (--update), never by
// the checker's normal pass, so a normal `migrations:check` run in CI never
// shells out to git log -L.
// ---------------------------------------------------------------------------

/** The calendar date (%cs) of the oldest commit that touched `lineNumber` (1-based) of `path`. */
export function addedDateForLine(root, path, lineNumber) {
  const out = execFileSync(
    "git",
    ["log", `--format=%H,%cs`, "-L", `${lineNumber},${lineNumber}:${path}`],
    { cwd: root, encoding: "utf8" },
  );
  const commitLines = out.split("\n").filter((l) => /^[0-9a-f]{40},/.test(l));
  if (commitLines.length === 0) return null;
  return commitLines[commitLines.length - 1].split(",")[1]; // oldest = last in git log's newest-first order
}

// ---------------------------------------------------------------------------
// Ledger loading + the checks themselves
// ---------------------------------------------------------------------------

export function loadLedger(root) {
  const path = resolve(root, LEDGER_PATH);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Computes the current blocks straight from source (no ledger involved). */
export function computeCurrentBlocks(root) {
  const lines = readSourceLines(root);
  const ranges = parseBlockRanges(lines);
  return ranges.map((range) => {
    const sourceText = blockSourceText(lines, range);
    const { columns_written } = extractColumnsWritten(sourceText);
    return {
      functionName: range.functionName,
      title: extractTitle(lines, range),
      columns_written,
      sha256: hashBlockSource(sourceText),
      startLine: range.startLine, // 0-based; for git-blame date lookup only, never serialized into the ledger
    };
  });
}

/**
 * The full check: a block whose hash differs from its ledger row (edited
 * without a new block id), a block with no ledger row, a ledger row whose
 * block no longer exists in the file, and two blocks whose columns_written
 * overlap on the same column unless that column is in known_overlaps.
 * "unknown" never participates in overlap detection (it names no column).
 */
export function checkLedger(root) {
  const findings = [];
  const ledger = loadLedger(root);
  if (!ledger) {
    return { findings: [{ code: "LEDGER_MISSING", detail: `${LEDGER_PATH} does not exist — run migrations:check -- --update` }], current: [] };
  }

  const current = computeCurrentBlocks(root);
  const currentByFn = new Map(current.map((b) => [b.functionName, b]));
  const ledgerByFn = new Map((ledger.blocks ?? []).map((b) => [b.function, b]));

  for (const row of ledger.blocks ?? []) {
    const cur = currentByFn.get(row.function);
    if (!cur) {
      findings.push({
        code: "LEDGER_BLOCK_GONE",
        block: row.id,
        detail: `${row.function} is ledgered as ${row.id} but no longer exists in ${SOURCE_PATH}`,
      });
      continue;
    }
    if (cur.sha256 !== row.sha256) {
      findings.push({
        code: "BLOCK_HASH_MISMATCH",
        block: row.id,
        detail: `${row.function} (${row.id}) has changed since it was ledgered — migration blocks are append-only: add a NEW block for the edit, do not modify this one in place. Run migrations:check -- --update to see the new block once added.`,
      });
    }
  }

  for (const cur of current) {
    if (!ledgerByFn.has(cur.functionName)) {
      findings.push({
        code: "UNLEDGERED_BLOCK",
        block: cur.functionName,
        detail: `${cur.functionName} has no ledger row — run migrations:check -- --update to add it`,
      });
    }
  }

  // Column-overlap detection: skip "unknown", skip already-allowlisted columns.
  const allowlisted = new Set((ledger.known_overlaps ?? []).map((o) => o.column));
  const writers = new Map(); // column -> [block ids]
  for (const row of ledger.blocks ?? []) {
    if (row.columns_written.length === 1 && row.columns_written[0] === "unknown") continue;
    for (const col of row.columns_written) {
      if (!writers.has(col)) writers.set(col, []);
      writers.get(col).push(row.id);
    }
  }
  for (const [col, blockIds] of writers) {
    if (blockIds.length > 1 && !allowlisted.has(col)) {
      findings.push({
        code: "DUPLICATE_COLUMN_WRITER",
        block: blockIds.join(", "),
        detail: `${col} is written by ${blockIds.length} blocks (${blockIds.join(", ")}) and is not in known_overlaps — this is the 2026-08-21 incident class (two blocks deriving one column can fight every boot). Verify they don't conflict (disjoint WHERE, or a later block superseding an earlier one) and add a known_overlaps entry, or fix the collision.`,
      });
    }
  }

  return { findings, current };
}
