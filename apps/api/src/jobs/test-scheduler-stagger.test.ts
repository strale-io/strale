/**
 * Unit tests for the slug-hash staggering helper used by the test
 * scheduler (DEC-20260503-B).
 *
 * The scheduler dispatches free capabilities on a per-minute basis using
 * `slugStaggerMinute(slug) === currentMinute`. The helper must be:
 *  1. Deterministic — same slug always yields the same minute
 *  2. In range 0–59
 *  3. Reasonably well-distributed across the hour
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
});
