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

describe("startup-migrations — BLOCKS list (canonical block set)", () => {
  it("exports the expected 23 blocks in historical order", () => {
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
    ]);
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
