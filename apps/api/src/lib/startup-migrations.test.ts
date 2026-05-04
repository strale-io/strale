/**
 * Regression tests for runStartupMigrations() — the replacement for the
 * dead apps/api/scripts/apply-migrations.ts. Per DEC-20260504-A
 * audit-followup test coverage protocol. Two coverage targets:
 *
 * 1. **Idempotency (behaviour).** Per the user's recovery directive:
 *    "running it twice produces no second-iteration changes." Each
 *    block uses IF NOT EXISTS for DDL or a WHERE filter for DML, so a
 *    second invocation against the post-migration state must:
 *      - skip the body of the conditional (block 0028, 0029)
 *      - or update zero rows (block 0062)
 *    Block 0060 (marketplace_eligible) issues two ADD COLUMN IF NOT
 *    EXISTS unconditionally; on re-run those execute but are no-ops at
 *    the database level. We assert that the SQL emits the IF NOT EXISTS
 *    marker (the shape contract).
 *
 * 2. **Failure-aborts-boot.** If any block throws, runStartupMigrations
 *    must propagate the error rather than catch-and-continue. Index.ts
 *    relies on that to fail-stop the process before the API starts
 *    listening. Caught-and-swallowed migration errors were the
 *    failure mode the previous setup actually had — apply-migrations.ts
 *    was structured fine; it just was never invoked at all. The new
 *    structure has to never fail SILENTLY.
 *
 * The tests use a stub MigrationExecutor that records every issued
 * query and returns canned results. No prod DB connection.
 */

import { describe, expect, it, vi } from "vitest";
import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// Mock the DB layer so the orchestrator-level test below can inject a
// stub executor via getDb(). Per-block tests pass their stub directly
// into the per-block function and don't touch getDb, so they're not
// affected by this mock.
const mockGetDb = vi.fn();
vi.mock("../db/index.js", () => ({
  getDb: () => mockGetDb(),
  closeDbPool: () => Promise.resolve(),
}));

import {
  BLOCKS,
  runMigration0028_sqsDailySnapshot,
  runMigration0029_actualCostCents,
  runMigration0030_complianceColumns,
  runMigration0031_testResultsCompositeIdx,
  runMigration0060_marketplaceEligible,
  runMigration0062_paidVendorCosts,
  runMigration0063_invoiceExtractCostReclassify,
  runStartupMigrations,
  type MigrationExecutor,
} from "./startup-migrations.js";

const dialect = new PgDialect();

/** Capture SQL chunks issued through the stub. Returns canned values
 *  in order; falls back to the default for queries past the canned set. */
function makeStub(canned: { default?: unknown; queue?: unknown[] }) {
  const queue = [...(canned.queue ?? [])];
  const captured: SQL[] = [];
  const exec: MigrationExecutor & { captured: SQL[]; renderedSql: string[] } = {
    captured,
    renderedSql: [] as string[],
    async execute(query: SQL) {
      captured.push(query);
      try {
        exec.renderedSql.push(dialect.sqlToQuery(query).sql);
      } catch {
        exec.renderedSql.push("<unrendered>");
      }
      if (queue.length > 0) return queue.shift();
      return canned.default ?? { count: 0 };
    },
  };
  return exec;
}

describe("startup-migrations — block 0028 (sqs_daily_snapshot)", () => {
  it("first run: creates table + 2 indexes when information_schema reports absence", async () => {
    // First execute: information_schema check returns cnt: "0" (table absent).
    // Subsequent executes: the CREATE TABLE + 2 CREATE INDEX (we don't care about return).
    const stub = makeStub({ queue: [[{ cnt: "0" }]], default: undefined });
    const result = await runMigration0028_sqsDailySnapshot(stub);
    expect(result.outcome).toMatch(/created table/i);
    // 1 information_schema check + 1 CREATE TABLE + 2 CREATE INDEX = 4 queries.
    expect(stub.captured).toHaveLength(4);
    expect(stub.renderedSql.some((s) => /create table if not exists/i.test(s))).toBe(true);
    // Both indexes also use IF NOT EXISTS — idempotent at SQL level.
    const indexCreates = stub.renderedSql.filter((s) => /create.*index if not exists/i.test(s));
    expect(indexCreates).toHaveLength(2);
  });

  it("second run: skips when table already exists (information_schema says cnt > 0)", async () => {
    const stub = makeStub({ queue: [[{ cnt: "1" }]] });
    const result = await runMigration0028_sqsDailySnapshot(stub);
    expect(result.outcome).toMatch(/skipped/i);
    // Only the information_schema check should run; no CREATE statements.
    expect(stub.captured).toHaveLength(1);
    expect(stub.renderedSql.some((s) => /create table/i.test(s))).toBe(false);
  });
});

