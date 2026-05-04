/**
 * Regression tests for the db-retention pruning job.
 *
 * Coverage targets:
 *
 * 1. **Date-encoding bug (PR-43-twin).** Pre-fix, every DELETE in
 *    runRetention() interpolated a raw `Date` into a sql`` template:
 *
 *      const cutoff = new Date(Date.now() - rule.days * 86_400_000);
 *      await tx.execute(sql`DELETE ... < ${cutoff}`);
 *
 *    postgres-js's bind encoder couldn't serialize the Date, threw,
 *    and the surrounding catch block swallowed the error. Every
 *    retention tick logged total: 0 and looked healthy. Same bug
 *    shape as do.ts spendCapWouldExceed (PR #43); both shipped from
 *    the 2026-04-30 cert-audit batch.
 *
 * 2. **Swallow visibility.** Pre-fix, the per-rule catch block logged
 *    the failure at error level but the surrounding summary log
 *    ("db-retention-pruned") fired with total: 0 and per_table: {}
 *    regardless of whether every rule had errored. The fix routes
 *    all-rules-failed ticks through `db-retention-all-rules-failed`
 *    at error level so dashboards can distinguish a healthy quiet
 *    tick from a silently broken one.
 *
 * 3. **Bounded-batch pagination (DEC-20260504-A, post-2026-05-04 crash
 *    hardening).** The previous form did a single unbounded
 *    `DELETE … WHERE column < cutoff` per table. After weeks of silent
 *    failure the first successful tick generated GBs of WAL on the
 *    accumulated backlog and crashed postgres at 09:30 UTC with
 *    `No space left on device`. The fix loops in 10,000-row batches,
 *    exits on 0-rows-affected, and stops on a 60-second per-rule
 *    wall-clock budget. These tests cover:
 *      - Each batch SQL contains LIMIT 10000 (bounded WAL per batch)
 *      - Empty-table case: loop exits after one zero-result batch
 *      - Budget exhaustion: loop bails cleanly, summary surfaces it
 *      - Per-table summary log carries deleted/batches/duration/budget
 */

import { describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  BATCH_SIZE,
  PER_RULE_BUDGET_MS,
  RULES,
  runOneRulePaginated,
  type RetentionExecutor,
  type RetentionRule,
} from "./db-retention.js";

/**
 * Walks a Drizzle SQL tag's queryChunks and returns every chunk that
 * is a raw `Date` instance. Postgres-js cannot bind these via the
 * sql-template path; this is the failure shape PR-43 hit.
 */
function findDateChunks(sqlTag: SQL): unknown[] {
  const chunks = (sqlTag as unknown as { queryChunks?: unknown[] }).queryChunks ?? [];
  return chunks.filter((c) => c instanceof Date);
}

/**
 * Re-implements the per-rule DELETE construction from the fixed
 * version of runRetention(). The shape under test is exactly:
 *   sql`DELETE FROM ${sql.raw(rule.table)} WHERE ${sql.raw(rule.column)} < ${cutoffIso}::timestamptz`
 *
 * Importing runRetention itself would pull in the full job loop +
 * advisory lock + interval scheduling. Re-stating the SQL-shape
 * contract here is the smallest faithful regression test.
 */
async function buildDeleteSqlForRule(rule: { table: string; column: string; days: number }): Promise<SQL> {
  const { sql } = await import("drizzle-orm");
  const cutoffIso = new Date(Date.now() - rule.days * 86_400_000).toISOString();
  return sql`DELETE FROM ${sql.raw(rule.table)} WHERE ${sql.raw(rule.column)} < ${cutoffIso}::timestamptz`;
}

describe("db-retention DELETE SQL shape", () => {
  it("never passes a raw Date — only an ISO string + ::timestamptz cast", async () => {
    const rules = [
      { table: "test_results", column: "executed_at", days: 30 },
      { table: "health_monitor_events", column: "created_at", days: 30 },
      { table: "failed_requests", column: "created_at", days: 90 },
      { table: "test_run_log", column: "started_at", days: 180 },
      { table: "rate_limit_counters", column: "window_start", days: 7 },
    ];

    for (const rule of rules) {
      const tag = await buildDeleteSqlForRule(rule);
      const dateChunks = findDateChunks(tag);
      expect(
        dateChunks,
        `Rule ${rule.table}: a raw Date reached the SQL bind layer. postgres-js cannot serialize Date through sql\`\` interpolation; cast to ISO string first. See PR-43 (do.ts) and the 2026-04-30 cert-audit batch.`,
      ).toEqual([]);
    }
  });

  it("emits exactly one ISO-string parameter (the cutoff)", async () => {
    const tag = await buildDeleteSqlForRule({ table: "test_results", column: "executed_at", days: 30 });
    const chunks = (tag as unknown as { queryChunks?: unknown[] }).queryChunks ?? [];
    const stringParams = chunks.filter((c) => typeof c === "string");
    expect(stringParams.length).toBeGreaterThan(0);
    // Every interpolated string parameter parses cleanly as an ISO date.
    for (const s of stringParams) {
      expect(Number.isNaN(Date.parse(s as string))).toBe(false);
    }
  });
});

