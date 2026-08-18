/**
 * Derives the schema artifacts (columns, tables, indexes) that
 * `startup-migrations.ts`'s blocks are supposed to have created — directly
 * from the SQL text of those blocks, never from a hand-maintained list.
 *
 * ## Why derived, not curated
 *
 * `schema-validator.ts` used to carry a `REQUIRED_COLUMNS` array that
 * authors were supposed to append to by hand every time a migration block
 * added a column. It rotted exactly the way CLAUDE.md's "derived beats
 * curated" rule predicts: its last entry covers migration 0050, while
 * `startup-migrations.ts` has since shipped blocks up to 0093 — 43 blocks,
 * and every column/table/index they added, with zero startup verification
 * that any of it actually landed in the database. That gap is precisely
 * the PR-42 class bug (DEC-20260504-C): code that assumes a migration ran
 * because the deploy looked clean, not because anyone checked.
 *
 * This module closes the gap by parsing the SQL literally embedded in
 * `startup-migrations.ts`'s block functions — the same statements that
 * already run at boot — and turning every:
 *
 *   - `ALTER TABLE <table> ADD COLUMN [IF NOT EXISTS] <column>`
 *   - `CREATE TABLE IF NOT EXISTS <table>`
 *   - `CREATE INDEX IF NOT EXISTS <index> ON <table>`
 *
 * into an artifact that the running database is asserted to contain. A new
 * migration block needs no parallel registration anywhere — the SQL it
 * already has to write is the only source of truth.
 *
 * ## Deliberately not derived
 *
 * `ADD CONSTRAINT` (CHECK constraints) is not parsed. Every occurrence in
 * this file uses a dynamic `sql.raw` template (see block 0067's
 * `ensureConstraint` helper) rather than a static string, so there's no
 * fixed literal to extract — and a missing CHECK constraint doesn't 500 a
 * customer request the way a missing column or table does. If that
 * changes, extend the parser rather than hand-listing constraint names.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sql } from "drizzle-orm";
import type { MigrationExecutor } from "./startup-migrations.js";

export type MigrationArtifact =
  | { kind: "column"; table: string; column: string; block: string }
  | { kind: "table"; table: string; block: string }
  | { kind: "index"; index: string; table: string | null; block: string };

export function artifactKey(a: MigrationArtifact): string {
  if (a.kind === "column") return `column:${a.table}.${a.column}`;
  if (a.kind === "table") return `table:${a.table}`;
  return `index:${a.index}`;
}

export function artifactLabel(a: MigrationArtifact): string {
  if (a.kind === "column") return `${a.table}.${a.column}`;
  if (a.kind === "table") return `table ${a.table}`;
  return `index ${a.index}${a.table ? ` on ${a.table}` : ""}`;
}

/**
 * Strip `//` line comments and `/* *​/` block comments before parsing.
 * Several migration blocks' doc comments discuss "ALTER TABLE" and
 * "ADD COLUMN" in prose (e.g. block 0093's TOCTOU writeup); stripping
 * comments first means the parser only ever sees real SQL, not a comment
 * that happens to mention the same words.
 */
