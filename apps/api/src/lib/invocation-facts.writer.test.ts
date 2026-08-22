/**
 * WP9 — what the writer actually puts in the row.
 *
 * Separate file because it mocks the database module, and the rest of the WP9
 * suite reads source text.
 *
 * Review round 6 found the eleventh hollow assertion here: rounds 3 to 5 moved
 * every forgeable field out of the call sites and into one authority, and then
 * nothing asserted what that authority WROTE. Four one-token mutations inside
 * the INSERT each survived the full 2342-test suite — forcing contextKind to
 * "internal_test" or isFreeTier to true makes the floor's query match zero rows
 * permanently, so WP9 ships, the table fills, and the package silently delivers
 * nothing; forcing success true pins every capability at 100%; forcing
 * countsAgainstCapability false means no failure ever counts.
 *
 * Source-text guards could not catch any of them, because the literals they
 * pinned were still sitting in the file — just no longer reaching the row. So
 * this asserts the row, field by field, against a table of cases.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const inserted: Record<string, unknown>[] = [];

/** Flipped by the failure test; the fact writer must swallow it. */
let dbRefuses = false;

vi.mock("../db/index.js", () => ({
  getDb: () => {
    if (dbRefuses) throw new Error("db down");
    return {
      insert: () => ({
        values: async (row: Record<string, unknown>) => {
          inserted.push(row);
        },
      }),
    };
  },
}));

const { computeServedFree, recordPaidInvocation, recordAnonymousInvocation, recordInvocation } =
  await import("./invocation-facts.js");
const { outcomeFromOutput, outcomeFromError } = await import("./execution-outcome.js");

beforeEach(() => {
  inserted.length = 0;
});

/** A successful, usable output for a capability with no declared contract. */
const OK = outcomeFromOutput("dns-lookup", { records: ["1.2.3.4"] });

