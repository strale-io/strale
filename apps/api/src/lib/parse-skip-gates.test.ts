/**
 * Cluster 2 Phase 2: parseSkipGates CLI helper tests.
 *
 * The helper itself lives in scripts/onboard.ts — since scripts/ is outside
 * the build-scope tsconfig, we test the identical parsing logic here as a
 * contract snapshot. If onboard.ts ever diverges from this behavior, the
 * cross-file drift is a bug and needs reconciling.
 */

import { describe, it, expect } from "vitest";

// Mirror of parseSkipGates in scripts/onboard.ts. Tests pin the contract.
function parseSkipGates(raw: string | undefined): Array<{ gate: string; reason: string }> {
  if (!raw) return [];
  return raw.split(",").map((entry) => {
    const [gate, ...reasonParts] = entry.split(":");
    const reason = reasonParts.join(":").trim();
    const trimmedGate = gate?.trim() ?? "";
    if (!trimmedGate || !reason) {
      throw new Error(`Invalid --skip-gates entry "${entry}". Format: gate:reason (comma-separated for multiple)`);
    }
    return { gate: trimmedGate, reason };
  });
}

describe("parseSkipGates (CLI parse for --skip-gates)", () => {
  it("returns empty array when input is undefined", () => {
    expect(parseSkipGates(undefined)).toEqual([]);
  });

  it("parses a single gate with reason", () => {
    expect(parseSkipGates("gate1_manifest:testing hotfix")).toEqual([
      { gate: "gate1_manifest", reason: "testing hotfix" },
    ]);
  });

  it("parses multiple gates separated by comma", () => {
    const result = parseSkipGates("gate1_manifest:r1,gate3_schema:r2");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ gate: "gate1_manifest", reason: "r1" });
    expect(result[1]).toEqual({ gate: "gate3_schema", reason: "r2" });
  });

  it("preserves colons within the reason string", () => {
    // gate:reason split is on first colon only; extra colons are part of reason
    expect(parseSkipGates("gate1_manifest:see ticket AB:123")).toEqual([
      { gate: "gate1_manifest", reason: "see ticket AB:123" },
    ]);
  });

  it("trims whitespace around the gate name", () => {
    expect(parseSkipGates("  gate1_manifest  :reason")).toEqual([
      { gate: "gate1_manifest", reason: "reason" },
    ]);
  });

  it("throws on malformed entry (missing reason)", () => {
    expect(() => parseSkipGates("gate1_manifest")).toThrow(/Invalid --skip-gates entry/);
  });

  it("throws on malformed entry (missing gate)", () => {
    expect(() => parseSkipGates(":just a reason")).toThrow(/Invalid --skip-gates entry/);
  });

  it("throws on malformed entry within a multi-entry string", () => {
    expect(() => parseSkipGates("gate1:reason,bad_entry")).toThrow(/Invalid --skip-gates entry/);
  });
});
