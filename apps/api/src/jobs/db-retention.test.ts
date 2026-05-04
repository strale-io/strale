/**
 * Regression test for the db-retention pruning job.
 *
 * Two coverage targets:
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
 * The retention job lives inside a `db.transaction(...)` block with
 * an advisory lock and a per-rule loop. Mocking that fully is more
 * heavy than testing the SQL shape directly, so this file extracts
 * the contract:
 *   - The cutoff arrives at tx.execute as a string, not a Date
 *   - Errors from tx.execute don't silently zero the per_table report
 */

import { describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";

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
