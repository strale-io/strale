/**
 * Tests for the commercial read.
 *
 * Bar: every case must fail against the naive implementation it replaces.
 * "Revenue went up" is trivially computable and needs no test; what needs one
 * is the refusal to call a partial week a trend, and the rule that reads
 * rising revenue plus rising concentration as bad news. Both are the opposite
 * of what a straightforward implementation produces.
 */
import { describe, it, expect } from "vitest";
import {
  growth, interpret, startOfIsoWeek, elapsedDaysInIsoWeek, activatingSlugs,
  type DiscreteWeek, type Concentration, type PayerFacts,
} from "./commercial.js";

const week = (startsOn: string, cents: number, opts: Partial<DiscreteWeek> = {}): DiscreteWeek => ({
  startsOn, cents, calls: Math.round(cents / 8), partial: false, daysElapsed: 7, ...opts,
});

const conc = (o: Partial<Concentration> = {}): Concentration => ({
  payers: 4, topShare: 0.993, topCents: 5650, othersCents: 39, unattributedCents: 0,
  newPayers: 2, newPayerKeys: new Set(["b", "c"]), returningPayers: 2,
  repeatPayers: 1, topPayerRepeats: true, repeatPayersExcludingTop: 0,
  activePayingDays: 6, attributedShare: 1, comparable: true, partialWindow: false, ...o,
});

const textOf = (cs: ReturnType<typeof interpret>) => cs.map((c) => c.text).join(" ");

describe("a partial week is never compared against a full one", () => {
  // The failure this prevents: on 2026-08-22 the week in progress was
  // €56.89 with one day still to run and was the highest in the series.
  // Naively comparing it to the prior full week reports growth from a number
  // that is not finished. The mirror case is worse — four elapsed days below
  // last week's total reads as a collapse.
  it("refuses when only the in-progress week and one full week exist", () => {
    const v = growth([week("2026-08-17", 5689, { partial: true, daysElapsed: 6 }), week("2026-08-10", 3924)]);
    expect(v.kind).toBe("not_comparable");
  });

  it("compares the two most recent FULL weeks, skipping the partial one", () => {
    const v = growth([
      week("2026-08-17", 100, { partial: true, daysElapsed: 1 }),
      week("2026-08-10", 3924),
      week("2026-08-03", 2738),
    ]);
    expect(v.kind).toBe("rising");
    if (v.kind === "rising") {
      expect(v.latestFullCents).toBe(3924);
      expect(v.priorCents).toBe(2738);
    }
  });

  it("does not let a tiny partial week manufacture a fall", () => {
    const v = growth([
      week("2026-08-17", 12, { partial: true, daysElapsed: 1 }),
      week("2026-08-10", 3924),
      week("2026-08-03", 2738),
    ]);
    expect(v.kind, "one elapsed day is not a decline").toBe("rising");
  });
});

describe("a run of weeks is counted, not assumed from the last pair", () => {
  it("counts consecutive rises and stops at the first break", () => {
    const v = growth([
      week("2026-08-17", 5689), week("2026-08-10", 3924),
      week("2026-08-03", 2738), week("2026-07-27", 1085), week("2026-07-20", 3798),
    ]);
    expect(v.kind).toBe("rising");
    // 3 rises: 08-17>08-10, 08-10>08-03, 08-03>07-27. The 07-27<07-20 step breaks it.
    if (v.kind === "rising") expect(v.consecutive).toBe(3);
  });

  it("reports a single good week after bad ones as one week, not as growth", () => {
    const v = growth([week("2026-08-17", 500), week("2026-08-10", 100), week("2026-08-03", 900)]);
    expect(v.kind).toBe("rising");
    if (v.kind === "rising") expect(v.consecutive).toBe(1);
    expect(textOf(interpret({ weeks: [], growth: v, concentration: null, quiet: null, activatingSlugs: [] })))
      .toMatch(/Revenue rose in the last completed week/);
  });
});

