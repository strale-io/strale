/**
 * Regression test for the wait_for coercion bug surfaced by 2026-07 x402
 * traffic. A caller passed `wait_for:"3"` (a numeric string, meaning "wait 3
 * seconds") to screenshot-url; the executor routed every string into the
 * `waitForSelector` branch, so "3" was sent to Browserless as a CSS selector.
 * Browserless rejected it (HTTP 400). Only a real JS `number` ever reached the
 * intended `waitForTimeout` path.
 *
 * Post-fix: numeric strings and numbers both map to waitForTimeout (seconds →
 * ms, clamped 0..30); only non-numeric strings become selectors.
 */

import { describe, it, expect } from "vitest";
import { normalizeWaitFor } from "./screenshot-url.js";

describe("normalizeWaitFor", () => {
  it('treats a numeric string ("3") as a 3-second timeout, not a selector (the bug case)', () => {
    expect(normalizeWaitFor("3")).toEqual({ waitForTimeout: 3000 });
  });

  it("treats a JS number as seconds", () => {
    expect(normalizeWaitFor(2)).toEqual({ waitForTimeout: 2000 });
  });

  it("accepts fractional numeric strings", () => {
    expect(normalizeWaitFor("1.5")).toEqual({ waitForTimeout: 1500 });
  });

  it("treats a non-numeric string as a CSS selector", () => {
    expect(normalizeWaitFor("#main")).toEqual({
      waitForSelector: { selector: "#main", timeout: 10000 },
    });
  });

  it("clamps seconds to a 30s ceiling", () => {
    expect(normalizeWaitFor(120)).toEqual({ waitForTimeout: 30000 });
  });

  it("clamps negative seconds to 0", () => {
    expect(normalizeWaitFor(-5)).toEqual({ waitForTimeout: 0 });
  });

  it("returns null for empty / whitespace / undefined input", () => {
    expect(normalizeWaitFor(undefined)).toBeNull();
    expect(normalizeWaitFor("")).toBeNull();
    expect(normalizeWaitFor("   ")).toBeNull();
  });

  it("returns null for a non-finite number", () => {
    expect(normalizeWaitFor(NaN)).toBeNull();
    expect(normalizeWaitFor(Infinity)).toBeNull();
  });
});
