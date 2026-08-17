/**
 * Regression test for wiring sanitizeLimitationTitle into
 * seed-limitations.ts's write path (Codex review finding, MEDIUM 2 on the
 * 2026-08-17/18 "undefined"-limitation-title investigation).
 *
 * seed-limitations.ts runs `seed().catch(...)` + `process.exit(0)`
 * unconditionally at module scope in its original form — importing it for
 * a test would kill the vitest process. The entry-point guard
 * (`invokedDirectly`, mirroring seed-solutions.ts) makes importing safe:
 * `seed()` only fires when this file is the process entry point, which it
 * never is under vitest. This test never calls `seed()` and never touches
 * a DB — it only exercises the pure `computeLimitationWrite` helper and
 * the `LIMITATIONS` data it's fed from.
 */
import { describe, it, expect } from "vitest";
import { LIMITATIONS, computeLimitationWrite } from "./seed-limitations.js";

describe("seed-limitations.ts: sanitizeLimitationTitle wiring", () => {
  it("computeLimitationWrite sanitizes a coerced-'undefined' title to null", () => {
    const write = computeLimitationWrite(
      { capabilitySlug: "test-cap", title: "undefined", limitationText: "Some limitation text", category: "coverage", severity: "info" },
      0,
    );
    expect(write.title).toBeNull();
    expect(write.title).not.toBe("undefined");
  });

  it("computeLimitationWrite passes a real title through unchanged", () => {
    const write = computeLimitationWrite(
      { capabilitySlug: "test-cap", title: "Real title", limitationText: "Some limitation text", category: "coverage", severity: "info" },
      0,
    );
    expect(write.title).toBe("Real title");
  });

  it("computeLimitationWrite preserves index as sortOrder and passes through the other fields", () => {
    const write = computeLimitationWrite(
      {
        capabilitySlug: "test-cap",
        title: "T",
        limitationText: "L",
        category: "coverage",
        severity: "warning",
        affectedPercentage: 12.5,
        workaround: "W",
      },
      3,
    );
    expect(write).toEqual({
      capabilitySlug: "test-cap",
      title: "T",
      limitationText: "L",
      category: "coverage",
      severity: "warning",
      affectedPercentage: "12.5",
      workaround: "W",
      sortOrder: 3,
    });
  });

  // Not a hypothetical: this is exactly the shape of bug the whole
  // investigation started from. If someone ever authors (or a future
  // generator emits) a hand-authored `title: "undefined"` entry in the
  // LIMITATIONS array below, this test fails the build instead of the
  // literal string quietly reaching capability_limitations.title.
  it("no entry in the live LIMITATIONS array has a coerced-'undefined' title after sanitization", () => {
    const bad = LIMITATIONS
      .map((lim, i) => computeLimitationWrite(lim, i))
      .filter((w) => w.title === "undefined" || w.title === "null" || w.title === "NaN");
    expect(bad).toEqual([]);
  });
});