describe("the row a customer invocation actually writes", () => {
  it("stamps the customer context, and no caller can change it", async () => {
    await recordPaidInvocation({
      capabilitySlug: "dns-lookup",
      rail: "v1_do",
      userId: "u1",
      latencyMs: 12,
      outcome: OK,
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].contextKind).toBe("customer_paid");
    expect(inserted[0].capabilitySlug).toBe("dns-lookup");
    expect(inserted[0].rail).toBe("v1_do");
    expect(inserted[0].userId).toBe("u1");
  });

  it("carries the WP4 verdict into the row rather than a constant", async () => {
    // Both directions. A row that always says success, or never counts a
    // failure, is the silent-disarm shape: the floor reads it as health.
    await recordPaidInvocation({
      capabilitySlug: "dns-lookup",
      rail: "v1_do",
      userId: "u1",
      latencyMs: 1,
      outcome: OK,
    });
    expect(inserted[0].success).toBe(true);
    expect(inserted[0].countsAgainstCapability).toBe(false);

    inserted.length = 0;
    const broken = outcomeFromError(new Error("Zefix API error: HTTP 503"));
    await recordPaidInvocation({
      capabilitySlug: "swiss-company-data",
      rail: "v1_do",
      userId: "u1",
      latencyMs: 1,
      outcome: broken,
    });
    expect(inserted[0].success).toBe(false);
    expect(inserted[0].countsAgainstCapability).toBe(true);
    expect(inserted[0].failureClass).toBe("provider_unavailable");
    expect(inserted[0].fault).toBe("provider");

    inserted.length = 0;
    const refused = outcomeFromError(new Error("Missing required input fields: iban"));
    await recordPaidInvocation({
      capabilitySlug: "iban-validate",
      rail: "v1_do",
      userId: "u1",
      latencyMs: 1,
      outcome: refused,
    });
    expect(inserted[0].success).toBe(false);
    // A caller's bad input is not the capability's fault.
    expect(inserted[0].countsAgainstCapability).toBe(false);
  });

  it("writes free-tier as the rail computed it, so the two writes cannot disagree", async () => {
    // Two derivations of this value have now been falsified by review, in
    // OPPOSITE directions. Reading the capability's own flag missed that
    // `/v1/do` stamps is_free_tier true for anonymous X-Payment and
    // progressive-unlock calls on PAID capabilities. Deriving `rail === v1_do
    // && no account` then missed that a SUCCESSFUL anonymous X-Payment call has
    // its transaction UPDATEd back to false on settlement -- production shows 5
    // of 5 such rows are false -- so it would have dropped genuinely paid
    // traffic out of the floor when pre-epoch it was counted.
    //
    // The writer cannot derive this: whether a call was paid is decided at the
    // route, before settlement, and no property of the fact reveals it. So the
    // enforceable invariant is not "the writer computes it correctly" but "the
    // rail computes it ONCE and both writes get the same variable" -- asserted
    // structurally in invocation-facts.test.ts, and asserted here as pass-through.
    for (const servedFree of [true, false]) {
      inserted.length = 0;
      await recordAnonymousInvocation({
        capabilitySlug: "dns-lookup",
        rail: "v1_do",
        userId: null,
        servedFree,
        latencyMs: 1,
        outcome: OK,
      });
      expect(inserted[0].isFreeTier, `servedFree=${servedFree}`).toBe(servedFree);
    }

    // And the paid writer cannot say free at all -- it takes no such input.
    inserted.length = 0;
    await recordPaidInvocation({
      capabilitySlug: "dns-lookup",
      rail: "x402_gateway",
      userId: null,
      latencyMs: 1,
      outcome: OK,
    });
    expect(inserted[0].isFreeTier).toBe(false);
  });

  it("never fails a customer call when the database refuses the fact", async () => {
    // Best-effort by design: the call already happened, and refusing to return
    // its result because bookkeeping failed helps nobody.
    dbRefuses = true;
    await expect(
      recordAnonymousInvocation({
        capabilitySlug: "dns-lookup",
        rail: "v1_do",
        userId: null,
        servedFree: true,
        latencyMs: 1,
        outcome: OK,
      }),
    ).resolves.toBeUndefined();
    dbRefuses = false;
    // And it dropped the fact rather than writing a half-row.
    expect(inserted).toHaveLength(0);
  });

  it("decides served-free from the payment marker, in both directions", async () => {
    // The origin of the one value round 8 collapsed nine call sites into. Every
    // HOP it takes afterwards was pinned; the expression that produces it was
    // unguarded in both directions, and no test file in the repo even mentioned
    // its input.
    //
    // Inverted to always-true, every anonymous /v1/do fact carries
    // is_free_tier = true, the floor filters all of them out, and the rail goes
    // permanently invisible -- the exact failure this file's own docstring
    // names as its reason for existing, closed at the writer and left open at
    // the source.
    //
    // Inverted to always-false, two live effects: genuine anonymous free-tier
    // traffic gets scored by the armed floor as customer experience (the
    // cheapest failure-fabrication vector there is, drivable from any IP), and
    // the SAME variable feeds the transaction row, whose is_free_tier = true is
    // what the 10/day per-IP free cap counts -- so the counter returns zero
    // forever and the cap is bounded only by the 60/min in-memory limiter.
    //
    // The three anonymous cases executeFreeTier actually serves:
    expect(computeServedFree(undefined), "genuine free-tier capability").toBe(true);
    expect(computeServedFree(undefined), "progressive unlock").toBe(true);
    expect(computeServedFree(true), "X-Payment settled").toBe(false);
    // And the marker is treated as a marker, not as a truthy accident.
    expect(computeServedFree(null)).toBe(true);
    expect(computeServedFree(false)).toBe(true);
  });

  it("does not let a fact claim free-tier by omission", async () => {
    // The last unguarded route to a free-tier fact: `isFreeTier: fact.isFreeTier
    // ?? false` on the raw writer. Only reachable via guardedExecute today,
    // whose callers pass internal_test and are filtered anyway -- but a default
    // that flipped would let a fact claim free-tier by saying nothing.
    await recordInvocation({
      capabilitySlug: "dns-lookup",
      rail: "harness",
      contextKind: "internal_test",
      latencyMs: 1,
      outcome: OK,
    });
    expect(inserted[0].isFreeTier).toBe(false);
  });

  it("carries the linkage the manifest promises, not just the verdict", async () => {
    // billable, solutionId and transactionId were all written and none asserted.
    // No armed consumer reads them today -- the floor reads only success and
    // counts_against_capability -- but WP9.yaml claims a fact carries "the
    // parent transaction if there is one", and the transaction_id index is
    // justified in the schema as answering "what did this bundle actually
    // run?". A claim nothing enforces is the shape this package keeps finding.
    await recordPaidInvocation({
      capabilitySlug: "danish-company-data",
      rail: "solution_step",
      solutionId: "sol-1",
      transactionId: "txn-1",
      userId: "u1",
      latencyMs: 5,
      outcome: OK,
    });
    expect(inserted[0].solutionId).toBe("sol-1");
    expect(inserted[0].transactionId).toBe("txn-1");
    // Asserted against a DIFFERENT value, not against itself. The first
    // version compared the row to `OK.billable` -- and OK was the only outcome
    // in the test, so `billable: true` hardcoded in the writer satisfied it.
    // An assertion whose expected value comes from the same constant it is
    // meant to exclude cannot fail.
    expect(inserted[0].billable).toBe(true);

    inserted.length = 0;
    const unbillable = outcomeFromError(new Error("Zefix API error: HTTP 503"));
    expect(unbillable.billable).toBe(false);
    await recordPaidInvocation({
      capabilitySlug: "swiss-company-data",
      rail: "v1_do",
      userId: "u1",
      latencyMs: 1,
      outcome: unbillable,
    });
    expect(inserted[0].billable).toBe(false);

    // And absent linkage is null, not undefined -- the column is nullable and a
    // stray undefined would be a dropped insert on a NOT NULL neighbour.
    inserted.length = 0;
    await recordPaidInvocation({
      capabilitySlug: "dns-lookup",
      rail: "v1_do",
      userId: "u1",
      latencyMs: 1,
      outcome: OK,
    });
    expect(inserted[0].solutionId).toBeNull();
    expect(inserted[0].transactionId).toBeNull();
  });

  it("clamps a nonsense latency rather than dropping the fact", async () => {
    // latency_ms is NOT NULL; a NaN from a mis-ordered clock read would turn a
    // bookkeeping slip into a lost fact.
    await recordInvocation({
      capabilitySlug: "dns-lookup",
      rail: "harness",
      contextKind: "internal_test",
      latencyMs: Number.NaN,
      outcome: OK,
    });
    expect(inserted[0].latencyMs).toBe(0);
  });
});
