import { describe, expect, it } from "vitest";
import { tedCountryCode } from "./ted-procurement.js";

describe("ted-procurement country filter", () => {
  // TED's organisation-country-buyer holds alpha-3; an alpha-2 filter matched
  // no notice at all, so every country-filtered search returned zero results.
  it("sends ISO alpha-3, whatever form the caller used", () => {
    expect(tedCountryCode("SE")).toBe("SWE");
    expect(tedCountryCode("se")).toBe("SWE");
    expect(tedCountryCode("SWE")).toBe("SWE");
    expect(tedCountryCode("Sweden")).toBe("SWE");
    expect(tedCountryCode("DE")).toBe("DEU");
  });

  it("accepts the EU code EL for Greece", () => {
    expect(tedCountryCode("EL")).toBe("GRC");
  });

  it("refuses a country it cannot resolve instead of searching for nothing", () => {
    expect(() => tedCountryCode("XX")).toThrow(/'country'/);
  });
});
