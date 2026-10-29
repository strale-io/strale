// Pure functions behind the T15 schema-migration ledger
// (apps/api/src/lib/startup-migrations.ledger.json). Spec:
// archive/sessions/2026-09-02-t15-receipts-and-migration-ledger-plan.md
//
// Layout (H7, 2026-10-28): each block lives in its own file under
// BLOCKS_DIR; SOURCE_PATH keeps the run order (BLOCKS) and the runner. The
// split moved every block's text byte for byte, so each ledger hash is
// unchanged. The checker reads SOURCE_PATH and every file in BLOCKS_DIR, and
// the delimiter rule below applies inside each file.
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
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE_PATH = "apps/api/src/lib/startup-migrations.ts";
export const LEDGER_PATH = "apps/api/src/lib/startup-migrations.ledger.json";
export const BLOCKS_DIR = "apps/api/src/startup-migrations/blocks";

/**
 * Declared data files moved after their block was ledgered. The block text,
 * and so its hash, keeps the path it was ledgered with; the content is read
 * from the new path. Only a move: the content must be unchanged, or the hash
 * differs. Append-only, like the ledger.
 */
export const MIGRATION_DATA_RELOCATIONS = Object.freeze({
  "apps/api/src/lib/catalogue-copy-0123.ts": "apps/api/src/startup-migrations/data/catalogue-copy-0123.ts",
  "apps/api/src/lib/public-descriptions-0124.ts": "apps/api/src/startup-migrations/data/public-descriptions-0124.ts",
});

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

export function readSourceLines(root, path = SOURCE_PATH) {
  return normalizeNewlines(readFileSync(resolve(root, path), "utf8")).split("\n");
}

/** SOURCE_PATH, then every `.ts` file in BLOCKS_DIR (tests excluded), sorted by name. */
export function sourceFiles(root) {
  const dir = resolve(root, BLOCKS_DIR);
  const blockFiles = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).sort().map((f) => `${BLOCKS_DIR}/${f}`)
    : [];
  return [SOURCE_PATH, ...blockFiles];
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

// ---------------------------------------------------------------------------
// Migration data files. A block whose rows live in a separate module declares
// it inside its own body with a line comment:
//
//   // migration-data: apps/api/src/lib/catalogue-copy-0123.ts
//
// (path relative to the repo root). The block's hash then covers the block
// text AND each declared file's content, so editing the data fails
// BLOCK_HASH_MISMATCH exactly as editing the block would. The declaration is
// itself inside the hashed block text, so removing it is also a hash change.
// A block with no declaration hashes exactly as before (hashBlockSource of
// its text alone), so every existing ledger row is unaffected.
// ---------------------------------------------------------------------------

const MIGRATION_DATA_RE = /^\s*\/\/\s*migration-data:\s*(\S+)\s*$/gm;

/** Repo-relative paths a block declares with `// migration-data: <path>`, in order. */
export function declaredDataFiles(sourceText) {
  return [...normalizeNewlines(sourceText).matchAll(MIGRATION_DATA_RE)].map((m) => m[1]);
}

/**
 * The block's ledger hash: its source text alone when it declares no data
 * file, otherwise its text followed by each declared file's path and content.
 * Returns the missing paths too, so the checker can report them.
 */