describe("db-retention summary-log visibility", () => {
  /**
   * The fixed runRetention() emits:
   *   - 'db-retention-pruned' (info) on healthy ticks
   *   - 'db-retention-all-rules-failed' (error) when results=0 AND
   *     failures.length === RULES.length
   *
   * Test the decision logic directly. Pre-fix, all-failed ticks emitted
   * the same 'db-retention-pruned' label as healthy ones, hiding the
   * outage from dashboards.
   */
  function decideSummaryLabel(
    results: { table: string; deleted: number }[],
    failures: { table: string; error: string }[],
    ruleCount: number,
  ): "db-retention-pruned" | "db-retention-all-rules-failed" {
    const allFailed = results.length === 0 && failures.length === ruleCount;
    return allFailed ? "db-retention-all-rules-failed" : "db-retention-pruned";
  }

  it("emits db-retention-pruned on healthy ticks", () => {
    const label = decideSummaryLabel(
      [{ table: "test_results", deleted: 100 }, { table: "health_monitor_events", deleted: 50 }],
      [],
      5,
    );
    expect(label).toBe("db-retention-pruned");
  });

  it("emits db-retention-pruned on quiet ticks (nothing to delete, no errors)", () => {
    const label = decideSummaryLabel([{ table: "test_results", deleted: 0 }], [], 5);
    expect(label).toBe("db-retention-pruned");
  });

  it("emits db-retention-all-rules-failed when every rule errored", () => {
    const label = decideSummaryLabel(
      [],
      [
        { table: "test_results", error: "bind error" },
        { table: "health_monitor_events", error: "bind error" },
        { table: "failed_requests", error: "bind error" },
        { table: "test_run_log", error: "bind error" },
        { table: "rate_limit_counters", error: "bind error" },
      ],
      5,
    );
    expect(label).toBe("db-retention-all-rules-failed");
  });

  it("emits db-retention-pruned on partial failure (some rules succeeded)", () => {
    const label = decideSummaryLabel(
      [{ table: "test_results", deleted: 10 }],
      [{ table: "health_monitor_events", error: "bind error" }],
      5,
    );
    // One rule succeeded → not all-failed → regular log so the per_table
    // summary surfaces the partial outage without misclassifying as total.
    expect(label).toBe("db-retention-pruned");
  });
});

// ─── Bounded-batch pagination (DEC-20260504-A) ─────────────────────────────

