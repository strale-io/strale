import { describe, expect, it } from "vitest";
import { legalRepresentativesReason } from "./estonian-company-data.js";

describe("legalRepresentativesReason", () => {
  it("never reads a dataset we never loaded as a fact about the company", () => {
    const reason = legalRepresentativesReason(0, null, null);
    expect(reason).toContain("says nothing about");
    expect(reason).not.toMatch(/newly registered|resigned/);
  });

  it("keeps the company-level reading once an ingest has completed", () => {
    const reason = legalRepresentativesReason(0, new Date("2026-10-30T10:00:00Z"), null);
    expect(reason).toMatch(/newly registered/);
    expect(reason).toContain("2026-10-30T10:00:00.000Z");
  });

  it("reports a cache failure as a failure", () => {
    expect(legalRepresentativesReason(0, null, "boom")).toContain("query failed (boom)");
  });

  it("attributes the source when representatives exist", () => {
    expect(legalRepresentativesReason(2, null, null)).toContain("CC BY 4.0");
  });
});