describe("startup-migrations — block 0029 (actual_cost_cents)", () => {
  it("first run: adds column when information_schema reports absence", async () => {
    const stub = makeStub({ queue: [[{ cnt: "0" }]] });
    const result = await runMigration0029_actualCostCents(stub);
    expect(result.outcome).toMatch(/added column/i);
    expect(stub.captured).toHaveLength(2); // check + ALTER TABLE
    expect(stub.renderedSql.some((s) => /alter table.*add column/i.test(s))).toBe(true);
  });

  it("second run: skips when column already exists", async () => {
    const stub = makeStub({ queue: [[{ cnt: "1" }]] });
    const result = await runMigration0029_actualCostCents(stub);
    expect(result.outcome).toMatch(/skipped/i);
    expect(stub.captured).toHaveLength(1); // only the check ran
    expect(stub.renderedSql.some((s) => /alter table/i.test(s))).toBe(false);
  });
});

describe("startup-migrations — block 0060 (marketplace_eligible)", () => {
  it("emits two ADD COLUMN IF NOT EXISTS — independently idempotent", async () => {
    const stub = makeStub({});
    const result = await runMigration0060_marketplaceEligible(stub);
    expect(result.outcome).toMatch(/marketplace_eligible/i);
    expect(stub.captured).toHaveLength(2);
    // Both ADD COLUMN IF NOT EXISTS — re-run is a Postgres-level no-op.
    for (const rendered of stub.renderedSql) {
      expect(rendered.toLowerCase()).toMatch(/add column if not exists/);
    }
    // First column is the boolean default-true; second is the nullable text.
    expect(stub.renderedSql[0]).toMatch(/marketplace_eligible.*boolean.*default true.*not null/i);
    expect(stub.renderedSql[1]).toMatch(/marketplace_eligible_reason.*text/i);
  });
});

describe("startup-migrations — block 0062 (paid-vendor costs)", () => {
  it("first run: updates rows; post-condition check passes; reports counts", async () => {
    // Queue: dili UPDATE returns 16; rng UPDATE returns 6; post-check returns 0.
    const stub = makeStub({
      queue: [{ count: 16 }, { count: 6 }, [{ remaining_zero: 0 }]],
    });
    const result = await runMigration0062_paidVendorCosts(stub);
    expect(result.rows_affected).toBe(22);
    expect(result.outcome).toContain("Dilisense+eSortcode=16");
    expect(result.outcome).toContain("risk-narrative-generate=6");
    expect(stub.captured).toHaveLength(3);
    // Both UPDATEs filter on external_cost_cents = 0 (idempotency).
    const updateSqls = stub.renderedSql.slice(0, 2);
    for (const s of updateSqls) {
      expect(s.toLowerCase()).toContain("external_cost_cents = 0");
      expect(s.toLowerCase()).toMatch(/test_mode = 'live'/);
    }
  });

  it("second run: idempotent — both UPDATEs return 0 rows; outcome reports already-classified", async () => {
    const stub = makeStub({
      queue: [{ count: 0 }, { count: 0 }, [{ remaining_zero: 0 }]],
    });
    const result = await runMigration0062_paidVendorCosts(stub);
    expect(result.rows_affected).toBe(0);
    expect(result.outcome).toMatch(/no rows to update.*already classified/i);
    // SQL still issued — but matched zero rows on re-run, the WHERE filter
    // doing the idempotency work.
    expect(stub.captured).toHaveLength(3);
  });

  it("post-condition violation throws (would fail boot)", async () => {
    // Imagine a new paid-vendor suite landed at cost=0 between deploys.
    // The UPDATEs do their work, but the post-check finds a leftover.
    // The block must throw rather than silently log.
    const stub = makeStub({
      queue: [{ count: 0 }, { count: 0 }, [{ remaining_zero: 1 }]],
    });
    await expect(runMigration0062_paidVendorCosts(stub)).rejects.toThrow(
      /post-condition failed.*1 paid-vendor suites/i,
    );
  });
});

