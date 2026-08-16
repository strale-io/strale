import { describe, expect, it, afterEach } from "vitest";
import {
  evaluatePromotion,
  DEFAULT_PROMOTION_CONFIG,
  type PromotionStats,
} from "./capability-promotion.js";
import {
  toPromotionStats,
  isEnforceMode,
  PROMOTION_EVIDENCE_SQL,
  type PromotionEvidenceRow,
} from "../jobs/capability-promotion.js";

// Promotion semantics pinned both directions (DEC-20260504-A). Each test
// asserts one specific gate, so breaking that gate breaks that test — verified
// by mutation, see the PR body.

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
    wasDelisted: false,
    delistingReason: null,
    wasFloorQuarantine: false,
    totalTests: 100,
    passedTests: 100,
    distinctTestDays: 7,
    knownAnswerTotal: 20,
    knownAnswerPassed: 20,
    latestKnownAnswerPassed: true,
    recentTotal: 14,
    recentPassed: 14,
    piggybackTotal: 0,
    piggybackPassed: 0,
    ...partial,
  };
}

const only = (rows: PromotionStats[]) => evaluatePromotion(rows)[0];

function row(partial: Partial<PromotionEvidenceRow>): PromotionEvidenceRow {
  return {
    slug: "s", lifecycle_state: "validating", visible: false, x402_enabled: false,
    is_free_tier: false, maintenance_class: "free-stable-api", marketplace_eligible: true,
    deactivation_reason: null, has_x402_method: true, breaker_state: "closed",
    last_listing_event: null, total_tests: 100, passed_tests: 100, distinct_test_days: 7,
    ka_total: 20, ka_passed: 20, latest_ka_passed: true, recent_total: 14, recent_passed: 14,
    piggyback_total: 0, piggyback_passed: 0, ...partial,
  };
}

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
    expect(evaluatePromotion([cap({ distinctTestDays: 1 })])).toEqual([]);
  });

  it("refuses when liveness is green but correctness is failing", () => {
    const d = only([cap({ totalTests: 100, passedTests: 96, knownAnswerTotal: 20, knownAnswerPassed: 4 })]);
    expect(d.action).toBe("none");
    expect(d.reason).toContain("failing correctness");
  });

  it("refuses when there is no known_answer evidence at all", () => {
    const d = only([cap({ knownAnswerTotal: 0, knownAnswerPassed: 0, latestKnownAnswerPassed: null })]);
    expect(d.action).toBe("none");
    expect(d.reason).toContain("correctness unproven");
  });
});

describe("evaluatePromotion — the week's average must not outvote today", () => {
  it("refuses when the most recent known_answer result failed", () => {
    // 95 passes then a fresh failure still averages 95%. Promotion is a claim
    // about now.
    const d = only([cap({ latestKnownAnswerPassed: false })]);
    expect(d.action).toBe("none");
    expect(d.reason).toContain("broken now");
  });

  it("refuses when the trailing 24h is degrading, however green the week", () => {
    const d = only([cap({ recentTotal: 10, recentPassed: 5 })]);
    expect(d.action).toBe("none");
    expect(d.reason).toContain("currently degrading");
  });

  it("refuses when the last 24h carries too little evidence to judge", () => {
    const d = only([cap({ recentTotal: 1, recentPassed: 1 })]);
    expect(d.action).toBe("none");
    expect(d.reason).toContain("last 24h");
  });
});

describe("evaluatePromotion — real customers outrank our own harness", () => {
  it("refuses when piggyback (real paid calls) is failing under a green harness", () => {
    // ~98% of platform traffic is the harness. Averaging 2 real failures into
    // 100 harness passes erases the only evidence that matters.
    const d = only([cap({ totalTests: 102, passedTests: 100, piggybackTotal: 2, piggybackPassed: 0 })]);
    expect(d.action).toBe("none");
    expect(d.reason).toContain("the customers are the ones who count");
  });

  it("promotes when piggyback evidence exists and is green", () => {
    expect(only([cap({ piggybackTotal: 4, piggybackPassed: 4 })]).action).toBe("promote");
  });
});

