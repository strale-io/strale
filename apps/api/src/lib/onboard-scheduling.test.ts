/**
 * A newly onboarded free capability must be schedulable; a paid one must not.
 *
 * Both halves are load-bearing and each guards a different real failure:
 *
 *  - FALSE for a free capability is what actually happened on 2026-09-06. Five
 *    suites per capability were inserted with the flag at its FALSE default,
 *    `test-scheduler.ts` requires TRUE, and block 0066's reconcile only touches
 *    `cost_class IS NULL` — so eight correctly authored capabilities were
 *    unschedulable and could never earn the green week promotion depends on.
 *    Confirmed on production: the only 40 non-eligible free suites in the whole
 *    table were the 40 just inserted.
 *
 *  - TRUE for a paid capability would be worse than the bug it replaces: a
 *    timer spending vendor credits, which Principle A and the scheduler's paid
 *    exclusion both exist to prevent. That is why this reads the declared cost
 *    class and not `external_cost_cents`, which onboard.ts never sets and which
 *    therefore reads 0 — "free" — for a paid capability at insert time.
 */
import { describe, expect, it } from "vitest";
import { suitesAreSchedulable, type CostClass } from "./onboard-scheduling.js";

describe("suitesAreSchedulable", () => {
  it("schedules the two classes that assert the upstream is free", () => {
    expect(suitesAreSchedulable("free_unlimited")).toBe(true);
    expect(suitesAreSchedulable("free_quota")).toBe(true);
  });

  // The expensive direction. A regression here bills real money on a timer.
  it.each<CostClass>(["paid_prepaid", "paid_subscription", "paid_with_free_tier"])(
    "never schedules %s",
    (costClass) => {
      expect(suitesAreSchedulable(costClass)).toBe(false);
    },
  );

  // An unclassified capability stays FALSE so startup-migrations block 0066
  // keeps owning that case — it reconciles exactly `cost_class IS NULL`.
  it("leaves an unclassified capability alone", () => {
    expect(suitesAreSchedulable(undefined)).toBe(false);
    expect(suitesAreSchedulable(null)).toBe(false);
    expect(suitesAreSchedulable("")).toBe(false);
  });

  // Fail closed on anything unrecognised: a new cost class added to the
  // manifest type must be considered deliberately, not inherit scheduling.
  it("fails closed on an unknown class", () => {
    expect(suitesAreSchedulable("free_forever_probably")).toBe(false);
    expect(suitesAreSchedulable("FREE_UNLIMITED")).toBe(false);
  });
});
