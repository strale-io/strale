import { describe, expect, it } from "vitest";
import { pickByName } from "./uk-company-data.js";

// Regression coverage for the #161 wrong-company class applied to Companies
// House: /search/companies applies its own relevance weighting but that is
// not an identity match, and the pre-fix code took items_per_page=1 (i.e.
// results[0]) unconditionally.

function item(title: string, company_number: string) {
  return { title, company_number };
}

describe("uk pickByName", () => {
  it("resolves an unambiguous exact match", () => {
    const r = pickByName("Tesco", [item("TESCO PLC", "00445790"), item("TESCO CONSULTING LTD", "99999999")]);
    expect(r).toEqual({ companyNumber: "00445790", matchedName: "TESCO PLC", matchConfidence: "exact" });
  });

  it("refuses when two distinct companies tie at the same confidence", () => {
    // Two DIFFERENT company numbers both named (after normalization)
    // identically to the query — e.g. a dissolved entity re-registered under
    // the same name. Choosing one silently is the wrong-company class; the
    // caller must disambiguate with the company number.
    const dup = [item("Acme Widgets Limited", "33333333"), item("Acme Widgets Limited", "44444444")];
    expect(() => pickByName("Acme Widgets", dup)).toThrow(/Ambiguous UK company name "Acme Widgets": 2 distinct/);
  });

  it("a duplicate listing of the SAME company number is not a tie", () => {
    const r = pickByName("Tesco", [item("TESCO PLC", "00445790"), item("TESCO PLC", "00445790")]);
    expect(r.companyNumber).toBe("00445790");
  });

  it("refuses a single-token partial overlap (Stripe-vs-Stripe-Holdings guard)", () => {
    expect(() => pickByName("Stripe", [item("Stripe Financial Holdings Ltd", "55555555")]))
      .toThrow(/No confident Companies House match for "Stripe"/);
  });

  it("refuses when nothing in the page matches, naming the closest", () => {
    expect(() => pickByName("Siemens", [item("Fysio Deutschland Ltd", "66666666")]))
      .toThrow(/No confident Companies House match for "Siemens".*Fysio Deutschland Ltd/s);
  });

  it("accepts a high-confidence multi-token match", () => {
    const r = pickByName("Tesco Stores", [item("Tesco Stores Ireland Limited", "77777777")]);
    expect(r.matchConfidence).toBe("high");
    expect(r.companyNumber).toBe("77777777");
  });
});
