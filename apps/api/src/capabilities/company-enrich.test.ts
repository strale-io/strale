/**
 * Tests for company-enrich's `hasSubstance` billing guard.
 *
 * This is the half of the 2026-08-14 fix that decides whether €0.50 is
 * charged. Making the JSON parser tolerant (see lib/llm-json.test.ts) means
 * an all-null extraction now parses cleanly, so without this guard the
 * openai.com call would have started *succeeding* — returning an object of
 * nulls, billing for it, and violating the `guaranteed` / not_null contract
 * in manifests/company-enrich.yaml. A throw is never charged (DEC-14).
 *
 * The guard is deliberately lenient: one populated field is enough. It
 * catches the "extracted nothing" corner, not every partial result.
 */

import { describe, it, expect } from "vitest";
import { hasSubstance } from "./company-enrich.js";

const ALL_NULL = {
  company_name: null,
  industry: null,
  employee_estimate: null,
  hq_location: null,
  description: null,
  social_links: { linkedin: null, twitter: null, github: null },
  tech_stack: null,
  founded_year: null,
  website: "https://openai.com",
};

describe("hasSubstance — rejects", () => {
  it("the all-null shape the openai.com call produced", () => {
    expect(hasSubstance(ALL_NULL)).toBe(false);
  });

  it("an object carrying only fields we fill in ourselves", () => {
    // `website` is set by the executor, never by the model — it must not
    // count as substance or the guard would never fire.
    expect(hasSubstance({ website: "https://openai.com" })).toBe(false);
  });

  it("empty and whitespace-only strings", () => {
    expect(hasSubstance({ ...ALL_NULL, company_name: "" })).toBe(false);
    expect(hasSubstance({ ...ALL_NULL, description: "   " })).toBe(false);
  });

  it("an empty tech_stack array", () => {
    expect(hasSubstance({ ...ALL_NULL, tech_stack: [] })).toBe(false);
  });

  it("undefined fields and a wholly empty object", () => {
    expect(hasSubstance({ company_name: undefined })).toBe(false);
    expect(hasSubstance({})).toBe(false);
  });
});

describe("hasSubstance — accepts", () => {
  it("any single populated substantive field", () => {
    expect(hasSubstance({ ...ALL_NULL, company_name: "OpenAI" })).toBe(true);
    expect(hasSubstance({ ...ALL_NULL, industry: "AI Research" })).toBe(true);
    expect(hasSubstance({ ...ALL_NULL, tech_stack: ["Python"] })).toBe(true);
  });

  it("a non-empty employee_estimate that is not a string", () => {
    expect(hasSubstance({ ...ALL_NULL, employee_estimate: 500 })).toBe(true);
  });

  it("a fully populated result", () => {
    expect(
      hasSubstance({
        company_name: "Google",
        industry: "Technology",
        description: "Search and cloud.",
        hq_location: "Mountain View, United States",
        employee_estimate: "1000+",
        tech_stack: ["Google Cloud"],
      }),
    ).toBe(true);
  });
});
