import { describe, it, expect, vi } from "vitest";
import {
  looksLikeMissingTitle,
  findManifestMatch,
  planRelationalRepairs,
  repairJsonbLimitationsArray,
  type ManifestLimitation,
  type RelationalRow,
} from "./limitation-repair.js";

describe("looksLikeMissingTitle", () => {
  it("treats null/undefined/coercion-artifacts/whitespace as missing", () => {
    expect(looksLikeMissingTitle(null)).toBe(true);
    expect(looksLikeMissingTitle(undefined)).toBe(true);
    expect(looksLikeMissingTitle("undefined")).toBe(true);
    expect(looksLikeMissingTitle("null")).toBe(true);
    expect(looksLikeMissingTitle("NaN")).toBe(true);
    expect(looksLikeMissingTitle("   ")).toBe(true);
    expect(looksLikeMissingTitle("")).toBe(true);
  });

  it("treats a real title as present, including one containing 'undefined' as a substring", () => {
    expect(looksLikeMissingTitle("Coverage varies by country")).toBe(false);
    expect(looksLikeMissingTitle("Behavior is undefined for negative inputs")).toBe(false);
  });
});

describe("findManifestMatch", () => {
  const manifestLims = new Map<string, ManifestLimitation[]>([
    ["cap-a", [{ title: "Real title", text: "Some limitation text" }, { title: null, text: "Untitled in manifest too" }]],
  ]);

  it("matches by slug + trimmed text", () => {
    const { match, ambiguous } = findManifestMatch(manifestLims, "cap-a", "  Some limitation text  ");
    expect(match?.title).toBe("Real title");
    expect(ambiguous).toBe(false);
  });

  it("returns undefined for a slug with no manifest", () => {
    const { match } = findManifestMatch(manifestLims, "unknown-slug", "anything");
    expect(match).toBeUndefined();
  });

  it("returns undefined for a slug that exists but no text match", () => {
    const { match } = findManifestMatch(manifestLims, "cap-a", "no such text");
    expect(match).toBeUndefined();
  });

  it("flags ambiguous when two manifest entries share the same text", () => {
    const dup = new Map<string, ManifestLimitation[]>([
      ["cap-b", [{ title: "First", text: "Same text" }, { title: "Second", text: "Same text" }]],
    ]);
    const { match, ambiguous } = findManifestMatch(dup, "cap-b", "Same text");
    expect(ambiguous).toBe(true);
    expect(match?.title).toBe("First"); // first match wins
  });
});

describe("planRelationalRepairs", () => {
  const manifestLims = new Map<string, ManifestLimitation[]>([
    ["cap-a", [{ title: "Real title", text: "Text A" }]],
    ["cap-b", [{ title: null, text: "Text B" }]], // manifest source also lacks a title
  ]);

  function row(overrides: Partial<RelationalRow> = {}): RelationalRow {
    return { id: "id-1", capability_slug: "cap-a", title: "undefined", limitation_text: "Text A", ...overrides };
  }

  it("plans a repair when the manifest has a real title", () => {
    const { actions, unrepairable } = planRelationalRepairs([row()], manifestLims);
    expect(actions).toEqual([
      { rowId: "id-1", slug: "cap-a", text: "Text A", oldTitle: "undefined", newTitle: "Real title" },
    ]);
    expect(unrepairable).toEqual([]);
  });

  it("reports unrepairable when the manifest source also lacks a title", () => {
    const { actions, unrepairable } = planRelationalRepairs(
      [row({ capability_slug: "cap-b", limitation_text: "Text B" })],
      manifestLims,
    );
    expect(actions).toEqual([]);
    expect(unrepairable).toHaveLength(1);
    expect(unrepairable[0].reason).toMatch(/manifest source also lacks a title/);
  });

  it("reports unrepairable when no manifest entry matches by slug+text", () => {
    const { actions, unrepairable } = planRelationalRepairs(
      [row({ capability_slug: "cap-a", limitation_text: "No such text" })],
      manifestLims,
    );
    expect(actions).toEqual([]);
    expect(unrepairable[0].reason).toMatch(/no matching manifest limitation/);
  });

  it("warns but still uses the first match on ambiguous manifest text", () => {
    const dup = new Map<string, ManifestLimitation[]>([
      ["cap-c", [{ title: "First", text: "Dup" }, { title: "Second", text: "Dup" }]],
    ]);
    const warn = vi.fn();
    const { actions } = planRelationalRepairs(
      [row({ capability_slug: "cap-c", limitation_text: "Dup" })],
      dup,
      warn,
    );
    expect(actions[0].newTitle).toBe("First");
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe("repairJsonbLimitationsArray", () => {
  const manifestLims = new Map<string, ManifestLimitation[]>([
    ["cap-a", [
      { title: "Fixed title 1", text: "Text 1" },
      { title: "Fixed title 2", text: "Text 2" },
    ]],
  ]);

  // This is the exact regression the Codex review caught (MEDIUM 1): the
  // original script computed the "affected" count by re-scanning for
  // title === "undefined" AFTER the in-place mutation loop had already
  // fixed those entries — so a fully-repairable array reported zero
  // affected. affectedCount here must reflect the ORIGINAL array's
  // count, unconditionally.
  it("affectedCount reflects the pre-mutation count even when every entry is fully repairable", () => {
    const arr = [
      { title: "undefined", text: "Text 1" },
      { title: "undefined", text: "Text 2" },
    ];
    const result = repairJsonbLimitationsArray(arr, "cap-a", manifestLims);
    expect(result.affectedCount).toBe(2);
    expect(result.repaired).toHaveLength(2);
    // Every entry actually got repaired: no "undefined" titles survive.
    expect(result.newArray.filter((e) => e.title === "undefined")).toHaveLength(0);
    expect(result.newArray[0].title).toBe("Fixed title 1");
    expect(result.newArray[1].title).toBe("Fixed title 2");
  });

  it("never mutates the input array", () => {
    const arr = [{ title: "undefined", text: "Text 1" }];
    const snapshot = JSON.parse(JSON.stringify(arr));
    repairJsonbLimitationsArray(arr, "cap-a", manifestLims);
    expect(arr).toEqual(snapshot);
  });

  it("affectedCount counts unrepairable entries too — repair success and affected-count are independent", () => {
    const arr = [
      { title: "undefined", text: "Text 1" }, // repairable
      { title: "undefined", text: "No manifest match" }, // not repairable
    ];
    const result = repairJsonbLimitationsArray(arr, "cap-a", manifestLims);
    expect(result.affectedCount).toBe(2);
    expect(result.repaired).toHaveLength(1);
    expect(result.unrepairable).toHaveLength(1);
    // The unrepaired entry keeps its original (bad) title in newArray —
    // the script must not silently drop or blank it.
    expect(result.newArray[1].title).toBe("undefined");
  });

  it("leaves entries with a real title untouched and out of affectedCount", () => {
    const arr = [{ title: "Already fine", text: "Text 1" }];
    const result = repairJsonbLimitationsArray(arr, "cap-a", manifestLims);
    expect(result.affectedCount).toBe(0);
    expect(result.repaired).toHaveLength(0);
    expect(result.newArray).toEqual(arr);
  });

  it("returns affectedCount 0 on an empty array", () => {
    const result = repairJsonbLimitationsArray([], "cap-a", manifestLims);
    expect(result.affectedCount).toBe(0);
    expect(result.newArray).toEqual([]);
  });
});
