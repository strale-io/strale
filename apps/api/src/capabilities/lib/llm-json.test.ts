/**
 * Tests for `extractJsonObject`.
 *
 * Regression origin: a 2026-08-14 x402 call to company-enrich for
 * openai.com failed with "Failed to parse enrichment result" even though
 * the model had returned a well-formed fenced JSON object. The old parser
 * stripped the fence with anchored regexes (/^```(json)?/ and /```\s*$/),
 * so any commentary after the closing fence left both the fence and the
 * prose in the string handed to JSON.parse.
 *
 * The "prose after the closing fence" case is the one that shipped the
 * incident, and it correlates with empty extractions: a model that found
 * nothing tends to explain itself afterwards. It is pinned first.
 */

import { describe, it, expect } from "vitest";
import { extractJsonObject } from "./llm-json.js";

const ALL_NULL_BODY = `{
  "company_name": null,
  "industry": null,
  "employee_estimate": null,
  "hq_location": null,
  "description": null,
  "social_links": { "linkedin": null, "twitter": null, "github": null },
  "tech_stack": null,
  "founded_year": null,
  "website": "https://openai.com"
}`;

describe("extractJsonObject — shapes that broke production", () => {
  it("recovers JSON when the model appends a note after the closing fence", () => {
    const raw = [
      "```json",
      ALL_NULL_BODY,
      "```",
      "",
      "Note: the page content appeared to be a JavaScript shell, so no",
      "company details could be determined.",
    ].join("\n");

    const parsed = extractJsonObject(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.website).toBe("https://openai.com");
    expect(parsed!.company_name).toBeNull();
  });

  it("recovers JSON when the model adds a preamble before the fence", () => {
    const raw = `Here is the extracted data:\n\n\`\`\`json\n${ALL_NULL_BODY}\n\`\`\``;
    expect(extractJsonObject(raw)?.website).toBe("https://openai.com");
  });

  it("prefers the fenced block when the preamble itself contains braces", () => {
    // This is the case the fenced candidate exists for: brace-scanning the
    // whole string would stop at the `{}` in the prose and never reach the
    // real object. Without the fence-first pass this returns the wrong
    // object, so it pins why that pass is not redundant machinery.
    const raw = [
      "I could not find some fields, so I used {} for those:",
      "```json",
      ALL_NULL_BODY,
      "```",
    ].join("\n");

    expect(extractJsonObject(raw)?.website).toBe("https://openai.com");
  });

  it("handles the plain fenced block the old parser already managed", () => {
    const raw = `\`\`\`json\n${ALL_NULL_BODY}\n\`\`\``;
    expect(extractJsonObject(raw)?.website).toBe("https://openai.com");
  });

  it("handles a bare object with no fence at all", () => {
    expect(extractJsonObject(ALL_NULL_BODY)?.website).toBe("https://openai.com");
  });

  it("handles a fence with no json language tag", () => {
    const raw = `\`\`\`\n${ALL_NULL_BODY}\n\`\`\``;
    expect(extractJsonObject(raw)?.website).toBe("https://openai.com");
  });
});

describe("extractJsonObject — brace scanning", () => {
  it("does not over-capture when trailing prose contains a brace", () => {
    const raw = `{"company_name":"Acme"}\n\nUse {placeholder} for missing values.`;
    expect(extractJsonObject(raw)).toEqual({ company_name: "Acme" });
  });

  it("keeps nested objects intact", () => {
    const raw = `{"a":{"b":{"c":1}},"d":2}`;
    expect(extractJsonObject(raw)).toEqual({ a: { b: { c: 1 } }, d: 2 });
  });

  it("ignores braces inside string values", () => {
    const raw = `{"description":"We use {{mustache}} templates","industry":"SaaS"}`;
    expect(extractJsonObject(raw)).toEqual({
      description: "We use {{mustache}} templates",
      industry: "SaaS",
    });
  });

  it("ignores escaped quotes inside string values", () => {
    const raw = String.raw`{"description":"They call it \"the platform\"","industry":"SaaS"}`;
    expect(extractJsonObject(raw)?.industry).toBe("SaaS");
  });
});

describe("extractJsonObject — returns null rather than partial data", () => {
  it("rejects output truncated mid-object", () => {
    const raw = '```json\n{"company_name":"Acme","industry":"Sa';
    expect(extractJsonObject(raw)).toBeNull();
  });

  it("rejects prose with no JSON in it", () => {
    expect(extractJsonObject("I could not access that website.")).toBeNull();
  });

  it("rejects empty output", () => {
    expect(extractJsonObject("")).toBeNull();
    expect(extractJsonObject("   \n  ")).toBeNull();
  });

  it("unwraps a single-object array rather than failing", () => {
    // The scanner starts at the first `{`, so an array wrapper is stepped
    // over. Deliberate: one object in a list is still the answer.
    expect(extractJsonObject('[{"company_name":"Acme"}]')).toEqual({
      company_name: "Acme",
    });
  });
});
