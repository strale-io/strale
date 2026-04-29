import { describe, expect, it, beforeAll } from "vitest";

// audit.ts transitively imports audit-token.ts which requires
// AUDIT_HMAC_SECRET >= 32 chars at module load. Set before dynamic import.
beforeAll(() => {
  process.env.AUDIT_HMAC_SECRET ??= "unit-test-audit-secret-plenty-of-entropy-0123456789";
  process.env.ADMIN_SECRET ??= "unit-test-admin-secret-plenty-of-entropy-0123456789";
});

type Extractor = (auditTrail: unknown, fallbackTotalLatencyMs: number | null) => Map<string, number>;

let extract: Extractor;

beforeAll(async () => {
  const mod = await import("./audit.js");
  extract = mod.extractStoredStepLatencies as Extractor;
});

describe("extractStoredStepLatencies — CCO #1 + #2", () => {
  describe("solution rows (multi-step audit_trail.steps[])", () => {
    it("returns map of capabilitySlug → real latencyMs", () => {
      const auditTrail = {
        solutionSlug: "kyb-essentials-se",
        steps: [
          { index: 0, capabilitySlug: "vat-validate", status: "completed", latencyMs: 4500, error: null },
          { index: 1, capabilitySlug: "swedish-company-data", status: "completed", latencyMs: 12, error: null },
          { index: 2, capabilitySlug: "sanctions-check", status: "completed", latencyMs: 1, error: null },
        ],
        stepsSucceeded: 3,
        stepsFailed: 0,
        totalLatencyMs: 4513,
        refunded: false,
      };

      const map = extract(auditTrail, 4513);

      expect(map.get("vat-validate")).toBe(4500);
      expect(map.get("swedish-company-data")).toBe(12);
      expect(map.get("sanctions-check")).toBe(1);
      expect(map.size).toBe(3);
    });

    it("CCO #2 regression guard: does NOT fabricate even-division per-step latency", () => {
      // Pre-fix: every step rendered as ~floor(4513/3) = 1504ms. Fix
      // returns the REAL latencies so the 4500ms outlier is visible to
      // an auditor — exactly the failure pattern that needs to be visible.
      const auditTrail = {
        steps: [
          { capabilitySlug: "step-a", latencyMs: 4500 },
          { capabilitySlug: "step-b", latencyMs: 12 },
          { capabilitySlug: "step-c", latencyMs: 1 },
        ],
      };

      const map = extract(auditTrail, 4513);

      // The outlier is preserved
      expect(map.get("step-a")).toBe(4500);
      // The fast steps are NOT smeared into a fabricated average
      expect(map.get("step-b")).toBe(12);
      expect(map.get("step-c")).toBe(1);
      // None of the values are even-division of total_latency / step_count
      expect(map.get("step-a")).not.toBe(Math.floor(4513 / 3));
      expect(map.get("step-b")).not.toBe(Math.floor(4513 / 3));
    });

    it("skips steps with malformed entries", () => {
      const auditTrail = {
        steps: [
          { capabilitySlug: "good", latencyMs: 100 },
          { capabilitySlug: "bad", latencyMs: "not-a-number" }, // malformed
          { capabilitySlug: "alsoGood", latencyMs: 200 },
          { latencyMs: 300 }, // missing slug
        ],
      };

      const map = extract(auditTrail, null);

      expect(map.get("good")).toBe(100);
      expect(map.get("alsoGood")).toBe(200);
      expect(map.has("bad")).toBe(false);
      expect(map.size).toBe(2);
    });
  });

  describe("capability rows (single-step audit_trail with top-level latency_ms)", () => {
    it("returns single __single entry with stored latency_ms", () => {
      const auditTrail = {
        transaction_id: "txn_abc",
        capability: "sanctions-check",
        latency_ms: 437,
        data_source: "Dilisense consolidated",
      };

      const map = extract(auditTrail, 437);
      expect(map.get("__single")).toBe(437);
      expect(map.size).toBe(1);
    });
  });

  describe("legacy rows (no stored audit_trail)", () => {
    it("falls back to row-level latencyMs when audit_trail is null", () => {
      const map = extract(null, 250);
      expect(map.get("__single")).toBe(250);
    });

    it("returns empty map when both audit_trail and fallback are absent", () => {
      const map = extract(null, null);
      expect(map.size).toBe(0);
    });

    it("returns empty when audit_trail is wrong shape (no steps[], no latency_ms)", () => {
      const auditTrail = { someOtherShape: "ignored" };
      const map = extract(auditTrail, null);
      expect(map.size).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("handles empty steps[] gracefully (returns empty map, not crash)", () => {
      const auditTrail = { steps: [] };
      const map = extract(auditTrail, null);
      expect(map.size).toBe(0);
    });

    it("does not throw on undefined input", () => {
      expect(() => extract(undefined, null)).not.toThrow();
    });

    it("does not throw on string input (defensive)", () => {
      expect(() => extract("not-an-object", null)).not.toThrow();
    });
  });
});
