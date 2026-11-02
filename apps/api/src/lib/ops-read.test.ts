import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  MAX_RANGE_DAYS,
  OPS_READ_CHECKS,
  OpsReadInputError,
  OpsReadOutputError,
  assertSafeOutput,
  isOpsReadCheck,
  isValidOpsReadAuth,
  parseDateRange,
  type ReadExecutor,
} from "./ops-read.js";
import { PAID_CALL_QUARANTINE_MARKER } from "./paid-call-guard.js";

const TOKEN = "t".repeat(40);
const dialect = new PgDialect();

/** Records every query a check runs and answers with canned rows. */
function recordingExecutor(answers: unknown[][]): ReadExecutor & { queries: { sql: string; params: unknown[] }[] } {
  const queries: { sql: string; params: unknown[] }[] = [];
  let i = 0;
  return {
    queries,
    async execute(query) {
      queries.push(dialect.sqlToQuery(query as SQL));
      return answers[i++] ?? [];
    },
  };
}

describe("isValidOpsReadAuth", () => {
  it("accepts the exact bearer token", () => {
    expect(isValidOpsReadAuth(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
  });
  it("refuses a wrong, missing or differently-shaped header", () => {
    expect(isValidOpsReadAuth(`Bearer ${"x".repeat(40)}`, TOKEN)).toBe(false);
    expect(isValidOpsReadAuth(undefined, TOKEN)).toBe(false);
    expect(isValidOpsReadAuth(TOKEN, TOKEN)).toBe(false);
  });
  it("fails closed when the token is unset or shorter than 32 characters", () => {
    expect(isValidOpsReadAuth("Bearer short", "short")).toBe(false);
    expect(isValidOpsReadAuth("Bearer undefined", undefined)).toBe(false);
  });
});

describe("assertSafeOutput", () => {
  it("passes listed keys with their own shapes", () => {
    const ok = {
      check: "parked-suites",
      result: {
        count: 2,
        commit: "b8e19865ee06",
        read_only: true,
        suites: [{
          test_suite_id: "6b7c1f8e-2f3a-4b5c-9d8e-1f2a3b4c5d6e",
          capability_slug: "canadian-company-data",
          test_type: "known_answer",
          test_mode: "live",
          active: true,
          last_result_at: "2026-11-02T01:23:45Z",
        }],
        days: [{ day: "2026-11-01", runs: 3, declared_external_cost_cents: "1234" }],
        oldest_result_day: null,
      },
    };
    expect(assertSafeOutput(ok)).toEqual(ok);
  });

  it.each([
    ["free text in a slug field", { capability_slug: "Shopify Inc. reported revenue of 7 billion" }],
    ["an email address", { capability_slug: "jane.doe@example.com" }],
    ["a URL", { capability_slug: "https://hooks.slack.com/services/T000/B000/XXXX" }],
    ["a quarantine reason", { capability_slug: `${PAID_CALL_QUARANTINE_MARKER} this suite's input reaches a paid upstream call` }],
    ["an sk_-style token", { capability_slug: "sk_test_abc123" }],
    ["json content", { capability_slug: '{"company_name":"Shopify"}' }],
    ["an unlisted key", { key_hash: "a".repeat(64) }],
    ["an unlisted key holding a number", { phone: 46701234567 }],
    ["a test type outside the vocabulary", { test_type: "jane" }],
    ["a string where a count belongs", { runs: "46701234567" }],
    ["a negative count", { count: -1 }],
    ["a non-integer count", { count: 1.5 }],
    ["cents with a decimal or sign", { declared_external_cost_cents: "-12.5" }],
    ["a timestamp with an offset", { last_result_at: "2026-11-02 01:23:45+00" }],
    ["a long commit", { commit: "b8e19865ee06aaaabbbb" }],
    ["a list where a leaf belongs", { capability_slug: ["canadian-company-data"] }],
  ])("refuses %s", (_label, row) => {
    expect(() => assertSafeOutput({ check: "parked-suites", result: { suites: [row] } })).toThrow(OpsReadOutputError);
  });

  it("allows null for any leaf", () => {
    expect(() => assertSafeOutput({ result: { commit: null, last_result_at: null } })).not.toThrow();
  });
});

describe("parseDateRange", () => {
  const now = new Date("2026-11-02T10:00:00Z");
  it(`defaults to the ${MAX_RANGE_DAYS} days ending today (UTC)`, () => {
    expect(parseDateRange({}, now)).toEqual({ from: "2026-10-04", to: "2026-11-02" });
  });
  it("accepts an explicit range", () => {
    expect(parseDateRange({ from: "2026-10-10", to: "2026-10-20" }, now)).toEqual({ from: "2026-10-10", to: "2026-10-20" });
  });
  it.each([
    [{ from: "2026-10-01'; DROP TABLE users; --" }],
    [{ to: "yesterday" }],
    [{ from: "2026-02-30", to: "2026-03-01" }],
    [{ from: "2026-11-02", to: "2026-11-01" }],
    [{ from: "2026-01-01", to: "2026-11-01" }],
    [{ from: "2026-10-01", to: "2026-10-31" }],
  ])("refuses %o", (q) => {
    expect(() => parseDateRange(q, now)).toThrow(OpsReadInputError);
  });
  it(`allows exactly ${MAX_RANGE_DAYS} days`, () => {
    expect(() => parseDateRange({ from: "2026-10-04", to: "2026-11-02" }, now)).not.toThrow();
  });
});

describe("checks", () => {
  it("only the named checks exist", () => {
    expect(Object.keys(OPS_READ_CHECKS).sort()).toEqual(["build", "parked-suites", "test-call-cost"]);
    expect(isOpsReadCheck("toString")).toBe(false);
    expect(isOpsReadCheck("__proto__")).toBe(false);
  });

  it("build reports the commit and whether the transaction is read-only", async () => {
    process.env.RAILWAY_GIT_COMMIT_SHA = "b8e19865ee06aaaa";
    const tx = recordingExecutor([[{ read_only: true }]]);
    expect(await OPS_READ_CHECKS.build.run(tx, null)).toEqual({ commit: "b8e19865ee06", read_only: true });
    expect(tx.queries[0].sql).toContain("current_setting('transaction_read_only')");
  });

  it("parked-suites selects no content columns and binds the marker as an exact prefix", async () => {
    const tx = recordingExecutor([[]]);
    await OPS_READ_CHECKS["parked-suites"].run(tx, null);
    const [q] = tx.queries;
    expect(q.params).toEqual([PAID_CALL_QUARANTINE_MARKER]);
    expect(q.sql).toContain("starts_with(ts.quarantine_reason, $1)");
    const selectList = q.sql.slice(0, q.sql.indexOf("FROM test_suites"));
    for (const col of ["input", "expected_output", "baseline_output", "quarantine_reason", "actual_output"]) {
      expect(selectList).not.toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it("test-call-cost validates its range in prepare, before any query", () => {
    expect(() => OPS_READ_CHECKS["test-call-cost"].prepare({ from: "2026-01-01", to: "2026-11-01" })).toThrow(OpsReadInputError);
    expect(OPS_READ_CHECKS["test-call-cost"].prepare({ from: "2026-10-10", to: "2026-10-20" })).toEqual({ from: "2026-10-10", to: "2026-10-20" });
  });

  it("test-call-cost binds the range as strings (never Date objects), excludes piggyback and reports retention", async () => {
    const tx = recordingExecutor([[], [], [{ oldest_result_day: "2026-10-03" }]]);
    const out = await OPS_READ_CHECKS["test-call-cost"].run(tx, { from: "2026-10-10", to: "2026-10-20" });
    expect(out).toEqual({ from: "2026-10-10", to: "2026-10-20", oldest_result_day: "2026-10-03", days: [], parked_suites: [] });
    for (const q of tx.queries) {
      for (const p of q.params) expect(p instanceof Date).toBe(false);
      expect(q.sql).not.toMatch(/\bactual_output\b|\binput\b/);
    }
    expect(tx.queries[0].sql).toContain("<> 'piggyback'");
    expect(tx.queries[0].params).toEqual(["2026-10-10", "2026-10-20"]);
  });

  it("a planted free-text value from the database never leaves: the output contract refuses it", async () => {
    const tx = recordingExecutor([[{
      test_suite_id: "6b7c1f8e-2f3a-4b5c-9d8e-1f2a3b4c5d6e",
      capability_slug: "Customer said: please refund order 1234 to jane.doe@example.com",
      test_type: "known_answer",
      test_mode: "live",
      active: true,
      last_result_at: null,
    }]]);
    const result = await OPS_READ_CHECKS["parked-suites"].run(tx, null);
    expect(() => assertSafeOutput({ check: "parked-suites", result })).toThrow(OpsReadOutputError);
  });

  it("a column added to a check later is refused unless OUTPUT_FIELDS lists it", async () => {
    const tx = recordingExecutor([[{ test_suite_id: "6b7c1f8e-2f3a-4b5c-9d8e-1f2a3b4c5d6e", input: "pep-check: Jane Doe" }]]);
    const result = await OPS_READ_CHECKS["parked-suites"].run(tx, null);
    expect(() => assertSafeOutput({ check: "parked-suites", result })).toThrow(OpsReadOutputError);
  });
});
