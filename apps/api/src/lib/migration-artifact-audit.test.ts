/**
 * Regression tests for migration-artifact-audit.ts — the derived
 * replacement for schema-validator.ts's hand-maintained REQUIRED_COLUMNS
 * list. Per DEC-20260504-A (Audit-Follow-up Test Coverage Protocol) and
 * DEC-20260504-C (Deploy Mechanism Verification).
 *
 * Two coverage targets:
 *
 * 1. **Parser correctness on synthetic fixtures.** Each DDL shape the
 *    real file uses (single-line ADD COLUMN, multi-line ALTER TABLE +
 *    ADD COLUMN IF NOT EXISTS, CREATE TABLE, CREATE INDEX) is derived
 *    correctly, and shapes that must NOT be derived (ADD CONSTRAINT,
 *    DDL keywords appearing only in prose comments) are excluded.
 *
 * 2. **Parser correctness on the real file — the fail-before/pass-after
 *    case.** `deriveExpectedArtifacts` run against the actual
 *    `startup-migrations.ts` source must find `transactions
 *    .x402_payer_hash` (block 0083) and its companion index. During
 *    development this test caught a real bug in the parser itself: a
 *    prose comment two blocks earlier ("this migration still can't read
 *    manifests/*.yaml") contains a literal `/*`, which an
 *    block-comment-first strip order misread as an unterminated block
 *    comment and used to swallow all of block 0083's DDL — the exact
 *    "derived list quietly stops covering new blocks" failure mode this
 *    module exists to prevent, just one layer down (in the deriver
 *    itself, not a hand-list). Fixed by stripping `//` line comments
 *    before `/* *​/` block comments. This test fails against the
 *    line-comment-order bug and passes with the fix — see the block
 *    0083 case below for the isolated synthetic repro of the same bug.
 */

import { describe, expect, it } from "vitest";
import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  auditMigrationArtifacts,
  deriveExpectedArtifacts,
  readMigrationsSourceText,
} from "./migration-artifact-audit.js";
import type { MigrationExecutor } from "./startup-migrations.js";

const dialect = new PgDialect();

