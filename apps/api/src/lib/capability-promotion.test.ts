import { describe, expect, it, afterEach } from "vitest";
import {
  evaluatePromotion,
  DEFAULT_PROMOTION_CONFIG,
  type PromotionStats,
} from "./capability-promotion.js";
import {
  toPromotionStats,
  isEnforceMode,
  isListingStateEvent,
  PROMOTION_EVIDENCE_SQL,
  LISTING_EVENT_MATCH_SQL,
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
    lastListingEventId: null,
    floorQuarantineCount: 0,
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
    last_listing_event: null, last_listing_event_id: null, last_listing_event_mode: null,
    floor_quarantine_count: 0, total_tests: 100, passed_tests: 100, distinct_test_days: 7,
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
    // floorQuarantineCount: 1 — this is the capability's FIRST quarantine
    // (the count includes the current/most-recent one), not a repeat.
    const d = only([cap({ wasDelisted: true, wasFloorQuarantine: true, delistingReason: "quarantined", floorQuarantineCount: 1 })]);
    expect(d.action).toBe("promote");
    expect(d.reason).toContain("auto-reversed on recovery per DEC-20260812-A");
    expect(d.reason).toContain("quarantined");
  });

  it("still flags rather than promotes something an operator unpublished (not a floor quarantine)", () => {
    const d = only([cap({ wasDelisted: true, wasFloorQuarantine: false, delistingReason: "Unpublished: removed from catalog" })]);
    expect(d.action).toBe("flag");
    expect(d.reason).toContain("taken down, not merely never listed");
  });

  // Round-2 fix (2026-08-16, Codex blocker #1b — oscillation). The floor's
  // own candidate filter requires visible=true to quarantine at all, so a
  // SECOND enforce quarantine can only happen after an intervening RE-LIST of
  // this exact slug: floorQuarantineCount >= 2 is proof it was re-listed and
  // re-quarantined at least once before. Even genuinely fresh, post-
  // quarantine, harness-green evidence must not auto-reverse a second time.
  it("refuses to auto-reverse a REPEAT floor quarantine — flags for human instead", () => {
    const d = only([cap({
      wasDelisted: true, wasFloorQuarantine: true, delistingReason: "quarantined",
      floorQuarantineCount: 2,
    })]);
    expect(d.action).toBe("flag");
    expect(d.reason).toContain("bounced before");
    expect(d.reason).toContain("quarantined 2 times");
    expect(d.enableX402).toBe(false);
  });

  it("a third-plus repeat is refused the same way, and the count is named in the reason", () => {
    const d = only([cap({ wasDelisted: true, wasFloorQuarantine: true, floorQuarantineCount: 5 })]);
    expect(d.action).toBe("flag");
    expect(d.reason).toContain("quarantined 5 times");
  });

  // Round-3 fix (2026-08-16, Codex MINOR). floorQuarantineCount >= 2 proves
  // an intervening RE-LIST — the admin publish endpoint can do that
  // manually, not only this job's own auto-reversal — so the recorded
  // reason must say "re-listed and re-quarantined" and must NOT claim a
  // prior auto-reversal specifically failed. The refusal itself is
  // unchanged (still conservative); only the claim in the text is narrowed.
  it("the repeat-bounce reason says re-listed-and-re-quarantined, and does not claim the prior re-list was this job's own auto-reversal", () => {
    const d = only([cap({ wasDelisted: true, wasFloorQuarantine: true, floorQuarantineCount: 2 })]);
    expect(d.reason).toContain("re-listed and re-quarantined");
    expect(d.reason).not.toContain("auto-reversal already failed");
    expect(d.reason).not.toMatch(/prior auto-reversal/i);
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
    const d = only([cap({ slug: "screenshot-url", wasDelisted: true, wasFloorQuarantine: true, delistingReason: "quarantined", floorQuarantineCount: 1, maintenanceClass: "scraping-fragile-target" })]);
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
    // Round-2 fix (2026-08-16): the flat 7-day window is now the upper bound
    // of a GREATEST(), clamped down to since-the-quarantine when relevant —
    // see "evidence is clamped to since-the-quarantine" below for that half.
    expect(PROMOTION_EVIDENCE_SQL).toContain("NOW() - INTERVAL '7 days'");
  });

  it("the last-listing-event lateral pins 'quarantined' to quality_floor only — the string wasFloorQuarantine relies on", () => {
    expect(PROMOTION_EVIDENCE_SQL).toContain("e.event_type = 'quality_floor'        AND e.action_taken = 'quarantined'");
  });

  // Round-2 fix (2026-08-16, Codex blocker #2): matching action_taken='quarantined'
  // alone is not enough — the floor also emits dry_run rows with the same
  // shape, and ad-hoc/manual writes with the same shape exist in prod (the
  // real screenshot-url reinstatement event had no `mode` key at all).
  describe("LISTING_EVENT_MATCH_SQL requires enforce mode (Codex blocker #2)", () => {
    it("the quality_floor branch requires details->>'mode' = 'enforce'", () => {
      expect(LISTING_EVENT_MATCH_SQL).toContain(
        "e.event_type = 'quality_floor'        AND e.action_taken = 'quarantined' AND e.details->>'mode' = 'enforce'",
      );
    });

    it("the capability_promotion branch also requires enforce mode", () => {
      expect(LISTING_EVENT_MATCH_SQL).toContain(
        "e.event_type = 'capability_promotion' AND e.action_taken LIKE 'promoted%' AND e.details->>'mode' = 'enforce'",
      );
    });

    it("exactly two branches carry the mode filter — lifecycle_transition (human events) is unfiltered", () => {
      expect((LISTING_EVENT_MATCH_SQL.match(/details->>'mode' = 'enforce'/g) ?? []).length).toBe(2);
    });

    it("PROMOTION_EVIDENCE_SQL embeds the shared constant verbatim rather than a copy that can drift", () => {
      expect(PROMOTION_EVIDENCE_SQL).toContain(LISTING_EVENT_MATCH_SQL);
    });

    // Round-3/4 (Codex MAJOR, twice): the SQL side of the arrow-form fix.
    // The isListingStateEvent producer-coverage suite below proves the JS
    // mirror's BEHAVIOR against real strings; this pins the COMPLETE grouped
    // lifecycle branch of the SQL constant (whitespace-normalized) — the
    // event-type scoping, all three literal prefixes, AND the arrow clause
    // together. Round 3's pin only asserted the arrow clause existed
    // somewhere, so dropping a prefix, or moving the arrow clause outside
    // the lifecycle_transition scope, would have left every test green while
    // SQL and mirror disagreed. Now any edit inside this branch breaks the
    // pin, forcing a matching update to isListingStateEvent (and vice versa
    // via the fixture suite).
    it("the lifecycle_transition branch carries the complete grouped clause: event-type scope, all three prefixes, and the arrow shape", () => {
      const normalize = (s: string) => s.replace(/\s+/g, " ");
      expect(normalize(LISTING_EVENT_MATCH_SQL)).toContain(
        normalize(`(e.event_type = 'lifecycle_transition' AND (e.action_taken LIKE 'Unpublished%'
                                                    OR e.action_taken LIKE 'Suspended%'
                                                    OR e.action_taken LIKE 'Published%'
                                                    OR e.action_taken LIKE '%→%')))`),
      );
    });
  });

  // Round-2 fix (2026-08-16, Codex blocker #1a — oscillation). Without this,
  // a capability that was harness-green WHILE customer traffic was failing
  // (the exact pre-quarantine state) could supply its own "recovery"
  // evidence from before it was ever quarantined.
  describe("evidence is clamped to since-the-quarantine (Codex blocker #1a)", () => {
    it("the test_results join is bounded by GREATEST(7d, since-quarantine)", () => {
      expect(PROMOTION_EVIDENCE_SQL).toMatch(
        /GREATEST\(\s*NOW\(\) - INTERVAL '7 days',\s*COALESCE\(le\.quarantined_at, '-infinity'::timestamptz\)\s*\)/,
      );
    });

    it("the latest-known_answer lateral is bounded the same way, so a stale pre-quarantine pass can't stand in for 'broken now'", () => {
      expect(PROMOTION_EVIDENCE_SQL).toContain(
        "tr2.executed_at > COALESCE(le.quarantined_at, '-infinity'::timestamptz)",
      );
    });

    it("quarantined_at resolves ONLY for the floor's own quarantine, never a promotion or human takedown", () => {
      expect(PROMOTION_EVIDENCE_SQL).toContain(
        "CASE WHEN e.event_type = 'quality_floor' AND e.action_taken = 'quarantined'",
      );
    });
  });

  // Round-2 fix (2026-08-16, Codex blocker #1b — repeat-bounce refusal).
  describe("floor_quarantine_count counts every enforce quarantine ever, for this slug", () => {
    it("is exposed as a dedicated column, defaulted to 0 rather than left null", () => {
      expect(PROMOTION_EVIDENCE_SQL).toContain("COALESCE(fq.n, 0)::int");
      expect(PROMOTION_EVIDENCE_SQL).toContain("AS floor_quarantine_count");
    });

    it("counts enforce-mode quarantine events only", () => {
      expect(PROMOTION_EVIDENCE_SQL).toMatch(
        /FROM health_monitor_events e\s+WHERE e\.capability_slug = c\.slug\s+AND e\.event_type = 'quality_floor'\s+AND e\.action_taken = 'quarantined'\s+AND e\.details->>'mode' = 'enforce'/,
      );
    });
  });
});

