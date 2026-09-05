/**
 * Regression tests for startup-db-retry (2026-07-02 outage follow-up).
 *
 * The bug shape: runStartupMigrations() treated a transient Postgres
 * CONNECT_TIMEOUT as instantly fatal. Railway restarted the process 10
 * times in a few minutes, exhausted restartPolicyMaxRetries, and the
 * service stayed CRASHED for ~11 hours after the DB had recovered.
 *
 * Invariants under test:
 *  1. Transient connectivity errors (postgres-js CONNECT_TIMEOUT, socket
 *     errno codes, SQLSTATE class 08/53 and 57P0x) are retried with
 *     exponential backoff — the pre-fix behaviour (throw on first
 *     CONNECT_TIMEOUT) fails these tests.
 *  2. Non-transient errors (real SQL/migration failures) rethrow
 *     immediately with zero retries — retry must never mask a bug.
 *  3. The retry loop respects its time budget and then rethrows, so a
 *     genuinely dead DB still surfaces as a fatal boot error.
 */

import { describe, expect, it } from "vitest";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { isTransientDbConnectError, withStartupDbRetry } from "./startup-db-retry.js";

function errWithCode(message: string, code: string): Error {
  const e = new Error(message);
  (e as Error & { code: string }).code = code;
  return e;
}

describe("isTransientDbConnectError", () => {
  it("matches postgres-js connection lifecycle codes", () => {
    expect(isTransientDbConnectError(errWithCode("write CONNECT_TIMEOUT postgres.railway.internal:5432", "CONNECT_TIMEOUT"))).toBe(true);
    expect(isTransientDbConnectError(errWithCode("connection closed", "CONNECTION_CLOSED"))).toBe(true);
  });

  it("matches Node socket errno codes", () => {
    expect(isTransientDbConnectError(errWithCode("connect ECONNREFUSED 10.0.0.1:5432", "ECONNREFUSED"))).toBe(true);
    expect(isTransientDbConnectError(errWithCode("getaddrinfo ENOTFOUND postgres.railway.internal", "ENOTFOUND"))).toBe(true);
    expect(isTransientDbConnectError(errWithCode("timed out", "ETIMEDOUT"))).toBe(true);
  });

  it("matches server-not-ready SQLSTATE codes (starting up / recovery / resources)", () => {
    expect(isTransientDbConnectError(errWithCode("the database system is starting up", "57P03"))).toBe(true);
    expect(isTransientDbConnectError(errWithCode("connection failure", "08006"))).toBe(true);
    expect(isTransientDbConnectError(errWithCode("too many connections", "53300"))).toBe(true);
    // The 2026-07-02 incident logged "canceling authentication due to timeout"
    expect(isTransientDbConnectError(errWithCode("canceling authentication due to timeout", "57014"))).toBe(true);
  });

  it("treats 57014 as fatal in its statement_timeout form — only the auth-phase cancel is transient", () => {
    // Review finding: the DB config applies a 30s statement_timeout, so a
    // slow migration or invariant query also raises 57014. Retrying that for
    // the full budget would mask a real problem.
    expect(isTransientDbConnectError(errWithCode("canceling statement due to statement timeout", "57014"))).toBe(false);
    expect(isTransientDbConnectError(errWithCode("canceling statement due to user request", "57014"))).toBe(false);
  });

  it("matches CONNECT_TIMEOUT surfaced in the message with no code property", () => {
    expect(isTransientDbConnectError(new Error("write CONNECT_TIMEOUT postgres.railway.internal:5432"))).toBe(true);
  });

  it("matches AggregateError wrapping a transient inner error", () => {
    const agg = new AggregateError([errWithCode("connect ECONNREFUSED ::1:5432", "ECONNREFUSED")], "");
    expect(isTransientDbConnectError(agg)).toBe(true);
  });

  it("rejects real SQL errors — a broken migration must stay fatal", () => {
    expect(isTransientDbConnectError(errWithCode('column "nope" does not exist', "42703"))).toBe(false);
    expect(isTransientDbConnectError(errWithCode("syntax error at or near", "42601"))).toBe(false);
    expect(isTransientDbConnectError(errWithCode("password authentication failed", "28P01"))).toBe(false);
  });

  it("rejects generic errors and non-Error values", () => {
    expect(isTransientDbConnectError(new Error("DATABASE_URL environment variable is required"))).toBe(false);
    expect(isTransientDbConnectError("CONNECT_TIMEOUT")).toBe(false);
    expect(isTransientDbConnectError(null)).toBe(false);
    expect(isTransientDbConnectError(undefined)).toBe(false);
  });

  describe("drizzle-orm 0.44+ DrizzleQueryError wrapper (PR #510 follow-up)", () => {
    // runStartupMigrations()/validateSchema() call db.execute() internally,
    // so a connection failure surfacing through a query attempt reaches
    // here wrapped, not bare. See lib/db-error.ts for the incident.
    it("still matches a WRAPPED CONNECT_TIMEOUT, unwrapping to find the code", () => {
      const inner = errWithCode("write CONNECT_TIMEOUT postgres.railway.internal:5432", "CONNECT_TIMEOUT");
      const wrapped = new DrizzleQueryError("select 1", [], inner);
      expect(isTransientDbConnectError(wrapped)).toBe(true);
    });

    it("still rejects a WRAPPED real SQL error — a broken migration stays fatal", () => {
      const inner = errWithCode('column "nope" does not exist', "42703");
      const wrapped = new DrizzleQueryError("select nope from t", [], inner);
      expect(isTransientDbConnectError(wrapped)).toBe(false);
    });
  });
});