describe("evaluatePromotion — human takedowns are never overturned; floor takedowns can be, on recovery", () => {
  it("never promotes a capability that carries a deactivation reason", () => {
    expect(evaluatePromotion([cap({ deactivationReason: "CourtListener token expired" })])).toEqual([]);
  });

  it("never promotes a marketplace-ineligible capability", () => {
    expect(evaluatePromotion([cap({ marketplaceEligible: false })])).toEqual([]);
  });

  // "Promotion grace" fix (2026-08-16): a quality-floor quarantine that
  // clears every gate above it (correctness, recency, piggyback) is now
  // auto-reversed rather than flagged — DEC-20260812-A lists "auto-promote
  // on recovery" as a platform-acts-alone action, and jobs/quality-floor.ts's
  // window clamp (since-last-promotion) is what makes a wrong reversal safe
  // to make: it gets caught on fresh evidence, not stale evidence. This is
  // the screenshot-url case verified in prod 2026-08-16: quarantined
  // 2026-08-12 for real completion driven by a bug fixed 2026-08-05, then
  // 100% over 520 harness runs across 7 days.
  it("auto-reverses (promotes) a quality-floor quarantine that clears the bar", () => {
    const d = only([cap({ wasDelisted: true, wasFloorQuarantine: true, delistingReason: "quarantined" })]);
    expect(d.action).toBe("promote");
    expect(d.reason).toContain("auto-reversed on recovery per DEC-20260812-A");
    expect(d.reason).toContain("quarantined");
  });

  it("still flags rather than promotes something an operator unpublished (not a floor quarantine)", () => {
    const d = only([cap({ wasDelisted: true, wasFloorQuarantine: false, delistingReason: "Unpublished: removed from catalog" })]);
    expect(d.action).toBe("flag");
    expect(d.reason).toContain("taken down, not merely never listed");
  });

  it("a human deactivation_reason refuses promotion even for an otherwise-eligible floor quarantine", () => {
    // deactivation_reason is checked before wasDelisted/wasFloorQuarantine
    // are ever consulted — a human "no" always wins, regardless of how the
    // capability was taken down or what the harness now says about it.
    expect(
      evaluatePromotion([
        cap({ wasDelisted: true, wasFloorQuarantine: true, deactivationReason: "Petter: shut off pending vendor review" }),
      ]),
    ).toEqual([]);
  });

  it("still promotes a capability whose last listing event was a promotion", () => {
    // "promoted" is not a takedown — this is the re-run case, not a reinstatement.
    expect(only([cap({ wasDelisted: false, delistingReason: null })]).action).toBe("promote");
  });

  it("flags rather than promotes a fragile maintenance class", () => {
    const d = only([cap({ slug: "screenshot-url", maintenanceClass: "scraping-fragile-target" })]);
    expect(d.action).toBe("flag");
    expect(d.enableX402).toBe(false);
  });

  it("a fragile maintenance class still refuses auto-reversal of a floor quarantine", () => {
    const d = only([cap({ slug: "screenshot-url", wasDelisted: true, wasFloorQuarantine: true, delistingReason: "quarantined", maintenanceClass: "scraping-fragile-target" })]);
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

  it("treats a missing breaker row as permitted", () => {
    // 14 active capabilities have no capability_health row; rows are created
    // lazily on first incident, so requiring one would exclude everything that
    // has never failed. The pass-rate and recency gates carry the weight.
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

  it("publishes to the catalog but closes x402 when the rail is inapplicable", () => {
    // enableX402 false is written, not omitted — it has to clear a stale true.
    expect(only([cap({ isFreeTier: true })]).enableX402).toBe(false);
    expect(only([cap({ hasX402Method: false })]).enableX402).toBe(false);
    expect(only([cap({ hasX402Method: false })]).action).toBe("promote");
  });
});

describe("the job's enforcement gate", () => {
  const original = process.env.CAPABILITY_PROMOTION_ENFORCE;
  afterEach(() => {
    if (original === undefined) delete process.env.CAPABILITY_PROMOTION_ENFORCE;
    else process.env.CAPABILITY_PROMOTION_ENFORCE = original;
  });

  it("is dry-run unless explicitly armed", () => {
    delete process.env.CAPABILITY_PROMOTION_ENFORCE;
    expect(isEnforceMode()).toBe(false);
    process.env.CAPABILITY_PROMOTION_ENFORCE = "1";
    expect(isEnforceMode()).toBe(false); // only the exact string arms it
    process.env.CAPABILITY_PROMOTION_ENFORCE = "true";
    expect(isEnforceMode()).toBe(true);
  });
});

describe("the evidence query", () => {
  it("only ever considers active, delisted capabilities", () => {
    expect(PROMOTION_EVIDENCE_SQL).toContain("c.is_active = true");
    expect(PROMOTION_EVIDENCE_SQL).toContain("c.visible = false");
  });

  it("scopes the aggregate to the promotion window rather than all history", () => {
    expect(PROMOTION_EVIDENCE_SQL).toContain("tr.executed_at > NOW() - INTERVAL '7 days'");
  });

  it("the last-listing-event lateral pins 'quarantined' to quality_floor only — the string wasFloorQuarantine relies on", () => {
    expect(PROMOTION_EVIDENCE_SQL).toContain("e.event_type = 'quality_floor'        AND e.action_taken = 'quarantined'");
  });
});

describe("toPromotionStats", () => {
  it("maps every SQL column to the field the core reads", () => {
    // Guards the swap that would matter most: ka_passed read as passed_tests
    // would report correctness as green on the strength of liveness tests.
    expect(toPromotionStats([row({ is_free_tier: true, total_tests: 90, passed_tests: 89, distinct_test_days: 6, ka_total: 10, ka_passed: 3, recent_total: 9, recent_passed: 8, piggyback_total: 2, piggyback_passed: 1 })])[0]).toEqual({
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
      wasDelisted: false,
      delistingReason: null,
      wasFloorQuarantine: false,
      totalTests: 90,
      passedTests: 89,
      distinctTestDays: 6,
      knownAnswerTotal: 10,
      knownAnswerPassed: 3,
      latestKnownAnswerPassed: true,
      recentTotal: 9,
      recentPassed: 8,
      piggybackTotal: 2,
      piggybackPassed: 1,
    });
  });

  it("reads a takedown from the last listing event, and a promotion as not one", () => {
    expect(toPromotionStats([row({ last_listing_event: "quarantined" })])[0].wasDelisted).toBe(true);
    expect(toPromotionStats([row({ last_listing_event: "Unpublished: removed from catalog" })])[0].wasDelisted).toBe(true);
    expect(toPromotionStats([row({ last_listing_event: "promoted_with_x402" })])[0].wasDelisted).toBe(false);
    expect(toPromotionStats([row({ last_listing_event: null })])[0].wasDelisted).toBe(false);
  });

  it("narrows wasFloorQuarantine to exactly the quality-floor's own 'quarantined' event", () => {
    // 'quarantined' is written only by jobs/quality-floor.ts's enforce apply
    // path — no lifecycle_transition (human) action_taken can ever equal it,
    // so this signal cannot be spoofed by an operator unpublish/suspend.
    expect(toPromotionStats([row({ last_listing_event: "quarantined" })])[0].wasFloorQuarantine).toBe(true);
    expect(toPromotionStats([row({ last_listing_event: "Unpublished: removed from catalog" })])[0].wasFloorQuarantine).toBe(false);
    expect(toPromotionStats([row({ last_listing_event: "Suspended: breaker open" })])[0].wasFloorQuarantine).toBe(false);
    expect(toPromotionStats([row({ last_listing_event: "promoted_with_x402" })])[0].wasFloorQuarantine).toBe(false);
    expect(toPromotionStats([row({ last_listing_event: null })])[0].wasFloorQuarantine).toBe(false);
  });

  it("carries a correctness failure through the mapping into a refusal", () => {
    expect(only(toPromotionStats([row({ passed_tests: 97, ka_total: 10, ka_passed: 1 })])).action).toBe("none");
  });
});
