/**
 * Regression tests for the 2026-08-14 /v1/suggest solutions-only defect.
 *
 * `/v1/suggest` returned a bundled solution for every query and never a
 * capability. Production evidence at the time:
 *
 *   "validate an IBAN"                  -> solution:payment-validate
 *   "find company contact info"         -> solution:kyc-sweden
 *   "check if an email address is valid" -> solution:lead-email-verify
 *   "look up a Swedish company"         -> solution:verify-us-company  (a US
 *                                          solution for a Swedish query)
 *
 * Cause: solutions received an unconditional +3 ranking bonus while raw token
 * scores top out around 3. The bonus was therefore larger than the evidence it
 * was added to, so a solution matching one word outranked a capability matching
 * the whole query. The bonus is now withheld when a capability wins on raw
 * merit.
 *
 * These tests fail against the unconditional bonus and pass against the
 * conditional one.
 */

import { describe, it, expect } from "vitest";
import { applyConditionalSolutionBonus } from "./suggest.js";

type Row = { item: { type: "solution" | "capability"; slug: string }; score: number };

const row = (type: "solution" | "capability", slug: string, score: number): Row => ({
  item: { type, slug },
  score,
});

/** Rank after the bonus, highest first — what the caller ultimately sees. */
function winner(rows: Row[]): string {
  applyConditionalSolutionBonus(rows);
  return [...rows].sort((a, b) => b.score - a.score)[0].item.slug;
}

describe("conditional solutions bonus", () => {
  it("lets a capability that outscores every solution win (the reported defect)", () => {
    // "validate an IBAN": the capability matches both query words, the
    // solution only one. Under the old +3 the solution won anyway.
    const rows = [row("capability", "iban-validate", 4), row("solution", "payment-validate", 2)];
    expect(winner(rows)).toBe("iban-validate");
  });

  it("does not add the bonus at all when a capability leads", () => {
    const rows = [row("capability", "iban-validate", 4), row("solution", "payment-validate", 2)];
    applyConditionalSolutionBonus(rows);
    expect(rows.find((r) => r.item.slug === "payment-validate")!.score).toBe(2);
  });

  it("still prefers the solution for workflow-shaped queries", () => {
    // "onboard a new supplier with full compliance checks": the bundle matches
    // more of the query than any single step of it does.
    const rows = [row("solution", "vendor-onboard", 4), row("capability", "vat-validate", 2)];
    expect(winner(rows)).toBe("vendor-onboard");
  });

  it("breaks an exact tie in favour of the solution", () => {
    // Deliberate: an ambiguous query should surface the bundle, which lists its
    // steps, rather than one arbitrary step of it.
    const rows = [row("capability", "sanctions-check", 3), row("solution", "kyc-sweden", 3)];
    expect(winner(rows)).toBe("kyc-sweden");
  });

  it("applies the bonus to every solution, not just the top one", () => {
    const rows = [row("solution", "a", 3), row("solution", "b", 2), row("capability", "c", 1)];
    applyConditionalSolutionBonus(rows);
    expect(rows.map((r) => r.score)).toEqual([6, 5, 1]);
  });

  it("handles a field with no solutions", () => {
    const rows = [row("capability", "dns-lookup", 3)];
    expect(() => applyConditionalSolutionBonus(rows)).not.toThrow();
    expect(rows[0].score).toBe(3);
  });

  it("handles a field with no capabilities", () => {
    const rows = [row("solution", "kyb-essentials-se", 2)];
    applyConditionalSolutionBonus(rows);
    expect(rows[0].score).toBe(5);
  });

  it("handles an empty field", () => {
    const rows: Row[] = [];
    expect(() => applyConditionalSolutionBonus(rows)).not.toThrow();
  });
});
