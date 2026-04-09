import { describe, it, expect } from "vitest";
import { calculateNullFieldRatio } from "./null-field-ratio.js";

describe("calculateNullFieldRatio", () => {
  const schema5fields = {
    properties: {
      company_name: { type: "string" },
      registration_number: { type: "string" },
      business_type: { type: "string" },
      address: { type: "string" },
      status: { type: "string" },
    },
  };

  it("returns 0 ratio for fully populated output", () => {
    const output = {
      company_name: "Bosch GmbH",
      registration_number: "HRB 14000",
      business_type: "GmbH",
      address: "Gerlingen, DE",
      status: "active",
    };
    const result = calculateNullFieldRatio(output, schema5fields);
    expect(result.ratio).toBe(0);
    expect(result.nullCount).toBe(0);
    expect(result.wouldFail).toBe(false);
  });

  it("returns 1.0 ratio for all-null output", () => {
    const output = {
      company_name: null,
      registration_number: null,
      business_type: null,
      address: null,
      status: null,
    };
    const result = calculateNullFieldRatio(output, schema5fields);
    expect(result.ratio).toBe(1.0);
    expect(result.nullCount).toBe(5);
    expect(result.wouldFail).toBe(true);
  });

  it("fails at exactly 51% nulls (3/5 = 60%)", () => {
    const output = {
      company_name: null,
      registration_number: null,
      business_type: null,
      address: "Gerlingen, DE",
      status: "active",
    };
    const result = calculateNullFieldRatio(output, schema5fields);
    expect(result.ratio).toBe(0.6);
    expect(result.wouldFail).toBe(true);
  });

  it("passes at exactly 50% nulls (2/4 = 50%)", () => {
    const schema4 = {
      properties: {
        a: { type: "string" },
        b: { type: "string" },
        c: { type: "string" },
        d: { type: "string" },
      },
    };
    const output = { a: null, b: null, c: "yes", d: "yes" };
    const result = calculateNullFieldRatio(output, schema4);
    expect(result.ratio).toBe(0.5);
    expect(result.wouldFail).toBe(false); // >0.5 required, not >=0.5
  });

  it("does not apply when schema has fewer than 3 fields", () => {
    const schema2 = {
      properties: {
        valid: { type: "boolean" },
        message: { type: "string" },
      },
    };
    const output = { valid: null, message: null };
    const result = calculateNullFieldRatio(output, schema2);
    expect(result.applies).toBe(false);
    expect(result.wouldFail).toBe(false);
  });

  it("excludes common and rare fields from the ratio", () => {
    const reliability = {
      company_name: "guaranteed",
      registration_number: "guaranteed",
      business_type: "common",
      address: "common",
      status: "rare",
    };
    // Only 2 guaranteed fields → applies=false (< 3)
    const output = {
      company_name: null,
      registration_number: null,
      business_type: null,
      address: null,
      status: null,
    };
    const result = calculateNullFieldRatio(output, schema5fields, reliability);
    expect(result.totalFields).toBe(2);
    expect(result.applies).toBe(false);
  });

  it("counts guaranteed fields only when reliability is provided", () => {
    const schema6 = {
      properties: {
        a: { type: "string" },
        b: { type: "string" },
        c: { type: "string" },
        d: { type: "string" },
        e: { type: "string" },
        f: { type: "string" },
      },
    };
    const reliability = {
      a: "guaranteed",
      b: "guaranteed",
      c: "guaranteed",
      d: "guaranteed",
      e: "common",
      f: "rare",
    };
    // 4 guaranteed fields, 3 null → 75% → would fail
    const output = { a: null, b: null, c: null, d: "ok", e: null, f: null };
    const result = calculateNullFieldRatio(output, schema6, reliability);
    expect(result.totalFields).toBe(4);
    expect(result.nullCount).toBe(3);
    expect(result.ratio).toBe(0.75);
    expect(result.wouldFail).toBe(true);
  });

  it("treats empty strings as null", () => {
    const output = {
      company_name: "",
      registration_number: "  ",
      business_type: "GmbH",
      address: "Berlin",
      status: "active",
    };
    const result = calculateNullFieldRatio(output, schema5fields);
    expect(result.nullCount).toBe(2);
    expect(result.ratio).toBe(0.4);
    expect(result.wouldFail).toBe(false);
  });

  it("treats empty arrays as null", () => {
    const schema = {
      properties: {
        name: { type: "string" },
        directors: { type: "array" },
        addresses: { type: "array" },
        status: { type: "string" },
      },
    };
    const output = { name: "Bosch", directors: [], addresses: [], status: null };
    const result = calculateNullFieldRatio(output, schema);
    expect(result.nullCount).toBe(3); // directors, addresses, status
    expect(result.wouldFail).toBe(true); // 3/4 = 75%
  });

  it("returns safe result for null output", () => {
    const result = calculateNullFieldRatio(null, schema5fields);
    expect(result.ratio).toBe(0);
    expect(result.applies).toBe(false);
  });

  it("returns safe result for null schema", () => {
    const result = calculateNullFieldRatio({ a: 1 }, null);
    expect(result.ratio).toBe(0);
    expect(result.applies).toBe(false);
  });

  it("lists which fields are null", () => {
    const output = {
      company_name: null,
      registration_number: "HRB 14000",
      business_type: null,
      address: null,
      status: "active",
    };
    const result = calculateNullFieldRatio(output, schema5fields);
    expect(result.nullFields).toEqual(["company_name", "business_type", "address"]);
  });
});
