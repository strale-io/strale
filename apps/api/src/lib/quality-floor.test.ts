import { describe, expect, it } from "vitest";
import { evaluateFloor, DEFAULT_FLOOR_CONFIG, type FloorStats } from "./quality-floor.js";
import { classifyTransactionFailure, CALLER_ATTRIBUTABLE } from "./transaction-failure-taxonomy.js";
import { TOS_REFUSAL_MARKER } from "./tos-blocklist.js";
import { foldTrafficRows, type FloorTrafficRow } from "../jobs/quality-floor.js";
import { isInternalAccountEmail } from "./internal-accounts.js";

// DEC-20260812-A floor semantics pinned both directions (DEC-20260504-A):
// quarantine <70%, deactivate-proposal <30%, ≥10 eligible calls/30d, max 3
// quarantines/run, burst guard (≥2 distinct failure days), deactivation
// never automatic, revenue-earner deactivation Petter-only.

function cap(partial: Partial<FloorStats>): FloorStats {
  return {
    slug: "x",
    lifecycleState: "active",
    visible: true,
    x402Enabled: true,
    eligibleCalls: 100,
    completedCalls: 100,
    revenueCents: 0,
    distinctFailureDays: 5,
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
    // There is deliberately NO "deactivate" action in the type.
  });

  it("65% is quarantined without a deactivation proposal; 70% exactly is not below floor", () => {
    const [d] = evaluateFloor([cap({ slug: "meh", completedCalls: 65 })]);
    expect(d.action).toBe("quarantine");
    expect(d.deactivateProposal).toBe(false);
    expect(evaluateFloor([cap({ completedCalls: 70 })])).toEqual([]);
  });

  it("under 10 eligible calls produces no verdict — noise, not signal", () => {
    expect(evaluateFloor([cap({ eligibleCalls: 9, completedCalls: 0 })])).toEqual([]);
  });

  it("single-day failure bursts NEVER quarantine on their own (H-1 burst guard)", () => {
    const [d] = evaluateFloor([cap({ slug: "burst", completedCalls: 5, distinctFailureDays: 1 })]);
    expect(d.action).toBe("none");
    expect(d.reason).toMatch(/burst, not a trend/);
    // The deactivation proposal still surfaces from the 30d figure.
    expect(d.deactivateProposal).toBe(true);
  });

  it("revenue-earning deactivation candidates are marked Petter-only", () => {
    const [d] = evaluateFloor([cap({ completedCalls: 10, revenueCents: 225 })]);
    expect(d.requiresHuman).toBe(true);
    const [d2] = evaluateFloor([cap({ completedCalls: 10, revenueCents: 0 })]);
    expect(d2.requiresHuman).toBe(false);
  });

  it("self-throttles: max quarantines per run, worst-first, rest deferred loudly", () => {
    const rows = [10, 20, 30, 40, 50].map((pct, i) =>
      cap({ slug: `c${i}`, completedCalls: pct }),
    );
    // Explicit config so the parameter is exercised, not defaulted (review gap #3).
    const decisions = evaluateFloor(rows, { ...DEFAULT_FLOOR_CONFIG, maxQuarantinesPerRun: 2 });
    const quarantined = decisions.filter((d) => d.action === "quarantine");
    const deferred = decisions.filter((d) => d.action === "none");
    expect(quarantined.map((d) => d.slug)).toEqual(["c0", "c1"]);
    expect(deferred).toHaveLength(3);
    expect(deferred[0].reason).toMatch(/budget exhausted/);
  });

  it("recovery override defers with proportional recent volume and STILL emits the proposal (M-5)", () => {
    // 100 eligible calls → required recent ≥ max(3, ceil(0.25×100×7/30)) = 6.
    const recovered = cap({ slug: "fixed", completedCalls: 25, recentEligibleCalls: 6, recentCompletedCalls: 6 });
    const [d] = evaluateFloor([recovered]);
    expect(d.action).toBe("none");
    expect(d.reason).toMatch(/shows recovery/);
    expect(d.deactivateProposal).toBe(true); // 25% < 30% — proposal survives deferral
    // Three lucky calls on a high-volume disaster do NOT defer.
    const lucky = cap({ slug: "lucky", completedCalls: 25, recentEligibleCalls: 3, recentCompletedCalls: 3 });
    expect(evaluateFloor([lucky])[0].action).toBe("quarantine");
  });

  it("degraded lifecycle is in scope (publicly listed → floor-eligible, M-7); probation is not", () => {
    const [d] = evaluateFloor([cap({ slug: "deg", lifecycleState: "degraded", completedCalls: 10 })]);
    expect(d.action).toBe("quarantine");
    expect(evaluateFloor([cap({ lifecycleState: "probation", completedCalls: 0 })])).toEqual([]);
  });

  it("already-delisted capabilities are out of scope", () => {
    expect(
      evaluateFloor([cap({ slug: "gone", visible: false, x402Enabled: false, completedCalls: 0 })]),
    ).toEqual([]);
  });
});

