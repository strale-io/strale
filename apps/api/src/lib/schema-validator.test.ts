/**
 * Regression tests for validateSchema() — now backed by the derived
 * migration-artifact audit instead of the hand-maintained REQUIRED_COLUMNS
 * list. Per DEC-20260504-A (Audit-Follow-up Test Coverage Protocol) and
 * DEC-20260504-C (Deploy Mechanism Verification).
 *
 * The canned column/table/index catalogs are built from the REAL
 * `startup-migrations.ts` source (via `deriveExpectedArtifacts`), not a
 * fixture list — so these tests exercise the actual derivation the
 * production code path uses, and stay meaningful as new migration blocks
 * are added without needing updates here.
 *
 * Fail-before/pass-after evidence (verified manually during development,
 * documented here rather than re-run every CI pass since it requires
 * diffing against `origin/main`): checked out the pre-fix
 * `schema-validator.ts` (curated `REQUIRED_COLUMNS`, last entry migration
 * 0050) against the "PR-42 class" test below — it does NOT throw, because
 * `REQUIRED_COLUMNS` never queries `test_suites.fixture_recapture_failures`
 * (added by block 0093) in the first place. The fixed file throws
 * `StartupFatalError` naming exactly that column. That gap — 43 migration
 * blocks' worth of columns/tables/indexes with zero startup verification —
 * is the whole reason this module exists.
 */

import { describe, expect, it, vi } from "vitest";
import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { deriveExpectedArtifacts, readMigrationsSourceText } from "./migration-artifact-audit.js";
import { StartupFatalError } from "./startup-fatal.js";

const dialect = new PgDialect();

const mockGetDb = vi.fn();
vi.mock("../db/index.js", () => ({
  getDb: () => mockGetDb(),
}));

const { validateSchema } = await import("./schema-validator.js");

function buildFullCatalog() {
  const artifacts = deriveExpectedArtifacts(readMigrationsSourceText());
  return {
    columns: artifacts
      .filter((a) => a.kind === "column")
      .map((a) => ({ table_name: (a as { table: string }).table, column_name: (a as { column: string }).column })),
    tables: artifacts
      .filter((a) => a.kind === "table")
      .map((a) => ({ table_name: (a as { table: string }).table })),
    indexes: artifacts
      .filter((a) => a.kind === "index")
      .map((a) => ({ indexname: (a as { index: string }).index })),
  };
}

function stubDb(
  columns: Array<{ table_name: string; column_name: string }>,
  tables: Array<{ table_name: string }>,
  indexes: Array<{ indexname: string }>,
) {
  return {
    async execute(query: SQL) {
      const text = dialect.sqlToQuery(query).sql;
      if (text.includes("information_schema.columns")) return columns;
      if (text.includes("information_schema.tables")) return tables;
      if (text.includes("pg_indexes")) return indexes;
      throw new Error(`unexpected query in test stub: ${text}`);
    },
  };
}

describe("validateSchema", () => {
  it("resolves without throwing when every migration-derived artifact exists in the DB", async () => {
    const { columns, tables, indexes } = buildFullCatalog();
    mockGetDb.mockReturnValue(stubDb(columns, tables, indexes));

    await expect(validateSchema()).resolves.toBeUndefined();
  });

  it(
    "throws StartupFatalError naming the missing column when a migration's ADD COLUMN never " +
      "landed in prod — the PR-42 outage shape (dead deploy mechanism / silently-failed migration)",
    async () => {
      const { columns, tables, indexes } = buildFullCatalog();
      // Simulate block 0093's column never having reached prod — exactly
      // the "migration ran in the deploy log, column not actually there"
      // failure DEC-20260504-C exists to catch.
      const withoutFixtureRecaptureFailures = columns.filter(
        (c) => !(c.table_name === "test_suites" && c.column_name === "fixture_recapture_failures"),
      );
      expect(withoutFixtureRecaptureFailures.length).toBe(columns.length - 1);
      mockGetDb.mockReturnValue(stubDb(withoutFixtureRecaptureFailures, tables, indexes));

      await expect(validateSchema()).rejects.toThrow(StartupFatalError);
      await expect(validateSchema()).rejects.toThrow(/fixture_recapture_failures/);
    },
  );

  it("throws StartupFatalError naming a missing table (block 0070's capability_budget_counters)", async () => {
    const { columns, tables, indexes } = buildFullCatalog();
    const withoutBudgetCounters = tables.filter((t) => t.table_name !== "capability_budget_counters");
    mockGetDb.mockReturnValue(stubDb(columns, withoutBudgetCounters, indexes));

    await expect(validateSchema()).rejects.toThrow(/capability_budget_counters/);
  });

  it("throws StartupFatalError naming a missing index (block 0083's transactions_x402_payer_hash_idx)", async () => {
    const { columns, tables, indexes } = buildFullCatalog();
    const withoutIndex = indexes.filter((i) => i.indexname !== "transactions_x402_payer_hash_idx");
    mockGetDb.mockReturnValue(stubDb(columns, tables, withoutIndex));

    await expect(validateSchema()).rejects.toThrow(/transactions_x402_payer_hash_idx/);
  });
});