// Round-3 fix (2026-08-16, Codex MAJOR). The round-2 tests above assert on
// LISTING_EVENT_MATCH_SQL's own text — they prove the SQL contains a
// pattern, not that the pattern matches what the real event producers
// actually write. These fixtures are the LITERAL strings each real emit
// site constructs, copied from source as of this fix:
//   - lib/lifecycle.ts:121 (canonical writer, arbitrary toState)
//   - routes/internal-health-monitor.ts:94 (restore for re-validation)
//   - routes/internal-health-monitor.ts:408 (suspend)
//   - routes/internal-health-monitor.ts:463 (suspended → validating)
//   - routes/reply-webhook.ts:368 (restore via email reply)
// The old prefix-only matcher (`'Unpublished%' OR 'Suspended%' OR
// 'Published%'`) matched NONE of these five — every real suspend/restore
// transition would have failed the TOCTOU listing-event-identity re-check
// silently, since a suspend→revalidate cycle between evidence collection
// and the promotion write would leave the (wrongly unmatched) most-recent
// listing event unchanged from the job's perspective.
describe("isListingStateEvent — producer coverage (Codex round-3 MAJOR)", () => {
  const realProducerFixtures: Array<{ site: string; actionTaken: string }> = [
    { site: "lib/lifecycle.ts:121 (canonical writer)", actionTaken: "active → degraded: circuit breaker opened" },
    { site: "routes/internal-health-monitor.ts:94 (restore for re-validation)", actionTaken: "active → validating: restored for re-validation" },
    { site: "routes/internal-health-monitor.ts:408 (suspend)", actionTaken: "active → suspended: repeated dependency failures" },
    { site: "routes/internal-health-monitor.ts:463 (suspended → validating)", actionTaken: "suspended → validating: re-entered onboarding pipeline" },
    { site: "routes/reply-webhook.ts:368 (restore via email reply)", actionTaken: "suspended → validating: restored via email reply" },
  ];

  it.each(realProducerFixtures)("matches the real string from $site", ({ actionTaken }) => {
    expect(isListingStateEvent("lifecycle_transition", actionTaken, null)).toBe(true);
  });

  it("still matches the two literal-prefix producers (publish/unpublish) that are NOT arrow-form", () => {
    expect(isListingStateEvent("lifecycle_transition", "Published: now visible in catalog", null)).toBe(true);
    expect(
      isListingStateEvent(
        "lifecycle_transition",
        "Unpublished: removed from catalog (lifecycle_state remains 'active')",
        null,
      ),
    ).toBe(true);
  });

  it("negative fixture: an unrelated lifecycle_transition-shaped string with no arrow and no known prefix does NOT match", () => {
    // Deliberately NOT one of the six known shapes — proves the matcher
    // isn't accidentally matching event_type alone.
    expect(isListingStateEvent("lifecycle_transition", "Reindexed test_suite ordering", null)).toBe(false);
  });

  it("event_type scopes the arrow-shape match — a '→' in an unrelated event_type never matches", () => {
    // Codex's caution: "be careful not to over-match unrelated event rows;
    // scope by the event_type(s) these producers write". A quality_floor or
    // capability_promotion row that happened to contain '→' in its reason
    // text (neither producer does this today, but nothing stops a future
    // one) must still fail unless it independently satisfies ITS OWN branch.
    expect(isListingStateEvent("quality_floor", "quarantined: escalated → reviewed", "enforce")).toBe(false);
    expect(isListingStateEvent("capability_promotion", "held: passRate → 0.94", "enforce")).toBe(false);
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
      lastListingEventId: null,
      floorQuarantineCount: 0,
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

  it("narrows wasFloorQuarantine to exactly the quality-floor's own ENFORCE-mode 'quarantined' event", () => {
    // 'quarantined' is written only by jobs/quality-floor.ts's enforce apply
    // path — no lifecycle_transition (human) action_taken can ever equal it,
    // so this signal cannot be spoofed by an operator unpublish/suspend.
    expect(toPromotionStats([row({ last_listing_event: "quarantined", last_listing_event_mode: "enforce" })])[0].wasFloorQuarantine).toBe(true);
    expect(toPromotionStats([row({ last_listing_event: "Unpublished: removed from catalog", last_listing_event_mode: "enforce" })])[0].wasFloorQuarantine).toBe(false);
    expect(toPromotionStats([row({ last_listing_event: "Suspended: breaker open", last_listing_event_mode: "enforce" })])[0].wasFloorQuarantine).toBe(false);
    expect(toPromotionStats([row({ last_listing_event: "promoted_with_x402", last_listing_event_mode: "enforce" })])[0].wasFloorQuarantine).toBe(false);
    expect(toPromotionStats([row({ last_listing_event: null })])[0].wasFloorQuarantine).toBe(false);
  });

  // Round-2 fix (2026-08-16, Codex blocker #2). This is the actual failure
  // mode named in the finding: the floor emits a dry_run row with
  // action_taken='quarantined' on every tick it's NOT armed to enforce, and
  // an ad-hoc/manual health_monitor_events insert could carry the same
  // action_taken with no mode key at all (the real screenshot-url
  // reinstatement event on 2026-08-13 was exactly this shape).
  it("a dry_run quarantine event does NOT set wasFloorQuarantine, even with the right action_taken string", () => {
    expect(
      toPromotionStats([row({ last_listing_event: "quarantined", last_listing_event_mode: "dry_run" })])[0].wasFloorQuarantine,
    ).toBe(false);
  });

  it("a 'quarantined' event with no recorded mode (ad-hoc/manual write) does NOT set wasFloorQuarantine", () => {
    expect(
      toPromotionStats([row({ last_listing_event: "quarantined", last_listing_event_mode: null })])[0].wasFloorQuarantine,
    ).toBe(false);
  });

  it("maps last_listing_event_id and floor_quarantine_count straight through", () => {
    const mapped = toPromotionStats([
      row({ last_listing_event_id: "11111111-1111-1111-1111-111111111111", floor_quarantine_count: 3 }),
    ])[0];
    expect(mapped.lastListingEventId).toBe("11111111-1111-1111-1111-111111111111");
    expect(mapped.floorQuarantineCount).toBe(3);
  });

  it("carries a correctness failure through the mapping into a refusal", () => {
    expect(only(toPromotionStats([row({ passed_tests: 97, ka_total: 10, ka_passed: 1 })])).action).toBe("none");
  });
});
