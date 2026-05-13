/**
 * Unit tests for the Zefix parseCompany shape-correctness cleanup.
 *
 * PR #107's smoke output exposed four parser bugs:
 *  - legal_form returned as Zefix's full object instead of a short string
 *  - legal_form_id read from `company.legalFormId` (doesn't exist)
 *    instead of `company.legalForm.id`
 *  - canton read via `legalSeat.canton` (legalSeat is a string, not object)
 *    instead of top-level `company.canton`
 *  - municipality read via `legalSeat.municipalityName` (same shape error)
 *    instead of the value of `legalSeat` itself (which IS the municipality
 *    name as a string)
 *
 * Per Rule 12: parser changes paired with regression tests using a
 * representative Zefix response fixture (Roche Holding AG, sampled
 * 2026-05-13 during PR #107 validation).
 */

import { describe, it, expect } from "vitest";
import {
  parseCompany,
  extractLegalFormShort,
  extractLegalFormId,
} from "./swiss-company-data.js";

// Trimmed Roche response captured via the actual Zefix REST API.
// Keeps just the keys parseCompany reads so the fixture is small.
const ROCHE_FIXTURE: Record<string, unknown> = {
  name: "Roche Holding AG",
  uid: "CHE101602521",
  chid: "CH27030051590",
  ehraid: 154673,
  legalSeatId: 2701,
  legalSeat: "Basel", // STRING (the prior parser tried to treat as object)
  legalForm: {
    id: 3,
    uid: "0106",
    name: {
      de: "Aktiengesellschaft",
      fr: "Société anonyme",
      it: "Società anonima",
      en: "Corporation",
    },
    shortName: {
      de: "AG",
      fr: "SA",
      it: "SA",
      en: "Ltd",
    },
  },
  status: "ACTIVE",
  canton: "BS", // top-level — NOT nested under legalSeat
  sogcDate: "2026-05-11",
  deletionDate: null,
  address: {
    organisation: "Roche Holding AG",
    street: "Grenzacherstrasse",
    houseNumber: "124",
    swissZipCode: "4070",
    city: "Basel",
  },
};

describe("parseCompany — Zefix response shape correctness", () => {
  it("legal_form is a string (Swiss-canonical short name), not the Zefix object", () => {
    const out = parseCompany(ROCHE_FIXTURE);
    expect(typeof out.legal_form).toBe("string");
    expect(out.legal_form).toBe("AG");
  });

  it("legal_form_id reads company.legalForm.id (not the absent company.legalFormId)", () => {
    const out = parseCompany(ROCHE_FIXTURE);
    expect(out.legal_form_id).toBe(3);
  });

  it("canton reads top-level company.canton (the 2-letter cantonal code)", () => {
    const out = parseCompany(ROCHE_FIXTURE);
    expect(out.canton).toBe("BS");
  });

  it("municipality reads the string value of company.legalSeat", () => {
    const out = parseCompany(ROCHE_FIXTURE);
    expect(out.municipality).toBe("Basel");
  });

  it("falls back gracefully when legalForm is missing or malformed", () => {
    // Defensive: parser must return null rather than crash if Zefix returns
    // an entity without legalForm (rare but possible for incomplete records).
    expect(extractLegalFormShort(undefined)).toBeNull();
    expect(extractLegalFormShort(null)).toBeNull();
    expect(extractLegalFormShort({})).toBeNull();
    expect(extractLegalFormShort({ shortName: null })).toBeNull();
    expect(extractLegalFormId(undefined)).toBeNull();
    expect(extractLegalFormId({})).toBeNull();
    expect(extractLegalFormId({ id: "not-a-number" })).toBeNull();
  });

  it("prefers .de but falls back to .en when .de is absent (non-Swiss-domiciled records)", () => {
    expect(extractLegalFormShort({ shortName: { en: "Ltd" } })).toBe("Ltd");
    expect(extractLegalFormShort({ shortName: { de: "AG", en: "Ltd" } })).toBe("AG");
  });

  it("preserves existing field extractions (company_name, uid, status, etc.)", () => {
    // Regression guard: the cleanup must not break the fields that were
    // already correct.
    const out = parseCompany(ROCHE_FIXTURE);
    expect(out.company_name).toBe("Roche Holding AG");
    expect(out.uid).toBe("CHE101602521");
    expect(out.ehraid).toBe(154673);
    expect(out.status).toBe("ACTIVE");
    expect(out.registration_date).toBe("2026-05-11");
    expect(out.address).toBe("Grenzacherstrasse, 124, 4070 Basel");
  });
});