function stripComments(source: string): string {
  // Line comments MUST be stripped first. A `//` comment line can itself
  // contain a literal `/*`-looking substring (this file has one: a prose
  // comment about `manifests/*.yaml`) — stripping block comments first
  // would read that as an unterminated block-comment open and swallow
  // everything up to the next real `*/`, taking a whole migration block's
  // DDL with it. Caught by the artifact-count regression test below,
  // which pinned the real file's expected count before this fix existed.
  const withoutLineComments = source
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  return withoutLineComments.replace(/\/\*[\s\S]*?\*\//g, "");
}

const BLOCK_BOUNDARY_RE = /export async function (runMigration(\d{4})_\w+)\s*\(/g;
const TABLE_RE = /CREATE TABLE IF NOT EXISTS\s+"?(\w+)"?/gi;
const INDEX_RE = /CREATE INDEX IF NOT EXISTS\s+"?(\w+)"?\s+ON\s+"?(\w+)"?/gi;

// Columns are parsed in two stages, NOT with a single
// `ALTER TABLE x ADD COLUMN y` regex. Postgres lets one statement add
// several columns (`ALTER TABLE t ADD COLUMN a int, ADD COLUMN b int`),
// and a single-match regex silently returns only the first — no error, no
// log, just a column quietly dropped from what boot verifies. That is a
// worse failure than the hand-maintained list this replaced: a stale list
// is visibly stale, a regex miss is invisible. No block writes multi-column
// ALTERs today; nothing stops the next one from doing so.
const ALTER_TABLE_RE = /ALTER TABLE\s+"?(\w+)"?/gi;
const ADD_COLUMN_RE = /ADD COLUMN(?:\s+IF NOT EXISTS)?\s+"?(\w+)"?/gi;

// Artifacts a later block removes must be subtracted, or the check demands
// a column that is correctly gone and boot fails forever. This gate aborts
// startup, so an over-derivation is not a false alarm — it is a prod
// crash-loop on every deploy. Under-deriving is merely a smaller safety
// net; over-deriving is an outage.
const DROP_COLUMN_RE = /ALTER TABLE\s+"?(\w+)"?\s+DROP COLUMN(?:\s+IF EXISTS)?\s+"?(\w+)"?/gi;
const DROP_TABLE_RE = /DROP TABLE(?:\s+IF EXISTS)?\s+"?(\w+)"?/gi;
const DROP_INDEX_RE = /DROP INDEX(?:\s+CONCURRENTLY)?(?:\s+IF EXISTS)?\s+"?(\w+)"?/gi;
const RENAME_COLUMN_RE = /ALTER TABLE\s+"?(\w+)"?\s+RENAME COLUMN\s+"?(\w+)"?/gi;
const RENAME_TABLE_RE = /ALTER TABLE\s+"?(\w+)"?\s+RENAME TO\s+"?(\w+)"?/gi;

/**
 * Split the (comment-stripped) source into per-block segments so each
 * derived artifact can be attributed to the migration block that creates
 * it — purely for diagnosability in the failure log; the derivation itself
 * doesn't need it.
 */
function segmentByBlock(cleaned: string): Array<{ block: string; start: number; end: number }> {
  const boundaries: Array<{ block: string; index: number }> = [];
  for (const m of cleaned.matchAll(BLOCK_BOUNDARY_RE)) {
    boundaries.push({ block: m[1], index: m.index ?? 0 });
  }
  const segments: Array<{ block: string; start: number; end: number }> = [];
  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i].index;
    const end = i + 1 < boundaries.length ? boundaries[i + 1].index : cleaned.length;
    segments.push({ block: boundaries[i].block, start, end });
  }
  return segments;
}

function blockAt(segments: Array<{ block: string; start: number; end: number }>, index: number): string {
  const seg = segments.find((s) => index >= s.start && index < s.end);
  return seg?.block ?? "unattributed";
}

/**
 * Pure function: given the raw source text of `startup-migrations.ts`
 * (or its compiled `.js` — template-literal SQL survives `tsc` unchanged),
 * derive every schema artifact its blocks create.
 */
