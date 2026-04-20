import { describe, it, expect } from "vitest";
import { assertDiscoverNotDryRun } from "./onboard-guards.js";

describe("F-B-005: assertDiscoverNotDryRun", () => {
  it("throws when both --dry-run and --discover are set", () => {
    expect(() => assertDiscoverNotDryRun(true, true)).toThrow(
      /--discover requires live execution and cannot be combined with --dry-run/,
    );
  });

  it("does not throw for --dry-run alone", () => {
    expect(() => assertDiscoverNotDryRun(true, false)).not.toThrow();
  });

  it("does not throw for --discover alone", () => {
    expect(() => assertDiscoverNotDryRun(false, true)).not.toThrow();
  });

  it("does not throw when neither is set", () => {
    expect(() => assertDiscoverNotDryRun(false, false)).not.toThrow();
  });

  it("error message points the operator to the fix", () => {
    try {
      assertDiscoverNotDryRun(true, true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toContain("Re-run without --dry-run");
      expect(msg).toContain("use --dry-run alone");
      return;
    }
    throw new Error("expected throw");
  });
});
