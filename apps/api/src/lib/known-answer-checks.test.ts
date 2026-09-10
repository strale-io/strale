import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describeCheck, diffChecks, expectedFieldsToChecks } from "./known-answer-checks.js";

describe("expectedFieldsToChecks", () => {
  it("copies field, operator, value and values, and drops reliability", () => {
    expect(expectedFieldsToChecks([
      { field: "cik", operator: "equals", value: "0000320193", reliability: "guaranteed" },
      { field: "status", operator: "one_of", values: ["a", "b"], reliability: "common" },
      { field: "studies", operator: "type", value: "array" },
      { field: "paper", operator: "not_null" },
    ])).toEqual([
      { field: "cik", operator: "equals", value: "0000320193" },
      { field: "status", operator: "one_of", values: ["a", "b"] },
      { field: "studies", operator: "type", value: "array" },
      { field: "paper", operator: "not_null" },
    ]);
  });
  it("keeps falsy values — false and 0 are answers, not absences", () => {
    expect(expectedFieldsToChecks([
      { field: "breached", operator: "equals", value: false },
      { field: "count", operator: "equals", value: 0 },
    ])).toEqual([
      { field: "breached", operator: "equals", value: false },
      { field: "count", operator: "equals", value: 0 },
    ]);
  });
});

describe("diffChecks", () => {
  const next = expectedFieldsToChecks([
    { field: "resolved_id", operator: "equals", value: "W2159974629" },
    { field: "citations", operator: "type", value: "array" },
  ]);
  it("names what a resync drops and adds", () => {
    const d = diffChecks({ checks: [
      { field: "resolved_id", operator: "equals", value: "W2159974629" },
      { field: "citations_unavailable", operator: "equals", value: false },
    ] }, next);
    expect(d.removed).toEqual(["citations_unavailable equals false"]);
    expect(d.added).toEqual(["citations type \"array\""]);
    expect(d.kept).toBe(1);
  });
  it("treats a value change as a removal plus an addition", () => {
    const d = diffChecks({ checks: [{ field: "resolved_id", operator: "equals", value: "W1" }] }, next);
    expect(d.removed).toEqual(["resolved_id equals \"W1\""]);
    expect(d.added).toContain("resolved_id equals \"W2159974629\"");
  });
  it("reads any current shape without throwing", () => {
    for (const cur of [null, undefined, {}, { checks: null }, { checks: [null, 3, { operator: "x" }] }]) {
      expect(diffChecks(cur, next)).toEqual({ removed: [], added: next.map(describeCheck), kept: 0 });
    }
  });
});

describe("one mapping, both writers", () => {
  const API = resolve(import.meta.dirname, "../..");
  const WRITERS = ["scripts/onboard.ts", "scripts/sync-known-answer-fixtures.ts"];
  for (const rel of WRITERS) {
    it(`${rel} calls the shared mapping and keeps no private copy`, () => {
      const src = readFileSync(resolve(API, rel), "utf8");
      expect(src).toMatch(/\bexpectedFieldsToChecks\s*\(/);
      // The retired copies both read `.expected_fields.map(`.
      expect(src).not.toMatch(/expected_fields\.map\s*\(/);
    });
  }
});
