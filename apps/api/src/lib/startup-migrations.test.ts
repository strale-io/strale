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
  runMigration0029_actualCostCents,
  runMigration0030_complianceColumns,
  runMigration0031_testResultsCompositeIdx,
  runMigration0060_marketplaceEligible,
  runMigration0062_paidVendorCosts,
  runMigration0063_invoiceExtractCostReclassify,
  runMigration0064_alwaysLlmHaikuCosts,
  runMigration0065_pr86LeakyCapsCleanup,
  runMigration0067_costClassTaxonomy,
  runMigration0068_seedDeDkSkCostClass,
  runMigration0069_reconcileEligibilityFromCostClass,
  runMigration0070_capabilityBudgetCounters,
  runMigration0071_bulkClassifyFreeUnlimited,
  runMigration0072_classifyFreeQuotaHighConfidence,
  runMigration0073_classifyFreeUnlimitedMediumConfidence,
  runMigration0074_classifyAnthropicPaidPrepaid,
  runMigration0075_classifyFreeQuotaLowConfidence,
  runMigration0076_classifyNonAnthropicPaidPrepaid,
  runMigration0077_classifyFreeQuotaOverrides,
  runMigration0078_transactionsCapabilityIdCreatedAtIdx,
  runMigration0082_reclassifyThrottledFreeUnlimited,
  runMigration0087_unhideRedactedRows,
  runMigration0093_fixtureRecaptureFailures,
  runMigration0102_accountLifecycleTables,
  runMigration0066_ensureEligibilityColumnAndReconcile,
  runMigration0094_clearChurnInvalidatedBaselines,
  runMigration0100_relistUrlToMarkdown,
  runMigration0101_capabilityInvocations,
  runStartupMigrations,
  type MigrationExecutor,
} from "./startup-migrations.js";
import { BLOCK_0064_SLUGS } from "./llm-capability-costs.js";

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

// Block 0028 (sqs_daily_snapshot) tests retired with the SQS engine
// (DEC-20260503-B). The table is dropped in PR2.

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

