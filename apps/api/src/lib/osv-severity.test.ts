import { describe, expect, it } from "vitest";
import { cvssV3BaseScore, osvSeverity } from "./osv-severity.js";

describe("OSV severity", () => {
  it.each([
    ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", 9.8, "critical"],
    ["CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N", 6.1, "medium"],
    ["CVSS:3.1/AV:L/AC:H/PR:H/UI:R/S:U/C:L/I:N/A:N", 1.8, "low"],
    ["CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H", 10, "critical"],
  ])("scores %s as %s (%s)", (vector, score, severity) => {
    expect(cvssV3BaseScore(vector)).toBe(score);
    expect(osvSeverity({ severity: [{ type: "CVSS_V3", score: vector }] })).toBe(severity);
  });

  it("returns unknown for malformed and CVSS v4-only vectors", () => {
    expect(osvSeverity({ severity: [{ type: "CVSS_V3", score: "CVSS:3.1/AV:N" }] })).toBe("unknown");
    expect(osvSeverity({ severity: [{ type: "CVSS_V4", score: "CVSS:4.0/AV:N" }] })).toBe("unknown");
  });

  it("prefers the advisory's case-insensitive named rating", () => {
    expect(osvSeverity({ database_specific: { severity: "Moderate" } })).toBe("medium");
  });
});
