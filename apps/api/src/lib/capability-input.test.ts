/**
 * Unit contract for the shared capability input guards.
 *
 * The production defect these exist to stop (2026-09-04): a caller sends a
 * bare string where the manifest declares an array. `(input.x as string[])`
 * is a compile-time-only assertion, so the string flows straight through,
 * satisfies every `.length` check — a string has a length — and then dies on
 * `.map is not a function`. The customer saw an unstructured 500 rather than
 * the structured refusal the contract promises.
 *
 * The asymmetry that matters here: absent must stay cheap (`[]`, so the
 * executor's own required-field check owns that decision), while present-and-
 * wrong-shape must be loud.
 */

import { describe, it, expect } from "vitest";
import {
  readStringArray,
  readBoundedInt,
  InputShapeError,
} from "./capability-input.js";

describe("readStringArray", () => {
  it("treats absence as an empty list, leaving required-ness to the caller", () => {
    expect(readStringArray(undefined, "languages")).toEqual([]);
    expect(readStringArray(null, "languages")).toEqual([]);
  });

  it("passes a well-formed array through unchanged", () => {
    expect(readStringArray(["typescript", "go"], "languages")).toEqual([
      "typescript",
      "go",
    ]);
    expect(readStringArray([], "languages")).toEqual([]);
  });

  it("refuses a bare string instead of letting it reach .map", () => {
    // The exact production input shape. Before the fix this returned the
    // string, `"python".length === 6` passed the emptiness guard, and
    // `.map` threw a TypeError out of the executor.
    expect(() => readStringArray("python", "languages")).toThrow(
      InputShapeError,
    );
    expect(() => readStringArray("python", "languages")).toThrow(
      /'languages' must be an array of strings, but received a string/,
    );
  });

  it("tells the caller the shape to send, not just that they are wrong", () => {
    expect(() => readStringArray("python", "languages")).toThrow(
      /Send \["value"\] rather than "value"/,
    );
  });

  it("refuses other non-array scalars and objects", () => {
    for (const bad of [42, true, { a: 1 }]) {
      expect(() => readStringArray(bad, "languages")).toThrow(InputShapeError);
    }
  });

  it("refuses an array containing a non-string, naming the index", () => {
    // `.toLowerCase()` on element 1 was the second crash site in
    // gitignore-generate, reachable even with a correctly-typed outer array.
    expect(() => readStringArray(["ts", 7], "languages")).toThrow(
      /item 1 is a number/,
    );
    expect(() => readStringArray(["ts", null], "languages")).toThrow(
      /item 1 is null/,
    );
  });

  it("appends a caller-supplied hint when given", () => {
    expect(() => readStringArray("x", "timezones", "IANA names.")).toThrow(
      /IANA names\.$/,
    );
  });
});

describe("readBoundedInt", () => {
  it("falls back when absent", () => {
    expect(
      readBoundedInt(undefined, "max_redirects", { min: 1, max: 30, fallback: 20 }),
    ).toBe(20);
  });

  it("clamps below min so a caller cannot skip a loop entirely", () => {
    // redirect-trace: max_redirects: 0 made `for (step = 1; step <= 0)` never
    // run, leaving the result array empty and crashing the read after it.
    expect(
      readBoundedInt(0, "max_redirects", { min: 1, max: 30, fallback: 20 }),
    ).toBe(1);
    expect(
      readBoundedInt(-5, "max_redirects", { min: 1, max: 30, fallback: 20 }),
    ).toBe(1);
  });

  it("clamps above max", () => {
    expect(
      readBoundedInt(999, "max_redirects", { min: 1, max: 30, fallback: 20 }),
    ).toBe(30);
  });

  it("refuses a non-numeric value rather than yielding NaN", () => {
    // `Number("abc")` is NaN and every comparison against NaN is false, which
    // is the silent form of the same skipped-loop bug.
    expect(() =>
      readBoundedInt("abc", "max_redirects", { min: 1, max: 30, fallback: 20 }),
    ).toThrow(InputShapeError);
    expect(() =>
      readBoundedInt({}, "max_redirects", { min: 1, max: 30, fallback: 20 }),
    ).toThrow(InputShapeError);
  });

  it("truncates a fractional value into the range", () => {
    expect(
      readBoundedInt(3.9, "max_redirects", { min: 1, max: 30, fallback: 20 }),
    ).toBe(3);
  });
});
