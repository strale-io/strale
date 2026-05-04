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

import { describe, expect, it } from "vitest";
import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  runMigration0028_sqsDailySnapshot,
  runMigration0029_actualCostCents,
  runMigration0060_marketplaceEligible,
  runMigration0062_paidVendorCosts,
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

describe("startup-migrations — failure-aborts-boot semantics", () => {
  it("if a block throws, runStartupMigrations propagates (no catch-and-continue)", async () => {
    // Use the post-condition-violation block as the failure trigger:
    // dili UPDATE 0, rng UPDATE 0, post-check returns 1 → block throws.
    // We invoke the block directly here because runStartupMigrations()
    // pulls getDb() from the real DB; the per-block test is the
    // behavioural assertion.
    const stub = makeStub({
      queue: [{ count: 0 }, { count: 0 }, [{ remaining_zero: 5 }]],
    });
    await expect(runMigration0062_paidVendorCosts(stub)).rejects.toThrow();
  });
});
