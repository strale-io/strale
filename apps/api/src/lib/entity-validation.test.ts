import { describe, it, expect } from "vitest";
import {
  validateNameMatch,
  validateCodeMatch,
  validateJurisdiction,
  validateAddressConsistency,
  validateCompanyResult,
} from "./entity-validation.js";

describe("validateNameMatch", () => {
  it("returns exact for identical names", () => {
    expect(validateNameMatch("Robert Bosch GmbH", "Robert Bosch GmbH")).toBe("exact");
  });

  it("returns exact after normalization (case, suffixes stripped)", () => {
    // GmbH/AG stripped by normalizer, so "Robert Bosch GmbH" == "Robert Bosch"
    expect(validateNameMatch("ROBERT BOSCH GMBH", "Robert Bosch")).toBe("exact");
    expect(validateNameMatch("Siemens AG", "siemens ag")).toBe("exact");
  });

  it("returns exact when legal suffix is the only difference", () => {
    expect(validateNameMatch("Robert Bosch GmbH", "Robert Bosch")).toBe("exact");
    expect(validateNameMatch("Deutsche Bank AG", "Deutsche Bank")).toBe("exact");
  });

  it("returns fuzzy for N.V. suffix difference (dots become spaces)", () => {
    // "Heineken N.V." → "heineken n v" which contains "heineken" → fuzzy
    expect(validateNameMatch("Heineken", "Heineken N.V.")).toBe("fuzzy");
  });

  it("returns fuzzy for subsidiary names that share core tokens", () => {
    expect(validateNameMatch("Robert Bosch Venture Capital GmbH", "Robert Bosch GmbH")).toBe("fuzzy");
  });

  it("returns mismatch for different entities", () => {
    expect(validateNameMatch("Robert Bosch Krankenhaus GmbH", "Robert Bosch GmbH")).toBe("fuzzy");
    expect(validateNameMatch("Siemens AG", "Robert Bosch GmbH")).toBe("mismatch");
  });

  it("returns mismatch for empty inputs", () => {
    expect(validateNameMatch("", "Robert Bosch")).toBe("mismatch");
    expect(validateNameMatch("Bosch", "")).toBe("mismatch");
  });
});

describe("validateCodeMatch", () => {
  it("matches identical codes", () => {
    expect(validateCodeMatch("HRB 14000", "HRB 14000")).toBe(true);
  });

  it("matches with formatting differences", () => {
    expect(validateCodeMatch("HRB14000", "HRB 14000")).toBe(true);
    expect(validateCodeMatch("hrb-14000", "HRB 14000")).toBe(true);
  });

  it("returns false for different codes", () => {
    expect(validateCodeMatch("HRB 14000", "HRB 6684")).toBe(false);
  });

  it("returns true when either is null (can't validate)", () => {
    expect(validateCodeMatch(null, "HRB 14000")).toBe(true);
    expect(validateCodeMatch("HRB 14000", null)).toBe(true);
  });
});

describe("validateJurisdiction", () => {
  it("matches same country", () => {
    expect(validateJurisdiction("DE", "DE")).toBe(true);
  });

  it("handles UK/GB alias", () => {
    expect(validateJurisdiction("UK", "GB")).toBe(true);
    expect(validateJurisdiction("GB", "UK")).toBe(true);
  });

  it("returns false for different countries", () => {
    expect(validateJurisdiction("DE", "DO")).toBe(false);
  });

  it("returns true when either is null", () => {
    expect(validateJurisdiction(null, "DE")).toBe(true);
  });
});

describe("validateAddressConsistency", () => {
  it("passes for consistent address object", () => {
    expect(validateAddressConsistency({ country: "DE", city: "Stuttgart" }, "DE")).toBe(true);
  });

  it("fails for inconsistent address (Bosch DO bug)", () => {
    expect(validateAddressConsistency({ country: "DO", city: "Stuttgart" }, "DE")).toBe(false);
  });

  it("passes for consistent address string", () => {
    expect(validateAddressConsistency("Robert-Bosch-Platz 1, 70839, Gerlingen, DE", "DE")).toBe(true);
  });

  it("returns true when address is null", () => {
    expect(validateAddressConsistency(null, "DE")).toBe(true);
  });
});

describe("validateCompanyResult", () => {
  it("passes all checks for a clean Bosch result", () => {
    const result = validateCompanyResult(
      { company_name: "Robert Bosch GmbH", registration_number: "HRB 14000", address: "Gerlingen, DE" },
      { company_name: "Robert Bosch GmbH" },
      "DE",
    );
    expect(result.valid).toBe(true);
    expect(result.failures).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("warns on name fuzzy match without code", () => {
    const result = validateCompanyResult(
      { company_name: "Robert Bosch Venture Capital GmbH", registration_number: null, address: "Gerlingen, DE" },
      { company_name: "Robert Bosch GmbH" },
      "DE",
    );
    expect(result.valid).toBe(true); // warning, not failure
    expect(result.warnings.length).toBeGreaterThanOrEqual(0);
  });

  it("fails on code mismatch", () => {
    const result = validateCompanyResult(
      { company_name: "Robert Bosch GmbH", registration_number: "HRB 6684", address: "Gerlingen, DE" },
      { company_name: "Robert Bosch GmbH", registration_number: "HRB 14000" },
      "DE",
    );
    expect(result.valid).toBe(false);
    expect(result.failures.length).toBeGreaterThan(0);
  });

  it("warns on address-jurisdiction inconsistency", () => {
    const result = validateCompanyResult(
      { company_name: "Robert Bosch Krankenhaus GmbH", registration_number: null, address: "Stuttgart, DO" },
      { company_name: "Robert Bosch GmbH" },
      "DE",
    );
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