describe("startup-migrations — block 0030 (compliance columns)", () => {
  it("first run: adds 3 columns + index when integrity_hash is absent", async () => {
    const stub = makeStub({ queue: [[{ cnt: "0" }]] });
    const result = await runMigration0030_complianceColumns(stub);
    expect(result.outcome).toMatch(/added/i);
    // 1 information_schema check + 3 ALTER TABLE + 1 CREATE INDEX = 5 queries.
    expect(stub.captured).toHaveLength(5);
    expect(stub.renderedSql.some((s) => /alter table.*integrity_hash/i.test(s))).toBe(true);
    expect(stub.renderedSql.some((s) => /alter table.*previous_hash/i.test(s))).toBe(true);
    expect(stub.renderedSql.some((s) => /alter table.*legal_hold.*not null/i.test(s))).toBe(true);
    expect(stub.renderedSql.some((s) => /create index if not exists.*integrity_hash/i.test(s))).toBe(true);
  });

  it("second run: skips when integrity_hash column already exists", async () => {
    const stub = makeStub({ queue: [[{ cnt: "1" }]] });
    const result = await runMigration0030_complianceColumns(stub);
    expect(result.outcome).toMatch(/skipped/i);
    expect(stub.captured).toHaveLength(1); // only the check ran
    expect(stub.renderedSql.some((s) => /alter table/i.test(s))).toBe(false);
  });
});

describe("startup-migrations — block 0031 (test_results composite index)", () => {
  it("emits CREATE INDEX IF NOT EXISTS unconditionally — Postgres-level idempotent", async () => {
    const stub = makeStub({});
    const result = await runMigration0031_testResultsCompositeIdx(stub);
    expect(result.outcome).toMatch(/composite index/i);
    expect(stub.captured).toHaveLength(1);
    expect(stub.renderedSql[0].toLowerCase()).toMatch(/create index if not exists/);
    expect(stub.renderedSql[0].toLowerCase()).toMatch(/test_results_suite_executed_idx/);
  });
});

describe("startup-migrations — block 0063 (invoice-extract cost reclassify)", () => {
  it("first run: updates 4 rows when invoice-extract suites are at 0; post-check passes", async () => {
    // Queue: UPDATE returns 4 (the 4 paid-burning suites flipped from 0 → 1);
    // post-check returns 0 (none remaining at 0).
    const stub = makeStub({
      queue: [{ count: 4 }, [{ remaining_zero: 0 }]],
    });
    const result = await runMigration0063_invoiceExtractCostReclassify(stub);
    expect(result.rows_affected).toBe(4);
    expect(result.outcome).toContain("invoice-extract suites reclassified: 4");
    expect(stub.captured).toHaveLength(2);

    // The UPDATE shape — single capability_slug, exactly the 4 paid test_types,
    // active+live filter, and the = 0 idempotency filter.
    const updateSql = stub.renderedSql[0].toLowerCase();
    expect(updateSql).toContain("update test_suites");
    expect(updateSql).toContain("set external_cost_cents = 1");
    expect(updateSql).toContain("capability_slug = 'invoice-extract'");
    expect(updateSql).toContain("active = true");
    expect(updateSql).toMatch(/test_mode = 'live'/);
    expect(updateSql).toContain("'known_answer'");
    expect(updateSql).toContain("'edge_case'");
    expect(updateSql).toContain("'negative'");
    expect(updateSql).toContain("'known_bad'");
    // Negative assertion: the two probe types must NOT be in the list —
    // they legitimately stay at 0 (auth-less probe pattern, no paid call).
    expect(updateSql).not.toContain("'dependency_health'");
    expect(updateSql).not.toContain("'schema_check'");
    // Idempotency filter:
    expect(updateSql).toContain("external_cost_cents = 0");
  });

  it("second run: idempotent — UPDATE returns 0 rows; outcome reports already-classified", async () => {
    const stub = makeStub({
      queue: [{ count: 0 }, [{ remaining_zero: 0 }]],
    });
    const result = await runMigration0063_invoiceExtractCostReclassify(stub);
    expect(result.rows_affected).toBe(0);
    expect(result.outcome).toMatch(/no rows to update.*already classified/i);
    expect(stub.captured).toHaveLength(2);
  });

  it("post-condition violation throws (would fail boot)", async () => {
    // Imagine a new invoice-extract suite landed at cost=0 between deploys.
    // The UPDATE captures 4, but the post-check finds a leftover.
    const stub = makeStub({
      queue: [{ count: 4 }, [{ remaining_zero: 1 }]],
    });
    await expect(runMigration0063_invoiceExtractCostReclassify(stub)).rejects.toThrow(
      /post-condition failed.*1 invoice-extract suites/i,
    );
  });
});

