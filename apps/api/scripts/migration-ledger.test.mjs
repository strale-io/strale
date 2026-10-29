// Tests for the T15 schema-migration ledger (migration-ledger-lib.mjs,
// check-migration-ledger.mjs). Every failure mode is planted in its own
// throwaway repo fixture (mirroring apps/api/src/lib/) and must fail there;
// the fixed counterpart must pass. Per docs/company/LESSONS.md F5's
// standing rule (no checker ships until it has failed on a planted case).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  addedDateForLine,
  repoRootFrom,
  checkLedger,
  declaredDataFiles,
  extractColumnsWritten,
  extractTitle,
  hashBlockSource,
  hashBlockWithData,
  humanizeFunctionName,
  parseBlockRanges,
  SOURCE_PATH,
  LEDGER_PATH,
  BLOCKS_DIR,
  MIGRATION_DATA_RELOCATIONS,
} from "./migration-ledger-lib.mjs";

function withFixture(sourceText, ledger, fn) {
  const root = mkdtempSync(join(tmpdir(), "strale-ledger-fixture-"));
  try {
    const sourceAbs = join(root, SOURCE_PATH);
    mkdirSync(dirname(sourceAbs), { recursive: true });
    writeFileSync(sourceAbs, sourceText, "utf8");
    if (ledger !== null) {
      writeFileSync(join(root, LEDGER_PATH), JSON.stringify(ledger, null, 2), "utf8");
    }
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function codes(root) {
  return checkLedger(root).findings.map((f) => f.code);
}

// A tiny two-block source file, mirroring the real file's shape closely
// enough to exercise the boundary logic: a banner comment, a shared
// top-level const between the blocks, and a trailing helper function.
const TWO_BLOCK_SOURCE = `/**
 * Fixture startup migrations file.
 */
export interface MigrationExecutor {
  execute(query: unknown): Promise<unknown>;
}

// ─── Block 1: widget_flag on widgets ────────────────────────────────────────
//
// Adds a boolean flag.

export async function runMigration0001_widgetFlag(
  tx: MigrationExecutor,
): Promise<unknown> {
  await tx.execute(sql\`
    ALTER TABLE "widgets" ADD COLUMN IF NOT EXISTS "flagged" boolean DEFAULT false
  \`);
  return { block: "0001_widget_flag" };
}

const SHARED_CONST = "not part of either block";

export async function runMigration0002_widgetName(
  tx: MigrationExecutor,
): Promise<unknown> {
  await tx.execute(sql\`
    UPDATE widgets SET name = 'default' WHERE name IS NULL
  \`);
  return { block: "0002_widget_name" };
}

async function helper(tx: MigrationExecutor): Promise<boolean> {
  return true;
}
`;

function computeLedgerFor(sourceText) {
  // Build a ledger the way --update would, without touching git (tests pass
  // fixed hashes/dates so they don't depend on git history existing).
  const lines = sourceText.replace(/\r\n/g, "\n").split("\n");
  const ranges = parseBlockRanges(lines);
  return {
    source: SOURCE_PATH,
    blocks: ranges.map((range, i) => {
      const src = lines.slice(range.startLine, range.endLine + 1).join("\n");
      const { columns_written } = extractColumnsWritten(src);
      return {
        id: `M${String(i + 1).padStart(3, "0")}`,
        function: range.functionName,
        title: extractTitle(lines, range),
        added: "2026-01-01",
        columns_written,
        sha256: hashBlockSource(src),
      };
    }),
    known_overlaps: [],
  };
}

// ---------------------------------------------------------------------------
// Block-boundary parsing
// ---------------------------------------------------------------------------

test("parseBlockRanges finds exactly the migration blocks, excluding the shared const and the trailing helper", () => {
  const lines = TWO_BLOCK_SOURCE.split("\n");
  const ranges = parseBlockRanges(lines);
  assert.deepEqual(
    ranges.map((r) => r.functionName),
    ["runMigration0001_widgetFlag", "runMigration0002_widgetName"],
  );
  // Every block's last line is a bare closing brace — the mechanical sanity
  // check used to validate this same logic against the real 54-block file.
  for (const r of ranges) {
    assert.equal(lines[r.endLine].trim(), "}");
  }
});

test("a shared top-level const between two blocks is excluded from both blocks' hashed text", () => {
  const lines = TWO_BLOCK_SOURCE.split("\n");
  const ranges = parseBlockRanges(lines);
  const block1Text = lines.slice(ranges[0].startLine, ranges[0].endLine + 1).join("\n");
  const block2Text = lines.slice(ranges[1].startLine, ranges[1].endLine + 1).join("\n");
  assert.ok(!block1Text.includes("SHARED_CONST"));
  assert.ok(!block2Text.includes("SHARED_CONST"));
});

test("extractTitle reads the banner comment when present, humanizes the function name otherwise", () => {
  const lines = TWO_BLOCK_SOURCE.split("\n");
  const ranges = parseBlockRanges(lines);
  assert.equal(extractTitle(lines, ranges[0]), "widget_flag on widgets");
  assert.equal(extractTitle(lines, ranges[1]), humanizeFunctionName("runMigration0002_widgetName"));
  assert.equal(humanizeFunctionName("runMigration0002_widgetName"), "Widget Name");
});

// ---------------------------------------------------------------------------
// extractColumnsWritten
// ---------------------------------------------------------------------------

test("extractColumnsWritten reads a literal ALTER TABLE ADD COLUMN", () => {
  const src = "await tx.execute(sql`ALTER TABLE \"widgets\" ADD COLUMN IF NOT EXISTS \"flagged\" boolean`);";
  assert.deepEqual(extractColumnsWritten(src).columns_written, ["widgets.flagged"]);
});

test("extractColumnsWritten reads a literal UPDATE ... SET with multiple columns", () => {
  const src = "await tx.execute(sql`UPDATE widgets SET name = 'x', updated_at = now() WHERE id = 1`);";
  assert.deepEqual(extractColumnsWritten(src).columns_written, ["widgets.name", "widgets.updated_at"]);
});

test("extractColumnsWritten reads a literal INSERT INTO column list", () => {
  const src = "await tx.execute(sql`INSERT INTO widgets (name, flagged) VALUES ('x', true)`);";
  assert.deepEqual(extractColumnsWritten(src).columns_written, ["widgets.flagged", "widgets.name"]);
});

test("extractColumnsWritten attributes an `ON CONFLICT ... DO UPDATE SET` upsert to the INSERT's table, not literally 'SET'", () => {
  const src =
    "await tx.execute(sql`INSERT INTO widgets (id, name) VALUES (1, 'x') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, touched_at = now()`);";
  const { columns_written } = extractColumnsWritten(src);
  assert.ok(columns_written.includes("widgets.name"));
  assert.ok(columns_written.includes("widgets.touched_at"));
  assert.ok(!columns_written.some((c) => c.startsWith("SET.")));
});

test("extractColumnsWritten does not flag a value-position interpolation (function-call argument) as dynamic", () => {
  const src =
    "await tx.execute(sql`UPDATE widgets SET payload = jsonb_set(payload, '{a}', ${JSON.stringify(x)}::jsonb) WHERE id = 1`);";
  const { columns_written } = extractColumnsWritten(src);
  assert.deepEqual(columns_written, ["widgets.payload"]);
});

test("extractColumnsWritten returns ['unknown'] when the column name itself is interpolated, correcting it recovers the real column", () => {
  const dynamic = "await tx.execute(sql`ALTER TABLE widgets ADD COLUMN ${dynamicName} text`);";
  assert.deepEqual(extractColumnsWritten(dynamic).columns_written, ["unknown"]);

  const literal = "await tx.execute(sql`ALTER TABLE widgets ADD COLUMN real_name text`);";
  assert.deepEqual(extractColumnsWritten(literal).columns_written, ["widgets.real_name"]);
});

test("extractColumnsWritten returns [] for DDL with no ADD/DROP COLUMN, UPDATE, or INSERT (e.g. CREATE INDEX, ADD CONSTRAINT)", () => {
  const src =
    "await tx.execute(sql`CREATE INDEX IF NOT EXISTS widgets_name_idx ON widgets (name)`); await tx.execute(sql`ALTER TABLE widgets ADD CONSTRAINT widgets_chk CHECK (id > 0)`);";
  assert.deepEqual(extractColumnsWritten(src).columns_written, []);
});

// ---------------------------------------------------------------------------
// checkLedger — the planted failure modes
// ---------------------------------------------------------------------------

test("clean pass: a ledger matching the source has zero findings", () => {
  const ledger = computeLedgerFor(TWO_BLOCK_SOURCE);
  withFixture(TWO_BLOCK_SOURCE, ledger, (root) => {
    assert.deepEqual(codes(root), []);
  });
});

test("no ledger file at all fails with LEDGER_MISSING", () => {
  withFixture(TWO_BLOCK_SOURCE, null, (root) => {
    assert.deepEqual(codes(root), ["LEDGER_MISSING"]);
  });
});

test("editing a ledgered block's body in place fails BLOCK_HASH_MISMATCH; ledgering the new hash passes", () => {
  const ledger = computeLedgerFor(TWO_BLOCK_SOURCE);
  const edited = TWO_BLOCK_SOURCE.replace("DEFAULT false", "DEFAULT true"); // edits block 1's body only
  withFixture(edited, ledger, (root) => {
    assert.ok(codes(root).includes("BLOCK_HASH_MISMATCH"));
  });
  // Re-ledgering (as --update would after a human decides this is a
  // legitimate new block, e.g. renumbering the function) passes again.
  const relegered = computeLedgerFor(edited);
  withFixture(edited, relegered, (root) => {
    assert.deepEqual(codes(root), []);
  });
});

test("a block in the source with no ledger row fails UNLEDGERED_BLOCK; adding the row passes", () => {
  const ledger = computeLedgerFor(TWO_BLOCK_SOURCE);
  ledger.blocks = ledger.blocks.filter((b) => b.function !== "runMigration0002_widgetName");
  withFixture(TWO_BLOCK_SOURCE, ledger, (root) => {
    assert.ok(codes(root).includes("UNLEDGERED_BLOCK"));
  });
  const full = computeLedgerFor(TWO_BLOCK_SOURCE);
  withFixture(TWO_BLOCK_SOURCE, full, (root) => {
    assert.deepEqual(codes(root), []);
  });
});

test("a ledger row whose block no longer exists in source fails LEDGER_BLOCK_GONE", () => {
  const ledger = computeLedgerFor(TWO_BLOCK_SOURCE);
  ledger.blocks.push({
    id: "M099",
    function: "runMigration9999_deletedBlock",
    title: "Deleted",
    added: "2026-01-01",
    columns_written: [],
    sha256: "0".repeat(64),
  });
  withFixture(TWO_BLOCK_SOURCE, ledger, (root) => {
    assert.ok(codes(root).includes("LEDGER_BLOCK_GONE"));
  });
});

test("two blocks writing the same column fail DUPLICATE_COLUMN_WRITER; a known_overlaps entry silences it", () => {
  const ledger = computeLedgerFor(TWO_BLOCK_SOURCE);
  // Force both rows to claim the same column, as if two blocks really did derive it.
  ledger.blocks[0].columns_written = ["widgets.name"];
  ledger.blocks[1].columns_written = ["widgets.name"];
  withFixture(TWO_BLOCK_SOURCE, ledger, (root) => {
    assert.ok(codes(root).includes("DUPLICATE_COLUMN_WRITER"));
  });

  const allowlisted = structuredClone(ledger);
  allowlisted.known_overlaps = [{ column: "widgets.name", blocks: ["M001", "M002"], note: "test fixture: intentional." }];
  withFixture(TWO_BLOCK_SOURCE, allowlisted, (root) => {
    assert.deepEqual(codes(root), []);
  });
});

test("a block marked ['unknown'] never participates in duplicate-column detection", () => {
  const ledger = computeLedgerFor(TWO_BLOCK_SOURCE);
  ledger.blocks[0].columns_written = ["unknown"];
  ledger.blocks[1].columns_written = ["unknown"];
  withFixture(TWO_BLOCK_SOURCE, ledger, (root) => {
    assert.deepEqual(codes(root), []);
  });
});

// ---------------------------------------------------------------------------
// Per-column, per-block allowlisting (the M058/ledger overlap gap): a column
// gaining one known_overlaps entry must not permanently exempt every later
// block that writes it. Only a block named in that column's own `blocks`
// array passes; an overlapping write by a block the entry does not name is
// still a finding, even while other writers of the same column are
// documented.
// ---------------------------------------------------------------------------

test("a block writing an already-allowlisted column, but not named in that column's entry, still fails DUPLICATE_COLUMN_WRITER", () => {
  const ledger = computeLedgerFor(TWO_BLOCK_SOURCE);
  ledger.blocks[0].columns_written = ["widgets.name"];
  ledger.blocks[1].columns_written = ["widgets.name"];
  // The entry documents M001 only — M002 joined the column's write set
  // without ever being added, the exact shape M058 was found in.
  ledger.known_overlaps = [{ column: "widgets.name", blocks: ["M001"], note: "test fixture: only M001 documented." }];
  withFixture(TWO_BLOCK_SOURCE, ledger, (root) => {
    const findings = checkLedger(root).findings.filter((f) => f.code === "DUPLICATE_COLUMN_WRITER");
    assert.equal(findings.length, 1);
    assert.equal(findings[0].block, "M002");
    assert.match(findings[0].detail, /M002/);
    assert.match(findings[0].detail, /widgets\.name/);
  });

  // Naming M002 in the same entry (a disjointness note, per M057's example)
  // clears the finding without needing a second entry.
  const documented = structuredClone(ledger);
  documented.known_overlaps = [{ column: "widgets.name", blocks: ["M001", "M002"], note: "test fixture: both documented." }];
  withFixture(TWO_BLOCK_SOURCE, documented, (root) => {
    assert.deepEqual(codes(root), []);
  });
});

test("a column with no known_overlaps entry at all still fails every writer, same as before the per-block tightening", () => {
  const ledger = computeLedgerFor(TWO_BLOCK_SOURCE);
  ledger.blocks[0].columns_written = ["widgets.name"];
  ledger.blocks[1].columns_written = ["widgets.name"];
  ledger.known_overlaps = [];
  withFixture(TWO_BLOCK_SOURCE, ledger, (root) => {
    const findings = checkLedger(root).findings.filter((f) => f.code === "DUPLICATE_COLUMN_WRITER");
    const blocksNamed = findings.map((f) => f.block).sort();
    assert.deepEqual(blocksNamed, ["M001", "M002"]);
  });
});

// ---------------------------------------------------------------------------
// Migration data files (`// migration-data: <path>` inside a block)
// ---------------------------------------------------------------------------

const DATA_PATH = "apps/api/src/lib/widget-data-0003.ts";
const DATA_BLOCK_SOURCE = `${TWO_BLOCK_SOURCE}
export async function runMigration0003_widgetCopy(
  tx: MigrationExecutor,
): Promise<unknown> {
  // migration-data: ${DATA_PATH}
  await tx.execute(sql\`
    UPDATE widgets SET label = 'x' WHERE label = 'y'
  \`);
  return { block: "0003_widget_copy" };
}
`;

/** Writes `dataText` and a ledger for DATA_BLOCK_SOURCE whose block-3 hash covers it (as --update would compute it). */
function ledgerWithData(root, dataText) {
  const ledger = computeLedgerFor(DATA_BLOCK_SOURCE);
  writeFileSync(join(root, DATA_PATH), dataText, "utf8");
  const lines = DATA_BLOCK_SOURCE.split("\n");
  const range = parseBlockRanges(lines).find((r) => r.functionName === "runMigration0003_widgetCopy");
  const row = ledger.blocks.find((b) => b.function === "runMigration0003_widgetCopy");
  row.sha256 = hashBlockWithData(root, lines.slice(range.startLine, range.endLine + 1).join("\n")).sha256;
  writeFileSync(join(root, LEDGER_PATH), JSON.stringify(ledger, null, 2), "utf8");
}

test("declaredDataFiles reads `// migration-data:` lines; a block without one hashes exactly as before", () => {
  assert.deepEqual(declaredDataFiles(`  // migration-data: ${DATA_PATH}\n  const x = 1;`), [DATA_PATH]);
  assert.deepEqual(declaredDataFiles("  const x = 1; // not a declaration"), []);
  const plain = "export async function runMigration0009_x() {\n}";
  assert.equal(hashBlockWithData(tmpdir(), plain).sha256, hashBlockSource(plain));
});

test("editing a block's declared data file fails BLOCK_HASH_MISMATCH; the unedited file passes", () => {
  withFixture(DATA_BLOCK_SOURCE, null, (root) => {
    ledgerWithData(root, 'export const ROWS = [{ slug: "a", old: "y", next: "x" }];\n');
    assert.deepEqual(codes(root), []);
    // CRLF vs LF is not an edit (autocrlf checkouts must not trip the check).
    writeFileSync(join(root, DATA_PATH), 'export const ROWS = [{ slug: "a", old: "y", next: "x" }];\r\n', "utf8");
    assert.deepEqual(codes(root), []);
    writeFileSync(join(root, DATA_PATH), 'export const ROWS = [{ slug: "a", old: "y", next: "z" }];\n', "utf8");
    assert.deepEqual(codes(root), ["BLOCK_HASH_MISMATCH"]);
  });
});

test("removing the `// migration-data:` declaration from the block is itself a hash change", () => {
  withFixture(DATA_BLOCK_SOURCE, null, (root) => {
    ledgerWithData(root, "export const ROWS = [];\n");
    writeFileSync(join(root, SOURCE_PATH), DATA_BLOCK_SOURCE.replace(`  // migration-data: ${DATA_PATH}\n`, ""), "utf8");
    assert.deepEqual(codes(root), ["BLOCK_HASH_MISMATCH"]);
  });
});

test("a declared data file that does not exist fails MIGRATION_DATA_MISSING", () => {
  withFixture(DATA_BLOCK_SOURCE, null, (root) => {
    ledgerWithData(root, "export const ROWS = [];\n");
    rmSync(join(root, DATA_PATH));
    const found = codes(root);
    assert.ok(found.includes("MIGRATION_DATA_MISSING"), found.join(", "));
  });
});

test("--update accepts an uncommitted appended block beyond HEAD's source length", () => {
  assert.equal(addedDateForLine(repoRootFrom(import.meta.url), SOURCE_PATH, 999999), null);
});

// ---------------------------------------------------------------------------
// Per-block files (H7): blocks live under BLOCKS_DIR, the runner in SOURCE_PATH
// ---------------------------------------------------------------------------

const fixtureFile = (fn) => `${/runMigration(\d+)_/.exec(fn)[1]}-${fn.replace(/^runMigration\d+_/, "").toLowerCase()}.ts`;

/** The two-block fixture split the way the real file was: each block in its own file, the runner registering both. */
function writeSplitFixture(root) {
  const lines = TWO_BLOCK_SOURCE.split("\n");
  const ranges = parseBlockRanges(lines);
  mkdirSync(join(root, BLOCKS_DIR), { recursive: true });
  for (const r of ranges) {
    writeFileSync(join(root, BLOCKS_DIR, fixtureFile(r.functionName)),
      `import type { MigrationExecutor } from "../types.js";\n\n${lines.slice(r.startLine, r.endLine + 1).join("\n")}\n`, "utf8");
  }
  writeFileSync(join(root, SOURCE_PATH),
    `export const BLOCKS: ReadonlyArray<(tx: unknown) => Promise<unknown>> = [\n${ranges.map((r) => `  ${r.functionName},`).join("\n")}\n];\n`, "utf8");
}

test("a block moved byte for byte into its own file under BLOCKS_DIR keeps its ledger hash", () => {
  withFixture(TWO_BLOCK_SOURCE, computeLedgerFor(TWO_BLOCK_SOURCE), (root) => {
    writeSplitFixture(root);
    assert.deepEqual(codes(root), []);
    // An edit inside a block file is still an edit.
    const file = join(root, BLOCKS_DIR, fixtureFile("runMigration0002_widgetName"));
    writeFileSync(file, readFileSync(file, "utf8").replace("'default'", "'other'"), "utf8");
    assert.deepEqual(codes(root), ["BLOCK_HASH_MISMATCH"]);
  });
});

test("a block registered in BLOCKS that the scan never reads fails REGISTERED_BLOCK_NOT_SCANNED", () => {
  withFixture(TWO_BLOCK_SOURCE, computeLedgerFor(TWO_BLOCK_SOURCE), (root) => {
    writeSplitFixture(root);
    // Moved outside BLOCKS_DIR: the runner still imports and runs it.
    rmSync(join(root, BLOCKS_DIR, fixtureFile("runMigration0002_widgetName")));
    const found = codes(root);
    assert.ok(found.includes("REGISTERED_BLOCK_NOT_SCANNED"), found.join(", "));
  });
});

test("the same block function in two files fails DUPLICATE_BLOCK_FUNCTION", () => {
  withFixture(TWO_BLOCK_SOURCE, computeLedgerFor(TWO_BLOCK_SOURCE), (root) => {
    writeSplitFixture(root);
    const file = join(root, BLOCKS_DIR, fixtureFile("runMigration0001_widgetFlag"));
    writeFileSync(join(root, BLOCKS_DIR, "0009-copy.ts"), readFileSync(file, "utf8"), "utf8");
    assert.deepEqual(codes(root), ["DUPLICATE_BLOCK_FUNCTION"]);
  });
});

test("a relocated data file is read from its new path and hashes as it did at its ledgered path", () => {
  const [oldPath, newPath] = Object.entries(MIGRATION_DATA_RELOCATIONS)[0];
  const block = `export async function runMigration0004_moved(tx) {\n  // migration-data: ${oldPath}\n}`;
  const data = "export const ROWS = [];\n";
  const root = mkdtempSync(join(tmpdir(), "strale-ledger-reloc-"));
  try {
    mkdirSync(dirname(join(root, newPath)), { recursive: true });
    writeFileSync(join(root, newPath), data, "utf8");
    const result = hashBlockWithData(root, block);
    assert.deepEqual(result.missing, []);
    assert.equal(result.sha256, hashBlockSource(`${block}\n// migration-data ${oldPath}\n${data}`));
    // Content changed at the new path is still an edit.
    writeFileSync(join(root, newPath), "export const ROWS = [1];\n", "utf8");
    assert.notEqual(hashBlockWithData(root, block).sha256, result.sha256);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a BLOCKS entry that is not a scanned block name (an alias) fails REGISTERED_BLOCK_NOT_SCANNED", () => {
  withFixture(TWO_BLOCK_SOURCE, computeLedgerFor(TWO_BLOCK_SOURCE), (root) => {
    writeSplitFixture(root);
    const runner = join(root, SOURCE_PATH);
    writeFileSync(runner, readFileSync(runner, "utf8").replace("  runMigration0002_widgetName,", "  m2,"), "utf8");
    assert.deepEqual(codes(root), ["REGISTERED_BLOCK_NOT_SCANNED"]);
  });
});

test("a runner whose BLOCKS array cannot be read fails BLOCKS_REGISTRY_UNREADABLE, never passes silently", () => {
  withFixture(TWO_BLOCK_SOURCE, computeLedgerFor(TWO_BLOCK_SOURCE), (root) => {
    writeSplitFixture(root);
    writeFileSync(join(root, SOURCE_PATH), "export const BLOCKS = [runMigration0001_widgetFlag, runMigration0002_widgetName] as const;\n", "utf8");
    assert.deepEqual(codes(root), ["BLOCKS_REGISTRY_UNREADABLE"]);
  });
});

test("a block file in a subfolder or with an off-pattern name fails BLOCKS_DIR_UNEXPECTED_ENTRY", () => {
  withFixture(TWO_BLOCK_SOURCE, computeLedgerFor(TWO_BLOCK_SOURCE), (root) => {
    writeSplitFixture(root);
    mkdirSync(join(root, BLOCKS_DIR, "sub"));
    writeFileSync(join(root, BLOCKS_DIR, "helper.ts"), "export const X = 1;\n", "utf8");
    assert.deepEqual(codes(root), ["BLOCKS_DIR_UNEXPECTED_ENTRY", "BLOCKS_DIR_UNEXPECTED_ENTRY"]);
  });
});

test("the real relocated data files are the ones their blocks import", () => {
  const root = repoRootFrom(import.meta.url);
  const found = checkLedger(root).findings.filter((f) => f.code === "RELOCATED_DATA_NOT_IMPORTED");
  assert.deepEqual(found, []);
  assert.ok(Object.keys(MIGRATION_DATA_RELOCATIONS).length >= 2);
});
