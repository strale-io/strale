import { describe, expect, it } from "vitest";
import { enumerateEntryPoints } from "./gate5-path-coverage.js";

// Regression coverage for the alias refinement (KYB build-out 2026-08-12):
// alias fields funnel into the same firstString dispatch chain as their
// canonical field, so they must not be counted as separate entry points —
// otherwise every schema unblock (adding org_number/name/query/task aliases)
// demands N duplicate fixtures of the same two code paths.
describe("gate5 enumerateEntryPoints alias handling", () => {
  const danishStyleSchema = {
    type: "object",
    required: [],
    properties: {
      cvr_number: { type: "string", description: "Danish CVR number (8 digits)" },
      org_number: { type: "string", description: "Alias for cvr_number" },
      company_number: { type: "string", description: "Alias for cvr_number" },
      company_name: { type: "string", description: "Danish company name (resolved via scored registry search)" },
      name: { type: "string", description: "Alias for company_name" },
      query: { type: "string", description: "Free-text alias — CVR number or company name" },
      task: { type: "string", description: "Free-text alias — CVR number or company name" },
    },
  };

  it("keeps canonical ID and name fields as the only entry points", () => {
    const eps = enumerateEntryPoints("danish-company-data", danishStyleSchema);
    const fields = eps.map((e) => `${e.field}:${e.pathType}`).sort();
    expect(fields).toEqual(["company_name:SECONDARY", "cvr_number:PRIMARY"]);
  });

  it("skips 'Free-text input' style descriptions (belgian task field)", () => {
    const eps = enumerateEntryPoints("belgian-company-data", {
      properties: {
        enterprise_number: { type: "string", description: "KBO/BCE enterprise number (e.g. 0404.616.494)" },
        company_name: { type: "string", description: "Belgian company name (fuzzy match)" },
        task: { type: "string", description: "Free-text input — first matching enterprise number or name is used" },
      },
    });
    expect(eps.map((e) => e.field).sort()).toEqual(["company_name", "enterprise_number"]);
  });

  it("still counts real name fields without alias descriptions", () => {
    const eps = enumerateEntryPoints("x", {
      properties: {
        company_name: { type: "string", description: "Company name" },
      },
    });
    expect(eps).toHaveLength(1);
    expect(eps[0].pathType).toBe("SECONDARY");
  });

  it("does NOT declassify an alias whose target field is missing from the schema", () => {
    // Prose alone must not remove an entry point: "Alias for X" with no X in
    // properties falls through to normal classification.
    const eps = enumerateEntryPoints("x", {
      properties: {
        cvr_number: { type: "string", description: "Danish CVR number (8 digits)" },
        name: { type: "string", description: "Alias for company_name" },
      },
    });
    const fields = eps.map((e) => `${e.field}:${e.pathType}`).sort();
    expect(fields).toEqual(["cvr_number:PRIMARY", "name:SECONDARY"]);
  });
});