describe("deriveExpectedArtifacts — synthetic fixtures", () => {
  it("derives a single-line ADD COLUMN (no IF NOT EXISTS, guarded by JS check)", () => {
    const source = `
      export async function runMigration0001_x(tx: MigrationExecutor) {
        await tx.execute(sql\`ALTER TABLE "widgets" ADD COLUMN "size" integer\`);
      }
    `;
    const artifacts = deriveExpectedArtifacts(source);
    expect(artifacts).toContainEqual(
      expect.objectContaining({ kind: "column", table: "widgets", column: "size" }),
    );
  });

  it("derives a multi-line ALTER TABLE + ADD COLUMN IF NOT EXISTS", () => {
    const source = `
      export async function runMigration0002_y(tx: MigrationExecutor) {
        await tx.execute(sql\`
          ALTER TABLE "capabilities"
            ADD COLUMN IF NOT EXISTS "marketplace_eligible" boolean DEFAULT true NOT NULL
        \`);
      }
    `;
    const artifacts = deriveExpectedArtifacts(source);
    expect(artifacts).toContainEqual(
      expect.objectContaining({ kind: "column", table: "capabilities", column: "marketplace_eligible" }),
    );
  });

  it("derives CREATE TABLE IF NOT EXISTS", () => {
    const source = `
      export async function runMigration0003_z(tx: MigrationExecutor) {
        await tx.execute(sql\`
          CREATE TABLE IF NOT EXISTS widget_counters (
            id BIGSERIAL PRIMARY KEY
          )
        \`);
      }
    `;
    const artifacts = deriveExpectedArtifacts(source);
    expect(artifacts).toContainEqual(
      expect.objectContaining({ kind: "table", table: "widget_counters" }),
    );
  });

  it("derives a multi-line CREATE INDEX IF NOT EXISTS ... ON", () => {
    const source = `
      export async function runMigration0004_w(tx: MigrationExecutor) {
        await tx.execute(sql\`
          CREATE INDEX IF NOT EXISTS widgets_size_idx
            ON widgets (size)
        \`);
      }
    `;
    const artifacts = deriveExpectedArtifacts(source);
    expect(artifacts).toContainEqual(
      expect.objectContaining({ kind: "index", index: "widgets_size_idx", table: "widgets" }),
    );
  });

  it("does NOT derive ADD CONSTRAINT as a column artifact", () => {
    const source = `
      export async function runMigration0005_v(tx: MigrationExecutor) {
        await tx.execute(
          sql.raw(\`ALTER TABLE widgets ADD CONSTRAINT widgets_size_chk CHECK (size > 0)\`),
        );
      }
    `;
    const artifacts = deriveExpectedArtifacts(source);
    expect(artifacts.some((a) => a.kind === "column")).toBe(false);
  });

  it("does NOT derive DDL keywords that appear only in prose comments", () => {
    const source = `
      // Cannot use a bare ADD COLUMN IF NOT EXISTS for `+ "`legal_hold`" + ` because
      // Both ALTER TABLE statements use ADD COLUMN IF NOT EXISTS, so they're fine
      export async function runMigration0006_u(tx: MigrationExecutor) {
        return { block: "0006_u", outcome: "no-op", duration_ms: 0 };
      }
    `;
    const artifacts = deriveExpectedArtifacts(source);
    expect(artifacts).toHaveLength(0);
  });

  it("attributes each artifact to the block function it was found in", () => {
    const source = `
      export async function runMigration0010_first(tx: MigrationExecutor) {
        await tx.execute(sql\`ALTER TABLE a ADD COLUMN IF NOT EXISTS b integer\`);
      }
      export async function runMigration0011_second(tx: MigrationExecutor) {
        await tx.execute(sql\`ALTER TABLE c ADD COLUMN IF NOT EXISTS d integer\`);
      }
    `;
    const artifacts = deriveExpectedArtifacts(source);
    const first = artifacts.find((a) => a.kind === "column" && a.table === "a");
    const second = artifacts.find((a) => a.kind === "column" && a.table === "c");
    expect(first?.block).toBe("runMigration0010_first");
    expect(second?.block).toBe("runMigration0011_second");
  });

  it(
    "regression: a literal /* inside a // prose comment must not swallow a later block's DDL " +
      "(the bug this module shipped with — a comment mentioning manifests/*.yaml between two " +
      "blocks made a naive block-comment-first strip consume everything up to the next real */, " +
      "deleting the intervening block's ADD COLUMN from the derived list)",
    () => {
      const source = `
        export async function runMigrationA_before(tx: MigrationExecutor) {
          // this migration still can't read manifests/*.yaml at runtime
          return { block: "A", outcome: "no-op", duration_ms: 0 };
        }

        export async function runMigrationB_middle(tx: MigrationExecutor) {
          await tx.execute(sql\`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS x402_payer_hash varchar(16)\`);
        }

        /**
         * A real JSDoc block comment for the next migration, whose closing
         * marker is the one a buggy parser would wrongly pair with the "/*"
         * above instead of its own opening "/**".
         */
        export async function runMigrationC_after(tx: MigrationExecutor) {
          return { block: "C", outcome: "no-op", duration_ms: 0 };
        }
      `;
      const artifacts = deriveExpectedArtifacts(source);
      expect(artifacts).toContainEqual(
        expect.objectContaining({ kind: "column", table: "transactions", column: "x402_payer_hash" }),
      );
    },
  );
});

