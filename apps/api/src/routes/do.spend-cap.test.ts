/**
 * Regression test for the in-tx authoritative spend-cap re-check
 * (`spendCapWouldExceed` in do.ts).
 *
 * Bug shipped 2026-04-30 in commit 6613bd7 (cert-audit A-7 TOCTOU fix).
 * The function interpolated a raw `Date` object into a sql`` template:
 *
 *   const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
 *   await tx.execute(sql`... AND created_at >= ${oneHourAgo}`);
 *
 * postgres-js's bind-parameter encoder couldn't serialize the Date
 * through the sql-template path (it falls through to
 * Buffer.byteLength(date) and throws). The throw was masked by the
 * Hono `app.onError` handler as `{"error_code":"internal_error"}`,
 * returning hard 500s for every authenticated paid /v1/do call by a
 * user with `maxSpendPerHourCents` set. Free-tier path was unaffected
 * (skips the spend-cap check). The pre-check at do.ts:754 was
 * unaffected (uses Drizzle column-query form, which serializes Date
 * via the column's mapToDriverValue).
 *
 * The assertions below would have caught the bug at PR-review time:
 *   1. No `Date` instance reaches `tx.execute(sql``)` as a bind param.
 *   2. Function returns null when projected spend ≤ cap.
 *   3. Function returns { spent } when projected spend > cap.
 *
 * Why a unit test, not an integration test: the codebase has no
 * Postgres-backed test harness for /v1/do; existing route-tangent
 * tests (e.g. free-tier-rate-limit.test.ts) reimplement pure logic.
 * Standing up a route-level integration harness is out of scope for a
 * one-line bug fix and is flagged in the PR description as deferred.
 */

import { describe, it, expect, vi } from "vitest";
import type { SQL } from "drizzle-orm";

import { spendCapWouldExceed } from "./do.js";

interface MockTxState {
  spendSumCents: number;
  executeCalls: SQL[];
  whereCalls: unknown[];
}

function makeMockTx(state: MockTxState) {
  return {
    // Drizzle's typed-column query path. The fixed implementation goes
    // here; under the hood Drizzle serializes Date params through each
    // column's `mapToDriverValue`, so postgres-js never sees a raw Date.
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn((cond: unknown) => {
          state.whereCalls.push(cond);
          return Promise.resolve([{ total: String(state.spendSumCents) }]);
        }),
      })),
    })),
    // Raw sql-template execute path. The unfixed implementation lived
    // here and shipped a `Date` chunk in queryChunks — postgres-js's
    // encoder threw "Received an instance of Date" at Bind time.
    execute: vi.fn(async (sqlTag: SQL) => {
      state.executeCalls.push(sqlTag);
      return [{ total: String(state.spendSumCents) }];
    }),
  };
}

/**
 * Detects raw `Date` instances anywhere in a Drizzle SQL tag's
 * `queryChunks`. Drizzle's sql`` tag stores interpolated values
 * directly in queryChunks (alongside `StringChunk` literals), so a
 * raw Date interpolation surfaces as `chunk instanceof Date`.
 *
 * This is the postgres-js-incompatible shape the original bug had.
 */
function findDateChunks(sqlTag: SQL): unknown[] {
  const chunks = (sqlTag as unknown as { queryChunks?: unknown[] }).queryChunks ?? [];
  return chunks.filter((c) => c instanceof Date);
}

describe("spendCapWouldExceed (in-tx authoritative spend-cap re-check)", () => {
  it("never passes a raw Date through tx.execute(sql``) — postgres-js bind encoder can't serialize it", async () => {
    const state: MockTxState = { spendSumCents: 50, executeCalls: [], whereCalls: [] };
    const tx = makeMockTx(state);

    await spendCapWouldExceed(tx, "user-uuid", 25, 100);

    // Either tx.execute is never called (the fix uses the typed-column
    // path) or it is called but no Date reaches the bind parameters.
    // Reverting to raw `sql`...${oneHourAgo}\`` would fail this.
    for (const call of state.executeCalls) {
      const dateChunks = findDateChunks(call);
      expect(
        dateChunks,
        "Date instance in tx.execute(sql``) — postgres-js bind encoder cannot serialize Date through the sql-template path. See do.ts spendCapWouldExceed and the Bind-error stack from production logs (2026-05-04).",
      ).toEqual([]);
    }
  });

  it("returns null when current spend + requested ≤ cap (under-cap success path)", async () => {
    const state: MockTxState = { spendSumCents: 50, executeCalls: [], whereCalls: [] };
    const tx = makeMockTx(state);

    const result = await spendCapWouldExceed(tx, "user-uuid", 25, 100);

    expect(result).toBeNull();
  });

  it("returns null at the exact cap boundary (50 + 50 = 100 ≤ 100)", async () => {
    const state: MockTxState = { spendSumCents: 50, executeCalls: [], whereCalls: [] };
    const tx = makeMockTx(state);

    const result = await spendCapWouldExceed(tx, "user-uuid", 50, 100);

    expect(result).toBeNull();
  });

  it("returns { spent } when current spend + requested > cap (over-cap rejection path)", async () => {
    const state: MockTxState = { spendSumCents: 80, executeCalls: [], whereCalls: [] };
    const tx = makeMockTx(state);

    const result = await spendCapWouldExceed(tx, "user-uuid", 25, 100);

    expect(result).toEqual({ spent: 80 });
  });

  it("returns spent=0 + null when no prior transactions in the window", async () => {
    const state: MockTxState = { spendSumCents: 0, executeCalls: [], whereCalls: [] };
    const tx = makeMockTx(state);

    const result = await spendCapWouldExceed(tx, "user-uuid", 25, 100);

    expect(result).toBeNull();
  });

  it("uses the typed-column query path (regression: do not revert to raw sql template)", async () => {
    const state: MockTxState = { spendSumCents: 0, executeCalls: [], whereCalls: [] };
    const tx = makeMockTx(state);

    await spendCapWouldExceed(tx, "user-uuid", 25, 100);

    // The fix path runs through tx.select(...).from(...).where(...).
    // If a future change reverts to tx.execute(sql``), this fails and
    // the assertion above (no Date chunks) becomes the safety net.
    expect(tx.select).toHaveBeenCalledTimes(1);
    expect(state.whereCalls.length).toBe(1);
  });
});