export function hashBlockWithData(root, sourceText) {
  const files = declaredDataFiles(sourceText);
  if (files.length === 0) return { sha256: hashBlockSource(sourceText), dataFiles: [], missing: [] };
  let text = normalizeNewlines(sourceText);
  const missing = [];
  for (const file of files) {
    const abs = resolve(root, MIGRATION_DATA_RELOCATIONS[file] ?? file);
    if (!existsSync(abs)) {
      missing.push(file);
      text += `\n// migration-data ${file}\n<missing>`;
      continue;
    }
    text += `\n// migration-data ${file}\n${normalizeNewlines(readFileSync(abs, "utf8"))}`;
  }
  return { sha256: hashBlockSource(text), dataFiles: files, missing };
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
  const committed = execFileSync("git", ["show", `HEAD:${path}`], { cwd: root, encoding: "utf8" });
  if (lineNumber > committed.split("\n").length) return null;
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

/**
 * The identifiers listed in SOURCE_PATH's `BLOCKS` array, in run order, or
 * null when the file has no `BLOCKS` array this parser can read.
 */
export function registeredBlocks(root) {
  const text = readSourceLines(root).join("\n");
  const m = /^export const BLOCKS\b.*=\s*\[$([\s\S]*?)^\];/m.exec(text);
  if (!m) return null;
  return [...m[1].replace(/\/\/[^\n]*/g, "").matchAll(/[A-Za-z_$][\w$]*/g)].map((x) => x[0]);
}

const BLOCK_FILE_RE = /^\d{4}-[a-z0-9-]+\.ts$/;

/** Entries of BLOCKS_DIR that are not a `NNNN-name.ts` block file (subfolders included), so the scan would not read them. */
export function unexpectedBlockDirEntries(root) {
  const dir = resolve(root, BLOCKS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => !e.isFile() || !BLOCK_FILE_RE.test(e.name))
    .map((e) => `${BLOCKS_DIR}/${e.name}${e.isFile() ? "" : "/"}`);
}

/** Relative import specifiers in a source file, resolved to repo-relative `.ts` paths. */
function resolvedImports(root, file) {
  const text = readFileSync(resolve(root, file), "utf8");
  const base = dirname(resolve(root, file));
  return [...text.matchAll(/from\s+"(\.{1,2}\/[^"]+)"/g)]
    .map((m) => relative(root, resolve(base, m[1])).split(sep).join("/").replace(/\.js$/, ".ts"));
}

/** Computes the current blocks straight from source (no ledger involved). */
export function computeCurrentBlocks(root) {
  return sourceFiles(root).flatMap((file) => computeFileBlocks(root, file));
}

function computeFileBlocks(root, file) {
  const lines = readSourceLines(root, file);
  const ranges = parseBlockRanges(lines);
  return ranges.map((range) => {
    const sourceText = blockSourceText(lines, range);
    const { columns_written } = extractColumnsWritten(sourceText);
    const { sha256, dataFiles, missing } = hashBlockWithData(root, sourceText);
    return {
      functionName: range.functionName,
      title: extractTitle(lines, range),
      columns_written,
      sha256,
      dataFiles, // declared `// migration-data:` files; covered by sha256
      missingDataFiles: missing,
      file,
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
  if (current.length === 0 || (ledger.blocks ?? []).length === 0) {
    findings.push({ code: "EMPTY_INPUT", detail: "Migration source and ledger must each contain at least one block" });
  }
  const currentByFn = new Map(current.map((b) => [b.functionName, b]));
  for (const fn of new Set(current.map((b) => b.functionName).filter((fn, i, all) => all.indexOf(fn) !== i))) {
    findings.push({ code: "DUPLICATE_BLOCK_FUNCTION", block: fn, detail: `${fn} is declared in more than one file` });
  }
  // A block the runner registers but the checker never read would run
  // unledgered: everything in BLOCKS must be a block the scan found.
  const registered = registeredBlocks(root);
  if (registered === null && current.some((b) => b.file !== SOURCE_PATH)) {
    findings.push({ code: "BLOCKS_REGISTRY_UNREADABLE", block: SOURCE_PATH,
      detail: `${SOURCE_PATH} has no \`export const BLOCKS ... = [\` array this checker can read, so it cannot prove every registered block is ledgered` });
  }
  for (const entry of unexpectedBlockDirEntries(root)) {
    findings.push({ code: "BLOCKS_DIR_UNEXPECTED_ENTRY", block: entry,
      detail: `${entry} is not a NNNN-name.ts file directly in ${BLOCKS_DIR}; the ledger scan and schema validation would not read it` });
  }
  for (const b of current) {
    for (const data of b.dataFiles ?? []) {
      const target = MIGRATION_DATA_RELOCATIONS[data];
      if (target && !resolvedImports(root, b.file).includes(target)) {
        findings.push({ code: "RELOCATED_DATA_NOT_IMPORTED", block: b.functionName,
          detail: `${b.functionName} declares ${data}, relocated to ${target}, but ${b.file} does not import ${target}; the hashed data would not be the data that runs` });
      }
    }
  }
  for (const fn of registered ?? []) {
    if (!currentByFn.has(fn)) {
      findings.push({
        code: "REGISTERED_BLOCK_NOT_SCANNED",
        block: fn,
        detail: `${fn} is registered in BLOCKS (${SOURCE_PATH}) but is not declared in ${SOURCE_PATH} or a file in ${BLOCKS_DIR}, so it is not ledgered`,
      });
    }
  }
  const ledgerByFn = new Map((ledger.blocks ?? []).map((b) => [b.function, b]));

  for (const row of ledger.blocks ?? []) {
    const cur = currentByFn.get(row.function);
    if (!cur) {
      findings.push({
        code: "LEDGER_BLOCK_GONE",
        block: row.id,
        detail: `${row.function} is ledgered as ${row.id} but no longer exists in ${SOURCE_PATH} or ${BLOCKS_DIR}`,
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
    for (const file of cur.missingDataFiles ?? []) {
      findings.push({
        code: "MIGRATION_DATA_MISSING",
        block: ledgerByFn.get(cur.functionName)?.id ?? cur.functionName,
        detail: `${cur.functionName} declares \`// migration-data: ${file}\` but that file does not exist — the block's data cannot be hashed (or imported)`,
      });
    }
    if (!ledgerByFn.has(cur.functionName)) {
      findings.push({
        code: "UNLEDGERED_BLOCK",
        block: cur.functionName,
        detail: `${cur.functionName} has no ledger row — run migrations:check -- --update to add it`,
      });
    }
  }

  // Column-overlap detection: skip "unknown", skip writes named in that
  // column's own known_overlaps entry. A `known_overlaps` entry allowlists
  // only the specific blocks named in its `blocks` array — a column is never
  // exempt wholesale just because it has an entry at all. A block writing an
  // overlapping column that the entry does not name is its own finding, even
  // when other writers of the same column are documented.
  const allowlistedBlocksByColumn = new Map(
    (ledger.known_overlaps ?? []).map((o) => [o.column, new Set(o.blocks ?? [])]),
  );
  const writers = new Map(); // column -> [block ids]
  for (const row of ledger.blocks ?? []) {
    if (row.columns_written.length === 1 && row.columns_written[0] === "unknown") continue;
    for (const col of row.columns_written) {
      if (!writers.has(col)) writers.set(col, []);
      writers.get(col).push(row.id);
    }
  }
  for (const [col, blockIds] of writers) {
    if (blockIds.length <= 1) continue;
    const allowedBlocks = allowlistedBlocksByColumn.get(col);
    for (const id of blockIds) {
      if (allowedBlocks && allowedBlocks.has(id)) continue;
      const entryHint = allowedBlocks
        ? `known_overlaps["${col}"].blocks (currently: ${[...allowedBlocks].join(", ") || "none"})`
        : `a new known_overlaps entry for column "${col}"`;
      findings.push({
        code: "DUPLICATE_COLUMN_WRITER",
        block: id,
        detail: `${col} is written by ${blockIds.length} blocks (${blockIds.join(", ")}); ${id} is not named in ${entryHint} — this is the 2026-08-21 incident class (two blocks deriving one column can fight every boot). Verify ${id}'s write is disjoint from the other writers of ${col} and add ${id} to ${entryHint} with a note explaining why, or fix the collision.`,
      });
    }
  }

  return { findings, current };
}