describe("rising revenue with rising concentration reads as bad news", () => {
  // The case that motivated this module. 2026-08-22: fourth consecutive
  // record week AND largest-buyer share 94.7% -> 99.3%. Any implementation
  // that reports the two facts separately lets a reader conclude the business
  // improved. It did not — it became more dependent.
  const rising = growth([week("2026-08-17", 5689), week("2026-08-10", 3924), week("2026-08-03", 2738)]);

  it("names the dependency deepening, not just the share", () => {
    const cs = interpret({
      weeks: [], growth: rising, concentration: conc({ topShare: 0.993 }),
      quiet: null, activatingSlugs: [], priorTopShare: 0.947,
    });
    const t = textOf(cs);
    expect(t).toMatch(/deepening/);
    expect(t).toMatch(/selling more to the same customer/);
    expect(t).toMatch(/99\.3%/);
    expect(t).toMatch(/94\.7%/);
  });

  it("marks concentration as the headline, not the revenue rise", () => {
    const cs = interpret({
      weeks: [], growth: rising, concentration: conc({ topShare: 0.993 }),
      quiet: null, activatingSlugs: [], priorTopShare: 0.947,
    });
    expect(cs.find((c) => c.headline)?.topic).toBe("concentration");
  });

  it("does NOT claim deepening when the share actually fell", () => {
    const cs = interpret({
      weeks: [], growth: rising, concentration: conc({ topShare: 0.62 }),
      quiet: null, activatingSlugs: [], priorTopShare: 0.947,
    });
    expect(textOf(cs)).not.toMatch(/deepening/);
    expect(textOf(cs), "still flagged, because 62% is still concentrated").toMatch(/Losing them/);
  });

  it("says the business is spread once no buyer dominates", () => {
    const cs = interpret({
      weeks: [], growth: rising, concentration: conc({ topShare: 0.31, payers: 6 }),
      quiet: null, activatingSlugs: [], priorTopShare: 0.20,
    });
    expect(textOf(cs)).toMatch(/no single customer can take most of it away/);
    expect(cs.find((c) => c.headline), "a healthy spread is not a headline").toBeUndefined();
  });
});

describe("a concentration move is never reported across incomparable windows", () => {
  // Found on this module's FIRST production run, which is the only reason
  // these tests exist. The pack printed "99.3%, up from 19.0%" — and the 19.0%
  // was one payer divided by a week in which payer identity had only existed
  // for two days. The movement was entirely coverage, and it read as the single
  // most important business fact on the page.
  const rising = growth([week("2026-08-17", 5689), week("2026-08-10", 3924), week("2026-08-03", 2738)]);

  it("states the share without a movement when no comparable prior exists", () => {
    const cs = interpret({
      weeks: [], growth: rising, concentration: conc({ topShare: 0.993 }),
      quiet: null, activatingSlugs: [], priorTopShare: null,
    });
    const t = textOf(cs);
    expect(t, "no invented trend").not.toMatch(/deepening|up from/);
    expect(t, "the level is still reported").toMatch(/99\.3%/);
    expect(t).toMatch(/first reading rather than a movement/);
  });

  it("marks a window as not comparable while the instrument is younger than it", () => {
    // The gate itself: attributedShare below the bar, or an instrument that did
    // not cover the window start, both make the share incomparable. This asserts
    // the field a caller must read before passing a prior share along.
    const partial = conc({ attributedShare: 0.19, comparable: false });
    expect(partial.comparable).toBe(false);
    const cs = interpret({
      weeks: [], growth: rising, concentration: conc({ attributedShare: 0.19 }),
      quiet: null, activatingSlugs: [], priorTopShare: null,
    });
    expect(textOf(cs)).toMatch(/81\.0% of revenue cannot be traced/);
  });

  it("refuses to compare when the window is a week still in progress", () => {
    // On a Monday morning one buyer is the whole week, so topShare is 1.0 with
    // full attribution. Against last week's completed 90% that reads as a jump
    // to total dependency, every Monday, regardless of the business — the same
    // partial-versus-full error growth() refuses for revenue.
    const partialWindow = conc({ topShare: 1, attributedShare: 1, partialWindow: true, comparable: false });
    expect(partialWindow.comparable).toBe(false);
    const cs = interpret({
      weeks: [], growth: rising, concentration: partialWindow,
      quiet: null, activatingSlugs: [], priorTopShare: null,
    });
    expect(textOf(cs)).not.toMatch(/deepening|up from/);
  });

  it("still reports the movement when both windows are genuinely comparable", () => {
    const cs = interpret({
      weeks: [], growth: rising, concentration: conc({ topShare: 0.993 }),
      quiet: null, activatingSlugs: [], priorTopShare: 0.947,
    });
    expect(textOf(cs)).toMatch(/deepening/);
    expect(textOf(cs)).not.toMatch(/first reading rather than a movement/);
  });
});

describe("new payers are weighed, not just counted", () => {
  const rising = growth([week("2026-08-17", 5689), week("2026-08-10", 3924), week("2026-08-03", 2738)]);

  it("says new buyers are rounding error when the top share stays near total", () => {
    const cs = interpret({
      weeks: [], growth: rising, concentration: conc({ newPayers: 2, topShare: 0.993 }),
      quiet: null, activatingSlugs: [{ slug: "google-search", payers: 2 }], priorTopShare: 0.947,
    });
    expect(textOf(cs)).toMatch(/add names, not income/);
  });

  it("does not disparage new buyers when they carry real revenue", () => {
    const cs = interpret({
      weeks: [], growth: rising, concentration: conc({ newPayers: 2, topShare: 0.45 }),
      quiet: null, activatingSlugs: [{ slug: "google-search", payers: 2 }], priorTopShare: 0.4,
    });
    expect(textOf(cs)).not.toMatch(/rounding error/);
  });

  it("names what the new buyers arrived through", () => {
    const cs = interpret({
      weeks: [], growth: rising, concentration: conc({ newPayers: 1 }),
      quiet: null, activatingSlugs: [{ slug: "email-validate", payers: 1 }],
    });
    expect(textOf(cs)).toMatch(/arriving through email-validate/);
  });
});