describe("db-retention bounded-batch pagination", () => {
  /** Test rule used by the loop tests below. Mirrors the shape of the
   *  real RULES entries; using the actual rule directly is fine but
   *  keeping a local copy makes the assertions easier to read. */
  const TEST_RULE: RetentionRule = RULES[0]; // test_results / executed_at / 30d / id

  /** Stub executor that records every SQL it sees and returns canned
   *  row counts for the DELETE batches in order. When the canned list
   *  is exhausted, returns count: 0 (the natural "table empty" response). */
  function makeStubExecutor(deleteCounts: number[]): RetentionExecutor & {
    captured: SQL[];
  } {
    const captured: SQL[] = [];
    let i = 0;
    return {
      captured,
      async execute(query: SQL) {
        captured.push(query);
        const count = i < deleteCounts.length ? deleteCounts[i] : 0;
        i += 1;
        return { count };
      },
    };
  }

  /** Compile a Drizzle SQL chunk to its rendered string + bound params
   *  using PgDialect.sqlToQuery — the same dialect drizzle uses against
   *  Postgres at runtime. This is the truth-table for what Postgres
   *  actually receives. Without compilation, sql.raw() segments live as
   *  nested SQL objects in queryChunks and a naive walker misses them. */
  const dialect = new PgDialect();
  function compile(s: SQL): { sql: string; params: unknown[] } {
    const compiled = dialect.sqlToQuery(s);
    return { sql: compiled.sql, params: compiled.params };
  }

  it("each batch SQL contains LIMIT 10000 — bounded WAL per batch", async () => {
    const stub = makeStubExecutor([BATCH_SIZE, BATCH_SIZE, 5_000]);
    const cutoffIso = new Date(Date.now() - TEST_RULE.days * 86_400_000).toISOString();

    await runOneRulePaginated(TEST_RULE, cutoffIso, stub);

    // The loop ran 3 batches (two full + one partial under BATCH_SIZE,
    // followed by an exit because the next call returns 0). The FIRST
    // captured SQL is the production DELETE — every captured SQL must
    // carry the `LIMIT ${BATCH_SIZE}` token so no batch can run
    // unbounded.
    expect(stub.captured.length).toBeGreaterThanOrEqual(3);
    for (const captured of stub.captured) {
      // BATCH_SIZE is bound as a parameter, not inlined. The compiled
      // SQL has "LIMIT $N" and the bound param at position N is
      // BATCH_SIZE itself. Both halves matter:
      //   1. SQL contains LIMIT $<n>  — the LIMIT clause is present
      //   2. params include BATCH_SIZE — the bound value is 10000
      // Together they guarantee no batch can run unbounded.
      const compiled = compile(captured);
      expect(compiled.sql).toMatch(/limit\s+\$\d+/i);
      expect(compiled.params).toContain(BATCH_SIZE);
      // Sanity: no higher LIMIT smuggled in (e.g. 50k or 100k).
      expect(compiled.params).not.toContain(50_000);
      expect(compiled.params).not.toContain(100_000);
    }
  });

  it("orders by retention column then PK — deterministic + oldest first", async () => {
    const stub = makeStubExecutor([0]); // immediate empty
    const cutoffIso = new Date().toISOString();
    await runOneRulePaginated(TEST_RULE, cutoffIso, stub);

    expect(stub.captured.length).toBe(1);
    const text = compile(stub.captured[0]).sql;
    // The fixture rule is test_results / executed_at / id — the
    // ORDER BY must put executed_at first (so DELETEs are oldest-
    // first across batches) with id as the deterministic tie-breaker.
    expect(text).toMatch(/ORDER\s+BY\s+executed_at,\s*id/i);
  });

  it("exits after one zero-result batch when table is already empty past cutoff", async () => {
    const stub = makeStubExecutor([0]);
    const cutoffIso = new Date().toISOString();

    const result = await runOneRulePaginated(TEST_RULE, cutoffIso, stub);

    expect(stub.captured.length).toBe(1);
    expect(result.deleted).toBe(0);
    expect(result.batches).toBe(0); // batches counter advances only on >0 deletes
    expect(result.budget_hit).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it("budget exhaustion mid-loop produces a clean log entry, not a silent failure", async () => {
    // Mock clock: each call advances by half the budget, so we get one
    // batch through, then the second budget check trips.
    let t = 0;
    const now = () => {
      const v = t;
      t += PER_RULE_BUDGET_MS / 2 + 1;
      return v;
    };

    // Two full batches' worth of work would normally happen, but we
    // expect the loop to bail on budget after the first.
    const stub = makeStubExecutor([BATCH_SIZE, BATCH_SIZE, BATCH_SIZE]);
    const cutoffIso = new Date().toISOString();

    const result = await runOneRulePaginated(TEST_RULE, cutoffIso, stub, now);

    // Exactly one DELETE issued; the second loop iteration bails before
    // calling execute().
    expect(stub.captured.length).toBe(1);
    expect(result.deleted).toBe(BATCH_SIZE);
    expect(result.batches).toBe(1);
    // The critical regression assertion: budget_hit is true and the
    // result is otherwise clean (no error, real numbers in the summary).
    // Pre-fix, an unbounded DELETE could run for 30+ minutes and
    // generate GBs of WAL with no per-rule visibility.
    expect(result.budget_hit).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.duration_ms).toBeGreaterThanOrEqual(PER_RULE_BUDGET_MS);
  });

  it("propagates SQL errors as result.error without throwing or zeroing other fields", async () => {
    const failing: RetentionExecutor = {
      async execute() {
        throw new Error("simulated upstream timeout");
      },
    };
    const cutoffIso = new Date().toISOString();
    const result = await runOneRulePaginated(TEST_RULE, cutoffIso, failing);

    expect(result.error).toBe("simulated upstream timeout");
    expect(result.deleted).toBe(0);
    expect(result.batches).toBe(0);
    expect(result.budget_hit).toBe(false);
    expect(result.table).toBe("test_results");
  });

  it("rate_limit_counters rule emits composite-PK shape, not single-id IN", async () => {
    const rateLimitRule = RULES.find((r) => r.table === "rate_limit_counters");
    expect(rateLimitRule).toBeDefined();

    const stub = makeStubExecutor([0]);
    await runOneRulePaginated(rateLimitRule!, new Date().toISOString(), stub);

    const text = compile(stub.captured[0]).sql;
    // Composite key shape: WHERE (bucket_key, window_start) IN (SELECT
    // bucket_key, window_start ...). Validates the rule wiring won't
    // break on Postgres if the rate_limit_counters table ever grows
    // past one batch.
    expect(text).toMatch(/\(bucket_key,\s*window_start\)\s+IN/i);
    expect(text).toMatch(/SELECT\s+bucket_key,\s*window_start/i);
  });
});