describe("classifyTransactionFailure", () => {
  it("caller-attributable classes never count against completion", () => {
    expect(CALLER_ATTRIBUTABLE.has(classifyTransactionFailure("Missing required input fields: url"))).toBe(true);
    expect(CALLER_ATTRIBUTABLE.has(classifyTransactionFailure(`Trustpilot is not a supported source: its ${TOS_REFUSAL_MARKER}.`))).toBe(true);
    expect(CALLER_ATTRIBUTABLE.has(classifyTransactionFailure("URL returned HTTP 404. This page does not exist."))).toBe(true);
  });

  it("target-site and upstream 5xx COUNT against the capability (review H-2 — the outage-blindness class)", () => {
    for (const msg of [
      "The Danish business registry (cvrapi.dk) returned a server error (HTTP 503). This is usually transient.",
      "Companies House API returned a server error (HTTP 503)",
      "The web page could not be loaded (HTTP 502).",
      "URL returned HTTP 503. The target site returned a server error.",
      "Zefix API error: HTTP 503",
    ]) {
      const cls = classifyTransactionFailure(msg);
      expect(cls, msg).toBe("upstream");
      expect(CALLER_ATTRIBUTABLE.has(cls), msg).toBe(false);
    }
  });

  it("platform config failures count and classify as config", () => {
    expect(classifyTransactionFailure("OPENREGISTER_API_KEY is required. Register at https://openregister.de/keys")).toBe("config");
    expect(classifyTransactionFailure("CourtListener rejected the token (HTTP 403). Verify COURTLISTENER_API_TOKEN.")).toBe("config");
  });

  it("classifies the remaining dimensions distinctly", () => {
    expect(classifyTransactionFailure("Request timed out after 35000ms")).toBe("timeout");
    expect(classifyTransactionFailure("eur-lex.europa.eu served an anti-bot challenge to the rendered browser as well.")).toBe("upstream");
    expect(classifyTransactionFailure("TypeError: Cannot read properties of undefined")).toBe("internal");
    expect(classifyTransactionFailure("")).toBe("internal");
    expect(classifyTransactionFailure(null)).toBe("internal");
  });
});

describe("foldTrafficRows (the SQL→stats fold — review test-gap #1)", () => {
  function row(partial: Partial<FloorTrafficRow>): FloorTrafficRow {
    return {
      slug: "s",
      lifecycle_state: "active",
      visible: true,
      x402_enabled: true,
      status: "completed",
      error: null,
      price_cents: 5,
      day: "2026-08-01",
      recent: false,
      n: 1,
      ...partial,
    };
  }

  it("excludes caller-attributable failures from the denominator, counts the rest, tracks failure days", () => {
    const stats = foldTrafficRows([
      row({ status: "completed", n: 4, recent: true }),
      row({ status: "failed", error: "Missing required input fields: iban", n: 10, day: "2026-08-02" }),
      row({ status: "failed", error: "Zefix API error: HTTP 503", n: 2, day: "2026-08-02" }),
      row({ status: "failed", error: "upstream unavailable", n: 1, day: "2026-08-03", recent: true }),
    ]);
    expect(stats).toHaveLength(1);
    const s = stats[0];
    expect(s.eligibleCalls).toBe(7);        // 4 completed + 3 counted failures (10 caller-input excluded)
    expect(s.completedCalls).toBe(4);
    expect(s.distinctFailureDays).toBe(2);  // 08-02 and 08-03
    expect(s.recentEligibleCalls).toBe(5);  // 4 completed + 1 counted failure
    expect(s.recentCompletedCalls).toBe(4);
    expect(s.revenueCents).toBe(20);
  });
});

describe("isInternalAccountEmail (H-3 suffix rule)", () => {
  it("matches by suffix and extras, not just literals", () => {
    for (const e of ["anything@strale.io", "new-test@strale.dev", "x@example.com", "petterlindstrom@hotmail.com"]) {
      expect(isInternalAccountEmail(e), e).toBe(true);
    }
    expect(isInternalAccountEmail("customer@gmail.com")).toBe(false);
    expect(isInternalAccountEmail(null)).toBe(false);
  });
});
