/**
 * Pins why the dispatcher gate's cost-control refusals never reach a scoring
 * consumer.
 *
 * Raised on 2026-08-14 as "the same bug as #231, a third time": the ALLOW_MATRIX
 * refusals the gate raises when it correctly declines to spend vendor credits
 * on a paid capability from a test context land in `transactions` as
 * `status='failed'`, and `classifyTransactionFailure()` files them as
 * `internal` — the "our bug until proven otherwise" bucket. 91 rows in 30 days
 * across 8 capabilities.
 *
 * That part is true. The conclusion drawn from it was not: they are already
 * excluded from everything that scores, three times over.
 *
 *   1. Customer path — `/v1/do` runs `assertGuardedAllow` (routes/do.ts:779)
 *      roughly 430 lines before the first `insert(transactions)` (:1208). A
 *      customer-triggered refusal returns 503 with no row ever written.
 *   2. Quality floor — its query excludes internal accounts by email suffix
 *      (jobs/quality-floor.ts). Verified against production: of 91 rows, zero
 *      survive that filter.
 *   3. Circuit breaker — test-runner.ts never calls `recordFailure`; the
 *      breaker is driven only from the customer path.
 *
 * So nothing needs reclassifying, and these tests deliberately pin the
 * `internal` result rather than "fixing" it. The refusal is not caller-
 * attributable — no caller asked for it — so moving it into
 * CALLER_ATTRIBUTABLE would be wrong in the other direction, and would also
 * quietly exempt it on the customer path if one ever opened.
 *
 * What the tests guard is the coupling that makes the above hold, because all
 * three protections are implicit and none of them announce themselves.
 */

import { describe, it, expect } from "vitest";
import {
  SYSTEM_ACCOUNT_EMAIL,
  isInternalAccountEmail,
  INTERNAL_EMAIL_SUFFIXES,
} from "./internal-accounts.js";
import { classifyTransactionFailure, CALLER_ATTRIBUTABLE } from "./transaction-failure-taxonomy.js";

/** Verbatim from `transactions` on 2026-08-14. */
const ALLOW_MATRIX_REFUSAL =
  "Capability 'french-company-data' (cost_class=paid_prepaid) refuses invocation from " +
  "context kind 'internal_test'. ALLOW_MATRIX governs this; bypass would burn vendor " +
  "credits outside customer-initiated paths.";

describe("the account the test runner books against stays internal", () => {
  it("is excluded by the suffix rule the quality floor filters on", () => {
    // The single load-bearing fact. If this goes false, the floor starts
    // counting the platform's own cost-control refusals against the paid
    // capabilities they protect — silently, since nothing else looks wrong.
    expect(isInternalAccountEmail(SYSTEM_ACCOUNT_EMAIL)).toBe(true);
  });

  it("keeps a suffix that the exclusion list actually covers", () => {
    // Guards the specific move that would break it: renaming the account to a
    // domain nobody remembered to add. isInternalAccountEmail would keep
    // passing for other addresses, so only this assertion would fail.
    const domain = SYSTEM_ACCOUNT_EMAIL.slice(SYSTEM_ACCOUNT_EMAIL.indexOf("@"));
    expect(INTERNAL_EMAIL_SUFFIXES).toContain(domain);
  });

  it("is not a real-looking address that could be mistaken for a customer", () => {
    expect(isInternalAccountEmail("customer@gmail.com")).toBe(false);
  });
});

describe("no customer-facing path can produce one of these refusals", () => {
  it("customer_paid is allow for every cost class, including unclassified", async () => {
    // The strongest form of the argument, and the reason the ordering of the
    // gate relative to the transaction insert does not actually matter.
    //
    // All three customer-facing entry points pass kind: "customer_paid" —
    // routes/do.ts:779, routes/x402-gateway-v2.ts:1296, and
    // lib/solution-executor.ts:315 (per step). If customer_paid is allow
    // everywhere, a refusal is unreachable from customer traffic no matter
    // when a row gets written, and the only producers left are the internal
    // contexts, which book against SYSTEM_ACCOUNT_EMAIL.
    //
    // Flip any customer_paid cell to "refuse" or "budget_check" and a real
    // caller starts generating rows that survive the floor's internal filter.
    // That is the change this test exists to stop.
    const { describeAllowMatrix } = await import("../capabilities/guarded-executor.js");
    for (const [costClass, decision] of Object.entries(describeAllowMatrix("customer_paid"))) {
      expect(decision, `cost_class=${costClass} under customer_paid`).toBe("allow");
    }
  });
});

describe("cost-control refusals keep their classification", () => {
  it("classifies as internal, and that is deliberate", () => {
    // Pinned, not fixed. See the module comment: the refusal is the platform's
    // own decision, so it is neither a capability fault nor caller-
    // attributable. It is inert because it never reaches a scoring consumer,
    // not because the bucket is right.
    expect(classifyTransactionFailure(ALLOW_MATRIX_REFUSAL)).toBe("internal");
  });

  it("is not caller-attributable — nobody asked for it", () => {
    const cls = classifyTransactionFailure(ALLOW_MATRIX_REFUSAL);
    expect(CALLER_ATTRIBUTABLE.has(cls)).toBe(false);
  });

  it("does not accidentally absorb a genuine upstream fault", () => {
    // The message names a capability and a cost class, so a careless pattern
    // written for it could swallow real failures mentioning the same words.
    for (const fault of [
      "Capability 'french-company-data' upstream returned HTTP 503",
      "fetch failed: ETIMEDOUT",
    ]) {
      expect(CALLER_ATTRIBUTABLE.has(classifyTransactionFailure(fault)), fault).toBe(false);
      expect(classifyTransactionFailure(fault)).not.toBe("caller_input");
    }
  });
});