describe("startup-migrations — BLOCKS list (canonical block set)", () => {
  it("exports the expected 7 blocks in historical order", () => {
    // Pin the canonical block list so an accidental scope-creep edit
    // (adding a block to BLOCKS without updating tests / admin endpoint
    // expectations) trips a test failure. Order matters because the
    // historical numbering is the audit trail.
    const blockNames = BLOCKS.map((fn) => fn.name);
    expect(blockNames).toEqual([
      "runMigration0028_sqsDailySnapshot",
      "runMigration0029_actualCostCents",
      "runMigration0030_complianceColumns",
      "runMigration0031_testResultsCompositeIdx",
      "runMigration0060_marketplaceEligible",
      "runMigration0062_paidVendorCosts",
      "runMigration0063_invoiceExtractCostReclassify",
    ]);
  });
});

describe("startup-migrations — failure-aborts-boot semantics (orchestrator)", () => {
  // These tests target runStartupMigrations() itself — not per-block
  // functions — to pin the orchestrator's contract: if any block throws
  // for any reason, the throw propagates and aborts boot. Per
  // DEC-20260504-A this regression test must fail against the un-applied
  // fix: if a future engineer wraps the BLOCKS for-loop in a try/catch
  // (turning the orchestrator into catch-and-continue), this test fails.

  it("propagates a throw from a block (executor-level failure on first query)", async () => {
    // Stub getDb() to return an executor whose every execute() throws.
    // Block 0028 runs first; its information_schema check is the very
    // first execute() call. The throw must bubble up through the for-loop
    // into runStartupMigrations()'s caller.
    mockGetDb.mockReturnValueOnce({
      async execute() {
        throw new Error("simulated executor failure on first query");
      },
    });

    await expect(runStartupMigrations()).rejects.toThrow(
      /simulated executor failure on first query/,
    );
  });

  it("propagates a post-condition violation thrown by a later block", async () => {
    // Realistic scenario: blocks 0028–0060 take their no-op paths (table
    // exists / column exists / IF NOT EXISTS no-op), 0062's UPDATEs
    // capture 0 rows, but the post-condition SELECT finds remaining_zero
    // > 0 — block 0062 throws and the orchestrator must propagate.
    //
    // Order of execute() calls across all blocks until the throw:
    //   0028: information_schema → cnt:"1" (skip)              [1]
    //   0029: information_schema → cnt:"1" (skip)              [2]
    //   0030: information_schema → cnt:"1" (skip)              [3]
    //   0031: CREATE INDEX IF NOT EXISTS                       [4]
    //   0060: ADD COLUMN IF NOT EXISTS marketplace_eligible    [5]
    //   0060: ADD COLUMN IF NOT EXISTS marketplace_eligible_…  [6]
    //   0062: UPDATE dilisense → {count: 0}                    [7]
    //   0062: UPDATE risk-narrative-generate → {count: 0}      [8]
    //   0062: SELECT remaining_zero → 1 → THROWS               [9]
    const queue: unknown[] = [
      [{ cnt: "1" }],
      [{ cnt: "1" }],
      [{ cnt: "1" }],
      undefined,
      undefined,
      undefined,
      { count: 0 },
      { count: 0 },
      [{ remaining_zero: 1 }],
    ];
    mockGetDb.mockReturnValueOnce({
      async execute() {
        return queue.length > 0 ? queue.shift() : { count: 0 };
      },
    });

    await expect(runStartupMigrations()).rejects.toThrow(
      /0062_paid_vendor_costs post-condition failed/,
    );
  });
});
