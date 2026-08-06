/**
 * Phase A0b regression tests for the cost-class boot invariant.
 *
 * Per DEC-20260504-A (audit-followup test coverage): the invariant is
 * the only thing that prevents an unclassified-cap fleet from rotting
 * unnoticed under GRACE. Pinning STRICT's process.exit and GRACE's
 * skip-unclassified log shape so a future engineer can't silently turn
 * STRICT into a no-op.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDbExecute = vi.fn();
vi.mock("../db/index.js", () => ({
  getDb: () => ({ execute: mockDbExecute }),
}));

import { assertCostClassTaxonomy, resolveCostClassMode } from "./cost-class-invariant.js";

beforeEach(() => {
  mockDbExecute.mockReset();
});

describe("resolveCostClassMode", () => {
  it("defaults to GRACE when unset", () => {
    expect(resolveCostClassMode(undefined)).toBe("GRACE");
  });
  it("returns STRICT for 'STRICT' (any case)", () => {
    expect(resolveCostClassMode("STRICT")).toBe("STRICT");
    expect(resolveCostClassMode("strict")).toBe("STRICT");
    expect(resolveCostClassMode(" Strict ")).toBe("STRICT");
  });
  it("returns GRACE for unrecognized values", () => {
    expect(resolveCostClassMode("paranoid")).toBe("GRACE");
    expect(resolveCostClassMode("")).toBe("GRACE");
  });
});

describe("assertCostClassTaxonomy", () => {
  it("no unclassified rows: returns cleanly (GRACE)", async () => {
    mockDbExecute.mockResolvedValueOnce([]);
    await expect(
      assertCostClassTaxonomy({ mode: "GRACE" }),
    ).resolves.toBeUndefined();
  });

  it("no unclassified rows: returns cleanly (STRICT)", async () => {
    mockDbExecute.mockResolvedValueOnce([]);
    await expect(
      assertCostClassTaxonomy({ mode: "STRICT" }),
    ).resolves.toBeUndefined();
  });

  it("GRACE: tolerates unclassified rows (returns void, no exit)", async () => {
    mockDbExecute.mockResolvedValueOnce([
      { slug: "x", name: "X cap" },
      { slug: "y", name: "Y cap" },
    ]);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((_code?: number) => {
      throw new Error("process.exit called unexpectedly");
    }) as never);
    await expect(
      assertCostClassTaxonomy({ mode: "GRACE" }),
    ).resolves.toBeUndefined();
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  it("STRICT: aborts boot by throwing StartupFatalError when unclassified rows exist", async () => {
    // Regression (2026-08 review of the 2026-07-02 incident fix): STRICT used
    // to process.exit(1) directly, which bypassed the fatal-startup email in
    // index.ts main().catch — the exact silent-death mode the alert closes.
    // It must THROW so the single fatal path owns alert-then-exit.
    mockDbExecute.mockResolvedValueOnce([
      { slug: "x", name: "X cap" },
    ]);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit(${code})`);
    }) as never);
    const { StartupFatalError } = await import("./startup-fatal.js");
    await expect(
      assertCostClassTaxonomy({ mode: "STRICT" }),
    ).rejects.toBeInstanceOf(StartupFatalError);
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});