export function deriveExpectedArtifacts(sourceText: string): MigrationArtifact[] {
  const cleaned = stripComments(sourceText);
  const segments = segmentByBlock(cleaned);
  const seen = new Set<string>();
  const artifacts: MigrationArtifact[] = [];

  const push = (a: MigrationArtifact) => {
    const key = artifactKey(a);
    if (seen.has(key)) return;
    seen.add(key);
    artifacts.push(a);
  };

  // Stage 1: find each ALTER TABLE, then scan only as far as that
  // statement's end (a backtick closes the sql`` template; a semicolon
  // separates statements inside one) for every ADD COLUMN it contains.
  // Bounding the scan is what keeps a multi-column parse from bleeding
  // into the next statement and inventing columns on the wrong table.
  for (const m of cleaned.matchAll(ALTER_TABLE_RE)) {
    const table = m[1];
    const after = cleaned.slice((m.index ?? 0) + m[0].length);
    const end = after.search(/[`;]/);
    const statement = end === -1 ? after : after.slice(0, end);
    for (const c of statement.matchAll(ADD_COLUMN_RE)) {
      push({ kind: "column", table, column: c[1], block: blockAt(segments, m.index ?? 0) });
    }
  }
  for (const m of cleaned.matchAll(TABLE_RE)) {
    push({ kind: "table", table: m[1], block: blockAt(segments, m.index ?? 0) });
  }
  for (const m of cleaned.matchAll(INDEX_RE)) {
    push({ kind: "index", index: m[1], table: m[2] ?? null, block: blockAt(segments, m.index ?? 0) });
  }

  // Stage 2: subtract anything a later block drops or renames away.
  const removed = new Set<string>();
  for (const m of cleaned.matchAll(DROP_COLUMN_RE)) removed.add(`column:${m[1]}.${m[2]}`);
  for (const m of cleaned.matchAll(RENAME_COLUMN_RE)) removed.add(`column:${m[1]}.${m[2]}`);
  for (const m of cleaned.matchAll(DROP_TABLE_RE)) removed.add(`table:${m[1]}`);
  for (const m of cleaned.matchAll(RENAME_TABLE_RE)) removed.add(`table:${m[1]}`);
  for (const m of cleaned.matchAll(DROP_INDEX_RE)) removed.add(`index:${m[1]}`);

  return removed.size === 0 ? artifacts : artifacts.filter((a) => !removed.has(artifactKey(a)));
}

/**
 * Reads `startup-migrations.{ts,js}` from disk — always the sibling of
 * this module, whatever extension is currently running (`.ts` under tsx
 * in dev/test, `.js` under the compiled `dist/` output in prod). Never
 * imported as code, only read as text: the SQL inside the `sql\`...\``
 * template literals is identical before and after `tsc` strips types, so
 * parsing either file's text produces the same artifact list.
 */
export function readMigrationsSourceText(): string {
  const selfPath = fileURLToPath(import.meta.url);
  const ext = selfPath.slice(selfPath.lastIndexOf("."));
  const migrationsPath = join(dirname(selfPath), `startup-migrations${ext}`);
  return readFileSync(migrationsPath, "utf-8");
}

function normalizeRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] })?.rows ?? []) as T[];
}

async function fetchExistingColumns(db: MigrationExecutor): Promise<Set<string>> {
  const res = await db.execute(sql`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'
  `);
  const rows = normalizeRows<{ table_name: string; column_name: string }>(res);
  return new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
}

async function fetchExistingTables(db: MigrationExecutor): Promise<Set<string>> {
  const res = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  const rows = normalizeRows<{ table_name: string }>(res);
  return new Set(rows.map((r) => r.table_name));
}

async function fetchExistingIndexes(db: MigrationExecutor): Promise<Set<string>> {
  const res = await db.execute(sql`
    SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
  `);
  const rows = normalizeRows<{ indexname: string }>(res);
  return new Set(rows.map((r) => r.indexname));
}

export interface MigrationArtifactAuditResult {
  artifacts: MigrationArtifact[];
  missing: MigrationArtifact[];
}

/**
 * Derive the expected artifact set (from source text, default: this
 * module's own `startup-migrations` sibling) and diff it against what
 * actually exists in the database right now. Three batched introspection
 * queries regardless of how many artifacts there are — cheap enough to run
 * on every boot.
 */
export async function auditMigrationArtifacts(
  db: MigrationExecutor,
  sourceText: string = readMigrationsSourceText(),
): Promise<MigrationArtifactAuditResult> {
  const artifacts = deriveExpectedArtifacts(sourceText);

  // A parser that finds nothing reports "all clear" — the exact hollow-gate
  // shape this program found three times in a week (a shape check that
  // 404'd on every run, a lint that matched no real imports, a test_mode
  // that dispatched identically to the mode it was meant to differ from).
  // If the source has migration blocks in it but yielded zero artifacts,
  // the parse broke — reformatting, a bundler inlining the file, a renamed
  // export convention. Refuse to certify the schema rather than wave it
  // through. Callers with no blocks at all (unit tests on snippets) are
  // unaffected because the condition requires blocks to be present.
  if (artifacts.length === 0 && segmentByBlock(stripComments(sourceText)).length > 0) {
    throw new Error(
      "Migration artifact derivation collapsed: startup-migrations source contains migration blocks " +
        "but no columns/tables/indexes could be parsed from it. The parser is broken, not the schema — " +
        "treat this as a failed verification, not a clean one.",
    );
  }

  const [columns, tables, indexes] = await Promise.all([
    fetchExistingColumns(db),
    fetchExistingTables(db),
    fetchExistingIndexes(db),
  ]);

  const missing = artifacts.filter((a) => {
    if (a.kind === "column") return !columns.has(`${a.table}.${a.column}`);
    if (a.kind === "table") return !tables.has(a.table);
    return !indexes.has(a.index);
  });

  return { artifacts, missing };
}