describe("withStartupDbRetry", () => {
  /** Fake clock: sleep() advances the clock by exactly the requested ms. */
  function fakeClock() {
    let t = 0;
    const sleeps: number[] = [];
    return {
      now: () => t,
      sleep: async (ms: number) => {
        sleeps.push(ms);
        t += ms;
      },
      sleeps,
    };
  }

  it("returns the result without retrying on first-attempt success", async () => {
    const clock = fakeClock();
    let calls = 0;
    const result = await withStartupDbRetry(
      "test",
      async () => {
        calls++;
        return "ok";
      },
      { sleep: clock.sleep, now: clock.now },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(1);
    expect(clock.sleeps).toEqual([]);
  });

  it("retries transient errors with doubling backoff until success (the 2026-07-02 shape)", async () => {
    const clock = fakeClock();
    let calls = 0;
    const result = await withStartupDbRetry(
      "startup-migrations",
      async () => {
        calls++;
        if (calls <= 3) {
          throw errWithCode("write CONNECT_TIMEOUT postgres.railway.internal:5432", "CONNECT_TIMEOUT");
        }
        return "migrated";
      },
      { sleep: clock.sleep, now: clock.now, baseDelayMs: 1000, maxDelayMs: 30_000, budgetMs: 600_000 },
    );
    expect(result).toBe("migrated");
    expect(calls).toBe(4);
    expect(clock.sleeps).toEqual([1000, 2000, 4000]);
  });

  it("caps the backoff delay at maxDelayMs", async () => {
    const clock = fakeClock();
    let calls = 0;
    await withStartupDbRetry(
      "test",
      async () => {
        calls++;
        if (calls <= 6) throw errWithCode("timeout", "CONNECT_TIMEOUT");
        return "ok";
      },
      { sleep: clock.sleep, now: clock.now, baseDelayMs: 1000, maxDelayMs: 4000, budgetMs: 600_000 },
    );
    expect(clock.sleeps).toEqual([1000, 2000, 4000, 4000, 4000, 4000]);
  });

  it("rethrows non-transient errors immediately with zero retries", async () => {
    const clock = fakeClock();
    let calls = 0;
    const sqlError = errWithCode('column "nope" does not exist', "42703");
    await expect(
      withStartupDbRetry(
        "startup-migrations",
        async () => {
          calls++;
          throw sqlError;
        },
        { sleep: clock.sleep, now: clock.now },
      ),
    ).rejects.toBe(sqlError);
    expect(calls).toBe(1);
    expect(clock.sleeps).toEqual([]);
  });

  it("shares one budget across call sites when startedAt is passed (per-boot, not per-site)", async () => {
    const clock = fakeClock();
    const timeout = errWithCode("write CONNECT_TIMEOUT postgres.railway.internal:5432", "CONNECT_TIMEOUT");
    const bootStartedAt = clock.now();

    // First call site burns 3s of the 5s boot budget (sleeps 1s + 2s), then succeeds.
    let firstCalls = 0;
    await withStartupDbRetry(
      "startup-migrations",
      async () => {
        firstCalls++;
        if (firstCalls <= 2) throw timeout;
        return "ok";
      },
      { sleep: clock.sleep, now: clock.now, startedAt: bootStartedAt, baseDelayMs: 1000, maxDelayMs: 30_000, budgetMs: 5000 },
    );
    expect(clock.sleeps).toEqual([1000, 2000]);

    // Second call site inherits the same clock: only ~2s of budget left,
    // so its first 1s retry fits but the next 2s retry overshoots.
    let secondCalls = 0;
    await expect(
      withStartupDbRetry(
        "schema-validation",
        async () => {
          secondCalls++;
          throw timeout;
        },
        { sleep: clock.sleep, now: clock.now, startedAt: bootStartedAt, baseDelayMs: 1000, maxDelayMs: 30_000, budgetMs: 5000 },
      ),
    ).rejects.toBe(timeout);
    expect(secondCalls).toBe(2);
    expect(clock.sleeps).toEqual([1000, 2000, 1000]);
  });

  it("gives up when a delay would end exactly on the budget boundary (>= not >)", async () => {
    // Review finding: with a strict > comparison, elapsed+delay === budget
    // scheduled one more sleep AND one more DB attempt starting exactly at
    // the deadline. Budget 3000 / delays 1000,2000: the second delay lands
    // exactly on 3000 and must NOT be taken.
    const clock = fakeClock();
    let calls = 0;
    const timeout = errWithCode("write CONNECT_TIMEOUT postgres.railway.internal:5432", "CONNECT_TIMEOUT");
    await expect(
      withStartupDbRetry(
        "boundary",
        async () => {
          calls++;
          throw timeout;
        },
        { sleep: clock.sleep, now: clock.now, baseDelayMs: 1000, maxDelayMs: 30_000, budgetMs: 3000 },
      ),
    ).rejects.toBe(timeout);
    expect(calls).toBe(2);
    expect(clock.sleeps).toEqual([1000]);
  });

  it("gives up and rethrows the transient error once the budget is exhausted", async () => {
    const clock = fakeClock();
    let calls = 0;
    const timeout = errWithCode("write CONNECT_TIMEOUT postgres.railway.internal:5432", "CONNECT_TIMEOUT");
    await expect(
      withStartupDbRetry(
        "startup-migrations",
        async () => {
          calls++;
          throw timeout;
        },
        // budget 5s, delays 1s+2s fit; the 4s third delay would overshoot
        { sleep: clock.sleep, now: clock.now, baseDelayMs: 1000, maxDelayMs: 30_000, budgetMs: 5000 },
      ),
    ).rejects.toBe(timeout);
    expect(calls).toBe(3);
    expect(clock.sleeps).toEqual([1000, 2000]);
  });
});