describe("deriveExpectedArtifacts — real startup-migrations.ts source", () => {
  const artifacts = deriveExpectedArtifacts(readMigrationsSourceText());

  it("parses without throwing and finds a substantial artifact set", () => {
    // Loose lower bound — the real file currently derives 36 artifacts
    // (16 columns, 7 tables, 13 indexes) across blocks 0029-0093. This
    // guards against the parser regressing to near-zero silently (e.g. a
    // future refactor of the SQL formatting style breaking every regex at
    // once) without pinning an exact count that would need updating on
    // every new migration block.
    expect(artifacts.length).toBeGreaterThanOrEqual(30);
  });

  it("finds block 0093's column (the newest block as of this fix)", () => {
    expect(artifacts).toContainEqual(
      expect.objectContaining({
        kind: "column",
        table: "test_suites",
        column: "fixture_recapture_failures",
      }),
    );
  });

  it("finds block 0083's column AND index — the exact pair the comment/*-comment bug deleted", () => {
    expect(artifacts).toContainEqual(
      expect.objectContaining({ kind: "column", table: "transactions", column: "x402_payer_hash" }),
    );
    expect(artifacts).toContainEqual(
      expect.objectContaining({ kind: "index", index: "transactions_x402_payer_hash_idx" }),
    );
  });

  it("finds block 0070's table", () => {
    expect(artifacts).toContainEqual(
      expect.objectContaining({ kind: "table", table: "capability_budget_counters" }),
    );
  });

  it(
    "finds every column added since migration 0050 — the exact gap schema-validator.ts's " +
      "hand-maintained REQUIRED_COLUMNS left open (its last entry was 0050; startup-migrations.ts " +
      "has shipped 43 more blocks since)",
    () => {
      const post0050Columns: Array<{ table: string; column: string }> = [
        { table: "test_suites", column: "scheduled_testing_eligible" }, // 0066
        { table: "capabilities", column: "cost_class" }, // 0067
        { table: "transactions", column: "client_meta" }, // 0081
        { table: "transactions", column: "x402_payer_hash" }, // 0083
        { table: "discovery_hits", column: "src_basis" }, // 0086
        { table: "solution_steps", column: "gate_condition" }, // 0088
        { table: "test_suites", column: "fixture_recapture_failures" }, // 0093
      ];
      for (const expected of post0050Columns) {
        expect(artifacts).toContainEqual(expect.objectContaining({ kind: "column", ...expected }));
      }
    },
  );
});

describe("auditMigrationArtifacts", () => {
  function makeStub(
    columns: Array<{ table_name: string; column_name: string }>,
    tables: Array<{ table_name: string }>,
    indexes: Array<{ indexname: string }>,
  ): MigrationExecutor {
    return {
      async execute(query: SQL) {
        // Distinguish the three introspection queries by the system view
        // they read from — auditMigrationArtifacts issues exactly one
        // query per kind, and the three view names are textually disjoint.
        const text = dialect.sqlToQuery(query).sql;
        if (text.includes("information_schema.columns")) return columns;
        if (text.includes("information_schema.tables")) return tables;
        if (text.includes("pg_indexes")) return indexes;
        throw new Error(`unexpected query in test stub: ${text}`);
      },
    };
  }

  it("reports no missing artifacts when the DB has everything the source expects", async () => {
    const source = `
      export async function runMigration0001_x(tx: MigrationExecutor) {
        await tx.execute(sql\`ALTER TABLE widgets ADD COLUMN IF NOT EXISTS size integer\`);
        await tx.execute(sql\`CREATE TABLE IF NOT EXISTS widget_counters (id int)\`);
        await tx.execute(sql\`CREATE INDEX IF NOT EXISTS widgets_size_idx ON widgets (size)\`);
      }
    `;
    const stub = makeStub(
      [{ table_name: "widgets", column_name: "size" }],
      [{ table_name: "widget_counters" }],
      [{ indexname: "widgets_size_idx" }],
    );
    const result = await auditMigrationArtifacts(stub, source);
    expect(result.artifacts).toHaveLength(3);
    expect(result.missing).toHaveLength(0);
  });

  it(
    "reports the missing artifact when the DB is stuck at a pre-migration state — the exact " +
      "PR-42 shape: the boot-time migration block never actually ran (or ran and failed " +
      "silently), and the code that expects the column is now live",
    async () => {
      const source = `
        export async function runMigration0093_fixtureRecaptureFailures(tx: MigrationExecutor) {
          await tx.execute(sql\`ALTER TABLE "test_suites" ADD COLUMN IF NOT EXISTS "fixture_recapture_failures" integer DEFAULT 0 NOT NULL\`);
        }
      `;
      // DB has not been migrated — information_schema reports the column absent.
      const stub = makeStub([], [], []);
      const result = await auditMigrationArtifacts(stub, source);
      expect(result.missing).toHaveLength(1);
      expect(result.missing[0]).toMatchObject({
        kind: "column",
        table: "test_suites",
        column: "fixture_recapture_failures",
      });
    },
  );
});

