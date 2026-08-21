/**
 * The disclosure has to be right, because it is the thing a regulator reads.
 *
 * These tests pin the boundaries rather than the prose. A window whose end is
 * wrong by a day would tell a customer their record was evidenced when it was
 * not, or the reverse — and the reverse is not the safe direction either, since
 * over-disclosing a defect is its own kind of inaccuracy.
 */

import { describe, expect, it } from "vitest";

import {
  CHAIN_INTEGRITY_WINDOWS,
  orderingEvidenceUnavailable,
  windowsCovering,
} from "./chain-integrity-windows.js";

const INSIDE = new Date("2026-06-15T00:00:00.000Z");
const BEFORE = new Date("2026-05-01T00:00:00.000Z");
const AFTER = new Date("2026-08-22T00:00:00.000Z");

describe("the 2026-05-04 ordering window", () => {
  it("covers a record created inside it", () => {
    expect(orderingEvidenceUnavailable(INSIDE)).toBe(true);
    expect(windowsCovering(INSIDE)).toHaveLength(1);
  });

  it("does not cover records before it", () => {
    // The chain worked before the null-completed_at row was written. Claiming
    // otherwise would disclose a defect that did not exist.
    expect(orderingEvidenceUnavailable(BEFORE)).toBe(false);
  });

  it("does not cover records after the fix", () => {
    expect(orderingEvidenceUnavailable(AFTER)).toBe(false);
  });

  it("is closed, with an end at the deploy that fixed it", () => {
    const w = CHAIN_INTEGRITY_WINDOWS[0]!;
    expect(w.to, "an open window would mean the defect is still live").not.toBeNull();
    expect(Date.parse(w.to!)).toBeGreaterThan(Date.parse(w.from));
  });

  it("states what remains reliable, not only what was lost", () => {
    // A disclosure that omits this reads as "the audit trail is worthless",
    // which is both false and unhelpful to whoever has to act on it.
    const w = CHAIN_INTEGRITY_WINDOWS[0]!;
    expect(w.unaffected).toMatch(/per-row integrity/i);
    expect(w.lost).toEqual(["ordering_and_completeness"]);
    expect(w.lost).not.toContain("row_integrity");
  });

  it("every window has a cause and a remedy", () => {
    for (const w of CHAIN_INTEGRITY_WINDOWS) {
      expect(w.cause.length, `${w.id} needs a cause`).toBeGreaterThan(40);
      expect(w.remedy.length, `${w.id} needs a remedy`).toBeGreaterThan(40);
    }
  });
});
