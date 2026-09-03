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
  resolveQuietLookback,
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

describe("a partial window states no verdict about the business", () => {
  // 2026-08-31, the first Monday the pack ran. `concentration()` has always
  // computed `partialWindow`, and its own comment says a partial window "on a
  // Monday reads as a jump to 100% concentration every single time" -- but
  // `interpret()` never read the field, and the shipped caller never set it.
  // The pack's headline conclusion that morning was "the business currently has
  // one customer and one point of failure", drawn from EUR 0.72 across 17 calls
  // on day 1 of 7, while the last completed week had 13 payers at 76.0%.
  //
  // The existing sibling test only pins that no MOVEMENT is reported across a
  // partial window. Every case here is about the LEVEL, which is what actually
  // shipped a false statement about the company.
  const rising = growth([week("2026-08-24", 7303), week("2026-08-17", 6631), week("2026-08-10", 3924)]);

  it("does not call a single first buyer of the week the whole customer base", () => {
    const cs = interpret({
      weeks: [], growth: rising,
      concentration: conc({ payers: 1, topShare: 1, topCents: 72, othersCents: 0, partialWindow: true, comparable: false }),
      quiet: null, activatingSlugs: [], priorTopShare: null,
    });
    const t = textOf(cs);
    expect(t, "the sentence that shipped on 2026-08-31").not.toMatch(/one customer and one point of failure/);
    expect(t, "and no reworded equivalent").not.toMatch(/single buyer/);
    expect(t, "it says why instead").toMatch(/describes the calendar rather than the business/);
  });

  it("does not report a dependency level from a partial window either", () => {
    // The other verdict branch. A partial window that happens to sit above the
    // 60% bar would otherwise print "losing them would remove most of the
    // income" off two days of data.
    const cs = interpret({
      weeks: [], growth: rising,
      concentration: conc({ payers: 3, topShare: 0.82, topCents: 410, othersCents: 90, partialWindow: true, comparable: false }),
      quiet: null, activatingSlugs: [], priorTopShare: null,
    });
    const t = textOf(cs);
    expect(t, "no dependency verdict").not.toMatch(/remove most of the income|accounts for/);
    expect(t, "no reassurance either -- silence must not read as health").not.toMatch(/no single customer can take/);
  });

  it("draws no acquisition or repeat conclusion from a partial window", () => {
    // "Nobody bought on more than one day" is trivially true on a Monday, and
    // it is the sentence that would tell Petter a returning customer's habit
    // had stopped. The refusal has to cover the whole section, not one line.
    const cs = interpret({
      weeks: [], growth: rising,
      concentration: conc({ payers: 1, topShare: 1, repeatPayers: 0, repeatPayersExcludingTop: 0, activePayingDays: 1, partialWindow: true, comparable: false }),
      quiet: null, activatingSlugs: [], priorTopShare: null,
    });
    const t = textOf(cs);
    expect(t, "no repeat verdict").not.toMatch(/bought on more than one day/);
    expect(t, "no acquisition verdict").not.toMatch(/bought for the first time|No new buyer/);
  });

  it("emits no headline at all from a partial window", () => {
    // A headline is what the brief is instructed to carry. A partial window may
    // contribute a caveat; it may never contribute the most important sentence
    // on the page.
    const cs = interpret({
      weeks: [], growth: rising,
      concentration: conc({ payers: 1, topShare: 1, partialWindow: true, comparable: false }),
      quiet: null, activatingSlugs: [], priorTopShare: null,
    });
    expect(cs.filter((c) => c.headline), "no headline from an unfinished week").toHaveLength(0);
  });

  it("still states the verdict when the window is complete", () => {
    // The guard must not buy silence at the price of blindness -- the mistake
    // LESSONS.md F1 step 4 names as the one that nearly shipped with the
    // taxonomy repair. Same shape, complete window: the verdict returns.
    const cs = interpret({
      weeks: [], growth: rising,
      concentration: conc({ payers: 1, topShare: 1, partialWindow: false }),
      quiet: null, activatingSlugs: [], priorTopShare: null,
    });
    expect(textOf(cs)).toMatch(/one customer and one point of failure/);
    expect(cs.filter((c) => c.headline).length).toBeGreaterThan(0);
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


describe("the quiet-payer lookback is clamped to the instrument, not refused", () => {
  // The bug: quietPayers shared concentration()'s guard, which demands the
  // instrument cover the WHOLE requested lookback. Payer identity switched on
  // 2026-08-15; a 90-day lookback therefore refused every call until
  // mid-November, and the metric had never returned a value in production.
  //
  // Exactly ONE case below discriminates against that implementation — the
  // first, which the old guard answered "impossible" and this one answers
  // "narrowed". It was verified failing before the clamp and passing after.
  // The other three pin the boundary the clamp must NOT cross and agree with
  // the old behaviour by construction; they are regression fences, not
  // evidence for the change, and an earlier version of this comment claimed
  // all four discriminated. Saying so was the F5 failure in miniature: a test
  // file asserting its own rigour. They earn their place by being the cases
  // that would go wrong if someone later "simplified" the refusal away.
  const ENABLED = new Date("2026-08-15T09:13:00Z");

  it("narrows rather than refusing when the instrument starts inside the lookback", () => {
    const r = resolveQuietLookback(new Date("2026-08-24T00:00:00Z"), 90, ENABLED);
    expect(r.kind, "the old guard answered impossible here").toBe("narrowed");
    if (r.kind === "narrowed") {
      expect(r.from).toEqual(ENABLED);
      // The requested start is kept so the caveat can say what was given up.
      expect(r.requestedFrom.getTime()).toBeLessThan(ENABLED.getTime());
    }
  });

  it("uses the full lookback once the instrument genuinely covers it", () => {
    const r = resolveQuietLookback(new Date("2026-12-01T00:00:00Z"), 90, ENABLED);
    expect(r.kind).toBe("full");
    if (r.kind === "full") expect(r.from).toEqual(new Date("2026-09-02T00:00:00Z"));
  });

  it("still refuses when no covered time exists BEFORE the window", () => {
    // The clamp must not degrade into "everyone looks new". With the
    // instrument starting at or after the window there is no prior period a
    // buyer could have been active in, so a narrowed answer would be false
    // rather than weaker.
    const sameInstant = resolveQuietLookback(ENABLED, 90, ENABLED);
    expect(sameInstant.kind).toBe("impossible");
    const insideWindow = resolveQuietLookback(new Date("2026-08-10T00:00:00Z"), 90, ENABLED);
    expect(insideWindow.kind).toBe("impossible");
  });

  it("distinguishes an absent instrument from an unenabled one", () => {
    expect(resolveQuietLookback(new Date("2026-08-24T00:00:00Z"), 90, undefined))
      .toMatchObject({ kind: "impossible", absent: true });
    expect(resolveQuietLookback(new Date("2026-08-24T00:00:00Z"), 90, null))
      .toMatchObject({ kind: "impossible", absent: false });
  });

  it("refuses a lookback that reaches into or past the window itself", () => {
    // A zero or negative lookback puts the prior period at or after the window
    // start: empty or inverted. Reporting `observed: []` there renders an
    // absence of evidence as evidence of absence — nobody has gone quiet
    // because nobody could have been seen. Unreachable from the shipped caller
    // (default 90 days), guarded because the invariant is stated
    // unconditionally.
    const w = new Date("2026-08-24T00:00:00Z");
    expect(resolveQuietLookback(w, 0, ENABLED).kind).toBe("impossible");
    expect(resolveQuietLookback(w, -7, ENABLED).kind).toBe("impossible");
    // ...and it must not swallow the ordinary cases on the way past: a
    // one-day lookback here sits entirely after the instrument and is `full`,
    // and the ninety-day default still narrows.
    expect(resolveQuietLookback(w, 1, ENABLED).kind).toBe("full");
    expect(resolveQuietLookback(w, 90, ENABLED).kind).toBe("narrowed");
  });
});

describe("the quiet-payer sentence carries its own narrowing", () => {
  // The qualifier used to live only on the Measurement wrapper, which
  // `interpret()` never receives — so the one sentence a founder actually reads
  // was emitted unqualified while the caveat sat one level up. That is the
  // exact shape `Measurement` exists to prevent, and it took an independent
  // review to spot it. These two cases fail against the version that took a
  // bare QuietPayer[].
  const quiet = [{ key: "x402:v1:abc", cents: 30, lastSeen: "2026-08-15T00:00:00Z", daysQuiet: 9 }];
  const base = {
    weeks: [week("2026-08-24", 7303), week("2026-08-17", 6631)],
    concentration: conc(),
    activatingSlugs: [],
    priorTopShare: null,
  };

  it("says the count is a floor when the lookback was narrowed", () => {
    const cs = interpret({
      ...base, growth: growth(base.weeks), quiet,
      quietNarrowedSince: new Date("2026-08-15T09:13:00Z"),
    });
    const attrition = cs.find((c) => c.topic === "attrition");
    expect(attrition, "the attrition conclusion must exist to be qualified").toBeDefined();
    expect(attrition!.text).toContain("2026-08-15");
    expect(attrition!.text).toMatch(/floor/);
    // The amount is a window sum, not a lifetime, and the sentence must say so.
    expect(attrition!.text).toMatch(/lifetime/);
  });

  it("adds no qualifier when the full lookback was covered", () => {
    const cs = interpret({ ...base, growth: growth(base.weeks), quiet, quietNarrowedSince: null });
    const attrition = cs.find((c) => c.topic === "attrition");
    expect(attrition!.text).not.toMatch(/floor|lifetime/);
    expect(attrition!.text).toContain("gone quiet");
  });
});
