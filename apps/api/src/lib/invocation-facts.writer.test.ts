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

const { recordPaidInvocation, recordAnonymousInvocation, recordInvocation } =
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
