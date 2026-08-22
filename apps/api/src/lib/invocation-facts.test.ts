/**
 * WP9 — the quality floor must be able to see a capability that only ever runs
 * inside bundles, and no new serving path may quietly skip recording.
 *
 * Every test here is mutation-checked: `scripts/mutation-test.mjs` reverts the
 * WP9 change and confirms the named test goes RED. A test that passes against
 * the pre-fix code is not evidence of anything, and this repo has shipped
 * several of those.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { foldTrafficRows, type FloorTrafficRow } from "../jobs/quality-floor.js";
import { evaluateFloor, DEFAULT_FLOOR_CONFIG } from "./quality-floor.js";
import { INVOCATION_RAILS } from "./invocation-facts.js";

const SRC = join(import.meta.dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

function factRow(partial: Partial<FloorTrafficRow>): FloorTrafficRow {
  return {
    slug: "bundle-only-capability",
    lifecycle_state: "active",
    visible: true,
    x402_enabled: true,
    source: "fact",
    status: null,
    error: null,
    success: true,
    counts: null,
    day: "2026-08-01",
    recent: false,
    n: 1,
    ...partial,
  };
}

describe("the floor can see a capability that only runs inside solutions", () => {
  /**
   * The whole reason WP9 exists. Before it, a bundle wrote ONE transaction with
   * `capability_id = NULL` and buried its step outcomes in an `output.steps`
   * JSONB blob, so the floor's `JOIN transactions ON capability_id` matched
   * nothing for a capability invoked only as a step. It could fail every call
   * it served and never reach the minimum-call threshold, because as far as the
   * query was concerned it had no traffic at all.
   */
  it("quarantines a capability whose only traffic is solution steps", () => {
    // Twelve step invocations, three of which produced usable output. No
    // transaction row anywhere carries this capability's id.
    const rows: FloorTrafficRow[] = [
      factRow({ success: true, n: 3, day: "2026-08-01" }),
      factRow({ success: false, counts: true, n: 5, day: "2026-08-02" }),
      factRow({ success: false, counts: true, n: 4, day: "2026-08-03" }),
    ];

    const stats = foldTrafficRows(rows, new Map());
    expect(stats).toHaveLength(1);
    expect(stats[0].eligibleCalls).toBe(12);
    expect(stats[0].completedCalls).toBe(3);

    const decisions = evaluateFloor(stats, DEFAULT_FLOOR_CONFIG);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].action).toBe("quarantine");
    // 25% is below the 30% deactivation floor too, so it should also surface a
    // proposal — a capability this broken is not merely a delisting.
    expect(decisions[0].deactivateProposal).toBe(true);
  });

  it("does not count a step failure the caller caused", () => {
    // `counts_against_capability: false` is the WP4 verdict for a caller-
    // attributable failure. A correct refusal of bad input must not push a
    // capability toward delisting — the platform has delisted capabilities for
    // refusing bad input before, and that is what this asserts against.
    const stats = foldTrafficRows(
      [
        factRow({ success: true, n: 4 }),
        factRow({ success: false, counts: false, n: 40, day: "2026-08-02" }),
      ],
      new Map(),
    );
    expect(stats[0].eligibleCalls).toBe(4);
    expect(stats[0].completedCalls).toBe(4);
    expect(evaluateFloor(stats, DEFAULT_FLOOR_CONFIG)).toEqual([]);
  });

  it("reads the verdict off the fact instead of re-deriving it from a string", () => {
    // The error text says "Missing required input fields", which the string
    // taxonomy classifies as caller-attributable. The FACT says this counts
    // against the capability. The fact wins — one authority per business fact.
    // If the fold ever falls back to the taxonomy for fact rows, two answers to
    // one question exist again, which is the defect this program removes.
    const stats = foldTrafficRows(
      [
        factRow({ success: true, n: 1 }),
        factRow({
          success: false,
          counts: true,
          error: "Missing required input fields: iban",
          n: 9,
          day: "2026-08-02",
        }),
      ],
      new Map(),
    );
    expect(stats[0].eligibleCalls).toBe(10);
    expect(stats[0].completedCalls).toBe(1);
  });
});

