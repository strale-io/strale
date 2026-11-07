import { describe, expect, it } from "vitest";
import { VAT_RATES, VAT_RATES_AS_OF } from "./vat-rate-lookup.js";
import { getExecutor } from "./index.js";

// Pins the rates re-verified on 2026-11-06 against the EC's TEDB and national
// authorities (see the source note in vat-rate-lookup.ts). When a rate
// changes, update VAT_RATES, VAT_RATES_AS_OF and this test together.

type Out = {
  standard_rate: number;
  reduced_rates: { rate: number; categories: string[] }[];
  zero_rated_categories: string[];
  currency: string;
  applicable_rate?: number;
};

async function lookup(country_code: string, category?: string): Promise<Out> {
  const fn = getExecutor("vat-rate-lookup")!;
  const res = (await fn(category ? { country_code, category } : { country_code })) as { output: Out };
  return res.output;
}

const rates = (o: Out) => o.reduced_rates.map((r) => r.rate);

describe("vat-rate-lookup (as of 2026-11-06)", () => {
  it("carries the verification date", () => {
    expect(VAT_RATES_AS_OF).toBe("2026-11-06");
  });

  it("Estonia: 24% standard since 1 July 2025, accommodation 13%", async () => {
    const o = await lookup("EE");
    expect(o.standard_rate).toBe(24);
    expect(rates(o)).toEqual([9, 13]);
    expect((await lookup("EE", "accommodation")).applicable_rate).toBe(13);
  });

  it("Romania: 21% and a single 11% rate since 1 August 2025", async () => {
    const o = await lookup("RO");
    expect(o.standard_rate).toBe(21);
    expect(rates(o)).toEqual([11]);
    expect((await lookup("RO", "food")).applicable_rate).toBe(11);
  });

  it("Finland: 13.5% from 2026, 10% only for the press", async () => {
    expect(rates(await lookup("FI"))).toEqual([10, 13.5]);
    expect((await lookup("FI", "food")).applicable_rate).toBe(13.5);
    expect((await lookup("FI", "books")).applicable_rate).toBe(13.5);
    expect((await lookup("FI", "newspapers")).applicable_rate).toBe(10);
  });

  it("Sweden: food 6% from 1 April 2026, restaurants 12%", async () => {
    expect((await lookup("SE", "food")).applicable_rate).toBe(6);
    expect((await lookup("SE", "restaurant_food")).applicable_rate).toBe(12);
  });

  it("Slovakia: reduced rates 5% and 19%", async () => {
    expect(rates(await lookup("SK"))).toEqual([5, 19]);
  });

  it("Lithuania: 9% became 12% in 2026; books 5%", async () => {
    expect(rates(await lookup("LT"))).toEqual([5, 12]);
    expect((await lookup("LT", "books")).applicable_rate).toBe(5);
    expect((await lookup("LT", "accommodation")).applicable_rate).toBe(12);
  });

  it("Bulgaria: priced in euro since 1 January 2026; restaurants standard-rated", async () => {
    const o = await lookup("BG");
    expect(o.currency).toBe("EUR");
    expect((await lookup("BG", "restaurant_food")).applicable_rate).toBe(20);
  });

  it("category rates corrected against TEDB and national sources", async () => {
    const cases: [string, string, number][] = [
      ["AT", "accommodation", 10],
      ["AT", "cultural_events", 13],
      ["AT", "basic_food", 4.9],
      ["DE", "restaurant_food", 7],
      ["NL", "accommodation", 21],
      ["IE", "restaurant_food", 9],
      ["IE", "cultural_events", 13.5],
      ["LU", "accommodation", 3],
      ["CZ", "books", 0],
      ["SI", "food", 9.5],
      ["LV", "books", 5],
      ["NO", "food", 15],
      ["NO", "transport", 12],
      ["PT", "accommodation", 6],
      ["GR", "energy", 6],
      ["FR", "energy", 20],
      ["MT", "food", 0],
    ];
    for (const [cc, cat, want] of cases) {
      expect((await lookup(cc, cat)).applicable_rate, `${cc} ${cat}`).toBe(want);
    }
  });

  it("every country lists each category at most once and reduced rates in ascending order", () => {
    for (const [cc, c] of Object.entries(VAT_RATES)) {
      const cats = c.reduced_rates.flatMap((r) => r.categories);
      expect(new Set(cats).size, cc).toBe(cats.length);
      const rs = c.reduced_rates.map((r) => r.rate);
      expect([...rs].sort((a, b) => a - b), cc).toEqual(rs);
    }
  });
});
