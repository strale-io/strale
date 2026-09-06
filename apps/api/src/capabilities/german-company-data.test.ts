import { describe, expect, it } from "vitest";
import { pickByName, pickByRegisterNumber, type AutocompleteResult } from "./german-company-data.js";

// Regression tests for the P0-sweep wrong-company finding (2026-08-12,
// disposition-v1): OpenRegister autocomplete for "HRB 2001 Landsberg a. Lech"
// returned the entity literally NAMED "HRB TREUHAND GMBH ..." (HRB 12530) and
// the executor took results[0]. Same class as PR #161 (FI/NO), #172 (CH),
// #173 (EE). Review then added two more cases: register numbers are per-COURT
// (same number at another Amtsgericht = different company), and sibling
// entities that normalize identically must be refused as ambiguous, never
// silently chosen.

function cand(partial: Partial<AutocompleteResult>): AutocompleteResult {
  return {
    company_id: "DE-HRB-X-1",
    name: "X",
    country: "DE",
    register_number: "1",
    register_type: "HRB",
    register_court: "München",
    active: true,
    legal_form: null,
    ...partial,
  };
}

const COURT = "Amtsgericht Landsberg a. Lech";

describe("pickByRegisterNumber", () => {
  const treuhand = cand({
    company_id: "DE-HRB-D3403-12530",
    name: "HRB TREUHAND GMBH Wirtschaftsprüfungsgesellschaft Steuerberatungsgesellschaft",
    register_number: "12530",
    register_type: "HRB",
    register_court: "Landsberg a. Lech",
  });
  const rational = cand({
    company_id: "DE-HRB-D2601-2001",
    name: "RATIONAL Aktiengesellschaft",
    register_number: "2001",
    register_type: "HRB",
    register_court: "Landsberg a. Lech",
  });

  it("refuses the exact production wrong-company case (HRB text matched as a NAME)", () => {
    expect(() => pickByRegisterNumber("HRB 2001", COURT, [treuhand])).toThrow(/No German company with HRB 2001/);
  });

  it("selects by register number even when a name-match ranks first", () => {
    expect(pickByRegisterNumber("HRB 2001", COURT, [treuhand, rational]).company_id).toBe("DE-HRB-D2601-2001");
  });

  it("refuses the same register number at a DIFFERENT court", () => {
    // Register numbers are per-court; HRB 2001 in Charlottenburg is another
    // company entirely. Review caught that v1 checked type+number but only
    // claimed the court check in its error text.
    const berlin = cand({ register_type: "HRB", register_number: "2001", register_court: "Charlottenburg", name: "Something Else GmbH" });
    expect(() => pickByRegisterNumber("HRB 2001", COURT, [berlin])).toThrow(/other register numbers or courts/);
  });

  it("court comparison tolerates prefix/punctuation variants", () => {
    const variant = cand({ ...rational, register_court: "Amtsgericht Landsberg a.Lech" });
    expect(pickByRegisterNumber("HRB 2001", "Landsberg a. Lech", [variant]).company_id).toBe("DE-HRB-D2601-2001");
  });

  it("does not confuse register types sharing a number", () => {
    const hra = cand({ register_type: "HRA", register_number: "2001", register_court: "Landsberg a. Lech", name: "Some KG" });
    expect(() => pickByRegisterNumber("HRB 2001", COURT, [hra])).toThrow(/No German company with HRB 2001/);
  });

  it("tolerates spacing and case variants of the requested number", () => {
    expect(pickByRegisterNumber("hrb2001", COURT, [rational]).company_id).toBe("DE-HRB-D2601-2001");
  });

  it("throws a clear parse error for unparseable register numbers", () => {
    expect(() => pickByRegisterNumber("garbage", COURT, [rational])).toThrow(/Unparseable German register number/);
  });
});

describe("pickByName", () => {
  const sap = cand({ company_id: "DE-HRB-F1103-719915", name: "SAP SE", register_number: "719915" });
  const sapCatering = cand({ company_id: "DE-HRB-X-2", name: "SAP Catering Service GmbH" });

  it("resolves an exact name (legal form stripped: SAP → SAP SE)", () => {
    expect(pickByName("SAP", [sapCatering, sap]).company_id).toBe("DE-HRB-F1103-719915");
  });

  it("resolves the full legal name", () => {
    expect(pickByName("SAP SE", [sapCatering, sap]).company_id).toBe("DE-HRB-F1103-719915");
  });

  it("refuses when two DISTINCT entities tie at the same confidence", () => {
    // "Muster GmbH" vs "Muster SE": both normalize to "muster" — separate
    // legal registrations. Choosing one silently is the wrong-company class;
    // the caller must disambiguate.
    const gmbh = cand({ company_id: "DE-HRB-A-100", name: "Muster GmbH", register_number: "100" });
    const seEnt = cand({ company_id: "DE-HRB-B-200", name: "Muster SE", register_number: "200" });
    // Anchored on the house-style prefix, not just the candidate count.
    // Unanchored, this regex matched the pre-2026-09-06 wording too — which
    // opened with the count and was recognised by none of the three health
    // consumers — so it could not have caught the defect it looks like it
    // guards. Independent review, 2026-09-06.
    expect(() => pickByName("Muster", [gmbh, seEnt]))
      .toThrow(/^Ambiguous German company name "Muster": 2 distinct German entities match/);
  });

  it("a duplicate listing of the SAME entity is not a tie", () => {
    expect(pickByName("SAP", [sap, { ...sap }]).company_id).toBe("DE-HRB-F1103-719915");
  });

  it("refuses when only unrelated entities come back, naming the closest", () => {
    const fysio = cand({ name: "Fysio Deutschland GmbH" });
    expect(() => pickByName("Siemens", [fysio])).toThrow(/No confident German registry match for "Siemens"/);
  });

  it("hints at free-text misuse for sentence-shaped queries", () => {
    const fysio = cand({ name: "Fysio Deutschland GmbH" });
    expect(() => pickByName("please look up the company register entry for Siemens in Germany", [fysio]))
      .toThrow(/pass the company name alone/);
  });

  it("refuses a single-token partial overlap (the Stripe-vs-Stripe-Holdings guard)", () => {
    const other = cand({ name: "RATIONAL Montage- und Vertriebs GmbH & Co. KG" });
    expect(() => pickByName("RATIONAL", [other])).toThrow(/No confident German registry match/);
  });

  it("accepts a high-confidence multi-token match", () => {
    const rationalAg = cand({ company_id: "DE-HRB-D2601-2001", name: "RATIONAL Aktiengesellschaft Großküchentechnik" });
    expect(pickByName("RATIONAL Aktiengesellschaft", [rationalAg]).company_id).toBe("DE-HRB-D2601-2001");
  });
});
