import { describe, it, expect } from "vitest";
import { acceptable, evaluate } from "./eval.js";
describe("search evaluation contract", () => {
  it("reports low-coverage none queries separately without weakening the positive gate", () => {
    const metrics = evaluate([
      { query: { q: "flight", kind: "none", expect: [] }, slugs: ["unrelated"], topCoverage: 0.3 },
      { query: { q: "send sms", kind: "none", expect: [] }, slugs: ["phone-type-detect"], topCoverage: 1 },
      { query: { q: "email", kind: "keyword", expect: ["email-validate"] }, slugs: ["email-validate"], topCoverage: 1 },
    ], "typeahead");
    expect(metrics.find((m) => m.kind === "none")).toMatchObject({ count: 2, top1: 1 });
    expect(metrics.at(-1)).toMatchObject({ count: 1, top1: 1 });
  });
  it("matches whole slugs and only two-letter family suffixes", () => {
    expect(acceptable("kyb-complete-de", ["kyb-complete-{cc}"])).toBe(true);
    for (const slug of [
      "kyb-complete",
      "kyb-complete-de-extra",
      "kyb-complete-germany",
      "kyb-complete-d",
    ])
      expect(acceptable(slug, ["kyb-complete-{cc}"])).toBe(false);
  });
  it("scores top-1, top-3 and reciprocal rank at five, and excludes none from typeahead", () => {
    const rows = [
      {
        query: { q: "a", kind: "natural", expect: ["correct"] },
        slugs: ["wrong", "correct"],
      },
      {
        query: { q: "b", kind: "keyword", expect: ["correct"] },
        slugs: ["correct"],
      },
      {
        query: { q: "c", kind: "keyword", expect: ["correct"] },
        slugs: ["1", "2", "3", "4", "5", "correct"],
      },
      { query: { q: "d", kind: "none", expect: [] }, slugs: [] },
    ];
    expect(evaluate(rows, "typeahead").at(-1)).toEqual({
      kind: "overall",
      count: 3,
      top1: 1,
      top3: 2,
      mrr5: 0.5,
    });
    expect(evaluate(rows, "suggest").at(-1)).toEqual({
      kind: "overall",
      count: 4,
      top1: 2,
      top3: 3,
      mrr5: 0.625,
    });
    expect(
      evaluate(
        [{ query: { q: "x", kind: "none", expect: [] }, slugs: ["wrong"] }],
        "suggest"
      )[0].top1
    ).toBe(0);
  });
});
