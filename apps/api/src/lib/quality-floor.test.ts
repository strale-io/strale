import { describe, expect, it } from "vitest";
import { evaluateFloor, DEFAULT_FLOOR_CONFIG, type FloorStats } from "./quality-floor.js";
import { classifyTransactionFailure, CALLER_ATTRIBUTABLE } from "./transaction-failure-taxonomy.js";
import { TOS_REFUSAL_MARKER } from "./tos-blocklist.js";

// DEC-20260812-A floor semantics pinned both directions (DEC-20260504-A):
// these encode the confirmed defaults — quarantine <70%, deactivate-proposal
// <30%, ≥10 eligible calls/30d, max 3 quarantines/run, deactivation never
// automatic, revenue earners' deactivation Petter-only.

function cap(partial: Partial<FloorStats>): FloorStats {
  return {
    slug: "x",
    lifecycleState: "active",
    visible: true,
    x402Enabled: true,
    eligibleCalls: 100,
    completedCalls: 100,
    revenueCents: 0,
    recentEligibleCalls: 0,
    recentCompletedCalls: 0,
    ...partial,
  };
}

describe("evaluateFloor", () => {
  it("healthy capabilities produce no decisions", () => {
    expect(evaluateFloor([cap({ completedCalls: 95 })])).toEqual([]);
  });

  it("quarantines below 70% and proposes (never applies) deactivation below 30%", () => {
    const [d] = evaluateFloor([cap({ slug: "bad", completedCalls: 12 })]);
    expect(d.action).toBe("quarantine");
    expect(d.deactivateProposal).toBe(true);
    // There is deliberately NO "deactivate" action in the type — the
    // strongest automatic action is quarantine.
  });

  it("65% is quarantined without a deactivation proposal", () => {
    const [d] = evaluateFloor([cap({ slug: "meh", completedCalls: 65 })]);
    expect(d.action).toBe("quarantine");
    expect(d.deactivateProposal).toBe(false);
  });

  it("70% exactly is NOT below the floor", () => {
    expect(evaluateFloor([cap({ completedCalls: 70 })])).toEqual([]);
  });

  it("under 10 eligible calls produces no verdict — noise, not signal", () => {
    expect(evaluateFloor([cap({ eligibleCalls: 9, completedCalls: 0 })])).toEqual([]);
  });

  it("revenue-earning deactivation candidates are marked Petter-only", () => {
    const [d] = evaluateFloor([cap({ completedCalls: 10, revenueCents: 225 })]);
    expect(d.requiresHuman).toBe(true);
    const [d2] = evaluateFloor([cap({ completedCalls: 10, revenueCents: 0 })]);
    expect(d2.requiresHuman).toBe(false);
  });

  it("self-throttles: max 3 quarantines per run, worst-first, rest deferred loudly", () => {
    const rows = [10, 20, 30, 40, 50].map((pct, i) =>
      cap({ slug: `c${i}`, completedCalls: pct }),
    );
    const decisions = evaluateFloor(rows);
    const quarantined = decisions.filter((d) => d.action === "quarantine");
    const deferred = decisions.filter((d) => d.action === "none");
    expect(quarantined.map((d) => d.slug)).toEqual(["c0", "c1", "c2"]);
    expect(deferred).toHaveLength(2);
    expect(deferred[0].reason).toMatch(/budget exhausted/);
  });

  it("defers when the trailing 7 days show recovery (the just-fixed-capability case)", () => {
    // us-company-data on the day this shipped: 50%/30d dragging pre-fix
    // failures, but healthy after the same-day PR #171 fix.
    const [d] = evaluateFloor([
      cap({ slug: "fixed", completedCalls: 50, recentEligibleCalls: 6, recentCompletedCalls: 6 }),
    ]);
    expect(d.action).toBe("none");
    expect(d.reason).toMatch(/shows recovery/);
    // Two healthy recent calls are NOT enough evidence to defer.
    const [d2] = evaluateFloor([
      cap({ slug: "thin", completedCalls: 50, recentEligibleCalls: 2, recentCompletedCalls: 2 }),
    ]);
    expect(d2.action).toBe("quarantine");
  });

  it("non-active lifecycle and already-delisted capabilities are out of scope", () => {
    expect(
      evaluateFloor([
        cap({ lifecycleState: "probation", completedCalls: 0 }),
        cap({ slug: "gone", visible: false, x402Enabled: false, completedCalls: 0 }),
      ]),
    ).toEqual([]);
  });
});

describe("classifyTransactionFailure", () => {
  it("caller-attributable classes never count against completion", () => {
    expect(CALLER_ATTRIBUTABLE.has(classifyTransactionFailure("Missing required input fields: url"))).toBe(true);
    expect(CALLER_ATTRIBUTABLE.has(classifyTransactionFailure(`Trustpilot is not a supported source: its ${TOS_REFUSAL_MARKER}.`))).toBe(true);
  });

  it("platform-side failures DO count", () => {
    for (const msg of [
      "OPENREGISTER_API_KEY is required. Register at https://openregister.de/keys",
      "The operation was aborted due to timeout",
      "OpenRegister upstream error (HTTP 503). Retry advised.",
      "TypeError: Cannot read properties of undefined",
    ]) {
      expect(CALLER_ATTRIBUTABLE.has(classifyTransactionFailure(msg)), msg).toBe(false);
    }
  });

  it("classifies the taxonomy dimensions distinctly", () => {
    expect(classifyTransactionFailure("COURTLISTENER rejected the token (HTTP 403). Verify COURTLISTENER_API_TOKEN.")).toBe("config");
    expect(classifyTransactionFailure("Request timed out after 35000ms")).toBe("timeout");
    expect(classifyTransactionFailure("Zefix API error: HTTP 503")).toBe("upstream");
    expect(classifyTransactionFailure("eur-lex.europa.eu served an anti-bot challenge to the rendered browser as well.")).toBe("upstream");
    expect(classifyTransactionFailure("")).toBe("internal");
    expect(classifyTransactionFailure(null)).toBe("internal");
  });
});