/**
 * This gate ABORTS BOOT. That makes its two failure directions
 * asymmetric, and the tests below exist because of that asymmetry:
 *
 *   - Under-deriving is a smaller safety net. Bad, silent, survivable.
 *   - Over-deriving demands a column that is correctly gone, so
 *     validateSchema throws on every boot — a production crash-loop on
 *     every deploy until someone edits the parser.
 *
 * So the DROP/RENAME cases are not hypothetical tidiness: without them,
 * the first migration block that removes a column takes prod down and
 * keeps it down. No block does that today, which is exactly why it would
 * ship unnoticed.
 */
describe("deriveExpectedArtifacts — boot-safety regressions", () => {
  const block = (ddl: string) => `export async function runMigration0099_x( ) { sql\`${ddl}\` }`;

  it("derives EVERY column of a multi-column ALTER TABLE, not just the first", () => {
    // Fails before the two-stage parse: a single ALTER TABLE ... ADD COLUMN
    // regex returns only `a`, and `b`/`c` are silently never verified.
    const got = deriveExpectedArtifacts(block("ALTER TABLE t ADD COLUMN a int, ADD COLUMN b int, ADD COLUMN c int"));
    expect(got.filter((x) => x.kind === "column").map((x: any) => x.column).sort()).toEqual(["a", "b", "c"]);
  });

  it("does not let a multi-column scan bleed into the next statement", () => {
    // The bound on the scan matters as much as the scan: without it, the
    // ADD COLUMN of a following statement gets attributed to this table,
    // inventing an artifact that will never exist -> boot fails forever.
    const got = deriveExpectedArtifacts(
      block("ALTER TABLE t1 ADD COLUMN a int`; sql`ALTER TABLE t2 ADD COLUMN b int"),
    );
    expect(got.filter((x) => x.kind === "column").map((x: any) => `${x.table}.${x.column}`).sort())
      .toEqual(["t1.a", "t2.b"]);
  });

  it.each([
    ["DROP COLUMN", "ALTER TABLE t ADD COLUMN a int`; sql`ALTER TABLE t DROP COLUMN a"],
    ["RENAME COLUMN", "ALTER TABLE t ADD COLUMN a int`; sql`ALTER TABLE t RENAME COLUMN a TO b"],
    ["DROP TABLE", "CREATE TABLE IF NOT EXISTS z (id int)`; sql`DROP TABLE z"],
    ["DROP INDEX", "CREATE INDEX IF NOT EXISTS ix ON t (a)`; sql`DROP INDEX ix"],
  ])("stops demanding an artifact that a later block removes via %s", (_label, ddl) => {
    expect(deriveExpectedArtifacts(block(ddl))).toEqual([]);
  });

  it("still derives the real file's full artifact set (no regression from the above)", () => {
    // Pins the real count so a future parser change that quietly derives
    // FEWER artifacts fails here instead of silently shrinking the net.
    const real = deriveExpectedArtifacts(readMigrationsSourceText());
    expect(real.length).toBeGreaterThanOrEqual(36);
  });
});

describe("auditMigrationArtifacts — refuses to certify a collapsed parse", () => {
  const emptyDb: MigrationExecutor = { async execute() { return []; } };

  it("throws when the source has migration blocks but nothing parses", async () => {
    // A parser that finds nothing otherwise reports "all clear" — the
    // hollow-gate shape (a 404ing shape check, a lint matching no real
    // imports, a canary mode dispatching identically to live) that this
    // program found three times in one week. Zero artifacts from a file
    // that plainly has blocks means the parser broke, not that the schema
    // is clean, and boot must not be certified on it.
    await expect(
      auditMigrationArtifacts(emptyDb, "export async function runMigration0099_x( ) { /* opaque */ }"),
    ).rejects.toThrow(/derivation collapsed/i);
  });

  it("does not throw for block-free snippets (unit tests must stay usable)", async () => {
    const res = await auditMigrationArtifacts(emptyDb, "ALTER TABLE t ADD COLUMN a int");
    expect(res.artifacts).toHaveLength(1);
  });
});
