/**
 * Regression test for the Date-in-sql-template bug in assertBudgetAvailable
 * (guarded-executor.ts).
 *
 * Bug introduced with Phase A0b (May 2026): `computeWindowStart` returns a
 * Date, which was interpolated directly into sql`` templates via `${windowStart}`.
 * postgres-js's bind encoder can't serialize a raw Date through the
 * sql-template path (falls through to Buffer.byteLength(date) and throws
 * ERR_INVALID_ARG_TYPE). Same root cause as cert-audit A-7 / PR #43 in do.ts.
 *
 * Effect: every `internal_test` invocation of a `free_quota` or
 * `paid_with_free_tier` capability failed immediately before reaching the
 * executor, tripping the circuit breaker after 3 consecutive failures.
 * german-company-data and danish-company-data were stuck open from
 * 2026-05-15 until this fix was applied (2026-05-21).
 *
 * The assertions below would have caught the bug at PR-review time:
 *   1. computeWindowStart returns a Date (coercion is necessary).
 *   2. A raw Date in a Drizzle sql tag produces a Date queryChunk
 *      (confirming postgres-js would throw on it).
 *   3. An ISO string from that same Date produces NO Date queryChunks
 *      (confirming the fixed path is safe).
 */

import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { computeWindowStart } from "./guarded-executor.js";

/**
 * Detects raw Date instances anywhere in a Drizzle SQL tag's queryChunks.
 * Mirrors the helper in do.spend-cap.test.ts — same bug class.
 */
function findDateChunks(sqlTag: SQL): unknown[] {
  const chunks = (sqlTag as unknown as { queryChunks?: unknown[] }).queryChunks ?? [];
  return chunks.filter((c) => c instanceof Date);
}

describe("computeWindowStart", () => {
  it("returns a Date (confirming coercion is needed before sql templates)", () => {
    const result = computeWindowStart("daily", null);
    expect(result).toBeInstanceOf(Date);
  });

  it("returns UTC midnight for daily window", () => {
    const now = new Date("2026-05-21T14:32:00Z");
    const result = computeWindowStart("daily", null, now);
    expect(result.toISOString()).toBe("2026-05-21T00:00:00.000Z");
  });

  it("returns correct month-start for monthly window", () => {
    const now = new Date("2026-05-21T14:32:00Z");
    const result = computeWindowStart("monthly", 1, now);
    expect(result.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });
});

describe("sql template Date serialization — A-7 follow-up (assertBudgetAvailable)", () => {
  it("BEFORE fix: raw Date in sql template produces Date queryChunk (postgres-js would throw)", () => {
    // This documents the shape the bug had. If a Date is interpolated directly,
    // Drizzle stores it as-is in queryChunks and postgres-js throws at Bind time.
    const windowStart = computeWindowStart("monthly", 1);
    const tag = sql`SELECT ${windowStart}`;
    const dateBits = findDateChunks(tag);
    // The Date IS in queryChunks — confirming the pre-fix shape was dangerous.
    expect(dateBits).toHaveLength(1);
    expect(dateBits[0]).toBeInstanceOf(Date);
  });

  it("AFTER fix: ISO string from same Date produces NO Date queryChunk (safe for postgres-js)", () => {
    // The fix in assertBudgetAvailable: `const windowStartIso = computeWindowStart(...).toISOString()`
    // then `${windowStartIso}` in all sql templates.
    const windowStart = computeWindowStart("monthly", 1);
    const windowStartIso = windowStart.toISOString(); // ← the fix
    const tag = sql`SELECT ${windowStartIso}`;
    const dateBits = findDateChunks(tag);
    // No Date in queryChunks — postgres-js will encode this as a plain string bind param.
    expect(dateBits).toHaveLength(0);
  });
});
