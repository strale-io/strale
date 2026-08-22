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

const { recordCustomerInvocation, recordInvocation } = await import("./invocation-facts.js");
const { outcomeFromOutput, outcomeFromError } = await import("./execution-outcome.js");

beforeEach(() => {
  inserted.length = 0;
});

/** A successful, usable output for a capability with no declared contract. */
const OK = outcomeFromOutput("dns-lookup", { records: ["1.2.3.4"] });

describe("the row a customer invocation actually writes", () => {
  it("stamps the customer context, and no caller can change it", async () => {
    await recordCustomerInvocation({
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
    await recordCustomerInvocation({
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
    await recordCustomerInvocation({
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
    await recordCustomerInvocation({
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

  it("derives free-tier to match what the transaction row records, on every path", async () => {
    // The parity claim review falsified. `/v1/do` routes THREE anonymous cases
    // through executeFreeTier -- a free-tier capability, an X-Payment call, and
    // a progressive-unlock call -- and stamps is_free_tier true on the
    // transaction for all three, including the two where the capability is
    // PAID. Deriving from the capability's own flag returned false for those
    // two, so post-epoch they would have started counting toward the floor when
    // pre-epoch they did not: anonymous zero-cost traffic on paid capabilities,
    // which is the exact abuse vector the floor's H-1 filter excludes.
    const cases: Array<[string, "v1_do" | "x402_gateway" | "solution_step", string | null, boolean]> = [
      // rail,             userId, expected is_free_tier
      ["anon free-tier",            "v1_do", null, true],
      ["anon X-Payment",            "v1_do", null, true],
      ["anon progressive unlock",   "v1_do", null, true],
      ["authenticated free-tier",   "v1_do", "u1", false],
      ["authenticated sync",        "v1_do", "u1", false],
      ["x402 capability rail",      "x402_gateway", null, false],
      ["solution step",             "solution_step", "u1", false],
      ["solution step via x402",    "solution_step", null, false],
    ];
    for (const [label, rail, userId, expected] of cases) {
      inserted.length = 0;
      await recordCustomerInvocation({
        capabilitySlug: "dns-lookup",
        rail,
        userId,
        latencyMs: 1,
        outcome: OK,
      });
      expect(inserted[0].isFreeTier, label).toBe(expected);
    }
  });

  it("never fails a customer call when the database refuses the fact", async () => {
    // Best-effort by design: the call already happened, and refusing to return
    // its result because bookkeeping failed helps nobody.
    dbRefuses = true;
    await expect(
      recordCustomerInvocation({
        capabilitySlug: "dns-lookup",
        rail: "v1_do",
        userId: null,
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
