/**
 * The tests that matter here are the ones a cohort-only implementation fails.
 *
 * A naive `cohortVerdict` — "cohort orders === 0 ? failed : selling" — passes
 * every test about a cohort that sold something, and every test about a cohort
 * that sold nothing while the control was healthy. It fails exactly the cases
 * where the control is silent too. Those are the reason this module exists, so
 * they are asserted first and asserted hardest.
 *
 * Verified failing against the un-fixed logic: deleting the `confounded` branch
 * makes three of these fail and the rest pass. Verified again against the
 * week-bucketed first draft: `pins the trial boundary to the day` fails there,
 * because that draft credited the control with pre-trial orders.
 */
import { describe, it, expect } from "vitest";
import {
  cohortVerdict, E4_COHORT, E4_CONTROL, E4_TRIAL_FROM,
  type BundleSales, type BundleWeek,
} from "./bundles.js";

/**
 * Build a bundle from `{ "2026-08-17": orders }` week pairs plus the exact
 * count inside the trial window. The two are supplied separately on purpose:
 * that is exactly the distinction the module now makes, and a helper that
 * derived one from the other could not express the bug being guarded against.
 */
function bundle(
  slug: string,
  weeks: Record<string, number>,
  ordersSince: number,
  centsPerOrder = 20,
): BundleSales {
  const w: BundleWeek[] = Object.entries(weeks)
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([startsOn, orders]) => ({
      startsOn, orders, cents: orders * centsPerOrder, partial: false, daysElapsed: 7,
    }));
  return {
    slug,
    weeks: w,
    totalOrders: w.reduce((a, x) => a + x.orders, 0),
    totalCents: w.reduce((a, x) => a + x.cents, 0),
    ordersSince,
    centsSince: ordersSince * centsPerOrder,
    lastSaleAt: w.some((x) => x.orders > 0) ? "2026-08-24T00:00:00.000Z" : null,
  };
}

const SILENT_WEEKS = { "2026-08-24": 0, "2026-08-17": 0, "2026-08-10": 0, "2026-08-03": 0 };
const silentCohort = () => E4_COHORT.map((s) => bundle(s, SILENT_WEEKS, 0));

function verdictFor(sales: BundleSales[]) {
  return cohortVerdict({
    cohort: E4_COHORT,
    controlSlug: E4_CONTROL,
    sales,
    trialFrom: E4_TRIAL_FROM,
  });
}

describe("cohortVerdict", () => {
  it("refuses to kill a silent cohort when its control went silent too", () => {
    // THE case. A cohort-only implementation returns `cohort_failed` here and
    // GOALS.md kills four bundles on evidence that does not support it.
    const sales = [
      ...silentCohort(),
      // Control sold 46 before the trial and nothing during it.
      bundle(E4_CONTROL, { "2026-08-24": 0, "2026-08-17": 0, "2026-08-10": 26, "2026-08-03": 20 }, 0),
    ];
    const v = verdictFor(sales);
    expect(v.kind).toBe("confounded");
    if (v.kind !== "confounded") throw new Error("narrowing");
    expect(v.controlSlug).toBe(E4_CONTROL);
    expect(v.controlOrdersBefore).toBe(46);
    expect(v.why).toMatch(/no bundle sold in this period/);
  });

  it("confounded outranks the kill even when the cohort is emphatically dead", () => {
    // Four bundles, zero sales, four full weeks. Every intuition says "kill".
    // The control's silence still forbids it, and that ordering is the rule.
    const sales = [...silentCohort(), bundle(E4_CONTROL, SILENT_WEEKS, 0)];
    expect(verdictFor(sales).kind).toBe("confounded");
  });

  it("pins the trial boundary to the day, not to the containing week", () => {
    // The control took 26 orders in the week of 08-17, but every one of them
    // landed on Monday 08-17 — the day BEFORE the cohort became payable. It
    // has sold nothing since. Bucketing by week credits those 26 to the trial
    // and returns `cohort_failed`; counting by date returns `confounded`.
    // This is the bias that made a kill easier, and it is the whole test.
    const sales = [
      ...silentCohort(),
      bundle(E4_CONTROL, { "2026-08-24": 0, "2026-08-17": 26, "2026-08-10": 9, "2026-08-03": 7 }, 0),
    ];
    const v = verdictFor(sales);
    expect(v.kind).toBe("confounded");
    if (v.kind !== "confounded") throw new Error("narrowing");
    expect(v.controlOrdersBefore).toBe(42);
  });

  it("kills a silent cohort when the control kept selling inside the trial", () => {
    const sales = [
      ...silentCohort(),
      bundle(E4_CONTROL, { "2026-08-24": 3, "2026-08-17": 26, "2026-08-10": 9, "2026-08-03": 7 }, 29),
    ];
    const v = verdictFor(sales);
    expect(v.kind).toBe("cohort_failed");
    if (v.kind !== "cohort_failed") throw new Error("narrowing");
    expect(v.controlOrdersInTrial).toBe(29);
    expect(v.why).toMatch(/they did not buy these/);
  });

  it("a single order anywhere in the cohort spares it, control notwithstanding", () => {
    const sales = [
      bundle("competitor-read", { "2026-08-24": 1, "2026-08-17": 0, "2026-08-10": 0, "2026-08-03": 0 }, 1),
      bundle("page-seo-check", SILENT_WEEKS, 0),
      bundle("prospect-brief", SILENT_WEEKS, 0),
      bundle("keyword-scout", SILENT_WEEKS, 0),
      bundle(E4_CONTROL, SILENT_WEEKS, 0),
    ];
    const v = verdictFor(sales);
    expect(v.kind).toBe("cohort_selling");
    if (v.kind !== "cohort_selling") throw new Error("narrowing");
    expect(v.orders).toBe(1);
  });

  it("ignores cohort sales from before the cohort was payable", () => {
    // Five pre-trial orders on a cohort bundle must not rescue the bet: the
    // bundles were listed but unpayable until 08-18, so anything earlier is
    // not evidence about them. `ordersSince` is 0 and only that is read.
    const sales = [
      bundle("competitor-read", { "2026-08-24": 0, "2026-08-17": 0, "2026-08-10": 5, "2026-08-03": 0 }, 0),
      bundle("page-seo-check", SILENT_WEEKS, 0),
      bundle("prospect-brief", SILENT_WEEKS, 0),
      bundle("keyword-scout", SILENT_WEEKS, 0),
      bundle(E4_CONTROL, { "2026-08-24": 4, "2026-08-17": 4, "2026-08-10": 0, "2026-08-03": 0 }, 8),
    ];
    expect(verdictFor(sales).kind).toBe("cohort_failed");
  });

  it("treats a missing control as silence rather than as health", () => {
    // The control row absent entirely — e.g. it was renamed or delisted. The
    // safe reading is that we have no control, not that the control is fine.
    const v = verdictFor(silentCohort());
    expect(v.kind).toBe("confounded");
    if (v.kind !== "confounded") throw new Error("narrowing");
    expect(v.controlOrdersBefore).toBe(0);
  });
});
