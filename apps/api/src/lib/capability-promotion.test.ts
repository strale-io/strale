import { describe, expect, it } from "vitest";
import {
  evaluatePromotion,
  DEFAULT_PROMOTION_CONFIG,
  type PromotionStats,
} from "./capability-promotion.js";
import { toPromotionStats, type PromotionEvidenceRow } from "../jobs/capability-promotion.js";

// Promotion semantics pinned both directions (DEC-20260504-A). Every test here
// is written to fail against the pre-fix state, which was "no promotion code
// exists at all" — so the discriminating property is that each one asserts a
// specific gate, not merely that a decision list is returned.

function cap(partial: Partial<PromotionStats>): PromotionStats {
  return {
    slug: "x",
    lifecycleState: "validating",
    visible: false,
    x402Enabled: false,
    isFreeTier: false,
    maintenanceClass: "free-stable-api",
    marketplaceEligible: true,
    deactivationReason: null,
    hasX402Method: true,
    breakerState: "closed",
    totalTests: 100,
    passedTests: 100,
    distinctTestDays: 7,
    knownAnswerTotal: 20,
    knownAnswerPassed: 20,
    ...partial,
  };
}

const only = (rows: PromotionStats[]) => evaluatePromotion(rows)[0];

describe("evaluatePromotion — the happy path", () => {
  it("promotes a delisted capability with a green week and opens x402", () => {
    const d = only([cap({ slug: "url-to-text" })]);
    expect(d.action).toBe("promote");
    expect(d.enableX402).toBe(true);
    expect(d.reason).toContain("green week met");
  });

  it("promotes out of probation and out of active-but-invisible, not just validating", () => {
    for (const lifecycleState of ["probation", "active"]) {
      expect(only([cap({ lifecycleState })]).action).toBe("promote");
    }
  });
});

describe("evaluatePromotion — evidence gates", () => {
  it("holds below the 95% pass rate even though the 70% floor would keep it listed", () => {
    // 80% sits above the quarantine floor and below the promotion bar. The two
    // bars are deliberately different; this pins the gap.
    expect(evaluatePromotion([cap({ passedTests: 80 })])).toEqual([]);
    expect(DEFAULT_PROMOTION_CONFIG.minPassRate).toBeGreaterThan(0.7);
  });

  it("holds on too few results, however green", () => {
    expect(evaluatePromotion([cap({ totalTests: 20, passedTests: 20, knownAnswerTotal: 5, knownAnswerPassed: 5 })])).toEqual([]);
  });

  it("holds when a whole week of results landed on too few calendar days", () => {
    // 100 green results in a single day is a burst, not a week.
    expect(evaluatePromotion([cap({ distinctTestDays: 1 })])).toEqual([]);
  });

  it("refuses when liveness is green but correctness is failing", () => {
    // The case an aggregate pass rate hides: schema/negative/dependency suites
    // carry the average while every known_answer assertion fails.
    const d = only([cap({ totalTests: 100, passedTests: 96, knownAnswerTotal: 20, knownAnswerPassed: 4 })]);
    expect(d.action).toBe("none");
    expect(d.reason).toContain("failing correctness");
  });

  it("refuses when there is no known_answer evidence at all", () => {
    const d = only([cap({ knownAnswerTotal: 0, knownAnswerPassed: 0 })]);
    expect(d.action).toBe("none");
    expect(d.reason).toContain("correctness unproven");
  });
});

describe("evaluatePromotion — human intent is never overridden", () => {
  it("never promotes a capability that carries a deactivation reason", () => {
    expect(evaluatePromotion([cap({ deactivationReason: "CourtListener token expired" })])).toEqual([]);
  });

  it("never promotes a marketplace-ineligible capability", () => {
    expect(evaluatePromotion([cap({ marketplaceEligible: false })])).toEqual([]);
  });

  it("flags rather than promotes a fragile maintenance class", () => {
    const d = only([cap({ slug: "screenshot-url", maintenanceClass: "scraping-fragile-target" })]);
    expect(d.action).toBe("flag");
    expect(d.enableX402).toBe(false);
  });

  it("ignores capabilities that are already visible", () => {
    expect(evaluatePromotion([cap({ visible: true })])).toEqual([]);
  });
});

describe("evaluatePromotion — safety interlocks", () => {
  it("never promotes while the circuit breaker is not closed", () => {
    for (const breakerState of ["open", "half_open"]) {
      expect(evaluatePromotion([cap({ breakerState })])).toEqual([]);
    }
  });

  it("treats a missing breaker row as healthy", () => {
    expect(only([cap({ breakerState: null })]).action).toBe("promote");
  });

  it("self-throttles to the per-run budget, best evidence first", () => {
    const rows = [
      cap({ slug: "weakest", passedTests: 96 }),
      cap({ slug: "strongest", passedTests: 100 }),
      cap({ slug: "middle", passedTests: 98 }),
      cap({ slug: "fourth", passedTests: 99 }),
    ];
    const decisions = evaluatePromotion(rows, { ...DEFAULT_PROMOTION_CONFIG, maxPromotionsPerRun: 2 });
    const promoted = decisions.filter((d) => d.action === "promote").map((d) => d.slug);
    expect(promoted).toEqual(["strongest", "fourth"]);
    expect(decisions.find((d) => d.slug === "middle")?.reason).toContain("budget");
  });

  it("publishes to the catalog but not to x402 when the rail is inapplicable", () => {
    expect(only([cap({ isFreeTier: true })]).enableX402).toBe(false);
    expect(only([cap({ hasX402Method: false })]).enableX402).toBe(false);
    // …and still publishes, because catalog visibility is the point.
    expect(only([cap({ hasX402Method: false })]).action).toBe("promote");
  });
});

describe("toPromotionStats", () => {
  it("maps every SQL column to the field the core reads", () => {
    // Guards the swap that would matter most: ka_passed read as passed_tests
    // would report correctness as green on the strength of liveness tests.
    const row: PromotionEvidenceRow = {
      slug: "s",
      lifecycle_state: "validating",
      visible: false,
      x402_enabled: false,
      is_free_tier: true,
      maintenance_class: "free-stable-api",
      marketplace_eligible: true,
      deactivation_reason: null,
      has_x402_method: true,
      breaker_state: "closed",
      total_tests: 90,
      passed_tests: 89,
      distinct_test_days: 6,
      ka_total: 10,
      ka_passed: 3,
    };
    expect(toPromotionStats([row])[0]).toEqual({
      slug: "s",
      lifecycleState: "validating",
      visible: false,
      x402Enabled: false,
      isFreeTier: true,
      maintenanceClass: "free-stable-api",
      marketplaceEligible: true,
      deactivationReason: null,
      hasX402Method: true,
      breakerState: "closed",
      totalTests: 90,
      passedTests: 89,
      distinctTestDays: 6,
      knownAnswerTotal: 10,
      knownAnswerPassed: 3,
    });
  });

  it("carries a correctness failure through the mapping into a refusal", () => {
    const row: PromotionEvidenceRow = {
      slug: "s", lifecycle_state: "validating", visible: false, x402_enabled: false,
      is_free_tier: false, maintenance_class: "free-stable-api", marketplace_eligible: true,
      deactivation_reason: null, has_x402_method: true, breaker_state: "closed",
      total_tests: 100, passed_tests: 97, distinct_test_days: 7, ka_total: 10, ka_passed: 1,
    };
    expect(only(toPromotionStats([row])).action).toBe("none");
  });
});
