import { describe, expect, it } from "vitest";
import { pickByName } from "./irish-company-data.js";

// Regression coverage for the #161 wrong-company class applied to Ireland:
// the CRO Open Data Portal's datastore_search returns a Postgres ts_rank
// score, but rank reflects term frequency, not entity identity. The pre-fix
// code sorted only by Live/Normal status and returned sorted[0] with zero
// name-relevance check — live-verified 2026-08-13: searching "Kerry" ranks
// WEST KERRY DEVELOPMENTS LIMITED (dissolved 2010) and WEST KERRY BUILDERS
// LIMITED identically, and neither is a name match to "Kerry" at all.

function record(company_name: string, company_num: number, company_status = "Normal"): any {
  return { company_name, company_num, company_status };
}

describe("irish pickByName", () => {
  it("resolves an unambiguous exact match", () => {
    const r = pickByName("Stripe Payments Europe, Limited", [
      record("STRIPE PAYMENTS EUROPE, LIMITED", 513174),
      record("WEST KERRY BUILDERS LIMITED", 386177, "Dissolved"),
    ]);
    expect(r.record.company_num).toBe(513174);
    expect(r.matchConfidence).toBe("exact");
  });

  it("refuses when two distinct entities tie at the same confidence — status is not a tiebreaker", () => {
    // A dissolved and a live company sharing the same name must both surface
    // as candidates, not silently resolve to the live one.
    const dup = [
      record("Acme Widgets Limited", 100001, "Dissolved"),
      record("Acme Widgets Limited", 100002, "Normal"),
    ];
    expect(() => pickByName("Acme Widgets Limited", dup)).toThrow(/Ambiguous Irish company name "Acme Widgets Limited": 2 distinct/);
  });

  it("a duplicate listing of the SAME company number is not a tie", () => {
    const r = record("STRIPE PAYMENTS EUROPE, LIMITED", 513174);
    const resolved = pickByName("Stripe Payments Europe", [r, { ...r }]);
    expect(resolved.record.company_num).toBe(513174);
  });

  it("refuses a bare generic name with no genuine match, naming the closest (Kerry regression)", () => {
    expect(() =>
      pickByName("Kerry", [
        record("WEST KERRY DEVELOPMENTS LIMITED", 368365, "Dissolved"),
        record("WEST KERRY BUILDERS LIMITED", 386177, "Dissolved"),
      ]),
    ).toThrow(/No confident Irish registry match for "Kerry".*WEST KERRY DEVELOPMENTS LIMITED/s);
  });

  it("accepts a high-confidence multi-token match", () => {
    const r = pickByName("CRH International", [record("CRH International Trading Limited", 104547)]);
    expect(r.matchConfidence).toBe("high");
    expect(r.record.company_num).toBe(104547);
  });
});
