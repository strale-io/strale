/**
 * Unit tests for the slug-hash staggering helper used by the test
 * scheduler (DEC-20260503-B, refined by DEC-20260513-D — per-suite spread).
 *
 * The scheduler dispatches suites on a per-minute basis using
 * `slugStaggerMinute(slug, testType) === currentMinute`. The helper must be:
 *  1. Deterministic — same (slug, testType) always yields the same minute
 *  2. In range 0–59
 *  3. Reasonably well-distributed across the hour
 *  4. Per-suite spread: a capability's N suites map to up to N distinct minutes
 */

import { describe, it, expect } from "vitest";
import { slugStaggerMinute } from "./test-scheduler.js";

describe("slugStaggerMinute", () => {
  it("returns a value in [0, 59] for any slug", () => {
    const slugs = [
      "iban-validate",
      "email-validate",
      "swedish-company-data",
      "kyb-essentials-se",
      "vat-validate",
      "x",
      "a-very-long-slug-that-keeps-going-and-going-here",
    ];
    for (const slug of slugs) {
      const m = slugStaggerMinute(slug);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThanOrEqual(59);
      expect(Number.isInteger(m)).toBe(true);
    }
  });

  it("is deterministic — same slug always yields the same minute", () => {
    const slug = "kyb-complete-de";
    const minutes = new Set<number>();
    for (let i = 0; i < 100; i++) {
      minutes.add(slugStaggerMinute(slug));
    }
    expect(minutes.size).toBe(1);
  });

  it("distributes a realistic catalog across the hour", () => {
    // Synthetic catalog of 240 slugs (representative of the live free
    // capability count). All buckets should be hit, and no single bucket
    // should hold more than ~20% of the catalog (≈48 of 240).
    const slugs: string[] = [];
    for (let i = 0; i < 240; i++) slugs.push(`cap-${i}-test`);

    const buckets = new Map<number, number>();
    for (const slug of slugs) {
      const m = slugStaggerMinute(slug);
      buckets.set(m, (buckets.get(m) ?? 0) + 1);
    }

    // Every minute should hit at least once for 240 slugs across 60 buckets
    expect(buckets.size).toBeGreaterThanOrEqual(45);

    // No bucket should hold a runaway share
    const max = Math.max(...buckets.values());
    expect(max).toBeLessThan(48);
  });

  it("differs across small slug variations", () => {
    // Confirms the stagger isn't degenerate on adjacent slug shapes
    const a = slugStaggerMinute("kyb-essentials-se");
    const b = slugStaggerMinute("kyb-essentials-no");
    const c = slugStaggerMinute("kyb-essentials-dk");
    // It is statistically possible for two of these to collide; all three
    // colliding would be very unlikely and indicate a bad hash.
    const distinct = new Set([a, b, c]);
    expect(distinct.size).toBeGreaterThanOrEqual(2);
  });

  describe("per-suite spread (DEC-20260513-D)", () => {
    // The five test_type values active for shipped capabilities. Other
    // values exist (piggyback, known_bad) but those don't get scheduled.
    const SUITES = ["known_answer", "schema_check", "negative", "edge_case", "dependency_health"];

    it("two-arg form spreads slovak-company-data's 5 suites across the hour", () => {
      // Regression test for the rate-limit-burst pattern at the :41 tick.
      // Pre-DEC-20260513-D: all 5 suites fired on the same minute (41),
      // saturating Zenedge's sliding-window throttle on api.statistics.sk.
      // Post-fix: the 5 suites map to >=4 distinct minutes so per-minute
      // upstream load stays at ≤1 req/min for steady-state.
      const minutes = new Set<number>();
      for (const t of SUITES) {
        minutes.add(slugStaggerMinute("slovak-company-data", t));
      }
      // Collisions across 5 draws from 60 buckets are possible (≈17% chance
      // of >=1 collision per the birthday formula). Asserting >=4 distinct
      // gives us a >99% pass rate while still failing if all 5 collapse to
      // the same minute — the pathology this guards against.
      expect(minutes.size).toBeGreaterThanOrEqual(4);
    });

    it("is deterministic for (slug, testType) pairs", () => {
      const minutes = new Set<number>();
      for (let i = 0; i < 100; i++) {
        minutes.add(slugStaggerMinute("slovak-company-data", "known_answer"));
      }
      expect(minutes.size).toBe(1);
    });

    it("single-arg and two-arg forms differ for the same slug", () => {
      const slugOnly = slugStaggerMinute("slovak-company-data");
      const withType = slugStaggerMinute("slovak-company-data", "known_answer");
      // The two-arg form hashes `slug:testType` — must be a different value
      // than the single-arg slug-only hash (unless the empty testType is
      // accidentally substituted somewhere).
      // Collision is statistically possible (1/60 chance) but unlikely for
      // any specific slug; using slovak-company-data which we've verified.
      expect(slugOnly).not.toBe(withType);
    });

    it("different testType for same slug produces different minute (typical case)", () => {
      // Confirms two-arg form is sensitive to testType. Statistically a
      // pair may collide (1/60), so we verify on >=3 pairs that not ALL
      // collide. Same logic as the original "differs across small slug
      // variations" test.
      const a = slugStaggerMinute("slovak-company-data", "known_answer");
      const b = slugStaggerMinute("slovak-company-data", "schema_check");
      const c = slugStaggerMinute("slovak-company-data", "negative");
      expect(new Set([a, b, c]).size).toBeGreaterThanOrEqual(2);
    });

    it("distributes well across a synthetic (cap × suite) catalog", () => {
      // 60 caps × 5 suites = 300 (slug, suite) pairs. Should fill ≥45 of
      // 60 buckets and no bucket should hold a runaway share.
      const buckets = new Map<number, number>();
      for (let i = 0; i < 60; i++) {
        for (const t of SUITES) {
          const m = slugStaggerMinute(`cap-${i}-test`, t);
          buckets.set(m, (buckets.get(m) ?? 0) + 1);
        }
      }
      expect(buckets.size).toBeGreaterThanOrEqual(45);
      const max = Math.max(...buckets.values());
      expect(max).toBeLessThan(60);
    });
  });
});