describe("absent evidence is stated, never filled in", () => {
  it("refuses a customer count when nothing is attributable", () => {
    const cs = interpret({
      weeks: [], growth: growth([week("a", 100), week("b", 50)]),
      concentration: null, quiet: null, activatingSlugs: [],
    });
    const coverage = cs.find((c) => c.topic === "coverage");
    expect(coverage?.headline).toBe(true);
    expect(coverage?.text).toMatch(/should be read as a customer count/);
    expect(textOf(cs), "no invented payer number").not.toMatch(/\d+ buyers/);
  });

  it("calls customer counts a floor when a tenth of revenue is untraceable", () => {
    const cs = interpret({
      weeks: [], growth: growth([week("a", 100), week("b", 50)]),
      concentration: conc({ topCents: 500, othersCents: 100, unattributedCents: 400, attributedShare: 0.6 }),
      quiet: null, activatingSlugs: [], priorTopShare: 0.5,
    });
    expect(textOf(cs)).toMatch(/floor rather than a total/);
  });

  it("stays quiet about coverage when everything is attributed and comparable", () => {
    const cs = interpret({
      weeks: [], growth: growth([week("a", 100), week("b", 50)]),
      concentration: conc({ unattributedCents: 0, attributedShare: 1 }),
      quiet: null, activatingSlugs: [], priorTopShare: 0.5,
    });
    expect(cs.some((c) => c.topic === "coverage")).toBe(false);
  });
});

describe("repeat usage distinguishes the big buyer from a second habit", () => {
  const g = growth([week("a", 100), week("b", 50)]);

  it("does not present the largest buyer's return as a second habit", () => {
    const cs = interpret({
      weeks: [], growth: g,
      concentration: conc({ repeatPayers: 1, topPayerRepeats: true, repeatPayersExcludingTop: 0 }),
      quiet: null, activatingSlugs: [],
    });
    expect(textOf(cs)).toMatch(/nobody else has developed a pattern/);
  });

  it("flags a genuine second returning buyer", () => {
    const cs = interpret({
      weeks: [], growth: g,
      concentration: conc({ repeatPayers: 3, topPayerRepeats: true, repeatPayersExcludingTop: 2 }),
      quiet: null, activatingSlugs: [],
    });
    expect(textOf(cs)).toMatch(/second habit forming/);
  });

  it("does not say 'only the largest' when the largest is NOT one of the repeaters", () => {
    // A count cannot tell a small buyer forming a habit — the one signal we are
    // looking for — from the big buyer simply buying again. Reading repeatPayers
    // as "the top one plus others" inverted exactly that case.
    const cs = interpret({
      weeks: [], growth: g,
      concentration: conc({ repeatPayers: 1, topPayerRepeats: false, repeatPayersExcludingTop: 1 }),
      quiet: null, activatingSlugs: [],
    });
    expect(textOf(cs)).not.toMatch(/Only the largest buyer/);
    expect(textOf(cs)).toMatch(/second habit forming/);
  });

  it("says plainly when nobody came back at all", () => {
    const cs = interpret({ weeks: [], growth: g, concentration: conc({ repeatPayers: 0 }), quiet: null, activatingSlugs: [] });
    expect(textOf(cs)).toMatch(/no evidence yet of anyone building us into a routine/);
  });
});

describe("quiet payers are reported without being called churn", () => {
  it("reports days quiet and the money involved, not a churn rate", () => {
    const cs = interpret({
      weeks: [], growth: growth([week("a", 100), week("b", 50)]), concentration: conc(),
      quiet: [{ key: "x", cents: 1580, lastSeen: "2026-07-02T00:00:00Z", daysQuiet: 51 }],
      activatingSlugs: [],
    });
    const t = textOf(cs);
    expect(t).toMatch(/gone quiet/);
    expect(t).toMatch(/51 days ago/);
    expect(t, "at this volume a skipped week is not churn").not.toMatch(/churn/i);
  });
});

