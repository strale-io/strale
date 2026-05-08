/**
 * Regression test for the findKbo truncation bug surfaced by the
 * 2026-05-08 BE parity audit (docs/research/2026-05-08-belgian-company-data-parity-audit.md).
 *
 * Pre-fix shape: an unanchored substring fallback regex matched only
 * the first 9 digits of a 10-digit input not starting with `0`, then
 * `padStart(10, "0")` prepended a `0` — silently rewriting input
 * `1234567890` to a different valid KBO `0123456789`. Active silent
 * data corruption for pre-2008 enterprise numbering.
 *
 * Post-fix shape: BE/VAT prefix + separators stripped explicitly, then
 * exactly 9 (zero-padded) or 10 digits accepted. Anything else returns
 * null and the executor falls through to fuzzy name search.
 */

import { describe, it, expect } from "vitest";
import { findKbo } from "./belgian-company-data.js";

describe("findKbo", () => {
  it("preserves a 10-digit KBO that does not start with 0 (pre-2008 numbering, the bug case)", () => {
    expect(findKbo("1234567890")).toBe("1234567890");
  });

  it("preserves a 10-digit KBO that does start with 0", () => {
    expect(findKbo("0417497106")).toBe("0417497106");
  });

  it("zero-pads a 9-digit legacy VAT shape", () => {
    expect(findKbo("417497106")).toBe("0417497106");
  });

  it("strips a BE prefix from a 10-digit identifier", () => {
    expect(findKbo("BE0417497106")).toBe("0417497106");
  });

  it("strips a BE prefix and space from a dotted identifier", () => {
    expect(findKbo("BE 0417.497.106")).toBe("0417497106");
  });

  it("strips a lowercase be prefix and dashes", () => {
    expect(findKbo("be-0417-497-106")).toBe("0417497106");
  });

  it("accepts dotted formatting without a BE prefix", () => {
    expect(findKbo("0417.497.106")).toBe("0417497106");
  });

  it("returns null for free-text input that is not an identifier", () => {
    expect(findKbo("ANHEUSER-BUSCH INBEV")).toBeNull();
  });

  it("returns null for garbage input", () => {
    expect(findKbo("abc")).toBeNull();
  });

  it("returns null for an 11-digit overlong number rather than silently truncating", () => {
    expect(findKbo("12345678901")).toBeNull();
  });

  it("returns null for a string that mixes digits with embedded text", () => {
    expect(findKbo("Find KBO 0417497106 please")).toBeNull();
  });
});