describe("evidence completeness", () => {
  it("carries no price on a fact, so revenue comes from the billing table", () => {
    // Facts answer 'did this work'. Asking them what a call earned would be the
    // same category error WP9 exists to undo, so `revenueCents` must come from
    // the map the job builds from `transactions` — and must be zero when the
    // capability is absent from it rather than guessed.
    const withRevenue = foldTrafficRows(
      [factRow({ success: true, n: 2 })],
      new Map([["bundle-only-capability", 250]]),
    );
    expect(withRevenue[0].revenueCents).toBe(250);

    const withoutRevenue = foldTrafficRows([factRow({ success: true, n: 2 })], new Map());
    expect(withoutRevenue[0].revenueCents).toBe(0);
  });
});

describe("no serving path may skip the fact", () => {
  /**
   * Exit condition: a guard prevents a new invocation path skipping the fact.
   *
   * `kind: "customer_paid"` is the marker of a customer-serving invocation —
   * it is what the dispatcher gate is told, and it is what makes the call count
   * as customer experience. Any file that claims it must also record what
   * happened.
   *
   * Requires a CALL, not an import. WP8 shipped a guard whose assertions were
   * satisfied by the import line alone: delete the logic, keep the import, and
   * it stayed green.
   */
  it("every file that serves a customer_paid invocation also records it", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const body = readFileSync(file, "utf8");
      if (!body.includes(`kind: "customer_paid"`)) continue;
      if (!body.includes("recordInvocation(")) {
        offenders.push(file.slice(SRC.length + 1).replace(/\\/g, "/"));
      }
    }
    expect(
      offenders,
      "These files invoke a capability as a paying customer but record no " +
        "invocation fact, so the quality floor cannot see their traffic. " +
        "Call recordInvocation() from lib/invocation-facts.ts on BOTH the " +
        "success and the failure path.",
    ).toEqual([]);
  });

  it("the known invocation paths are actually covered, not merely unviolated", () => {
    // The guard above passes vacuously if no file matches. Pin the ones that
    // must match, so deleting a rail's marker cannot turn the guard green.
    //
    // `guarded-executor.ts` is on this list because it RUNS an executor. It had
    // no live callers when WP9 shipped — every rail uses `assertGuardedAllow`
    // and drives the executor itself — but the guard flagged it anyway, and an
    // executor-invoking helper that records nothing is a ready-made way for the
    // next rail to be invisible to the floor. It was fixed rather than
    // allowlisted; an allowlist is how a guard becomes decoration.
    const covered = walk(SRC)
      .filter((f) => {
        const body = readFileSync(f, "utf8");
        return body.includes(`kind: "customer_paid"`) && body.includes("recordInvocation(");
      })
      .map((f) => f.slice(SRC.length + 1).replace(/\\/g, "/"))
      .sort();

    expect(covered).toEqual([
      "capabilities/guarded-executor.ts",
      "lib/solution-executor.ts",
      "routes/do.ts",
      "routes/x402-gateway-v2.ts",
    ]);
  });

  it("the solution executor records on both the success and the failure path", () => {
    // The rail WP9 exists for. One call would be easy to write and would cover
    // only half the outcomes — and the half it would miss is the failures,
    // which are the entire input to a quality floor.
    const body = readFileSync(join(SRC, "lib/solution-executor.ts"), "utf8");
    const calls = body.match(/await recordInvocation\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(body).toContain("outcome: outcomeFromOutput(step.capabilitySlug, output)");
    expect(body).toContain("outcome: outcomeFromError(err)");
  });
});

describe("rail vocabulary", () => {
  it("names entry points, not payment rails", () => {
    // `/v1/do` serves both wallet-funded and X-Payment callers, so a
    // payment-rail label would be wrong for a large share of its traffic.
    // Payment rail is already on the transaction, where a billing question
    // belongs.
    expect([...INVOCATION_RAILS]).toEqual([
      "v1_do",
      "x402_gateway",
      "solution_step",
      "harness",
      "onboarding",
    ]);
  });
});