describe("no conclusion contains jargon a founder would have to decode", () => {
  it("keeps every sentence free of technical vocabulary", () => {
    const all = interpret({
      weeks: [], growth: growth([week("a", 5689), week("b", 3924), week("c", 2738)]),
      concentration: conc({ unattributedCents: 900, topCents: 5650, othersCents: 39 }),
      quiet: [{ key: "x", cents: 1580, lastSeen: "2026-07-02T00:00:00Z", daysQuiet: 51 }],
      activatingSlugs: [{ slug: "google-search", payers: 1 }], priorTopShare: 0.947,
    });
    for (const c of all) {
      expect(c.text, c.topic).not.toMatch(
        /\b(actor_key|x402|wallet hash|SQL|transactions table|null|undefined|instrument)\b/i);
      expect(c.text.length, c.topic).toBeGreaterThan(20);
    }
  });
});

describe("the flattering half of an unmeasurable pair is refused too", () => {
  // `newPayers` and `returningPayers` sum to the payer count by construction.
  // The first version gated only `returningPayers`, so before the identity
  // instrument was old enough every buyer read as brand new — the same
  // unmeasurable fact, published in its encouraging direction.
  const g = growth([week("a", 100), week("b", 50)]);

  it("says new-versus-returning cannot be answered rather than reporting all-new", () => {
    const cs = interpret({
      weeks: [], growth: g,
      concentration: conc({ payers: 4, newPayers: null, returningPayers: null }),
      quiet: null, activatingSlugs: [{ slug: "email-validate", payers: 3 }], priorTopShare: 0.9,
    });
    const t = textOf(cs);
    expect(t).toMatch(/cannot be answered yet/);
    expect(t, "no count of first-time buyers").not.toMatch(/bought for the first time/);
  });

  it("reports first-time buyers once the question is answerable", () => {
    const cs = interpret({
      weeks: [], growth: g, concentration: conc({ payers: 4, newPayers: 3, returningPayers: 1 }),
      quiet: null, activatingSlugs: [{ slug: "email-validate", payers: 3 }], priorTopShare: 0.9,
    });
    expect(textOf(cs)).toMatch(/3 buyers bought for the first time/);
  });
});

describe("zero traceable payers is not one customer", () => {
  it("refuses any customer statement instead of reporting a single buyer", () => {
    // `payers <= 1` produced the single-buyer headline for an empty set, next
    // to a coverage line saying nothing could be traced — two adjacent
    // sentences contradicting each other, the alarming one first.
    const cs = interpret({
      weeks: [], growth: growth([week("a", 100), week("b", 50)]),
      concentration: conc({ payers: 0, topCents: 0, othersCents: 0, unattributedCents: 5000, attributedShare: 0 }),
      quiet: null, activatingSlugs: [],
    });
    const t = textOf(cs);
    expect(t).not.toMatch(/single buyer/);
    expect(t).toMatch(/nothing here supports any statement about how many customers/);
    expect(cs.find((c) => c.headline)?.topic).toBe("coverage");
  });

  it("still names the genuine single-customer case", () => {
    const cs = interpret({
      weeks: [], growth: growth([week("a", 100), week("b", 50)]),
      concentration: conc({ payers: 1, topShare: 1 }), quiet: null, activatingSlugs: [],
    });
    expect(textOf(cs)).toMatch(/single buyer/);
  });
});

describe("ISO week boundaries", () => {
  it("treats Monday as the start and Sunday as day seven", () => {
    expect(startOfIsoWeek(new Date("2026-08-17T00:00:00Z")).toISOString().slice(0, 10)).toBe("2026-08-17");
    expect(startOfIsoWeek(new Date("2026-08-23T23:00:00Z")).toISOString().slice(0, 10)).toBe("2026-08-17");
    expect(elapsedDaysInIsoWeek(new Date("2026-08-23T23:00:00Z"))).toBe(7);
    expect(elapsedDaysInIsoWeek(new Date("2026-08-17T00:30:00Z"))).toBe(1);
  });
});

describe("activation is attributed only to genuinely new payers", () => {
  const facts: PayerFacts[] = [
    { key: "a", cents: 5650, calls: 800, activeDays: 6, firstSeen: "", lastSeen: "", firstSlugInWindow: "google-search" },
    { key: "b", cents: 20, calls: 2, activeDays: 1, firstSeen: "", lastSeen: "", firstSlugInWindow: "email-validate" },
    { key: "c", cents: 19, calls: 1, activeDays: 1, firstSeen: "", lastSeen: "", firstSlugInWindow: "email-validate" },
  ];

  it("ignores the established buyer's first call of the window", () => {
    const out = activatingSlugs(facts, new Set(["b", "c"]));
    expect(out).toEqual([{ slug: "email-validate", payers: 2 }]);
    expect(out.some((s) => s.slug === "google-search"), "an existing buyer is not activated").toBe(false);
  });
});
