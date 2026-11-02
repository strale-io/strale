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
  it("passes counts, sums, slugs, identifiers, timestamps and booleans", () => {
    const ok = {
      count: 2,
      commit: "b8e19865ee06",
      suites: [{
        test_suite_id: "6b7c1f8e-2f3a-4b5c-9d8e-1f2a3b4c5d6e",
        capability_slug: "canadian-company-data",
        test_type: "known_answer",
        active: true,
        last_result_at: "2026-11-02T01:23:45Z",
        declared_external_cost_cents: "1234",
        day: "2026-11-01",
        empty: null,
      }],
    };
    expect(assertSafeOutput(ok)).toEqual(ok);
  });

  it("converts a Date to an ISO timestamp", () => {
    expect(assertSafeOutput({ at: new Date("2026-11-02T00:00:00.000Z") })).toEqual({ at: "2026-11-02T00:00:00.000Z" });
  });

  it.each([
    ["free text", "Shopify Inc. reported revenue of 7 billion"],
    ["an email address", "jane.doe@example.com"],
    ["a URL", "https://hooks.slack.com/services/T000/B000/XXXX"],
    ["a quarantine reason", `${PAID_CALL_QUARANTINE_MARKER} this suite's input reaches a paid upstream call`],
    ["a capitalised name", "Jane Doe"],
    ["json content", '{"company_name":"Shopify"}'],
  ])("refuses %s anywhere in the output", (_label, value) => {
    expect(() => assertSafeOutput({ suites: [{ capability_slug: value }] })).toThrow(OpsReadOutputError);
  });

  it("refuses an unexpected key shape and non-finite numbers", () => {
    expect(() => assertSafeOutput({ "Free Text Key": 1 })).toThrow(OpsReadOutputError);
    expect(() => assertSafeOutput({ n: Number.NaN })).toThrow(OpsReadOutputError);
  });
});

describe("parseDateRange", () => {
  const now = new Date("2026-11-02T10:00:00Z");
  it("defaults to the 30 days ending today (UTC)", () => {
    expect(parseDateRange({}, now)).toEqual({ from: "2026-10-04", to: "2026-11-02" });
  });
  it("accepts an explicit range", () => {
    expect(parseDateRange({ from: "2026-10-01", to: "2026-10-31" }, now)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });
  it.each([
    [{ from: "2026-10-01'; DROP TABLE users; --" }],
    [{ to: "yesterday" }],
    [{ from: "2026-02-30", to: "2026-03-01" }],
    [{ from: "2026-11-02", to: "2026-11-01" }],
    [{ from: "2026-01-01", to: "2026-11-01" }],
  ])("refuses %o", (q) => {
    expect(() => parseDateRange(q, now)).toThrow(OpsReadInputError);
  });
  it(`allows exactly ${MAX_RANGE_DAYS} days`, () => {
    expect(() => parseDateRange({ from: "2026-08-03", to: "2026-11-02" }, now)).not.toThrow();
  });
});

describe("checks", () => {
  it("only the named checks exist", () => {
    expect(Object.keys(OPS_READ_CHECKS).sort()).toEqual(["build", "parked-suites", "test-call-cost"]);
    expect(isOpsReadCheck("toString")).toBe(false);
    expect(isOpsReadCheck("__proto__")).toBe(false);
  });

  it("parked-suites selects no content columns and binds the marker as a parameter", async () => {
    const tx = recordingExecutor([[]]);
    await OPS_READ_CHECKS["parked-suites"](tx, {});
    const [q] = tx.queries;
    expect(q.params).toEqual([`${PAID_CALL_QUARANTINE_MARKER}%`]);
    const selectList = q.sql.slice(0, q.sql.indexOf("FROM test_suites"));
    for (const col of ["input", "expected_output", "baseline_output", "quarantine_reason", "actual_output"]) {
      expect(selectList).not.toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it("test-call-cost binds the range as strings (never Date objects) and excludes piggyback rows", async () => {
    const tx = recordingExecutor([[], []]);
    const out = await OPS_READ_CHECKS["test-call-cost"](tx, { from: "2026-10-01", to: "2026-10-31" });
    expect(out).toMatchObject({ from: "2026-10-01", to: "2026-10-31", days: [], parked_suites: [] });
    for (const q of tx.queries) {
      for (const p of q.params) expect(p instanceof Date).toBe(false);
      expect(q.sql).not.toMatch(/\bactual_output\b|\binput\b/);
    }
    expect(tx.queries[0].sql).toContain("<> 'piggyback'");
    expect(tx.queries[0].params).toEqual(["2026-10-01", "2026-10-31"]);
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
    const result = await OPS_READ_CHECKS["parked-suites"](tx, {});
    expect(() => assertSafeOutput({ check: "parked-suites", result })).toThrow(OpsReadOutputError);
  });
});
