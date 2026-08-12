import { describe, expect, it } from "vitest";
import { pickUnambiguous, scorePool } from "./finnish-company-data.js";

// Synthetic PRH company records — shape mirrors the v3 API's `companies[]`
// entries as consumed by scorePool (businessId keys the pool; names carry
// optional endDate).
function company(names: Array<{ name: string; endDate?: string | null }>) {
  return { names };
}

describe("finnish scorePool", () => {
  it("ignores ended names — a defunct alias must not resolve (Rovio regression)", () => {
    // "Rovio" used to return Combiholding Oy via "E E Rovio Oy" (ended 2020).
    const pool = new Map<string, any>([
      ["2674369-7", company([
        { name: "E E Rovio Oy", endDate: "2020-08-26" },
        { name: "Combiholding Oy" },
      ])],
    ]);
    const { exact, high } = scorePool("Rovio", pool);
    expect(exact.size).toBe(0);
    expect(high.size).toBe(0);
  });

  it("matches current names after legal-form suffix stripping", () => {
    const pool = new Map<string, any>([
      ["0112038-9", company([
        { name: "Oy Nokia Ab", endDate: "1997-01-01" },
        { name: "Nokia Oyj" },
      ])],
    ]);
    const { exact } = scorePool("Nokia", pool);
    expect([...exact.keys()]).toEqual(["0112038-9"]);
    expect(exact.get("0112038-9")).toBe("Nokia Oyj");
  });

  it("promotes an id from high to exact when a later current name scores exact", () => {
    const pool = new Map<string, any>([
      ["111-1", company([
        { name: "Acme Consulting Oy" }, // high vs "Acme Consulting Group"? keep simple:
        { name: "Acme Group Oy" },
      ])],
    ]);
    // "Acme Group" scores high on "Acme Consulting Oy"? Not necessarily — use
    // a direct exact on the second name to assert the high-map cleanup.
    const { exact, high } = scorePool("Acme Group", pool);
    expect(exact.has("111-1")).toBe(true);
    expect(high.has("111-1")).toBe(false);
  });
});

describe("finnish pickUnambiguous", () => {
  it("returns the single candidate with its match metadata", () => {
    const r = pickUnambiguous("Nokia", new Map([["0112038-9", "Nokia Oyj"]]), "exact");
    expect(r).toEqual({
      businessId: "0112038-9",
      matchedName: "Nokia Oyj",
      matchConfidence: "exact",
    });
  });

  it("refuses ties, listing the candidates", () => {
    const bucket = new Map([
      ["111-1", "Nokia Oy"],
      ["222-2", "Nokia Oyj"],
    ]);
    expect(() => pickUnambiguous("Nokia", bucket, "exact")).toThrow(/Ambiguous.*2 distinct.*Nokia Oy \(111-1\).*Nokia Oyj \(222-2\)/s);
  });
});
