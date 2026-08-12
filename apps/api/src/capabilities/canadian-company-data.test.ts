import { describe, expect, it } from "vitest";
import { findRegistryNumber } from "./canadian-company-data.js";

// Registry-number detection for the Corporations Canada JSON API migration:
// corp IDs are NOT fixed-width (corp 1007 is real), 9 digits = business
// number, and short digit runs inside free text stay ambiguous.
describe("canadian findRegistryNumber", () => {
  it("accepts modern 7-digit corporation numbers", () => {
    expect(findRegistryNumber("3000061")).toBe("3000061");
  });

  it("accepts legacy short corporation numbers", () => {
    expect(findRegistryNumber("1007")).toBe("1007");
  });

  it("accepts 9-digit business numbers, with separators stripped", () => {
    expect(findRegistryNumber("106 679 285")).toBe("106679285");
  });

  it("extracts a 7-9 digit number embedded in free text", () => {
    expect(findRegistryNumber("look up corp 3000061 for me")).toBe("3000061");
  });

  it("does NOT extract short digit runs from free text (too ambiguous)", () => {
    expect(findRegistryNumber("founded in 2024 in Toronto")).toBeNull();
  });

  it("does not truncate longer digit runs into a wrong ID", () => {
    // The old /\d{7}/ rule matched the first 7 digits of a 10-digit run and
    // looked up an unrelated corporation.
    expect(findRegistryNumber("id 1234567890")).toBeNull();
  });

  it("returns null for pure names", () => {
    expect(findRegistryNumber("Abbotsford Chamber of Commerce")).toBeNull();
  });
});
