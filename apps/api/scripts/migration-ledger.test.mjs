// Tests for the T15 schema-migration ledger (migration-ledger-lib.mjs,
// check-migration-ledger.mjs). Every failure mode is planted in its own
// throwaway repo fixture (mirroring apps/api/src/lib/) and must fail there;
// the fixed counterpart must pass. Per docs/company/LESSONS.md F5's
// standing rule (no checker ships until it has failed on a planted case).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  checkLedger,
  extractColumnsWritten,
  extractTitle,
  hashBlockSource,
  humanizeFunctionName,
  parseBlockRanges,
  SOURCE_PATH,
  LEDGER_PATH,
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
