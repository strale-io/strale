import { describe, expect, it } from "vitest";
import { pickByName, pickByRegisterNumber, type AutocompleteResult } from "./german-company-data.js";

// Regression tests for the P0-sweep wrong-company finding (2026-08-12,
// disposition-v1): OpenRegister autocomplete for "HRB 2001 Landsberg a. Lech"
// returned the entity literally NAMED "HRB TREUHAND GMBH ..." (HRB 12530) and
// the executor took results[0]. Same class as PR #161 (FI/NO), #172 (CH),
// #173 (EE). These tests pin both directions: real queries must resolve,
// wrong entities must be refused — never silently substituted.

function cand(partial: Partial<AutocompleteResult>): AutocompleteResult {
  return {
    company_id: "DE-HRB-X-1",
    name: "X",
    country: "DE",
    register_number: "1",
    register_type: "HRB",
    register_court: "X",
    active: true,
    legal_form: null,
    ...partial,
  };
}

describe("pickByRegisterNumber", () => {
  const treuhand = cand({
    company_id: "DE-HRB-D3403-12530",
    name: "HRB TREUHAND GMBH Wirtschaftsprüfungsgesellschaft Steuerberatungsgesellschaft",
    register_number: "12530",
    register_type: "HRB",
  });
  const rational = cand({
    company_id: "DE-HRB-D2601-2001",
    name: "RATIONAL Aktiengesellschaft",
    register_number: "2001",
    register_type: "HRB",
  });

  it("refuses the exact production wrong-company case (HRB text matched as a NAME)", () => {
    expect(() => pickByRegisterNumber("HRB 2001", [treuhand])).toThrow(/No German company with HRB 2001/);
  });

  it("selects by register number even when a name-match ranks first", () => {
    expect(pickByRegisterNumber("HRB 2001", [treuhand, rational]).company_id).toBe("DE-HRB-D2601-2001");
  });

  it("does not confuse register types sharing a number", () => {
    const hra = cand({ register_type: "HRA", register_number: "2001", name: "Some KG" });
    expect(() => pickByRegisterNumber("HRB 2001", [hra])).toThrow(/No German company with HRB 2001/);
  });

  it("tolerates spacing and case variants of the requested number", () => {
    expect(pickByRegisterNumber("hrb2001", [rational]).company_id).toBe("DE-HRB-D2601-2001");
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

  it("refuses when only unrelated entities come back, naming the closest", () => {
    const fysio = cand({ name: "Fysio Deutschland GmbH" });
    expect(() => pickByName("Siemens", [fysio])).toThrow(/No confident German registry match for "Siemens"/);
  });

  it("refuses a single-token partial overlap (the Stripe-vs-Stripe-Holdings guard)", () => {
    const other = cand({ name: "RATIONAL Montage- und Vertriebs GmbH & Co. KG" });
    // Single-token query vs multi-token different entity: classifier rates low.
    expect(() => pickByName("RATIONAL", [other])).toThrow(/No confident German registry match/);
  });

  it("accepts a high-confidence multi-token match", () => {
    const rationalAg = cand({ company_id: "DE-HRB-D2601-2001", name: "RATIONAL Aktiengesellschaft Großküchentechnik" });
    expect(pickByName("RATIONAL Aktiengesellschaft", [rationalAg]).company_id).toBe("DE-HRB-D2601-2001");
  });
});