describe("startup-migrations — block 0093 (fixture_recapture_failures)", () => {
  // Companion to the Browserless harness-burn mitigation's HIGH-2b fix
  // (recordFixtureRecaptureFailure in test-runner.ts). MEDIUM (Codex
  // closing-pass round 2, 2026-08-18): rewritten from check-then-ALTER
  // (a TOCTOU race between two overlapping boots — see the block's own
  // comment) to a single `ADD COLUMN IF NOT EXISTS` statement, the pattern
  // every other column-adding block since 0060 uses. A single atomic DDL
  // statement has no read-then-write gap for a second boot to race into,
  // so there's no "first run vs second run" branch to test — every
  // invocation issues the identical idempotent statement and Postgres
  // itself no-ops it when the column is already there.
  it("issues a single ADD COLUMN IF NOT EXISTS statement", async () => {
    const stub = makeStub({});
    const result = await runMigration0093_fixtureRecaptureFailures(stub);
    expect(result.outcome).toMatch(/column ensured/i);
    expect(stub.captured).toHaveLength(1); // one statement, no preceding check
    expect(stub.renderedSql[0].toLowerCase()).toMatch(
      /alter table[\s\S]*add column if not exists[\s\S]*fixture_recapture_failures/,
    );
  });

  it("a second invocation issues the identical statement — no app-level branching to race", async () => {
    const stub = makeStub({});
    await runMigration0093_fixtureRecaptureFailures(stub);
    const firstSql = stub.renderedSql[0];

    const stub2 = makeStub({});
    await runMigration0093_fixtureRecaptureFailures(stub2);
    const secondSql = stub2.renderedSql[0];

    expect(secondSql).toBe(firstSql);
    expect(stub2.captured).toHaveLength(1);
  });

  it("never reads information_schema before the ALTER — the exact shape that created the two-boot race", async () => {
    const stub = makeStub({});
    await runMigration0093_fixtureRecaptureFailures(stub);
    expect(stub.renderedSql.some((s) => /information_schema/i.test(s))).toBe(false);
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

describe("startup-migrations — block 0064 (always-LLM Haiku costs)", () => {
  it("first run: updates rows when always-LLM Haiku suites are at 0; post-check passes", async () => {
    // Queue: UPDATE returns N (the suites flipped from 0 → 1);
    // post-check returns 0 (none remaining at 0).
    const stub = makeStub({
      queue: [{ count: 219 }, [{ remaining_zero: 0 }]],
    });
    const result = await runMigration0064_alwaysLlmHaikuCosts(stub);
    expect(result.rows_affected).toBe(219);
    expect(result.outcome).toMatch(/always-LLM Haiku suites reclassified across \d+ capabilities: 219/);
    expect(stub.captured).toHaveLength(2);

    // The UPDATE shape — IN-list of BLOCK_0064_SLUGS, exactly the 4 paid
    // test_types, active+live filter, and the = 0 idempotency filter.
    const updateSql = stub.renderedSql[0].toLowerCase();
    expect(updateSql).toContain("update test_suites");
    expect(updateSql).toContain("set external_cost_cents = 1");
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
    // Earlier-block slugs are NOT in the IN-list (avoid stomping on
    // 0062's 3¢ risk-narrative-generate, or duplicating 0063's invoice-extract).
    expect(updateSql).not.toContain("'risk-narrative-generate'");
    expect(updateSql).not.toContain("'invoice-extract'");
  });

  it("second run: idempotent — UPDATE returns 0 rows; outcome reports already-classified", async () => {
    const stub = makeStub({
      queue: [{ count: 0 }, [{ remaining_zero: 0 }]],
    });
    const result = await runMigration0064_alwaysLlmHaikuCosts(stub);
    expect(result.rows_affected).toBe(0);
    expect(result.outcome).toMatch(/no rows to update.*already classified/i);
    expect(stub.captured).toHaveLength(2);
  });

  it("post-condition violation throws (would fail boot)", async () => {
    // Imagine a new always-LLM Haiku suite landed at cost=0 between
    // deploys. The UPDATE captures some, but the post-check finds a
    // leftover.
    const stub = makeStub({
      queue: [{ count: 219 }, [{ remaining_zero: 1 }]],
    });
    await expect(runMigration0064_alwaysLlmHaikuCosts(stub)).rejects.toThrow(
      /post-condition failed.*1 always-LLM Haiku suites/i,
    );
  });

  it("UPDATE binds every slug in BLOCK_0064_SLUGS as a parameter (no string concat)", async () => {
    // Build-time parameterisation check: the rendered SQL should
    // contain N placeholders ($1 etc.) at least equal to the number
    // of slugs in BLOCK_0064_SLUGS, not the slug strings inline.
    // (sql.join + sql`${s}` pushes each as a bind parameter.)
    const stub = makeStub({
      queue: [{ count: 0 }, [{ remaining_zero: 0 }]],
    });
    await runMigration0064_alwaysLlmHaikuCosts(stub);
    const updateSql = stub.renderedSql[0];
    // Count placeholders in the UPDATE-line — at least one per slug
    // (the UPDATE has the IN-list; the post-check has its own).
    const placeholderCount = (updateSql.match(/\$\d+/g) ?? []).length;
    expect(placeholderCount).toBeGreaterThanOrEqual(BLOCK_0064_SLUGS.length);
  });
});

describe("startup-migrations — block 0065 (PR #86 leaky-cap cleanup)", () => {
  it("first run: bumps website-to-company cost AND fixes us-company-data fixture", async () => {
    // Queue: cost-bump UPDATE returns 4 (4 live non-probe suites);
    //        fixture-fix UPDATE returns 4 (4 AAPL rows replaced);
    //        cost post-check returns 0;
    //        fixture post-check returns 0.
    const stub = makeStub({
      queue: [
        { count: 4 },
        { count: 4 },
        [{ remaining_zero: 0 }],
        [{ remaining_aapl: 0 }],
      ],
    });
    const result = await runMigration0065_pr86LeakyCapsCleanup(stub);
    expect(result.rows_affected).toBe(8);
    expect(result.outcome).toContain("website-to-company cost-bumped=4");
    expect(result.outcome).toContain("us-company-data fixture-fixed=4");
    expect(stub.captured).toHaveLength(4);

    // Cost-bump UPDATE shape
    const costSql = stub.renderedSql[0].toLowerCase();
    expect(costSql).toContain("update test_suites");
    expect(costSql).toContain("set external_cost_cents = 1");
    expect(costSql).toMatch(/test_mode = 'live'/);
    expect(costSql).toContain("external_cost_cents = 0");
    expect(costSql).not.toContain("'dependency_health'");
    expect(costSql).not.toContain("'schema_check'");

    // Fixture-fix UPDATE shape
    const fixSql = stub.renderedSql[1].toLowerCase();
    expect(fixSql).toContain("update test_suites");
    expect(fixSql).toContain("jsonb_set");
    expect(fixSql).toContain("'{company}'");
    expect(fixSql).toContain("'\"320193\"'");
    expect(fixSql).toContain("'us-company-data'");
    expect(fixSql).toContain("'aapl'"); // idempotency filter (lowercased by toLowerCase)
  });

  it("second run: idempotent — both UPDATEs return 0 rows; outcome reports already-fixed", async () => {
    const stub = makeStub({
      queue: [
        { count: 0 },
        { count: 0 },
        [{ remaining_zero: 0 }],
        [{ remaining_aapl: 0 }],
      ],
    });
    const result = await runMigration0065_pr86LeakyCapsCleanup(stub);
    expect(result.rows_affected).toBe(0);
    expect(result.outcome).toMatch(/no rows to update.*already classified.*fixed/i);
    expect(stub.captured).toHaveLength(4);
  });

  it("post-condition violation (cost) throws (would fail boot)", async () => {
    // Cost UPDATE captured some, fixture UPDATE captured 0, post-check
    // (cost) finds a leftover at external_cost_cents = 0.
    const stub = makeStub({
      queue: [
        { count: 4 },
        { count: 0 },
        [{ remaining_zero: 1 }],
        [{ remaining_aapl: 0 }],
      ],
    });
    await expect(runMigration0065_pr86LeakyCapsCleanup(stub)).rejects.toThrow(
      /post-condition failed.*1 website-to-company suites/i,
    );
  });

  it("post-condition violation (fixture) throws (would fail boot)", async () => {
    // Cost UPDATE clean, fixture UPDATE clean, but post-check (fixture)
    // finds a leftover AAPL row.
    const stub = makeStub({
      queue: [
        { count: 4 },
        { count: 4 },
        [{ remaining_zero: 0 }],
        [{ remaining_aapl: 1 }],
      ],
    });
    await expect(runMigration0065_pr86LeakyCapsCleanup(stub)).rejects.toThrow(
      /post-condition failed.*1 us-company-data suites.*'AAPL'/i,
    );
  });
});

describe("startup-migrations — block 0067 (cost_class taxonomy)", () => {
  it("first run: adds 4 columns + 3 CHECK constraints when none exist", async () => {
    // 4 ADD COLUMN, 3 constraint checks (each absent → cnt:"0"), 3 ALTER ADD CONSTRAINT.
    const stub = makeStub({
      queue: [
        undefined, undefined, undefined, undefined, // 4 ADD COLUMN
        [{ cnt: "0" }], undefined, // cost_class chk: absent + ADD
        [{ cnt: "0" }], undefined, // quota_window chk: absent + ADD
        [{ cnt: "0" }], undefined, // quota_reset_dom chk: absent + ADD
      ],
    });
    const result = await runMigration0067_costClassTaxonomy(stub);
    expect(result.outcome).toMatch(/columns.*constraints ensured/i);
    expect(stub.captured).toHaveLength(10); // 4 ADD + 3×(check+ADD)
    // ADD COLUMN statements all use IF NOT EXISTS.
    const addColumns = stub.renderedSql.slice(0, 4);
    for (const sqlStr of addColumns) {
      expect(sqlStr.toLowerCase()).toMatch(/add column if not exists/);
    }
    // CHECK constraint SQL appears.
    expect(stub.renderedSql.some((s) => /cost_class.*in.*free_unlimited.*paid_subscription/i.test(s))).toBe(true);
    expect(stub.renderedSql.some((s) => /quota_window.*in.*daily.*monthly.*none/i.test(s))).toBe(true);
    expect(stub.renderedSql.some((s) => /quota_reset_dom.*>= 1.*<= 31/i.test(s))).toBe(true);
  });

  it("second run: skips constraint ADDs when pg_constraint reports presence", async () => {
    const stub = makeStub({
      queue: [
        undefined, undefined, undefined, undefined, // 4 ADD COLUMN IF NOT EXISTS — PG no-op
        [{ cnt: "1" }], // cost_class chk: present
        [{ cnt: "1" }], // quota_window chk: present
        [{ cnt: "1" }], // quota_reset_dom chk: present
      ],
    });
    const result = await runMigration0067_costClassTaxonomy(stub);
    expect(result.outcome).toMatch(/columns.*constraints ensured/i);
    // 4 ADD COLUMN + 3 constraint checks (no ADDs) = 7 queries.
    expect(stub.captured).toHaveLength(7);
    // No ALTER TABLE ... ADD CONSTRAINT issued.
    expect(stub.renderedSql.some((s) => /add constraint/i.test(s))).toBe(false);
  });
});

describe("startup-migrations — block 0068 (seed DE/DK/SK cost_class)", () => {
  it("first run: updates 3 rows (DE=1, DK=1, SK=1); reports total affected", async () => {
    const stub = makeStub({
      queue: [{ count: 1 }, { count: 1 }, { count: 1 }],
    });
    const result = await runMigration0068_seedDeDkSkCostClass(stub);
    expect(result.rows_affected).toBe(3);
    expect(result.outcome).toMatch(/seeded.*3 row/i);
    expect(stub.captured).toHaveLength(3);
    // All 3 UPDATEs filter on cost_class IS NULL (idempotency).
    for (const sqlStr of stub.renderedSql) {
      expect(sqlStr.toLowerCase()).toContain("cost_class is null");
    }
    // German row sets quota_reset_dom = 1 (the 1st-of-month reset).
    expect(stub.renderedSql[0]).toMatch(/german-company-data/);
    expect(stub.renderedSql[0]).toMatch(/quota_reset_dom = 1|\$1/i);
    // Danish row sets daily window, no reset_dom needed.
    expect(stub.renderedSql[1]).toMatch(/danish-company-data/);
    expect(stub.renderedSql[1].toLowerCase()).toContain("daily");
    // Slovak row sets free_unlimited, window 'none'.
    expect(stub.renderedSql[2]).toMatch(/slovak-company-data/);
    expect(stub.renderedSql[2].toLowerCase()).toContain("free_unlimited");
  });

  it("second run: idempotent — all UPDATEs return 0 rows after first apply", async () => {
    const stub = makeStub({
      queue: [{ count: 0 }, { count: 0 }, { count: 0 }],
    });
    const result = await runMigration0068_seedDeDkSkCostClass(stub);
    expect(result.rows_affected).toBe(0);
    expect(result.outcome).toMatch(/no rows to update.*already classified/i);
    // SQL still issued — WHERE filter does the idempotency work.
    expect(stub.captured).toHaveLength(3);
  });

  it("missing-rows path: zero rows hit when caps don't exist in DB", async () => {
    // Same observable shape as already-classified: zero affected, no-op outcome.
    const stub = makeStub({
      queue: [{ count: 0 }, { count: 0 }, { count: 0 }],
    });
    const result = await runMigration0068_seedDeDkSkCostClass(stub);
    expect(result.rows_affected).toBe(0);
    expect(result.outcome).toMatch(/no rows to update/i);
  });
});

describe("startup-migrations — block 0069 (reconcile eligibility from cost_class)", () => {
  it("first run: reconciles, post-check passes, reports row count", async () => {
    // Queue: UPDATE returns 12; post-check returns 0 mismatched.
    const stub = makeStub({
      queue: [{ count: 12 }, [{ mismatched: 0 }]],
    });
    const result = await runMigration0069_reconcileEligibilityFromCostClass(stub);
    expect(result.rows_affected).toBe(12);
    expect(result.outcome).toMatch(/reconciled 12 row/i);
    expect(stub.captured).toHaveLength(2);
    // UPDATE references cost_class IN (...) derivation.
    expect(stub.renderedSql[0].toLowerCase()).toContain("free_unlimited");
    expect(stub.renderedSql[0].toLowerCase()).toContain("free_quota");
    expect(stub.renderedSql[0].toLowerCase()).toContain("paid_with_free_tier");
    expect(stub.renderedSql[0].toLowerCase()).toContain("is distinct from");
  });

  it("second run: idempotent — UPDATE returns 0; post-check still passes", async () => {
    const stub = makeStub({
      queue: [{ count: 0 }, [{ mismatched: 0 }]],
    });
    const result = await runMigration0069_reconcileEligibilityFromCostClass(stub);
    expect(result.rows_affected).toBe(0);
    expect(result.outcome).toMatch(/no rows to reconcile.*already aligned/i);
  });

  it("post-condition violation throws (would fail boot)", async () => {
    // Imagine a manifest landed mid-deploy with a contradictory state.
    // Block must throw rather than silently leave the scheduler reading
    // stale eligibility — same shape as block 0062's post-condition.
    const stub = makeStub({
      queue: [{ count: 0 }, [{ mismatched: 1 }]],
    });
    await expect(
      runMigration0069_reconcileEligibilityFromCostClass(stub),
    ).rejects.toThrow(/0069.*post-condition failed.*1 rows still mismatched/i);
  });
});

describe("startup-migrations — block 0070 (capability_budget_counters)", () => {
  it("first run: creates table + index + CHECK constraint", async () => {
    const stub = makeStub({
      queue: [
        undefined, // CREATE TABLE
        undefined, // CREATE INDEX
        [{ cnt: "0" }], // CHECK absent
        undefined, // ALTER ADD CONSTRAINT
      ],
    });
    const result = await runMigration0070_capabilityBudgetCounters(stub);
    expect(result.outcome).toMatch(/table.*index.*check.*ensured/i);
    expect(stub.captured).toHaveLength(4);
    expect(stub.renderedSql.some((s) => /create table if not exists capability_budget_counters/i.test(s))).toBe(true);
    expect(stub.renderedSql.some((s) => /primary key.*capability_slug.*window_start.*window_kind/i.test(s))).toBe(true);
    expect(stub.renderedSql.some((s) => /create index if not exists capability_budget_counters_window_idx/i.test(s))).toBe(true);
    expect(stub.renderedSql.some((s) => /window_kind in.*daily.*monthly/i.test(s))).toBe(true);
  });

  it("second run: skips CHECK ADD when pg_constraint reports presence", async () => {
    const stub = makeStub({
      queue: [
        undefined,    // CREATE TABLE IF NOT EXISTS — PG no-op
        undefined,    // CREATE INDEX IF NOT EXISTS — PG no-op
        [{ cnt: "1" }], // CHECK present
      ],
    });
    const result = await runMigration0070_capabilityBudgetCounters(stub);
    expect(result.outcome).toMatch(/ensured/i);
    expect(stub.captured).toHaveLength(3); // no ADD CONSTRAINT issued
    expect(stub.renderedSql.some((s) => /add constraint/i.test(s))).toBe(false);
  });
});

describe("startup-migrations — block 0071 (bulk-classify free_unlimited)", () => {
  it("first run: UPDATEs the eligible slug subset; reports rows_affected", async () => {
    // Queue: single UPDATE returns count=180 (everything matched).
    const stub = makeStub({ queue: [{ count: 180 }] });
    const result = await runMigration0071_bulkClassifyFreeUnlimited(stub);
    expect(result.rows_affected).toBe(180);
    expect(result.outcome).toMatch(/bulk-classified 180 cap/i);
    expect(stub.captured).toHaveLength(1);

    const sqlText = stub.renderedSql[0].toLowerCase();
    expect(sqlText).toContain("update capabilities");
    expect(sqlText).toContain("cost_class = 'free_unlimited'");
    expect(sqlText).toContain("quota_window = 'none'");
    expect(sqlText).toContain("quota_cap = null");
    // Idempotency clause: only NULL rows update.
    expect(sqlText).toContain("cost_class is null");
    // Slug list is inline-bound — sample 3 known slugs to verify the
    // PHASE_B1_FREE_UNLIMITED_SLUGS list was actually serialized.
    expect(sqlText).toContain("'iban-validate'");
    expect(sqlText).toContain("'dns-lookup'");
    expect(sqlText).toContain("'json-repair'");
  });

  it("second run: idempotent — count=0; outcome reports already-classified", async () => {
    const stub = makeStub({ queue: [{ count: 0 }] });
    const result = await runMigration0071_bulkClassifyFreeUnlimited(stub);
    expect(result.rows_affected).toBe(0);
    expect(result.outcome).toMatch(/no rows to classify.*already have cost_class/i);
  });

  it("does not touch already-classified rows (idempotency by AND cost_class IS NULL)", async () => {
    // Whatever the count returns, the SQL itself must filter on
    // cost_class IS NULL. Without that clause, re-running the block
    // would overwrite paid_prepaid / paid_subscription rows added by
    // Phase B.2+ batches. This test pins the safety filter shape.
    const stub = makeStub({ queue: [{ count: 0 }] });
    await runMigration0071_bulkClassifyFreeUnlimited(stub);
    const sqlText = stub.renderedSql[0].toLowerCase();
    expect(sqlText).toMatch(/where[\s\S]*and\s+cost_class\s+is\s+null/);
  });
});

describe("startup-migrations — phase-b1-free-unlimited-slugs list", () => {
  it("list size is within the 170-200 audit-bounded range", async () => {
    // Loose bounds: the audit-reported high-confidence free_unlimited
    // count was 180 on 2026-05-12. A future audit refresh might add or
    // remove a few caps; the test stays green within reason but flags
    // a wholesale loss (e.g., empty list or 300+ caps surprise).
    const { PHASE_B1_FREE_UNLIMITED_SLUGS } = await import("./phase-b1-free-unlimited-slugs.js");
    expect(PHASE_B1_FREE_UNLIMITED_SLUGS.length).toBeGreaterThan(150);
    expect(PHASE_B1_FREE_UNLIMITED_SLUGS.length).toBeLessThan(220);
  });

  it("list is alphabetically sorted (audit-trail discipline)", async () => {
    const { PHASE_B1_FREE_UNLIMITED_SLUGS } = await import("./phase-b1-free-unlimited-slugs.js");
    const sorted = [...PHASE_B1_FREE_UNLIMITED_SLUGS].sort();
    expect(PHASE_B1_FREE_UNLIMITED_SLUGS).toEqual(sorted);
  });

  it("list has no duplicates", async () => {
    const { PHASE_B1_FREE_UNLIMITED_SLUGS } = await import("./phase-b1-free-unlimited-slugs.js");
    const unique = new Set(PHASE_B1_FREE_UNLIMITED_SLUGS);
    expect(unique.size).toBe(PHASE_B1_FREE_UNLIMITED_SLUGS.length);
  });
});

describe("startup-migrations — block 0072 (classify free_quota high-confidence)", () => {
  it("first run: UPDATEs the 8 free_quota slugs with per-cap quota params", async () => {
    const stub = makeStub({ queue: [{ count: 8 }] });
    const result = await runMigration0072_classifyFreeQuotaHighConfidence(stub);
    expect(result.rows_affected).toBe(8);
    expect(result.outcome).toMatch(/classified 8 cap/i);
    expect(stub.captured).toHaveLength(1);

    const sqlText = stub.renderedSql[0].toLowerCase();
    expect(sqlText).toContain("update capabilities");
    expect(sqlText).toContain("cost_class = 'free_quota'");
    // Per-cap params: VALUES clause must include each (slug, window, cap, reset_dom) tuple.
    expect(sqlText).toContain("'au-company-data'");
    expect(sqlText).toContain("'beneficial-ownership-lookup'");
    expect(sqlText).toContain("'flight-status'");
    expect(sqlText).toContain("'job-board-search'");
    // Daily caps with reset_dom=NULL.
    expect(sqlText).toMatch(/'au-company-data',\s*'daily',\s*1000,\s*null/);
    // Monthly caps with reset_dom=1.
    expect(sqlText).toMatch(/'flight-status',\s*'monthly',\s*100,\s*1/);
    expect(sqlText).toMatch(/'job-board-search',\s*'monthly',\s*1000,\s*1/);
    // Idempotency clause.
    expect(sqlText).toContain("c.cost_class is null");
  });

  it("second run: idempotent — count=0; outcome reports already-classified", async () => {
    const stub = makeStub({ queue: [{ count: 0 }] });
    const result = await runMigration0072_classifyFreeQuotaHighConfidence(stub);
    expect(result.rows_affected).toBe(0);
    expect(result.outcome).toMatch(/no rows to classify.*already have cost_class/i);
  });

  it("does not touch already-classified rows (cost_class IS NULL safety filter)", async () => {
    // Pins the safety clause so a future refactor that drops it would
    // silently overwrite paid_prepaid / free_quota classifications from
    // Phase B.3+ batches. Block 0072 must only fill blanks.
    const stub = makeStub({ queue: [{ count: 0 }] });
    await runMigration0072_classifyFreeQuotaHighConfidence(stub);
    const sqlText = stub.renderedSql[0].toLowerCase();
    expect(sqlText).toMatch(/where[\s\S]*c\.cost_class\s+is\s+null/);
  });
});

describe("startup-migrations — block 0073 (classify free_unlimited medium-conf)", () => {
  it("first run: UPDATEs the 5 medium-conf scraping slugs", async () => {
    const stub = makeStub({ queue: [{ count: 5 }] });
    const result = await runMigration0073_classifyFreeUnlimitedMediumConfidence(stub);
    expect(result.rows_affected).toBe(5);
    expect(result.outcome).toMatch(/classified 5 cap/i);

    const sqlText = stub.renderedSql[0].toLowerCase();
    expect(sqlText).toContain("cost_class = 'free_unlimited'");
    expect(sqlText).toContain("quota_window = 'none'");
    expect(sqlText).toContain("quota_cap = null");
    // All 5 scraping caps in the IN-list.
    expect(sqlText).toContain("'canadian-company-data'");
    expect(sqlText).toContain("'japanese-company-data'");
    expect(sqlText).toContain("'polish-company-data'");
    expect(sqlText).toContain("'seo-audit'");
    expect(sqlText).toContain("'tech-stack-detect'");
    // Idempotency clause.
    expect(sqlText).toContain("cost_class is null");
  });

  it("second run: idempotent — count=0; outcome reports already-classified", async () => {
    const stub = makeStub({ queue: [{ count: 0 }] });
    const result = await runMigration0073_classifyFreeUnlimitedMediumConfidence(stub);
    expect(result.rows_affected).toBe(0);
    expect(result.outcome).toMatch(/no rows to classify/i);
  });
});

describe("startup-migrations — phase-b2 slug lists (audit-trail invariants)", () => {
  it("PHASE_B2_FREE_QUOTA_HIGH_CONF has 8 entries", async () => {
    const { PHASE_B2_FREE_QUOTA_HIGH_CONF } = await import("./startup-migrations.js");
    expect(PHASE_B2_FREE_QUOTA_HIGH_CONF.length).toBe(8);
  });

  it("PHASE_B2_FREE_QUOTA_HIGH_CONF entries have valid quota shapes", async () => {
    const { PHASE_B2_FREE_QUOTA_HIGH_CONF } = await import("./startup-migrations.js");
    for (const cap of PHASE_B2_FREE_QUOTA_HIGH_CONF) {
      expect(cap.slug).toMatch(/^[a-z][a-z0-9-]+$/);
      expect(["daily", "monthly"]).toContain(cap.quotaWindow);
      expect(cap.quotaCap).toBeGreaterThan(0);
      // reset_dom NULL only valid for daily windows.
      if (cap.quotaWindow === "monthly") {
        expect(cap.quotaResetDom).toBeGreaterThanOrEqual(1);
        expect(cap.quotaResetDom).toBeLessThanOrEqual(31);
      } else {
        expect(cap.quotaResetDom).toBeNull();
      }
    }
  });

  it("PHASE_B2_FREE_UNLIMITED_MEDIUM_CONF has 5 entries (audit-pinned count)", async () => {
    const { PHASE_B2_FREE_UNLIMITED_MEDIUM_CONF } = await import("./startup-migrations.js");
    expect(PHASE_B2_FREE_UNLIMITED_MEDIUM_CONF.length).toBe(5);
  });

  it("PHASE_B2_FREE_UNLIMITED_MEDIUM_CONF has no duplicates", async () => {
    const { PHASE_B2_FREE_UNLIMITED_MEDIUM_CONF } = await import("./startup-migrations.js");
    const unique = new Set(PHASE_B2_FREE_UNLIMITED_MEDIUM_CONF);
    expect(unique.size).toBe(PHASE_B2_FREE_UNLIMITED_MEDIUM_CONF.length);
  });

  it("B.2 slug lists do not overlap with B.1 free_unlimited", async () => {
    const { PHASE_B2_FREE_QUOTA_HIGH_CONF, PHASE_B2_FREE_UNLIMITED_MEDIUM_CONF } = await import("./startup-migrations.js");
    const { PHASE_B1_FREE_UNLIMITED_SLUGS } = await import("./phase-b1-free-unlimited-slugs.js");
    const b1Set = new Set(PHASE_B1_FREE_UNLIMITED_SLUGS);
    for (const cap of PHASE_B2_FREE_QUOTA_HIGH_CONF) {
      expect(b1Set.has(cap.slug), `${cap.slug} appears in BOTH B.1 and B.2 free_quota`).toBe(false);
    }
    for (const slug of PHASE_B2_FREE_UNLIMITED_MEDIUM_CONF) {
      expect(b1Set.has(slug), `${slug} appears in BOTH B.1 and B.2 free_unlimited`).toBe(false);
    }
  });
});

describe("startup-migrations — block 0074 (classify ANTHROPIC paid_prepaid)", () => {
  it("first run: UPDATEs the 83 ANTHROPIC slugs to paid_prepaid", async () => {
    const stub = makeStub({ queue: [{ count: 83 }] });
    const result = await runMigration0074_classifyAnthropicPaidPrepaid(stub);
    expect(result.rows_affected).toBe(83);
    expect(result.outcome).toMatch(/classified 83 cap/i);

    const sqlText = stub.renderedSql[0].toLowerCase();
    expect(sqlText).toContain("update capabilities");
    expect(sqlText).toContain("cost_class = 'paid_prepaid'");
    expect(sqlText).toContain("quota_window = 'none'");
    expect(sqlText).toContain("quota_cap = null");
    // Sample slugs from the audit-derived list — assert presence to
    // confirm the slug-list module was actually serialized into the SQL.
    expect(sqlText).toContain("'agent-trace-analyze'");
    expect(sqlText).toContain("'classify-text'");
    expect(sqlText).toContain("'invoice-extract'");
    expect(sqlText).toContain("'pii-redact'");
    expect(sqlText).toContain("'translate'");
    // Idempotency clause.
    expect(sqlText).toContain("cost_class is null");
  });

  it("second run: idempotent — count=0; outcome reports already-classified", async () => {
    const stub = makeStub({ queue: [{ count: 0 }] });
    const result = await runMigration0074_classifyAnthropicPaidPrepaid(stub);
    expect(result.rows_affected).toBe(0);
    expect(result.outcome).toMatch(/no rows to classify.*already have cost_class/i);
  });

  it("does not overwrite already-classified rows (safety filter pin)", async () => {
    // A future refactor that drops `AND cost_class IS NULL` would
    // silently overwrite free_* / paid_subscription classifications
    // from Phase B.1/B.2/B.4+ batches. Pin the safety filter shape.
    const stub = makeStub({ queue: [{ count: 0 }] });
    await runMigration0074_classifyAnthropicPaidPrepaid(stub);
    const sqlText = stub.renderedSql[0].toLowerCase();
    expect(sqlText).toMatch(/where[\s\S]*and\s+cost_class\s+is\s+null/);
  });
});

describe("startup-migrations — phase-b3 ANTHROPIC slug list (audit invariants)", () => {
  it("list size is within the audit-bounded range", async () => {
    // Loose bounds: the audit found 83 caps reading ANTHROPIC_API_KEY
    // at high confidence on 2026-05-12. Anthropic-dominance in the
    // LLM-backed fleet means this number is naturally ~80; a future
    // audit refresh might add or remove a few. Bounds match the chat-
    // approved 50-100 range from Phase B.3 prompt.
    const { PHASE_B3_ANTHROPIC_PAID_PREPAID_SLUGS } = await import("./phase-b3-anthropic-paid-prepaid-slugs.js");
    expect(PHASE_B3_ANTHROPIC_PAID_PREPAID_SLUGS.length).toBeGreaterThan(50);
    expect(PHASE_B3_ANTHROPIC_PAID_PREPAID_SLUGS.length).toBeLessThan(100);
  });

  it("list is alphabetically sorted (audit-trail discipline)", async () => {
    const { PHASE_B3_ANTHROPIC_PAID_PREPAID_SLUGS } = await import("./phase-b3-anthropic-paid-prepaid-slugs.js");
    const sorted = [...PHASE_B3_ANTHROPIC_PAID_PREPAID_SLUGS].sort();
    expect(PHASE_B3_ANTHROPIC_PAID_PREPAID_SLUGS).toEqual(sorted);
  });

  it("list has no duplicates", async () => {
    const { PHASE_B3_ANTHROPIC_PAID_PREPAID_SLUGS } = await import("./phase-b3-anthropic-paid-prepaid-slugs.js");
    const unique = new Set(PHASE_B3_ANTHROPIC_PAID_PREPAID_SLUGS);
    expect(unique.size).toBe(PHASE_B3_ANTHROPIC_PAID_PREPAID_SLUGS.length);
  });

  it("does not overlap with B.1 free_unlimited or B.2 free_quota/free_unlimited", async () => {
    const { PHASE_B3_ANTHROPIC_PAID_PREPAID_SLUGS } = await import("./phase-b3-anthropic-paid-prepaid-slugs.js");
    const { PHASE_B1_FREE_UNLIMITED_SLUGS } = await import("./phase-b1-free-unlimited-slugs.js");
    const { PHASE_B2_FREE_QUOTA_HIGH_CONF, PHASE_B2_FREE_UNLIMITED_MEDIUM_CONF } = await import("./startup-migrations.js");

    const b1 = new Set(PHASE_B1_FREE_UNLIMITED_SLUGS);
    const b2a = new Set(PHASE_B2_FREE_QUOTA_HIGH_CONF.map((c: { slug: string }) => c.slug));
    const b2b = new Set(PHASE_B2_FREE_UNLIMITED_MEDIUM_CONF);

    for (const slug of PHASE_B3_ANTHROPIC_PAID_PREPAID_SLUGS) {
      expect(b1.has(slug), `${slug} also in B.1 free_unlimited`).toBe(false);
      expect(b2a.has(slug), `${slug} also in B.2 free_quota`).toBe(false);
      expect(b2b.has(slug), `${slug} also in B.2 free_unlimited`).toBe(false);
    }
  });
});

describe("startup-migrations — block 0075 (classify free_quota low-confidence)", () => {
  it("first run: issues 8 per-cap UPDATEs with chat-supplied quota_cap values", async () => {
    // Block 0075 runs 8 atomic UPDATEs (one per cap), each returning count=1.
    const stub = makeStub({
      queue: Array(8).fill({ count: 1 }),
    });
    const result = await runMigration0075_classifyFreeQuotaLowConfidence(stub);
    expect(result.rows_affected).toBe(8);
    expect(result.outcome).toMatch(/classified 8 cap/i);
    expect(stub.captured).toHaveLength(8);

    // Each UPDATE has the same shape: cost_class='free_quota', daily, per-cap cap.
    const allSql = stub.renderedSql.join("\n").toLowerCase();
    expect(allSql).toContain("cost_class = 'free_quota'");
    expect(allSql).toContain("quota_window = 'daily'");
    expect(allSql).toContain("quota_reset_dom = null");
    // Idempotency clause on every UPDATE.
    expect(stub.renderedSql.every((s) => /cost_class\s+is\s+null/i.test(s))).toBe(true);
    // Per-cap quota_cap values surface in the rendered SQL (drizzle binds
    // them; the rendered string includes $1-style placeholders, but the
    // slug also surfaces as $2).
    expect(stub.renderedSql.every((s) => /quota_cap\s*=\s*\$\d+/i.test(s))).toBe(true);
  });

  it("second run: all 8 UPDATEs return 0 rows; outcome reports already-classified", async () => {
    const stub = makeStub({ queue: Array(8).fill({ count: 0 }) });
    const result = await runMigration0075_classifyFreeQuotaLowConfidence(stub);
    expect(result.rows_affected).toBe(0);
    expect(result.outcome).toMatch(/no rows to classify.*already have cost_class/i);
    // SQL still issued (8 statements) — WHERE filter does the idempotency.
    expect(stub.captured).toHaveLength(8);
  });

  it("safety filter pin — every UPDATE includes AND cost_class IS NULL", async () => {
    const stub = makeStub({ queue: Array(8).fill({ count: 0 }) });
    await runMigration0075_classifyFreeQuotaLowConfidence(stub);
    for (const sqlText of stub.renderedSql) {
      expect(sqlText.toLowerCase()).toMatch(/and\s+cost_class\s+is\s+null/);
    }
  });
});

describe("startup-migrations — phase-b4 low-conf free_quota cap list (invariants)", () => {
  it("has exactly 8 entries (audit-pinned count)", async () => {
    const { PHASE_B4_FREE_QUOTA_LOW_CONF_CAPS } = await import("./startup-migrations.js");
    expect(PHASE_B4_FREE_QUOTA_LOW_CONF_CAPS.length).toBe(8);
  });

  it("every entry has valid shape (slug + quota_cap > 0)", async () => {
    const { PHASE_B4_FREE_QUOTA_LOW_CONF_CAPS } = await import("./startup-migrations.js");
    for (const cap of PHASE_B4_FREE_QUOTA_LOW_CONF_CAPS) {
      expect(cap.slug).toMatch(/^[a-z][a-z0-9-]+$/);
      expect(cap.quotaCap).toBeGreaterThan(0);
    }
  });

  it("contains the 8 chat-supplied slugs", async () => {
    const { PHASE_B4_FREE_QUOTA_LOW_CONF_CAPS } = await import("./startup-migrations.js");
    const slugs = PHASE_B4_FREE_QUOTA_LOW_CONF_CAPS.map((c: { slug: string }) => c.slug).sort();
    expect(slugs).toEqual([
      "belgian-company-data",
      "croatian-company-data",
      "github-repo-compare",
      "github-user-profile",
      "greek-company-data",
      "page-speed-test",
      "swedish-company-data",
      "us-court-search",
    ]);
  });

  it("pins per-cap quota_cap values (chat-supplied authoritative table)", async () => {
    const { PHASE_B4_FREE_QUOTA_LOW_CONF_CAPS } = await import("./startup-migrations.js");
    const byslug = Object.fromEntries(
      PHASE_B4_FREE_QUOTA_LOW_CONF_CAPS.map((c: { slug: string; quotaCap: number }) => [c.slug, c.quotaCap]),
    );
    // Pin the chat-researched quota caps so a future refactor that
    // re-loads "audit defaults" can't silently regress these values.
    expect(byslug["belgian-company-data"]).toBe(2500);
    expect(byslug["croatian-company-data"]).toBe(500);
    expect(byslug["github-repo-compare"]).toBe(1000);
    expect(byslug["github-user-profile"]).toBe(1000);
    expect(byslug["greek-company-data"]).toBe(500);
    expect(byslug["page-speed-test"]).toBe(25000);
    expect(byslug["swedish-company-data"]).toBe(1000);
    expect(byslug["us-court-search"]).toBe(5000);
  });

  it("does not overlap with B.1 / B.2 / B.3 slug lists", async () => {
    const { PHASE_B4_FREE_QUOTA_LOW_CONF_CAPS, PHASE_B2_FREE_QUOTA_HIGH_CONF, PHASE_B2_FREE_UNLIMITED_MEDIUM_CONF } = await import("./startup-migrations.js");
    const { PHASE_B1_FREE_UNLIMITED_SLUGS } = await import("./phase-b1-free-unlimited-slugs.js");
    const { PHASE_B3_ANTHROPIC_PAID_PREPAID_SLUGS } = await import("./phase-b3-anthropic-paid-prepaid-slugs.js");

    const b1 = new Set(PHASE_B1_FREE_UNLIMITED_SLUGS);
    const b2a = new Set(PHASE_B2_FREE_QUOTA_HIGH_CONF.map((c: { slug: string }) => c.slug));
    const b2b = new Set(PHASE_B2_FREE_UNLIMITED_MEDIUM_CONF);
    const b3 = new Set(PHASE_B3_ANTHROPIC_PAID_PREPAID_SLUGS);

    for (const cap of PHASE_B4_FREE_QUOTA_LOW_CONF_CAPS) {
      expect(b1.has(cap.slug), `${cap.slug} also in B.1`).toBe(false);
      expect(b2a.has(cap.slug), `${cap.slug} also in B.2 free_quota`).toBe(false);
      expect(b2b.has(cap.slug), `${cap.slug} also in B.2 free_unlimited`).toBe(false);
      expect(b3.has(cap.slug), `${cap.slug} also in B.3 paid_prepaid`).toBe(false);
    }
  });
});

describe("startup-migrations — block 0076 (classify non-Anthropic paid_prepaid)", () => {
  it("first run: UPDATEs DB-present slugs to paid_prepaid (orphans skipped by cost_class IS NULL+absent-row filter)", async () => {
    // 7 DB-present caps update; 3 orphans return 0 rows (slug doesn't exist).
    // The stub doesn't model the orphan-missing behavior, so we assert
    // the SQL shape covers all 10 + the safety filter is present.
    const stub = makeStub({ queue: [{ count: 7 }] });
    const result = await runMigration0076_classifyNonAnthropicPaidPrepaid(stub);
    expect(result.rows_affected).toBe(7);
    expect(result.outcome).toMatch(/classified 7 cap/i);

    const sqlText = stub.renderedSql[0].toLowerCase();
    expect(sqlText).toContain("cost_class = 'paid_prepaid'");
    expect(sqlText).toContain("quota_window = 'none'");
    expect(sqlText).toContain("quota_cap = null");
    // All 10 slugs (including orphans) in the IN-list.
    expect(sqlText).toContain("'adverse-media-check'");
    expect(sqlText).toContain("'sanctions-check'");
    expect(sqlText).toContain("'google-search'");
    expect(sqlText).toContain("'uk-cop-check'");
    expect(sqlText).toContain("'us-company-data-cobalt'");   // orphan
    expect(sqlText).toContain("'us-ein-match'");              // orphan
    expect(sqlText).toContain("'us-sec-filings-extended'");   // orphan
    // Idempotency clause.
    expect(sqlText).toContain("cost_class is null");
  });

  it("second run: idempotent — count=0; outcome reports already-classified", async () => {
    const stub = makeStub({ queue: [{ count: 0 }] });
    const result = await runMigration0076_classifyNonAnthropicPaidPrepaid(stub);
    expect(result.rows_affected).toBe(0);
    expect(result.outcome).toMatch(/no rows to classify/i);
  });

  it("safety filter pin — UPDATE includes AND cost_class IS NULL", async () => {
    const stub = makeStub({ queue: [{ count: 0 }] });
    await runMigration0076_classifyNonAnthropicPaidPrepaid(stub);
    const sqlText = stub.renderedSql[0].toLowerCase();
    expect(sqlText).toMatch(/and\s+cost_class\s+is\s+null/);
  });
});

describe("startup-migrations — block 0077 (free_quota overrides — BAG + EP-Online)", () => {
  it("first run: per-cap UPDATEs with chat-supplied quota_cap values", async () => {
    const stub = makeStub({ queue: Array(2).fill({ count: 1 }) });
    const result = await runMigration0077_classifyFreeQuotaOverrides(stub);
    expect(result.rows_affected).toBe(2);
    expect(result.outcome).toMatch(/classified 2 cap/i);
    expect(stub.captured).toHaveLength(2);

    const allSql = stub.renderedSql.join("\n").toLowerCase();
    expect(allSql).toContain("cost_class = 'free_quota'");
    expect(allSql).toContain("quota_window = 'daily'");
    expect(allSql).toContain("quota_reset_dom = null");
    expect(stub.renderedSql.every((s) => /cost_class\s+is\s+null/i.test(s))).toBe(true);
  });

  it("second run: idempotent — both UPDATEs return 0", async () => {
    const stub = makeStub({ queue: Array(2).fill({ count: 0 }) });
    const result = await runMigration0077_classifyFreeQuotaOverrides(stub);
    expect(result.rows_affected).toBe(0);
    expect(result.outcome).toMatch(/no rows to classify/i);
  });
});

// Per DEC-20260504-A: every cert-audit / new-code-path commit needs at
// least one regression test capturing the structural shape of the fix.
// Block 0079 is a new DDL path with a non-trivial constraint-guard
// branch — these two cases lock down both the create path and the
// "constraint already present" skip path.
describe("startup-migrations — block 0079 (ee_directors)", () => {
  it("first run: creates tables + indexes + singleton CHECK constraint", async () => {
    // The block issues 4 DDL statements (whose return values are
    // discarded), then a pg_constraint SELECT (call #5), then the
    // ALTER TABLE ADD CONSTRAINT (call #6). `makeStub.queue` shifts
    // per-call positionally, so we pad with 4 nulls before the SELECT
    // response — only call #5 reads the result.
    const stub = makeStub({ queue: [null, null, null, null, [{ cnt: "0" }]] });
    const { runMigration0079_eeDirectors } = await import("./startup-migrations.js");
    const result = await runMigration0079_eeDirectors(stub);
    expect(result.outcome).toMatch(/ee_directors.*ensured/i);
    expect(stub.captured).toHaveLength(6);
    const allSql = stub.renderedSql.join("\n").toLowerCase();
    expect(allSql).toContain("create table if not exists ee_directors");
    expect(allSql).toContain("create index if not exists ee_directors_entity_idx");
    expect(allSql).toContain("create index if not exists ee_directors_last_synced_idx");
    expect(allSql).toContain("create table if not exists ee_directors_sync");
    expect(allSql).toContain("add constraint ee_directors_sync_singleton_chk");
    expect(allSql).toContain("check (id = 1)");
    // Idempotency markers must be on every DDL — IF NOT EXISTS on creates,
    // pg_constraint lookup before the ALTER TABLE.
    expect(stub.renderedSql.filter((s) => /create table if not exists/i.test(s))).toHaveLength(2);
    expect(stub.renderedSql.filter((s) => /create index if not exists/i.test(s))).toHaveLength(2);
  });

  it("second run: skips the ALTER TABLE when CHECK constraint already exists", async () => {
    // pg_constraint SELECT returns cnt="1" → constraint present → ALTER is
    // not executed. CREATE TABLE / CREATE INDEX statements still run
    // because they're IF NOT EXISTS no-ops.
    const stub = makeStub({ queue: [null, null, null, null, [{ cnt: "1" }]] });
    const { runMigration0079_eeDirectors } = await import("./startup-migrations.js");
    await runMigration0079_eeDirectors(stub);
    // Five statements only — no ALTER TABLE ADD CONSTRAINT on this path.
    expect(stub.captured).toHaveLength(5);
    expect(stub.renderedSql.some((s) => /alter table.*add constraint/i.test(s))).toBe(false);
  });
});

// Block 0080 mirrors the Block 0079 shape: 4 DDL statements followed by a
// pg_constraint SELECT, then a conditional ALTER TABLE. Two cases lock down
// the create path and the constraint-already-present skip path.
describe("startup-migrations — block 0080 (cy_directors)", () => {
  it("first run: creates tables + indexes + singleton CHECK constraint", async () => {
    const stub = makeStub({ queue: [null, null, null, null, [{ cnt: "0" }]] });
    const { runMigration0080_cyDirectors } = await import("./startup-migrations.js");
    const result = await runMigration0080_cyDirectors(stub);
    expect(result.outcome).toMatch(/cy_directors.*ensured/i);
    expect(stub.captured).toHaveLength(6);
    const allSql = stub.renderedSql.join("\n").toLowerCase();
    expect(allSql).toContain("create table if not exists cy_directors");
    expect(allSql).toContain("create index if not exists cy_directors_entity_idx");
    expect(allSql).toContain("create index if not exists cy_directors_last_synced_idx");
    expect(allSql).toContain("create table if not exists cy_directors_sync");
    expect(allSql).toContain("add constraint cy_directors_sync_singleton_chk");
    expect(allSql).toContain("check (id = 1)");
    // Composite PK shape pinned — DRCOR has no stable per-row identifier
    // upstream, so the PK is the natural unique tuple.
    expect(allSql).toContain(
      "primary key (entity_reg_code, person_or_organisation_name, official_position)",
    );
    expect(stub.renderedSql.filter((s) => /create table if not exists/i.test(s))).toHaveLength(2);
    expect(stub.renderedSql.filter((s) => /create index if not exists/i.test(s))).toHaveLength(2);
  });

  it("second run: skips the ALTER TABLE when CHECK constraint already exists", async () => {
    const stub = makeStub({ queue: [null, null, null, null, [{ cnt: "1" }]] });
    const { runMigration0080_cyDirectors } = await import("./startup-migrations.js");
    await runMigration0080_cyDirectors(stub);
    expect(stub.captured).toHaveLength(5);
    expect(stub.renderedSql.some((s) => /alter table.*add constraint/i.test(s))).toBe(false);
  });
});

describe("startup-migrations — phase-b5 slug lists (invariants)", () => {
  it("PHASE_B5_NON_ANTHROPIC_PAID_PREPAID_SLUGS has the expected 10 entries", async () => {
    const { PHASE_B5_NON_ANTHROPIC_PAID_PREPAID_SLUGS } = await import("./startup-migrations.js");
    expect(PHASE_B5_NON_ANTHROPIC_PAID_PREPAID_SLUGS.length).toBeGreaterThanOrEqual(7);
    expect(PHASE_B5_NON_ANTHROPIC_PAID_PREPAID_SLUGS.length).toBeLessThanOrEqual(10);
    // Pin the chat-supplied slug set for regression resistance.
    const sorted = [...PHASE_B5_NON_ANTHROPIC_PAID_PREPAID_SLUGS].sort();
    expect(sorted).toEqual([
      "adverse-media-check",
      "backlink-check",
      "google-search",
      "pep-check",
      "sanctions-check",
      "serp-analyze",
      "uk-cop-check",
      "us-company-data-cobalt",
      "us-ein-match",
      "us-sec-filings-extended",
    ]);
  });

  it("PHASE_B5_FREE_QUOTA_OVERRIDE_CAPS has exactly 2 entries with pinned values", async () => {
    const { PHASE_B5_FREE_QUOTA_OVERRIDE_CAPS } = await import("./startup-migrations.js");
    expect(PHASE_B5_FREE_QUOTA_OVERRIDE_CAPS.length).toBe(2);
    const byslug = Object.fromEntries(
      PHASE_B5_FREE_QUOTA_OVERRIDE_CAPS.map((c: { slug: string; quotaCap: number }) => [c.slug, c.quotaCap]),
    );
    expect(byslug["nl-bag-address"]).toBe(50000);
    expect(byslug["nl-energy-label"]).toBe(1000);
  });

  it("B.5 slug lists do not overlap with B.1 / B.2 / B.3 / B.4", async () => {
    const { PHASE_B5_NON_ANTHROPIC_PAID_PREPAID_SLUGS, PHASE_B5_FREE_QUOTA_OVERRIDE_CAPS,
            PHASE_B2_FREE_QUOTA_HIGH_CONF, PHASE_B2_FREE_UNLIMITED_MEDIUM_CONF,
            PHASE_B4_FREE_QUOTA_LOW_CONF_CAPS } = await import("./startup-migrations.js");
    const { PHASE_B1_FREE_UNLIMITED_SLUGS } = await import("./phase-b1-free-unlimited-slugs.js");
    const { PHASE_B3_ANTHROPIC_PAID_PREPAID_SLUGS } = await import("./phase-b3-anthropic-paid-prepaid-slugs.js");

    const b1 = new Set(PHASE_B1_FREE_UNLIMITED_SLUGS);
    const b2a = new Set(PHASE_B2_FREE_QUOTA_HIGH_CONF.map((c: { slug: string }) => c.slug));
    const b2b = new Set(PHASE_B2_FREE_UNLIMITED_MEDIUM_CONF);
    const b3 = new Set(PHASE_B3_ANTHROPIC_PAID_PREPAID_SLUGS);
    const b4 = new Set(PHASE_B4_FREE_QUOTA_LOW_CONF_CAPS.map((c: { slug: string }) => c.slug));

    const allB5 = [
      ...PHASE_B5_NON_ANTHROPIC_PAID_PREPAID_SLUGS,
      ...PHASE_B5_FREE_QUOTA_OVERRIDE_CAPS.map((c: { slug: string }) => c.slug),
    ];
    for (const slug of allB5) {
      expect(b1.has(slug), `${slug} also in B.1`).toBe(false);
      expect(b2a.has(slug), `${slug} also in B.2 free_quota`).toBe(false);
      expect(b2b.has(slug), `${slug} also in B.2 free_unlimited`).toBe(false);
      expect(b3.has(slug), `${slug} also in B.3`).toBe(false);
      expect(b4.has(slug), `${slug} also in B.4`).toBe(false);
    }
  });
});

describe("startup-migrations — block 0087 (un-hide content-redacted rows)", () => {
  it("clears deleted_at only for this sweep's own signature", async () => {
    // Narrow by construction: a user-requested erasure and the 1095-day hard
    // purge both legitimately set deleted_at and must survive untouched.
    const stub = makeStub({ default: { count: 2004 } });
    const result = await runMigration0087_unhideRedactedRows(stub);
    const [unhide] = stub.renderedSql;
    expect(unhide).toMatch(/set "?deleted_at"? = null/i);
    expect(unhide).toMatch(/redacted_at is not null/i);
    expect(unhide).toMatch(/pii_retention_purge|content_retention_purge/);
    expect(unhide).not.toMatch(/user_request/);
    expect(result.rows_affected).toBeGreaterThan(0);
  });

  it("un-hides without un-redacting — no payload column is written", async () => {
    const stub = makeStub({ default: { count: 0 } });
    await runMigration0087_unhideRedactedRows(stub);
    for (const s of stub.renderedSql) {
      for (const col of ["input", "output", "audit_trail", "provenance"]) {
        expect(s, `payload column ${col} must not be written`).not.toMatch(
          new RegExp(`"?${col}"?\s*=`, "i"),
        );
      }
    }
  });

  it("is a no-op on re-run once the repair has landed", async () => {
    const stub = makeStub({ default: { count: 0 } });
    const result = await runMigration0087_unhideRedactedRows(stub);
    expect(result.rows_affected).toBe(0);
    expect(result.outcome).toMatch(/no change/);
  });
});

/**
 * A stub for block 0102 that answers the ledger probe by matching the SQL,
 * not by counting statements.
 *
 * The positional `makeStub` queue meant every test in this describe carried a
 * row of seven `undefined`s whose only job was to reach the eighth call. Adding
 * one statement to the block silently shifted the ledger result onto a CREATE
 * INDEX and the "already applied" test started failing for a reason that had
 * nothing to do with what it asserts. Matching on the query removes the
 * coupling between a test's fixture and the block's statement count.
 */
function makeBlock0102Stub(priorRun: Array<{ block: string }> = []) {
  const captured: SQL[] = [];
  const renderedSql: string[] = [];
  const exec: MigrationExecutor & { captured: SQL[]; renderedSql: string[] } = {
    captured,
    renderedSql,
    async execute(query: SQL) {
      captured.push(query);
      let rendered = "<unrendered>";
      try {
        rendered = dialect.sqlToQuery(query).sql;
      } catch {
        /* keep the placeholder */
      }
      renderedSql.push(rendered);
      if (/SELECT block FROM startup_migration_ledger/i.test(rendered)) {
        return priorRun;
      }
      return { count: 0 };
    },
  };
  return exec;
}

describe("startup-migrations — block 0102 (account lifecycle tables)", () => {
  it("creates both tables and their indexes idempotently", async () => {
    const stub = makeBlock0102Stub();
    const result = await runMigration0102_accountLifecycleTables(stub);

    const ddl = stub.renderedSql.join(" ").toLowerCase();
    expect(ddl).toMatch(/create table if not exists "trial_grants"/);
    expect(ddl).toMatch(/create unique index if not exists "trial_grants_email_hash_unique"/);
    expect(ddl).toMatch(/create table if not exists "api_key_recovery_tokens"/);
    expect(ddl).toMatch(
      /create unique index if not exists "api_key_recovery_tokens_token_hash_unique"/,
    );
    expect(result.outcome).toMatch(/tables and indexes ensured/i);
  });

  it("the backfill cannot duplicate an entitlement", async () => {
    // The UNIQUE index is the rule this block installs, so a backfill that
    // could violate it would abort boot rather than silently skipping.
    const stub = makeBlock0102Stub();
    await runMigration0102_accountLifecycleTables(stub);
    const insert = stub.renderedSql.find((s) => /insert into "trial_grants"/i.test(s));
    expect(insert).toBeDefined();
    expect(insert!.toLowerCase()).toMatch(/on conflict \(email_hash\) do nothing/);
  });

  it("pins the SQL hash expression that has to agree with hashEmail", async () => {
    // The two halves of one rule live in different languages. If they diverge,
    // every backfilled row is keyed on a hash the application will never
    // produce, and the entitlement silently stops applying to exactly the
    // accounts it was created to cover.
    //
    // This asserts the SQL TEXT and nothing more — it would pass unchanged if
    // hashEmail() were switched to SHA-512 tomorrow. The agreement itself is
    // proved where it can be: routes/account-lifecycle.integration.test.ts
    // ("the migration backfills entitlements…") runs this block against a real
    // Postgres and looks the row up BY hashEmail(), and
    // lib/trial-eligibility.test.ts pins hashEmail to plain SHA-256 of the
    // normalised address. Named for what it does, so the next reader does not
    // count it as coverage twice.
    const stub = makeBlock0102Stub();
    await runMigration0102_accountLifecycleTables(stub);
    const insert = stub.renderedSql.find((s) => /insert into "trial_grants"/i.test(s))!;
    expect(insert.toLowerCase()).toContain(
      "encode(sha256(convert_to(lower(btrim(u.email)), 'utf8')), 'hex')",
    );
  });

  it("skips accounts whose address has already been erased", async () => {
    // A redacted row has no recoverable address, so no hash can be computed
    // for it. Stated in the query rather than left implicit, because a future
    // reader could easily read the omission as an oversight.
    const stub = makeBlock0102Stub();
    await runMigration0102_accountLifecycleTables(stub);
    const insert = stub.renderedSql.find((s) => /insert into "trial_grants"/i.test(s))!;
    expect(insert.toLowerCase()).toMatch(/u\.deleted_at is null/);
    expect(insert.toLowerCase()).toMatch(/redacted-%@deleted\.local/);
  });

  it("creates the Stripe replay index, which no migration block owned before", async () => {
    // `wallet_transactions_stripe_session_id_unique` lives in schema.ts and in
    // production, and was created by NO block — it survives only from the
    // original `drizzle-kit push`, which never runs against production. A
    // database rebuilt from startup-migrations.ts alone would come up without
    // the one constraint standing between a duplicated Stripe delivery and a
    // double credit, and nothing would say so. WP11 owns the Stripe crediting
    // decision, so it adopts the guard that decision rests on.
    const stub = makeBlock0102Stub();
    await runMigration0102_accountLifecycleTables(stub);
    const ddl = stub.renderedSql.join(" ").toLowerCase();
    expect(ddl).toMatch(
      /create unique index if not exists "wallet_transactions_stripe_session_id_unique"/,
    );
    // Partial, matching the schema: a NULL session id is the ordinary case for
    // every non-Stripe ledger row, and a total index would reject the second one.
    expect(ddl).toMatch(/where "stripe_session_id" is not null/);
  });

  it("does not re-run the backfill once the ledger records it", async () => {
    // A second boot must not re-scan the users table. ON CONFLICT would make
    // a re-run harmless, but the ledger gate is what keeps a boot cheap.
    const stub = makeBlock0102Stub([{ block: "0102_account_lifecycle_tables" }]);
    const result = await runMigration0102_accountLifecycleTables(stub);
    expect(stub.renderedSql.some((s) => /insert into "trial_grants"/i.test(s))).toBe(false);
    expect(result.outcome).toMatch(/already applied/i);
  });
});

describe("startup-migrations — BLOCKS list (canonical block set)", () => {
  it("exports the expected 47 blocks in historical order", () => {
    // Pin the canonical block list so an accidental scope-creep edit
    // (adding a block to BLOCKS without updating tests / admin endpoint
    // expectations) trips a test failure. Order matters because the
    // historical numbering is the audit trail.
    const blockNames = BLOCKS.map((fn) => fn.name);
    expect(blockNames).toEqual([
      "runMigration0029_actualCostCents",
      "runMigration0030_complianceColumns",
      "runMigration0031_testResultsCompositeIdx",
      "runMigration0060_marketplaceEligible",
      "runMigration0062_paidVendorCosts",
      "runMigration0063_invoiceExtractCostReclassify",
      "runMigration0064_alwaysLlmHaikuCosts",
      "runMigration0065_pr86LeakyCapsCleanup",
      "runMigration0066_ensureEligibilityColumnAndReconcile",
      "runMigration0067_costClassTaxonomy",
      "runMigration0068_seedDeDkSkCostClass",
      "runMigration0069_reconcileEligibilityFromCostClass",
      "runMigration0070_capabilityBudgetCounters",
      "runMigration0071_bulkClassifyFreeUnlimited",
      "runMigration0072_classifyFreeQuotaHighConfidence",
      "runMigration0073_classifyFreeUnlimitedMediumConfidence",
      "runMigration0074_classifyAnthropicPaidPrepaid",
      "runMigration0075_classifyFreeQuotaLowConfidence",
      "runMigration0076_classifyNonAnthropicPaidPrepaid",
      "runMigration0077_classifyFreeQuotaOverrides",
      "runMigration0078_transactionsCapabilityIdCreatedAtIdx",
      "runMigration0079_eeDirectors",
      "runMigration0080_cyDirectors",
      "runMigration0081_attribution",
      "runMigration0082_reclassifyThrottledFreeUnlimited",
      "runMigration0083_x402PayerHash",
      "runMigration0084_danishQuotaHeadroom",
      "runMigration0085_actorIdentity",
      "runMigration0086_srcBasis",
      "runMigration0087_unhideRedactedRows",
      "runMigration0088_solutionGateCondition",
      "runMigration0089_deactivateUsCourtSearch",
      "runMigration0090_capabilityOutputContracts",
      "runMigration0091_bolStaleValidationRules",
      "runMigration0092_x402GrowthBundles",
      "runMigration0093_fixtureRecaptureFailures",
      "runMigration0094_clearChurnInvalidatedBaselines",
      // WP3: wallet_reservations table + the non-negative balance constraint.
      "runMigration0095_walletReservations",
      "runMigration0096_x402SettlementIntents",
      "runMigration0097_chainSequence",
      "runMigration0098_perCustomerIdempotency",
      "runMigration0099_noHalfQuarantine",
      "runMigration0100_relistUrlToMarkdown",
      "runMigration0101_capabilityInvocations",
      "runMigration0102_accountLifecycleTables",
      "runMigration0103_redactedContentStaysRedacted",
      "runMigration0104_jobSchedule",
    ]);
  });
});

describe("startup-migrations — block 0083 (x402 payer hash)", () => {
  it("adds the column and index idempotently (IF NOT EXISTS markers present)", async () => {
    const { runMigration0083_x402PayerHash } = await import("./startup-migrations.js");
    const stub = makeStub({ queue: [{}, {}] });
    const result = await runMigration0083_x402PayerHash(stub);
    expect(stub.captured).toHaveLength(2);
    const [alterSql, indexSql] = stub.renderedSql.map((s) => s.toLowerCase());
    expect(alterSql).toContain("add column if not exists x402_payer_hash");
    expect(indexSql).toContain("create index if not exists");
    expect(indexSql).toContain("x402_payer_hash");
    expect(result.block).toBe("0083_x402_payer_hash");
  });

  it("no captured statement binds a Date instance (DEC-20260504-A bind-encoder shape)", async () => {
    const { runMigration0083_x402PayerHash } = await import("./startup-migrations.js");
    const stub = makeStub({ queue: [{}, {}] });
    await runMigration0083_x402PayerHash(stub);
    for (const query of stub.captured) {
      const chunks = (query as unknown as { queryChunks?: unknown[] }).queryChunks ?? [];
      const badChunks = chunks.filter((c) => c instanceof Date || Buffer.isBuffer(c));
      expect(badChunks, "no Date/Buffer chunk reaches the SQL bind layer").toEqual([]);
    }
  });
});

describe("startup-migrations — block 0082 (reclassify throttled free_unlimited)", () => {
  it("first run: single VALUES-CTE UPDATE reclassifies all 19 target slugs", async () => {
    // Single VALUES-CTE UPDATE (same shape as Block 0072) — one round
    // trip for all 19 rows, each with its own quota_cap.
    const stub = makeStub({ queue: [{ count: 19 }] });
    const result = await runMigration0082_reclassifyThrottledFreeUnlimited(stub);
    expect(result.rows_affected).toBe(19);
    expect(result.outcome).toMatch(/reclassified 19 cap/i);
    expect(stub.captured).toHaveLength(1);

    const sqlText = stub.renderedSql[0].toLowerCase();
    expect(sqlText).toContain("update capabilities");
    expect(sqlText).toContain("cost_class = 'free_quota'");
    expect(sqlText).toContain("quota_window = 'daily'");
    // Reclassification, not first-time classification: the safety filter
    // targets the prior (wrong) value, not IS NULL.
    expect(sqlText).toContain("c.cost_class = 'free_unlimited'");
    expect(sqlText).not.toContain("cost_class is null");
    // Per-cap params: VALUES clause must include each (slug, quota_cap) tuple.
    const { PHASE_C1_THROTTLED_UPSTREAM_RECLASSIFY } = await import("./startup-migrations.js");
    expect(PHASE_C1_THROTTLED_UPSTREAM_RECLASSIFY.length).toBe(19);
    for (const cap of PHASE_C1_THROTTLED_UPSTREAM_RECLASSIFY) {
      expect(sqlText).toContain(`'${cap.slug}'`);
      expect(sqlText).toMatch(new RegExp(`'${cap.slug}',\\s*${cap.quotaCap}\\b`));
    }
  });

  it("second run: idempotent — count=0 once reclassified", async () => {
    const stub = makeStub({ queue: [{ count: 0 }] });
    const result = await runMigration0082_reclassifyThrottledFreeUnlimited(stub);
    expect(result.rows_affected).toBe(0);
    expect(result.outcome).toMatch(/no rows to reclassify/i);
  });

  it("does not touch a cap already moved off free_unlimited by an operator", async () => {
    // Pins the safety clause: Block 0082 must only correct rows still
    // sitting at the (wrong) free_unlimited value, never overwrite a
    // manual reclassification an operator made in between deploys.
    const stub = makeStub({ queue: [{ count: 0 }] });
    await runMigration0082_reclassifyThrottledFreeUnlimited(stub);
    expect(stub.renderedSql[0].toLowerCase()).toMatch(/where[\s\S]*c\.cost_class\s*=\s*'free_unlimited'/);
  });

  it("no captured UPDATE binds a Date instance (DEC-20260504-A bind-encoder shape)", async () => {
    // Per the Audit-Follow-up Test Coverage Protocol: walk every SQL
    // tag's queryChunks and confirm no raw Date/Buffer reaches the
    // bind layer — the PR #43 incident class (postgres-js's encoder
    // cannot serialize a raw Date interpolated via sql``). Block 0082
    // inlines its slug/quota_cap values via sql.raw (same as Block
    // 0071/0072/0074's IN-list/VALUES UPDATEs) rather than binding them
    // as $-placeholders, so there are no interpolated chunks at all to
    // go wrong — this pins that shape. Mirrors the walker in
    // db-retention.test.ts / do.spend-cap.test.ts.
    const stub = makeStub({ queue: [{ count: 19 }] });
    await runMigration0082_reclassifyThrottledFreeUnlimited(stub);
    for (const query of stub.captured) {
      const chunks = (query as unknown as { queryChunks?: unknown[] }).queryChunks ?? [];
      const badChunks = chunks.filter((c) => c instanceof Date || Buffer.isBuffer(c));
      expect(badChunks, "no Date/Buffer chunk reaches the SQL bind layer").toEqual([]);
    }
  });
});

describe("startup-migrations — PHASE_C1_THROTTLED_UPSTREAM_RECLASSIFY (invariants)", () => {
  it("has exactly 19 entries", async () => {
    const { PHASE_C1_THROTTLED_UPSTREAM_RECLASSIFY } = await import("./startup-migrations.js");
    expect(PHASE_C1_THROTTLED_UPSTREAM_RECLASSIFY.length).toBe(19);
  });

  it("every entry has a positive integer quota_cap", async () => {
    const { PHASE_C1_THROTTLED_UPSTREAM_RECLASSIFY } = await import("./startup-migrations.js");
    for (const cap of PHASE_C1_THROTTLED_UPSTREAM_RECLASSIFY) {
      expect(cap.slug.length, `${cap.slug} has a slug`).toBeGreaterThan(0);
      expect(Number.isInteger(cap.quotaCap), `${cap.slug} quota_cap is an integer`).toBe(true);
      expect(cap.quotaCap, `${cap.slug} quota_cap is positive`).toBeGreaterThan(0);
    }
  });

  it("has no duplicate slugs", async () => {
    const { PHASE_C1_THROTTLED_UPSTREAM_RECLASSIFY } = await import("./startup-migrations.js");
    const slugs = PHASE_C1_THROTTLED_UPSTREAM_RECLASSIFY.map((c: { slug: string }) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("does not overlap any prior B1-B5 classification batch", async () => {
    // These slugs were previously classified free_unlimited by Block 0071
    // (or, in principle, could collide with a later batch) — this test
    // pins that Block 0082's target list is disjoint from every
    // first-time-classification batch, since it's a correction, not a
    // parallel classification path.
    const {
      PHASE_C1_THROTTLED_UPSTREAM_RECLASSIFY,
      PHASE_B2_FREE_QUOTA_HIGH_CONF,
      PHASE_B2_FREE_UNLIMITED_MEDIUM_CONF,
      PHASE_B4_FREE_QUOTA_LOW_CONF_CAPS,
      PHASE_B5_NON_ANTHROPIC_PAID_PREPAID_SLUGS,
      PHASE_B5_FREE_QUOTA_OVERRIDE_CAPS,
    } = await import("./startup-migrations.js");
    const { PHASE_B3_ANTHROPIC_PAID_PREPAID_SLUGS } = await import("./phase-b3-anthropic-paid-prepaid-slugs.js");

    const others = new Set<string>([
      ...PHASE_B2_FREE_QUOTA_HIGH_CONF.map((c: { slug: string }) => c.slug),
      ...PHASE_B2_FREE_UNLIMITED_MEDIUM_CONF,
      ...PHASE_B4_FREE_QUOTA_LOW_CONF_CAPS.map((c: { slug: string }) => c.slug),
      ...PHASE_B5_NON_ANTHROPIC_PAID_PREPAID_SLUGS,
      ...PHASE_B5_FREE_QUOTA_OVERRIDE_CAPS.map((c: { slug: string }) => c.slug),
      ...PHASE_B3_ANTHROPIC_PAID_PREPAID_SLUGS,
    ]);
    for (const cap of PHASE_C1_THROTTLED_UPSTREAM_RECLASSIFY) {
      expect(others.has(cap.slug), `${cap.slug} unexpectedly also in an earlier batch`).toBe(false);
    }
  });

  it("pins the Etherscan family at the vendor's documented 100,000/day literal", async () => {
    const { PHASE_C1_THROTTLED_UPSTREAM_RECLASSIFY } = await import("./startup-migrations.js");
    const byslug = Object.fromEntries(
      PHASE_C1_THROTTLED_UPSTREAM_RECLASSIFY.map((c: { slug: string; quotaCap: number }) => [c.slug, c.quotaCap]),
    );
    for (const slug of [
      "contract-verify-check",
      "gas-price-check",
      "wallet-age-check",
      "wallet-balance-lookup",
      "wallet-transactions-lookup",
    ]) {
      expect(byslug[slug], slug).toBe(100000);
    }
  });

  // ── Follow-up (2026-08-14, same day): derive-from-shared-function ────────
  // refactor. quotaCap used to be 19 hand-computed integers; it's now
  // computed via deriveQuotaCapFromRateLimit from a {value, unit,
  // source_url} citation per cap (PHASE_C1_THROTTLED_UPSTREAM_SOURCE).
  // These tests pin that the refactor is value-preserving and that the
  // migration's embedded citations don't drift from the corresponding
  // manifest's own known_rate_limit field.

  it("every quotaCap equals deriveQuotaCapFromRateLimit(rateLimit) — no hand-computed drift", async () => {
    const { PHASE_C1_THROTTLED_UPSTREAM_RECLASSIFY, PHASE_C1_THROTTLED_UPSTREAM_SOURCE } = await import(
      "./startup-migrations.js"
    );
    const { deriveQuotaCapFromRateLimit } = await import("./capability-manifest-types.js");
    const bySlug = Object.fromEntries(
      PHASE_C1_THROTTLED_UPSTREAM_RECLASSIFY.map((c: { slug: string; quotaCap: number }) => [c.slug, c.quotaCap]),
    );
    for (const source of PHASE_C1_THROTTLED_UPSTREAM_SOURCE as ReadonlyArray<{
      slug: string;
      rateLimit: { value: number; unit: "per_second" | "per_minute" | "per_day"; source_url: string };
    }>) {
      expect(bySlug[source.slug], source.slug).toBe(deriveQuotaCapFromRateLimit(source.rateLimit));
    }
  });

  it("every PHASE_C1_THROTTLED_UPSTREAM_SOURCE entry has a well-formed rateLimit citation", async () => {
    const { PHASE_C1_THROTTLED_UPSTREAM_SOURCE } = await import("./startup-migrations.js");
    for (const source of PHASE_C1_THROTTLED_UPSTREAM_SOURCE as ReadonlyArray<{
      slug: string;
      rateLimit: { value: number; unit: string; source_url: string };
    }>) {
      expect(source.rateLimit.value, `${source.slug} value`).toBeGreaterThan(0);
      expect(["per_second", "per_minute", "per_day"], `${source.slug} unit`).toContain(source.rateLimit.unit);
      expect(source.rateLimit.source_url, `${source.slug} source_url`).toMatch(/^https?:\/\//);
    }
  });

  it("each reclassified capability's manifest known_rate_limit matches this migration's citation exactly", async () => {
    // Cross-file drift guard: the manifest is the authoring surface
    // (check-cost-class-coherence.mjs enforces it against cost_class/
    // quota_cap at CI time), this migration is what actually writes the
    // DB row — the two must cite the identical vendor fact. Reading the
    // manifests directly (not importing capability-manifest-types.ts's
    // YAML loader, which doesn't exist) mirrors how the CI lint reads
    // them.
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const yaml = (await import("js-yaml")).default;
    const { PHASE_C1_THROTTLED_UPSTREAM_SOURCE } = await import("./startup-migrations.js");
    const manifestsDir = resolve(import.meta.dirname, "../../../../manifests");

    for (const source of PHASE_C1_THROTTLED_UPSTREAM_SOURCE as ReadonlyArray<{
      slug: string;
      rateLimit: { value: number; unit: string; source_url: string };
    }>) {
      const manifestPath = resolve(manifestsDir, `${source.slug}.yaml`);
      const manifest = yaml.load(readFileSync(manifestPath, "utf8")) as {
        known_rate_limit?: { value: number; unit: string; source_url: string };
      };
      expect(manifest.known_rate_limit, `${source.slug} manifest has known_rate_limit`).toBeDefined();
      expect(manifest.known_rate_limit?.value, `${source.slug} value`).toBe(source.rateLimit.value);
      expect(manifest.known_rate_limit?.unit, `${source.slug} unit`).toBe(source.rateLimit.unit);
      expect(manifest.known_rate_limit?.source_url, `${source.slug} source_url`).toBe(source.rateLimit.source_url);
    }
  });
});

describe("startup-migrations — block 0078 (transactions capability_id index)", () => {
  it("emits CREATE INDEX IF NOT EXISTS for the compound index", async () => {
    const stub = makeStub({ queue: [undefined] });
    const result = await runMigration0078_transactionsCapabilityIdCreatedAtIdx(stub);
    expect(result.outcome).toMatch(/compound index ensured/i);
    expect(stub.captured).toHaveLength(1);

    const sqlText = stub.renderedSql[0].toLowerCase();
    expect(sqlText).toContain("create index if not exists");
    expect(sqlText).toContain("transactions_capability_id_created_at_idx");
    expect(sqlText).toContain("transactions");
    expect(sqlText).toContain("capability_id");
    expect(sqlText).toContain("created_at");
  });

  it("idempotent re-run: IF NOT EXISTS makes re-runs a Postgres-level no-op", async () => {
    const stub = makeStub({ queue: [undefined, undefined] });
    await runMigration0078_transactionsCapabilityIdCreatedAtIdx(stub);
    const result = await runMigration0078_transactionsCapabilityIdCreatedAtIdx(stub);
    expect(result.outcome).toMatch(/compound index ensured/i);
    // Both runs issue the IF NOT EXISTS statement; PG handles the actual no-op.
    expect(stub.captured).toHaveLength(2);
    for (const sqlText of stub.renderedSql) {
      expect(sqlText.toLowerCase()).toContain("create index if not exists");
    }
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
    // Order of execute() calls across all blocks until the throw
    // (0028 retired with the SQS engine — DEC-20260503-B):
    //   0029: information_schema → cnt:"1" (skip)              [1]
    //   0030: information_schema → cnt:"1" (skip)              [2]
    //   0031: CREATE INDEX IF NOT EXISTS                       [3]
    //   0060: ADD COLUMN IF NOT EXISTS marketplace_eligible    [4]
    //   0060: ADD COLUMN IF NOT EXISTS marketplace_eligible_…  [5]
    //   0062: UPDATE dilisense → {count: 0}                    [6]
    //   0062: UPDATE risk-narrative-generate → {count: 0}      [7]
    //   0062: SELECT remaining_zero → 1 → THROWS               [8]
    const queue: unknown[] = [
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

describe("startup-migrations — block 0089 (deactivate us-court-search)", () => {
  it("takes the capability off every surface, not just x402", async () => {
    // The defect this executes against: DQ-4 recorded us-court-search as
    // switched off on 2026-08-15, but only x402_enabled was cleared. Verified
    // on production 2026-08-17 — still is_active, still visible, still on
    // /v1/capabilities at EUR 0.15, returning HTTP 500 to every caller because
    // CourtListener rejects the token with 403.
    const { runMigration0089_deactivateUsCourtSearch } = await import("./startup-migrations.js");
    const stub = makeStub({ queue: [{ count: 1 }] });
    const result = await runMigration0089_deactivateUsCourtSearch(stub);

    const rendered = stub.renderedSql[0].toLowerCase();
    expect(rendered).toContain("update capabilities");
    expect(rendered).toContain("is_active = false");
    expect(rendered).toContain("visible = false");
    expect(rendered).toContain("x402_enabled = false");
    expect(rendered).toContain("us-court-search");
    expect(result.rows_affected).toBe(1);
    expect(result.block).toBe("0089_deactivateUsCourtSearch");
  });

  it("is idempotent — the WHERE clause makes a re-run a no-op", async () => {
    const { runMigration0089_deactivateUsCourtSearch } = await import("./startup-migrations.js");
    const stub = makeStub({ queue: [{ count: 0 }] });
    const result = await runMigration0089_deactivateUsCourtSearch(stub);

    // Guards both re-running on an already-deactivated row AND re-deactivating
    // a capability an operator has since deliberately switched back on.
    expect(stub.renderedSql[0].toLowerCase()).toContain("is_active = true");
    expect(result.rows_affected).toBe(0);
    expect(result.outcome).toContain("no change");
  });

  it("records a reversible reason naming the credential to restore", async () => {
    const { runMigration0089_deactivateUsCourtSearch, US_COURT_SEARCH_DEACTIVATION_REASON } =
      await import("./startup-migrations.js");
    const stub = makeStub({ queue: [{ count: 1 }] });
    await runMigration0089_deactivateUsCourtSearch(stub);

    // The reason is bound as a parameter, so it is in the query's params, not
    // in the rendered SQL text — assert on the bound value, not on the string.
    expect(US_COURT_SEARCH_DEACTIVATION_REASON).toContain("COURTLISTENER_API_TOKEN");
    expect(US_COURT_SEARCH_DEACTIVATION_REASON).toContain("DQ-4");
    expect(dialect.sqlToQuery(stub.captured[0]).params).toContain(
      US_COURT_SEARCH_DEACTIVATION_REASON,
    );
  });

  it("no captured statement binds a Date instance (DEC-20260504-A bind-encoder shape)", async () => {
    const { runMigration0089_deactivateUsCourtSearch } = await import("./startup-migrations.js");
    const stub = makeStub({ queue: [{ count: 1 }] });
    await runMigration0089_deactivateUsCourtSearch(stub);
    for (const query of stub.captured) {
      const chunks = (query as unknown as { queryChunks?: unknown[] }).queryChunks ?? [];
      const badChunks = chunks.filter((c) => c instanceof Date || Buffer.isBuffer(c));
      expect(badChunks, "no Date/Buffer chunk reaches the SQL bind layer").toEqual([]);
    }
  });
});

describe("startup-migrations — block 0090 (capability output contracts)", () => {
  it("writes properties, reliability and the two replacement fixtures", async () => {
    const { runMigration0090_capabilityOutputContracts } = await import("./startup-migrations.js");
    const { CORRECTED_SLUGS, CAPABILITY_OUTPUT_CONTRACTS } = await import(
      "./capability-output-contracts.js"
    );
    const withFixture = CORRECTED_SLUGS.filter(
      (s) => CAPABILITY_OUTPUT_CONTRACTS[s]!.knownAnswerInput,
    );
    // 2 statements per slug, plus one more for each replacement fixture.
    const expected = CORRECTED_SLUGS.length * 2 + withFixture.length;
    const stub = makeStub({ default: { count: 1 } });
    const result = await runMigration0090_capabilityOutputContracts(stub);

    expect(stub.captured).toHaveLength(expected);
    expect(result.rows_affected).toBe(expected);

    // Slugs are bound parameters, not SQL text — assert on the binds.
    const boundParams = stub.captured.flatMap((c) => dialect.sqlToQuery(c).params);
    for (const slug of CORRECTED_SLUGS) expect(boundParams).toContain(slug);

    const all = stub.renderedSql.join(" ").toLowerCase();
    // Only `properties` is replaced, so a hand-written `example` survives.
    expect(all).toContain("jsonb_set");
    expect(all).toContain("'{properties}'");
    expect(all).toContain("update test_suites");
    expect(all).toContain("test_type = 'known_answer'");
  });

  it("is idempotent — every statement is guarded by IS DISTINCT FROM", async () => {
    const { runMigration0090_capabilityOutputContracts } = await import("./startup-migrations.js");
    const stub = makeStub({ default: { count: 0 } });
    const result = await runMigration0090_capabilityOutputContracts(stub);

    for (const rendered of stub.renderedSql) {
      expect(rendered.toLowerCase()).toContain("is distinct from");
    }
    expect(result.rows_affected).toBe(0);
    expect(result.outcome).toContain("no change");
  });

  it("no captured statement binds a Date instance (DEC-20260504-A bind-encoder shape)", async () => {
    const { runMigration0090_capabilityOutputContracts } = await import("./startup-migrations.js");
    const stub = makeStub({ default: { count: 1 } });
    await runMigration0090_capabilityOutputContracts(stub);
    for (const query of stub.captured) {
      const chunks = (query as unknown as { queryChunks?: unknown[] }).queryChunks ?? [];
      const badChunks = chunks.filter((c) => c instanceof Date || Buffer.isBuffer(c));
      expect(badChunks, "no Date/Buffer chunk reaches the SQL bind layer").toEqual([]);
    }
  });
});

describe("startup-migrations — block 0091 (stale beneficial-ownership assertions)", () => {
  it("asserts only fields the executor actually returns", async () => {
    const { BOL_DEPENDENCY_HEALTH_CHECKS, BOL_SCHEMA_CHECK_CHECKS } = await import(
      "./startup-migrations.js"
    );
    // Verbatim from production 2026-08-17, input {company_name:"Tesco PLC", jurisdiction:"GB"}.
    const PROD_KEYS = [
      "company_name", "company_number", "jurisdiction", "company_status",
      "beneficial_owners", "total_beneficial_owners", "has_psc_data", "data_source",
    ];
    for (const rules of [BOL_DEPENDENCY_HEALTH_CHECKS, BOL_SCHEMA_CHECK_CHECKS]) {
      for (const c of rules.checks) {
        expect(PROD_KEYS, `asserts a field production does not return: ${c.field}`).toContain(c.field);
      }
    }
    // The four dead names must be gone from both.
    const all = JSON.stringify([BOL_DEPENDENCY_HEALTH_CHECKS, BOL_SCHEMA_CHECK_CHECKS]);
    for (const dead of ["coverage_note", "total_owners", "lookup_date"]) {
      expect(all).not.toContain(dead);
    }
    // ...and the replacements must still assert something real, not nothing.
    expect(BOL_DEPENDENCY_HEALTH_CHECKS.checks.length).toBeGreaterThanOrEqual(3);
    expect(BOL_SCHEMA_CHECK_CHECKS.checks.length).toBeGreaterThanOrEqual(3);
  });

  it("targets only the schema_check suite carrying the dead names", async () => {
    const { runMigration0091_bolStaleValidationRules } = await import("./startup-migrations.js");
    const stub = makeStub({ default: { count: 1 } });
    await runMigration0091_bolStaleValidationRules(stub);
    const [depSql, schemaSql] = stub.renderedSql.map((x) => x.toLowerCase());
    expect(depSql).toContain("test_type = 'dependency_health'");
    expect(schemaSql).toContain("test_type = 'schema_check'");
    // Without this predicate the migration would overwrite the three sibling
    // schema_check suites that assert real fields.
    expect(schemaSql).toContain("coverage_note");
    expect(schemaSql).toContain("like");
  });

  it("is idempotent — both statements guard on IS DISTINCT FROM", async () => {
    const { runMigration0091_bolStaleValidationRules } = await import("./startup-migrations.js");
    const stub = makeStub({ default: { count: 0 } });
    const result = await runMigration0091_bolStaleValidationRules(stub);
    for (const rendered of stub.renderedSql) {
      expect(rendered.toLowerCase()).toContain("is distinct from");
    }
    expect(result.rows_affected).toBe(0);
    expect(result.outcome).toContain("no change");
  });

  it("no captured statement binds a Date instance (DEC-20260504-A bind-encoder shape)", async () => {
    const { runMigration0091_bolStaleValidationRules } = await import("./startup-migrations.js");
    const stub = makeStub({ default: { count: 1 } });
    await runMigration0091_bolStaleValidationRules(stub);
    for (const query of stub.captured) {
      const chunks = (query as unknown as { queryChunks?: unknown[] }).queryChunks ?? [];
      expect(chunks.filter((c) => c instanceof Date || Buffer.isBuffer(c))).toEqual([]);
    }
  });
});

describe("startup-migrations — block 0092 (growth bundles onto the x402 rail)", () => {
  // The defect this executes against: the four bundles created 2026-08-16 under
  // DQ-9 shipped is_active = true (publicly listed) and x402_enabled = false
  // (unpayable). Every euro of external revenue arrives over x402, so they have
  // earned nothing since. Verified 2026-08-18 in the DB, in GET /x402/catalog,
  // and by live probe.
  const freshRun = () => makeStub({ queue: [{ count: 0 }, [], { count: 4 }, { count: 1 }] });

  it("puts exactly the four growth bundles on the rail, and nothing else", async () => {
    const { runMigration0092_x402GrowthBundles, X402_GROWTH_BUNDLE_SLUGS } = await import(
      "./startup-migrations.js"
    );
    const stub = freshRun();
    const result = await runMigration0092_x402GrowthBundles(stub);

    const update = stub.renderedSql.find((s) => /update solutions/i.test(s));
    expect(update, "an UPDATE against solutions is issued on first run").toBeDefined();
    expect(update!.toLowerCase()).toContain("x402_enabled = true");
    // Guarded on is_active so it can never surface a deactivated bundle.
    expect(update!.toLowerCase()).toContain("is_active = true");
    expect(update!.toLowerCase()).toContain("x402_enabled = false");

    // The set is exact: these four and no others. lead-email-verify is already
    // on the rail and must not be touched by this block.
    expect([...X402_GROWTH_BUNDLE_SLUGS].sort()).toEqual([
      "competitor-read",
      "keyword-scout",
      "page-seo-check",
      "prospect-brief",
    ]);
    const updateQuery = dialect.sqlToQuery(stub.captured[2]);
    expect(JSON.stringify(updateQuery.params) + updateQuery.sql).not.toContain(
      "lead-email-verify",
    );
    expect(result.rows_affected).toBe(4);
    expect(result.block).toBe("0092_x402GrowthBundles");
  });

  it("retires itself: once applied, a later boot issues NO update at all", async () => {
    // This is the test that discriminates against the obvious implementation.
    // A block idempotent only by WHERE clause would re-issue the UPDATE on every
    // boot and re-enable a bundle an operator had deliberately switched off —
    // the scheduled_testing_eligible footgun in CLAUDE.md. The ledger check must
    // short-circuit before any write.
    const { runMigration0092_x402GrowthBundles } = await import("./startup-migrations.js");
    const stub = makeStub({
      queue: [{ count: 0 }, [{ block: "0092_x402GrowthBundles" }]],
    });
    const result = await runMigration0092_x402GrowthBundles(stub);

    expect(stub.renderedSql.some((s) => /update solutions/i.test(s))).toBe(false);
    expect(stub.renderedSql.some((s) => /insert into startup_migration_ledger/i.test(s))).toBe(
      false,
    );
    expect(result.rows_affected).toBe(0);
    expect(result.outcome).toContain("no change");
  });

  it("records the ledger row only after the update has succeeded", async () => {
    const { runMigration0092_x402GrowthBundles } = await import("./startup-migrations.js");
    const stub = freshRun();
    await runMigration0092_x402GrowthBundles(stub);

    const updateAt = stub.renderedSql.findIndex((s) => /update solutions/i.test(s));
    const ledgerAt = stub.renderedSql.findIndex((s) =>
      /insert into startup_migration_ledger/i.test(s),
    );
    expect(updateAt).toBeGreaterThanOrEqual(0);
    expect(ledgerAt).toBeGreaterThan(updateAt);
    // A crash between the two is safe: the retry's UPDATE matches nothing.
    expect(stub.renderedSql[ledgerAt].toLowerCase()).toContain("on conflict");
  });

  it("creates its ledger table idempotently before reading it", async () => {
    const { runMigration0092_x402GrowthBundles } = await import("./startup-migrations.js");
    const stub = freshRun();
    await runMigration0092_x402GrowthBundles(stub);
    expect(stub.renderedSql[0].toLowerCase()).toContain(
      "create table if not exists startup_migration_ledger",
    );
    expect(stub.renderedSql[1].toLowerCase()).toContain("select block from startup_migration_ledger");
  });

  it("never renders ANY((...)) — the row-value tuple Postgres rejects", async () => {
    // The bug this pins shipped in this very block and was caught before it
    // reached a booted process. drizzle's sql tag does not serialize a JS array
    // as a Postgres array bind: `slug = ANY(${array})` renders
    // `ANY(($1, $2, $3, $4))`, and Postgres answers "op ANY/ALL (array) requires
    // array on right side". lib/internal-accounts.ts documents the same defect
    // as the root cause of a production outage (4bf58d0), resurfaced three times.
    //
    // Here it is worse than a failed query: runStartupMigrations() throws on the
    // first failing block and index.ts exits the process, so this shape is the
    // difference between a deploy and a crash loop on every boot.
    const { runMigration0092_x402GrowthBundles } = await import("./startup-migrations.js");
    const stub = freshRun();
    await runMigration0092_x402GrowthBundles(stub);

    for (const rendered of stub.renderedSql) {
      expect(
        rendered,
        "a bound JS array must never reach ANY() through drizzle's sql tag",
      ).not.toMatch(/any\s*\(\s*\(/i);
    }
    // ...and the slugs must still each be bound, not string-interpolated.
    const update = stub.renderedSql.find((s) => /update solutions/i.test(s))!;
    expect(update).toMatch(/slug in \(\$\d+(, \$\d+)+\)/i);
    expect(update).not.toContain("competitor-read");
    expect(dialect.sqlToQuery(stub.captured[2]).params).toContain("competitor-read");
  });

  it("no captured statement binds a Date instance (DEC-20260504-A bind-encoder shape)", async () => {
    const { runMigration0092_x402GrowthBundles } = await import("./startup-migrations.js");
    const stub = freshRun();
    await runMigration0092_x402GrowthBundles(stub);
    for (const query of stub.captured) {
      const chunks = (query as unknown as { queryChunks?: unknown[] }).queryChunks ?? [];
      expect(
        chunks.filter((c) => c instanceof Date || Buffer.isBuffer(c)),
        "no Date/Buffer chunk reaches the SQL bind layer",
      ).toEqual([]);
    }
  });
});

/**
 * The 0066/0069 eligibility ping-pong (found 2026-08-21).
 *
 * Both blocks derived `test_suites.scheduled_testing_eligible`, from
 * different sources, on every boot. Where the sources disagreed the flag
 * flipped twice per boot and each block's post-condition still passed,
 * because each checked only its own derivation right after its own write.
 * Both UPDATEs also carried `updated_at = NOW()`, which test-runner.ts
 * reads as "this suite's content was edited" — so a scheduling-flag write
 * invalidated the fixture baseline every deploy, and paid suites (which
 * refuse to re-baseline without a human) were pinned at `passed: false`
 * forever. `eu-regulation-search` scored 51% over 24h that way with no
 * real failure behind it.
 *
 * Each assertion below fails against the pre-fix source: the UPDATEs
 * contained `updated_at = NOW()` and 0066 was unscoped.
 */
describe("startup-migrations — eligibility reconcile is not a content edit", () => {
  it("0066 does not stamp updated_at (a scheduling flag is not an edit)", async () => {
    const stub = makeStub({ queue: [undefined, { count: 0 }, [{ mismatched: 0 }]] });
    await runMigration0066_ensureEligibilityColumnAndReconcile(stub);
    const update = stub.renderedSql[1].toLowerCase();
    expect(update).toContain("scheduled_testing_eligible");
    expect(update).not.toContain("updated_at");
  });

  it("0069 does not stamp updated_at either", async () => {
    const stub = makeStub({ queue: [{ count: 0 }, [{ mismatched: 0 }]] });
    await runMigration0069_reconcileEligibilityFromCostClass(stub);
    const update = stub.renderedSql[0].toLowerCase();
    expect(update).toContain("scheduled_testing_eligible");
    expect(update).not.toContain("updated_at");
  });

  it("0066 claims only capabilities 0069 does not — UPDATE and post-check alike", async () => {
    const stub = makeStub({ queue: [undefined, { count: 0 }, [{ mismatched: 0 }]] });
    await runMigration0066_ensureEligibilityColumnAndReconcile(stub);
    // Both the write and the fail-boot assertion must carry the same
    // exclusion, or boot breaks the moment 0069 legitimately disagrees.
    for (const rendered of [stub.renderedSql[1], stub.renderedSql[2]]) {
      const q = rendered.toLowerCase().replace(/\s+/g, " ");
      expect(q).toContain("not exists");
      expect(q).toContain("cost_class is not null");
    }
  });
});

describe("startup-migrations — block 0094 (clear churn-invalidated baselines)", () => {
  it("clears only paid fixture baselines owned by a free-classified capability", async () => {
    const stub = makeStub({ queue: [{ count: 2 }] });
    const result = await runMigration0094_clearChurnInvalidatedBaselines(stub);
    expect(result.rows_affected).toBe(2);
    expect(result.outcome).toMatch(/cleared 2 baseline/i);
    const q = stub.renderedSql[0].toLowerCase().replace(/\s+/g, " ");
    expect(q).toContain("baseline_output = null");
    expect(q).toContain("baseline_captured_at = null");
    // Scope: paid-to-run fixture suites whose baseline predates the write...
    expect(q).toContain("ts.external_cost_cents > 0");
    expect(q).toContain("ts.test_mode = 'fixture'");
    expect(q).toContain("ts.baseline_captured_at < ts.updated_at");
    // ...and only where the capability is one 0069 calls free, which is
    // exactly the set the ping-pong could reach. Genuine paid-vendor
    // suites stay human-gated.
    expect(q).toContain("free_unlimited");
    expect(q).toContain("paid_with_free_tier");
  });

  it("is idempotent: requires a non-null baseline, so a recaptured suite is not re-cleared", async () => {
    const stub = makeStub({ queue: [{ count: 0 }] });
    const result = await runMigration0094_clearChurnInvalidatedBaselines(stub);
    expect(result.rows_affected).toBe(0);
    expect(result.outcome).toMatch(/no churn-invalidated baselines remain/i);
    const q = stub.renderedSql[0].toLowerCase().replace(/\s+/g, " ");
    expect(q).toContain("ts.baseline_output is not null");
  });
});

describe("startup-migrations — block 0100 (re-list url-to-markdown)", () => {
  /**
   * The 2026-08-22 quality-floor quarantine of `url-to-markdown` counted five
   * failures, none of them a defect in the capability. This block reverses it.
   *
   * What each test protects, stated because the failure modes are asymmetric:
   * a listing change without its evidence leaves the floor's window clamp and
   * the promotion job reading a stale takedown, and a re-listing that fires on
   * every boot would silently undo a LATER, legitimate quarantine.
   */
  const applied = () => [{ block: "0100_relistUrlToMarkdown" }] as unknown[];

  it("flips both flags and writes the promotion event together", async () => {
    const stub = makeStub({ queue: [{}, [], { count: 1 }, {}, {}] });
    const result = await runMigration0100_relistUrlToMarkdown(stub);
    const joined = stub.renderedSql.join(" | ").toLowerCase();
    expect(joined).toMatch(/set\s+visible = true/);
    expect(joined).toMatch(/x402_enabled = true/);
    expect(joined).toContain("insert into health_monitor_events");
    expect(joined).toContain("capability_promotion");
    expect(result.rows_affected).toBe(1);
  });

  it("writes the event in the shape the floor clamp and promotion job read", async () => {
    // jobs/quality-floor.ts clamps its window on
    //   action_taken LIKE 'promoted%' AND details->>'mode' = 'enforce'
    // and jobs/capability-promotion.ts treats any other last listing event as
    // an un-reversed takedown. An event that misses either field is invisible
    // to both, and the next tick re-quarantines on the same July rows.
    const stub = makeStub({ queue: [{}, [], { count: 1 }, {}, {}] });
    await runMigration0100_relistUrlToMarkdown(stub);
    const insert = stub.renderedSql.find((q) => /insert into health_monitor_events/i.test(q));
    expect(insert).toBeDefined();
    expect(insert!).toContain("promoted_with_x402");
    // The details payload is a bound parameter, not rendered SQL, so it has to
    // be read off the captured chunks. Parsed rather than substring-matched:
    // the assertion is about the VALUE the clamp reads, not about formatting.
    const boundStrings = stub.captured
      .flatMap((c) => ((c as { queryChunks?: unknown[] }).queryChunks ?? []) as unknown[])
      .filter((v): v is string => typeof v === "string");
    const details = boundStrings
      .map((v) => {
        try {
          return JSON.parse(v) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .find((v) => v !== null && typeof v === "object");
    expect(details, "the promotion event must bind a details payload").toBeTruthy();
    expect(details!.mode).toBe("enforce");
  });

  it("does not claim a promotion that did not happen", async () => {
    // UPDATE matched nothing (already listed) → no event. An event asserting a
    // listing change that never occurred is the same lie as a quarantine
    // without its evidence, and both consumers would read it as fact.
    const stub = makeStub({ queue: [{}, [], { count: 0 }, {}] });
    const result = await runMigration0100_relistUrlToMarkdown(stub);
    expect(result.rows_affected).toBe(0);
    expect(stub.renderedSql.join(" | ")).not.toMatch(/insert into health_monitor_events/i);
    expect(result.outcome).toMatch(/no change/);
  });

  it("never fires twice — a later quarantine is not undone on the next deploy", async () => {
    const stub = makeStub({ queue: [{}, applied()] });
    const result = await runMigration0100_relistUrlToMarkdown(stub);
    expect(result.rows_affected).toBe(0);
    const joined = stub.renderedSql.join(" | ").toLowerCase();
    expect(joined).not.toMatch(/update capabilities/);
    expect(joined).not.toMatch(/insert into health_monitor_events/);
    expect(result.outcome).toMatch(/already applied/);
  });

  it("cannot produce the half-quarantine state the WP8 constraint forbids", async () => {
    // capabilities_no_half_quarantine is CHECK (NOT (is_active AND NOT visible
    // AND x402_enabled)). Setting x402_enabled without visible in the same
    // statement would abort the UPDATE, and a throwing block aborts boot.
    const stub = makeStub({ queue: [{}, [], { count: 1 }, {}, {}] });
    await runMigration0100_relistUrlToMarkdown(stub);
    const update = stub.renderedSql.find((q) => /update capabilities/i.test(q));
    expect(update).toBeDefined();
    const setClause = update!.slice(update!.toLowerCase().indexOf("set"));
    expect(/visible = true/i.test(setClause) && /x402_enabled = true/i.test(setClause)).toBe(true);
  });
});

describe("startup-migrations — block identity is unique, not just the function name", () => {
  /**
   * Block 0100 (url-to-markdown re-listing) landed on main while WP9 was open,
   * and WP9's block was originally numbered 0100 too. Renaming the function is
   * the visible half of fixing that; the half that matters is the LEDGER ID,
   * because `startup_migration_ledger.block` is a primary key and it is what
   * tells a one-shot block it has already fired. Two blocks sharing an id means
   * whichever runs second reads the other's row and skips its own work forever.
   */
  const BLOCK_ID_RE = /const BLOCK = "([^"]+)"/g;

  it("no two blocks share a ledger id", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(import.meta.dirname, "startup-migrations.ts"), "utf8");
    const ids = [...src.matchAll(BLOCK_ID_RE)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ids).size, `duplicate ledger ids: ${ids.join(", ")}`).toBe(ids.length);
  });

  it("no two blocks share a BlockResult label either", async () => {
    // The label is what the deploy log and the admin endpoint report. Distinct
    // ledger ids with duplicate labels would make the log ambiguous about which
    // migration ran, which is the same failure one layer out.
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(import.meta.dirname, "startup-migrations.ts"), "utf8");
    // Resolved, not just literal. Four return sites write `block: BLOCK,` where
    // BLOCK is a const -- and one of those four is
    // runMigration0100_relistUrlToMarkdown, the exact block the collision was
    // about. A literals-only regex could not see it, so the invariant was
    // decorative for precisely the case its docstring names. Ninth hollow
    // assertion in this program; this one was decorative from birth rather than
    // broken by a later edit.
    const labels = [...src.matchAll(/^\s*block: "([^"]+)",$/gm)].map((m) => m[1]);
    const constLabels = [...src.matchAll(/const BLOCK = "([^"]+)"/g)].map((m) => m[1]);
    labels.push(...constLabels);
    expect(constLabels.length, "block: BLOCK return sites must be resolvable")
      .toBeGreaterThanOrEqual(2);
    expect(labels).toContain("0100_relistUrlToMarkdown");
    // And every ledger lookup must match its own id EXACTLY. A predicate that
    // loosened to a prefix would make 0101 read main's 0100 row and conclude it
    // had already run -- the ledger collision, arriving through the query
    // instead of through the id. Production's ledger holds 0100 today, so this
    // is not hypothetical.
    const lookups = [...src.matchAll(/FROM startup_migration_ledger WHERE block = \$\{BLOCK\}/g)];
    const anyLedgerRead = [...src.matchAll(/FROM startup_migration_ledger WHERE /g)];
    expect(lookups.length).toBe(anyLedgerRead.length);
    expect(lookups.length).toBeGreaterThanOrEqual(2);
    expect(labels.length).toBeGreaterThanOrEqual(10);
    // Grouped by NUMBER, not deduped outright: several blocks legitimately
    // return the same label from more than one path (an early skip and a
    // completed run), and 0029/0030 do exactly that. The invariant that matters
    // is that one number never names two different migrations -- which is the
    // collision this describe exists for, arriving as a label rather than a
    // function name.
    const byNumber = new Map<string, Set<string>>();
    for (const label of labels) {
      const n = /^(\d+)_/.exec(label)?.[1];
      if (!n) continue;
      if (!byNumber.has(n)) byNumber.set(n, new Set());
      byNumber.get(n)!.add(label);
    }
    const collisions = [...byNumber.entries()]
      .filter(([, set]) => set.size > 1)
      .map(([n, set]) => `${n}: ${[...set].join(" vs ")}`);
    expect(collisions, `one block number naming two migrations: ${collisions.join("; ")}`).toEqual([]);
  });

  it("every registered block function has a distinct number prefix", () => {
    // The number IS the audit key. Two blocks numbered 0100 make it useless
    // even if their names and ledger ids differ.
    const numbers = BLOCKS.map((fn) => /runMigration(\d+)_/.exec(fn.name)?.[1] ?? fn.name);
    const dupes = numbers.filter((n, i) => numbers.indexOf(n) !== i);
    expect(dupes, `duplicate block numbers: ${dupes.join(", ")}`).toEqual([]);
  });

  it("block numbers only ever increase", () => {
    // A new block taking a number below the highest already registered is the
    // collision this whole describe exists for, arriving from the other side.
    const numbers = BLOCKS.map((fn) => Number(/runMigration(\d+)_/.exec(fn.name)?.[1] ?? "0"));
    const sorted = [...numbers].sort((a, b) => a - b);
    expect(numbers).toEqual(sorted);
    expect(Math.max(...numbers)).toBe(104);
  });
});

describe("startup-migrations — block 0101 runs its one-shot work exactly once", () => {
  /**
   * The DDL is idempotent by construction (CREATE IF NOT EXISTS, trigger created
   * only when absent), so re-running it is a no-op. The part that is NOT safe to
   * repeat is the purge of rows written while the table had no trigger, which is
   * a DELETE. It is gated on the ledger so it can only ever fire on a genuine
   * first install -- otherwise dropping the trigger for maintenance and
   * rebooting would destroy live data.
   */
  it("purges the unprotected era on first install, and never again", async () => {
    // First install: ledger empty, trigger absent, three stray rows.
    const first = makeStub({
      queue: [
        {},            // ensure ledger table
        [],            // ledger SELECT -> no prior run
        {},            // create table
        {}, {}, {},    // three indexes
        {},            // create-or-replace function
        [{ n: 0 }],    // hasImmutableTrigger -> absent
        [{ n: 3 }],    // bounded probe -> 3 stray rows
        { count: 3 },  // DELETE
        {},            // create trigger
        [{ n: 1 }],    // hasImmutableTrigger -> present
        {},            // ledger INSERT
      ],
    });
    const r1 = await runMigration0101_capabilityInvocations(first);
    expect(r1.outcome).toContain("verified");
    expect(r1.outcome).toContain("discarded 3");
    expect(first.renderedSql.join(" | ").toLowerCase()).toContain(
      'delete from "capability_invocations"',
    );

    // Second boot: the ledger already has the row. Even with the trigger somehow
    // absent, nothing is deleted.
    const second = makeStub({
      queue: [
        {},                                   // ensure ledger table
        [{ block: "0101_capability_invocations" }], // prior run recorded
        {},                                   // create table
        {}, {}, {},                           // indexes
        {},                                   // function
        {},                                   // create trigger
        [{ n: 1 }],                           // verification
        {},                                   // ledger INSERT (no-op)
      ],
    });
    const r2 = await runMigration0101_capabilityInvocations(second);
    expect(r2.outcome).toContain("verified");
    expect(r2.outcome).not.toContain("discarded");
    expect(second.renderedSql.join(" | ").toLowerCase()).not.toContain(
      'delete from "capability_invocations"',
    );
  });

  it("refuses rather than bulk-deleting when the unprotected backlog is large", async () => {
    // An unbounded DELETE at boot on a table holding ~6k rows a day is a bulk
    // operation, and DEC-20260504-B says those get a plan and an operator, not a
    // boot path. Refusing defers the block, which leaves the floor on billing
    // rows -- its pre-WP9 behaviour -- and destroys nothing.
    const stub = makeStub({
      queue: [
        {}, [], {}, {}, {}, {}, {},
        [{ n: 0 }],       // trigger absent
        [{ n: 10001 }],   // probe exceeds the ceiling
      ],
    });
    const result = await runMigration0101_capabilityInvocations(stub);
    expect(result.outcome).toContain("deferred to next boot");
    expect(result.outcome).toContain("UNPROTECTED-BACKLOG");
    expect(stub.renderedSql.join(" | ").toLowerCase()).not.toContain(
      'delete from "capability_invocations"',
    );
  });

  it("does not record itself as applied when it fails partway", async () => {
    // A block that failed halfway must not write its ledger row, or the next
    // boot skips the purge gate and the unprotected era becomes permanent.
    const stub = makeStub({
      queue: [
        {}, [], {}, {}, {}, {}, {},
        [{ n: 0 }],   // trigger absent
        [{ n: 0 }],   // nothing to purge
        {},           // create trigger
        [{ n: 0 }],   // verification FAILS -- trigger still absent
      ],
    });
    const result = await runMigration0101_capabilityInvocations(stub);
    expect(result.outcome).toContain("deferred to next boot");
    expect(result.outcome).toContain("UNPROTECTED");
    expect(stub.renderedSql.join(" | ").toLowerCase()).not.toContain(
      "insert into startup_migration_ledger",
    );
  });

  it("writes its ledger row after the verification, not before it", async () => {
    // Order is the whole property. The stub test above only proves the INSERT is
    // absent on the failure path it exercises; if the INSERT moved above the
    // verification it would be absent there too, for the wrong reason, and every
    // future boot would skip the purge gate with the unprotected era intact.
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(import.meta.dirname, "startup-migrations.ts"), "utf8");
    const block = src.slice(
      src.indexOf("export async function runMigration0101_capabilityInvocations"),
      src.indexOf("export const BLOCKS"),
    );
    const verify = block.indexOf("if (triggerCount !== 1)");
    const ledger = block.indexOf("INSERT INTO startup_migration_ledger");
    expect(verify).toBeGreaterThan(-1);
    expect(ledger).toBeGreaterThan(-1);
    expect(ledger, "the ledger row must be written after the trigger is verified")
      .toBeGreaterThan(verify);
  });
});
